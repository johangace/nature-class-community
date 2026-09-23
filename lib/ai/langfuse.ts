import { randomUUID } from "node:crypto";

/**
 * Langfuse tracing — Nature Class's OWN project, behind a flag.
 *
 * This is deliberately its own thing, separate from any other product's
 * Langfuse: a dedicated Nature Class project with its own keys, its own prompt
 * history, its own evals. Nothing here couples the AGPL repo to a shared
 * instance — set three env vars and traces flow to whichever project those
 * keys belong to; leave them unset and this is a silent no-op and the features
 * work exactly the same.
 *
 *   LANGFUSE_PUBLIC_KEY   pk-lf-...   (this project's public key)
 *   LANGFUSE_SECRET_KEY   sk-lf-...   (this project's secret key)
 *   LANGFUSE_BASE_URL     https://us.cloud.langfuse.com  (or a self-host URL)
 *
 * The host var is read as LANGFUSE_BASE_URL first and LANGFUSE_HOST second.
 * Two names existed: this file read LANGFUSE_HOST while the sibling backend
 * reads LANGFUSE_BASE_URL, so copying an env block between them pointed the
 * host at the default and nobody would have seen a thing -- the failure mode
 * of this module is silence. LANGFUSE_BASE_URL is now the name (it matches
 * the Langfuse SDK's own `baseUrl` option); LANGFUSE_HOST still works.
 *
 * Tracing is observability, never a dependency: a failed or slow ingest can
 * never delay or break a teacher's request. We post with a tight timeout and
 * swallow everything.
 */

export interface TraceInput {
  /** What this generation is called, e.g. "lesson-support-age". */
  promptId: string;
  /** The prompt in the registry it came from, e.g. "lesson-support". */
  promptName: string;
  /** The prompt's committed version, so a trace pins the exact text used. */
  promptVersion: number;
  // Note: no prompt input or model output is carried. Both can contain free
  // text a teacher typed (a child's question), which must never reach the trace
  // store. A trace pins prompt id + version + model + timing + usage + pass/fail
  // — enough to catch a regression, nothing that identifies a child.
  model: string | null;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  /**
   * How the call ended, as a slug: "ok", "model-unavailable", "unparseable",
   * or the category of the guard that refused the draft. This replaced a
   * boolean, which made a timed-out call and an invented species the same
   * byte — and the guards were already computing the distinction on every
   * production call and discarding it.
   *
   * It is a category, never a quote. `outcomeCode` in ./draft derives it from
   * the guard's reason by taking the text before the colon, so the half that
   * quotes the model's own words cannot travel here.
   */
  outcome: string;
}

function config(): { publicKey: string; secretKey: string; host: string } | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  const host = (
    process.env.LANGFUSE_BASE_URL ??
    process.env.LANGFUSE_HOST ??
    "https://us.cloud.langfuse.com"
  ).replace(/\/$/, "");
  return { publicKey, secretKey, host };
}

/** True when a Nature Class Langfuse project is wired. For diagnostics only. */
export function isTracingEnabled(): boolean {
  return config() !== null;
}

/**
 * A fresh id per event.
 *
 * This was a 32-bit FNV hash of id + version + start + end, for idempotency on
 * retry. Nothing retries, so it bought nothing — and it cost a silent
 * data-loss path: two drafts of the same prompt starting and ending in the
 * same millisecond produce the same id, and Langfuse dedupes one away with no
 * error. On a page that drafts several lines at once that is not exotic.
 */
function eventId(): string {
  return `nc-${randomUUID()}`;
}

/**
 * Send one trace (a generation nested under a trace) to the Nature Class
 * Langfuse project. No-op when unconfigured. Fire-and-forget from the caller's
 * point of view: it returns a promise the route may await inside waitUntil, or
 * ignore — either way it can never surface an error.
 */
export async function trace(t: TraceInput): Promise<void> {
  const cfg = config();
  if (!cfg) return;

  const id = eventId();
  const traceId = `${id}-t`;
  const isoStart = new Date(t.startedAt).toISOString();
  const isoEnd = new Date(t.endedAt).toISOString();

  const batch = [
    {
      id: `${id}-trace-evt`,
      type: "trace-create",
      timestamp: isoStart,
      body: {
        id: traceId,
        name: `helper:${t.promptId}`,
        // No input/output: free text stays out of the trace store by design.
        timestamp: isoStart,
        // Coerced, because a caller that passes the wrong shape should lose a
        // tag and not the trace: the API rejects the whole event if any tag is
        // not a string, and the first caller to get this wrong was this repo's
        // own smoke script, which is a .mjs file and therefore untyped.
        tags: ["nature-class", typeof t.outcome === "string" ? t.outcome : "unknown"],
      },
    },
    {
      id: `${id}-gen-evt`,
      type: "generation-create",
      timestamp: isoStart,
      body: {
        id: `${id}-gen`,
        traceId,
        name: t.promptId,
        startTime: isoStart,
        endTime: isoEnd,
        model: t.model ?? undefined,
        // No input/output: see the trace body above.
        // Sent as a PAIR or not at all. Langfuse rejects a generation carrying
        // promptVersion with no promptName, and the rejection is a 400 nested
        // inside a 207 — so the trace lands, the generation vanishes, and
        // nothing says why. Found exactly that way.
        ...(typeof t.promptName === "string" && t.promptName.length > 0
          ? { promptName: t.promptName, promptVersion: t.promptVersion }
          : {}),
        level: t.outcome === "ok" ? "DEFAULT" : "WARNING",
        statusMessage: t.outcome,
        usage: t.usage
          ? { input: t.usage.inputTokens, output: t.usage.outputTokens, unit: "TOKENS" }
          : undefined,
      },
    },
  ];

  const auth = Buffer.from(`${cfg.publicKey}:${cfg.secretKey}`).toString("base64");
  try {
    const res = await fetch(`${cfg.host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ batch }),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });

    // The ingestion endpoint answers 207 and reports per-event outcomes in the
    // body: a malformed event is rejected with a 400 INSIDE a 207 response.
    // This used to be discarded, so a payload the API refused looked exactly
    // like a payload it accepted, and the only symptom was an empty dashboard.
    // That is the worst possible failure mode for the one module whose entire
    // job is telling you what happened. It is logged now — never thrown, never
    // awaited by the request path, but never silent either.
    if (!res.ok && res.status !== 207) {
      console.error(`[langfuse] ingestion returned ${res.status}`);
      return;
    }
    const payload = (await res.json().catch(() => null)) as {
      errors?: Array<{ id?: string; status?: number; message?: string }>;
    } | null;
    const errors = payload?.errors ?? [];
    if (errors.length > 0) {
      const first = errors[0];
      console.error(
        `[langfuse] ${errors.length} event(s) rejected; first: ${first?.id} ${first?.status} ${first?.message}`
      );
    }
  } catch {
    // A slow or unreachable Langfuse must never cost the teacher a request.
    // This is the one case that stays quiet: an aborted ingest is expected on
    // a bad network and says nothing about whether our payload is right.
  }
}
