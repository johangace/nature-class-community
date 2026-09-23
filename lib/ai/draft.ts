import { after } from "next/server";
import { callModel, type ModelCall } from "./model";
import { trace } from "./langfuse";

/**
 * The one AI seam. Every model call in this product goes through `draft()`.
 *
 * Before this file there were three shapes doing the same job. `runDraft` in
 * plate-draft.ts took a parser with no access to the call's own facts, so
 * three of the callers that should have used it hand-rolled callModel + trace
 * instead — plate-draft.ts said so out loud at the world-extract site — and
 * the six drafters in door-line.ts and friends never rode it at all. Five
 * copies of "pull the first JSON object out of the reply" grew from that.
 *
 * The missing piece was never the loop; it was the facts. A guard here checks
 * the model's words against the inputs that produced them: the temperature it
 * was given, the species the record holds, the words the source article used.
 * A parse-only seam cannot express that, so the shape is:
 *
 *     build a committed prompt  →  call the model  →  parse the JSON
 *       →  check the value AGAINST ITS FACTS  →  trace the outcome
 *
 * Every stage may refuse, and a refusal is ordinary: the caller gets null and
 * renders whatever it renders without a model. Nothing here throws.
 */

/** What a guard says about one draft. `reason` is for humans reading logs. */
export interface GuardVerdict {
  ok: boolean;
  reason?: string;
}

export interface DraftSpec<Facts, T> {
  /**
   * The committed prompt, already compiled.
   *
   * `id` is what this generation is CALLED; `name` is the prompt in the
   * registry it came FROM, and they are not always the same. lesson-support
   * runs ten task variants off one prompt file, so it traces as
   * "lesson-support-age" while the managed prompt is "lesson-support" — send
   * the id as the name and the trace's link to the prompt dangles, for the
   * ten highest-volume drafts in the product.
   */
  prompt: {
    id: string;
    version: number;
    system: string;
    user: string;
    name?: string;
  };
  /** The closed inputs this call was built from. Handed to parse and check. */
  facts: Facts;
  maxTokens: number;
  /** Vision calls only. Never written, never logged, never traced. */
  image?: ModelCall["image"];
  /** Shape the reply into a value, or refuse it. */
  parse: (json: unknown, facts: Facts) => T | null;
  /** Hold the value against its facts. Omit when the parse is the whole check. */
  check?: (value: T, facts: Facts) => GuardVerdict;
}

/** Pull the first JSON object out of a model reply, tolerant of stray prose. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The commonest parse in this codebase: one named string field, trimmed, or a
 * refusal. Five drafters each had their own copy of this, differing only in
 * the field name they read.
 */
export function stringField(name: string): (json: unknown) => string | null {
  return (json) => {
    const value = (json as Record<string, unknown> | null)?.[name];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
}

/**
 * Reduce a guard's reason to a category safe to put in a trace.
 *
 * Seventeen of the guards' reasons quote the thing they caught — "named a
 * creature the door did not show: ${invented}", "carries a number the article
 * does not: ${n}". That quoted half is model output, and model output does not
 * enter the trace store (nc#50, nc#66). Every one of those reasons is written
 * as `stable phrase: ${value}`, so taking the text before the first colon
 * drops the quoted half by construction rather than by remembering to.
 *
 * Doing it here instead of hand-editing seventy-seven guard returns also means
 * a guard written next year is safe without its author knowing this rule
 * exists. `tests/unit/draft-seam.spec.ts` holds the source-level
 * invariant that makes that true: a reason may interpolate, but not before its
 * colon.
 *
 * The bound below (small charset, 48 chars) is a seatbelt, not the brakes: it
 * stops a sentence, not a name. If the source invariant ever breaks,
 * outcomeCode("Aisha was named") still yields "aisha-was-named". The scan is
 * what keeps this safe; the bound only limits the blast radius.
 */
export function outcomeCode(reason: string | undefined): string {
  const head = (reason ?? "").split(":")[0] ?? "";
  const slug = head
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "rejected";
}

/**
 * Outcomes that are not a guard's doing, so a dashboard can tell "the model
 * never answered" apart from "the model answered and we refused it".
 */
export const OUTCOME_OK = "ok";
export const OUTCOME_NO_MODEL = "model-unavailable";
export const OUTCOME_UNPARSEABLE = "unparseable";

export async function draft<Facts, T>(spec: DraftSpec<Facts, T>): Promise<T | null> {
  const startedAt = Date.now();
  const result = await callModel({
    system: spec.prompt.system,
    user: spec.prompt.user,
    image: spec.image,
    maxTokens: spec.maxTokens,
  });

  let value: T | null = null;
  let outcome: string = OUTCOME_NO_MODEL;

  if (result) {
    const parsed = spec.parse(extractJson(result.text), spec.facts);
    if (parsed === null || parsed === undefined) {
      outcome = OUTCOME_UNPARSEABLE;
    } else if (spec.check) {
      const verdict = spec.check(parsed, spec.facts);
      if (verdict.ok) {
        value = parsed;
        outcome = OUTCOME_OK;
      } else {
        outcome = outcomeCode(verdict.reason);
      }
    } else {
      value = parsed;
      outcome = OUTCOME_OK;
    }
  }

  // Trace every outcome. A refused draft is the signal, not the gap: the
  // guards run on every production call and until now threw their verdict
  // away, so "which guard is eating my drafts, and did that prompt edit move
  // the ratio" was a question the system could not answer.
  //
  // No prompt input and no model output travels with it. The user prompt can
  // carry free text a teacher typed, and the outcome is a slug, not a quote.
  keepAlive(
    trace({
      promptId: spec.prompt.id,
      promptName: spec.prompt.name ?? spec.prompt.id,
      promptVersion: spec.prompt.version,
      model: result?.model ?? null,
      startedAt,
      endedAt: Date.now(),
      usage: result?.usage,
      outcome,
    })
  );

  return value;
}

/**
 * Hand a started, un-awaited promise to the platform so the function is not
 * frozen before it finishes (#405).
 *
 * The ingest is deliberately off the request path — a teacher never waits for
 * observability — but "not awaited" and "allowed to be killed" are different
 * things. On Vercel a serverless invocation can be frozen the moment its
 * response is sent, and the ingest POST takes around 0.7s against a request
 * that often returns faster than that. Fluid Compute reuses instances and
 * usually lets background work finish; usually is not a guarantee, and the
 * symptom of losing that race is a trace that silently never appears, which
 * is the failure mode this whole surface has already been bitten by twice.
 *
 * `after` is Next's own mechanism for exactly this and costs no dependency.
 * It throws outside a request scope, which is every test, the seasonal probe,
 * and the smoke check — and in those there is no invocation to keep alive and
 * nothing to do but let the promise settle on its own. So the throw is the
 * signal to do nothing, not an error.
 */
function keepAlive(pending: Promise<void> | undefined): void {
  // Everything here is wrapped, and that is the point rather than caution.
  // This runs AFTER the model has answered and the draft has been checked, so
  // anything that throws in here throws away work the teacher already waited
  // for, and turns a successful draft into an exception on the request path.
  // Observability must not be able to do that. The first version of this
  // function was not wrapped and did exactly that the moment a trace helper
  // returned something other than a promise.
  // Promise.resolve().catch() cannot throw, whatever `pending` is — including
  // undefined, which is how the first version of this managed to throw inside
  // draft() after the model had already answered. So one guard, around the one
  // call that can: `after` throws outside a request scope.
  const settled = Promise.resolve(pending).catch(() => {});
  try {
    after(settled);
  } catch {
    void settled;
  }
}
