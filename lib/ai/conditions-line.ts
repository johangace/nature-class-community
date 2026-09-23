import { isModelAvailable } from "./model";
import { draft, stringField } from "./draft";
import { loadPrompt } from "./prompt-registry";

/**
 * The conditions line, written by the model from measured weather.
 *
 * Johan, 2026-08-17: *"my guidance is add ai intelligence instead of hard
 * coded intelligence"*.
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 *
 * `composeConditionsLine` builds one sentence by concatenation:
 *
 *     "Right now it feels like " + degrees + " degrees out"
 *       + " under " + SKY_PHRASES[sky]
 *       + ", with " + windPhrase(kph) + "."
 *
 * Three lookup tables and a fixed sentence shape. Every school, every day of
 * the year, the same clause order and the same nine adjectives. It is the
 * first line a teacher reads on the card, and it has been the same line since
 * it was written.
 *
 * ── WHAT THE MODEL MAY AND MAY NOT DO ──────────────────────────────────────
 *
 * office#330 wrote the rule for exactly this case: **templates and
 * deterministic comparison, the model limited to register, with a
 * numbers-unchanged diff check.** So:
 *
 *   MEASURED, and never the model's: the felt temperature, the sky condition,
 *   the wind speed, whether it is raining. These come from Pointmoon with
 *   per-token confidence, and the temperature is already converted to the
 *   reader's own scale by the one owner that is allowed to do it.
 *
 *   THE MODEL'S: the sentence. Whether the wind or the sky leads, what to
 *   leave out on a day when there is little to say, how it sounds read aloud
 *   to a class about to go outside.
 *
 * ── THE NUMBER IS THE THING THAT CANNOT MOVE ───────────────────────────────
 *
 * `checkConditionsLine` requires the temperature to appear EXACTLY as supplied
 * and requires no other number to appear at all. A model that rounds 13 to 12,
 * or helpfully adds a wind speed in kph, or converts to the other scale, is
 * discarded. That is not a style preference: a teacher who reads a temperature
 * a degree out for no reason stops trusting the rest of the card, and the card
 * is the product's whole claim to being about right now.
 *
 * Everything fails to the authored composition, which is a good sentence.
 */

export interface ConditionsFacts {
  /** The felt temperature as a whole number, already in the reader's scale. */
  degrees: number;
  /** "degrees" spoken aloud carries no unit symbol; the scale is in the number. */
  sky: string | null;
  wind: string | null;
  raining: boolean;
  heavyRain: boolean;
  /** The deterministic sentence, which renders whenever this path declines. */
  fallback: string;
}



/** Exported for scripts/prompt-eval.mjs: the harness must render the user
 *  half exactly as production does, or it measures a prompt nobody ships. */
export function buildUser(facts: ConditionsFacts): string {
  return [
    `It feels like ${facts.degrees} degrees.`,
    facts.sky ? `The sky: ${facts.sky}.` : "The sky was not reported.",
    facts.wind ? `The wind: ${facts.wind}.` : "No wind worth mentioning.",
    facts.raining
      ? facts.heavyRain
        ? "It is raining."
        : "It is raining lightly."
      : "It is not raining.",
    "",
    "Write the line.",
  ].join("\n");
}

export interface ConditionsCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Everything that must hold before a drafted conditions line reaches a teacher.
 *
 * Pure and exported, so the rule is a thing with a name that a test can watch
 * reject something, rather than a condition buried in a call site.
 */
export function checkConditionsLine(
  draft: string,
  facts: ConditionsFacts
): ConditionsCheck {
  const text = draft.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > 160) return { ok: false, reason: "too long" };
  if (text.split(/\s+/).length > 28) return { ok: false, reason: "too many words" };
  if (/[—–]/.test(text)) return { ok: false, reason: "em dash" };
  if (/!/.test(text)) return { ok: false, reason: "exclamation" };
  // Two, not three: no acronym belongs in a sentence about the weather, and
  // "IT feels like" is the register slipping just as surely as shouting is.
  if (/\b[A-Z]{2,}\b/.test(text)) return { ok: false, reason: "all caps" };
  if (/https?:\/\/|[<>]/.test(text)) return { ok: false, reason: "markup or link" };

  // THE NUMBERS CHECK. Every number in the draft must be the temperature we
  // supplied, and the temperature must be there. A model that rounds it, adds
  // a wind speed, or converts the scale is discarded.
  const numbers = text.match(/-?\d+(\.\d+)?/g) ?? [];
  if (numbers.length === 0) return { ok: false, reason: "lost the temperature" };
  for (const n of numbers) {
    if (Number(n) !== facts.degrees) {
      return { ok: false, reason: `changed or added a number: ${n}` };
    }
  }

  // Weather it was not told about. A model reaching for "clearing later" or
  // "a real autumn chill" has started forecasting, which nothing here can
  // support and no teacher can check.
  const INVENTED =
    /\b(forecast|later|tomorrow|this afternoon|clearing|will be|should be|expect|autumn|winter|spring|summer|storm|snow|frost|thunder|humid)\w*/i;
  const invented = text.match(INVENTED);
  if (invented) return { ok: false, reason: `not measured: ${invented[0]}` };

  // Rain is a fact, in both directions.
  const saysRain = /\brain|drizzl|shower|wet\b/i.test(text);
  if (saysRain && !facts.raining) return { ok: false, reason: "invented rain" };

  return { ok: true };
}

/**
 * Draft the line, or return null so the authored composition renders.
 *
 * Null on: no model, a slow or failed call, unparseable output, or a draft
 * that fails the check. All of those are ordinary, because the fallback is a
 * sentence somebody wrote on purpose.
 */
export async function draftConditionsLine(
  facts: ConditionsFacts
): Promise<string | null> {
  if (!isModelAvailable()) return null;

  const prompt = loadPrompt("conditions-line");
  if (!prompt) return null;

  return draft({
    prompt: { ...prompt, user: buildUser(facts) },
    facts,
    maxTokens: 150,
    parse: stringField("line"),
    check: checkConditionsLine,
  });
}
