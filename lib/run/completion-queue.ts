import { z } from "zod";
import { happeningKeys, moodKeys, moreOfKeys, timingKeys } from "@/lib/reflection";
import { NOTE_MAX } from "@/lib/reflection-note";

const oneOf = (keys: string[]) => z.enum(keys as [string, ...string[]]);

const completionDraftSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().min(1).max(240),
    classId: z.string().min(1).max(240),
    startedAt: z.number().int().nonnegative(),
    endedAt: z.number().int().positive(),
    // Optional by design. Old queued drafts keep their number; a teacher who
    // leaves it blank stores an honest absence rather than a made-up zero.
    headcount: z.number().int().min(1).max(40).optional(),
    // The optional reflection. The four taps are closed vocabulary; `note` is
    // the teacher's own words (#347). A draft queued before any of these
    // fields existed parses unchanged, which is the point of them all being
    // optional: an iPad that has been in a drawer since before this shipped
    // still drains cleanly.
    mood: oneOf(moodKeys).optional(),
    happenings: z.array(oneOf(happeningKeys)).max(happeningKeys.length).optional(),
    timing: oneOf(timingKeys).optional(),
    moreOf: oneOf(moreOfKeys).optional(),
    note: z.string().max(NOTE_MAX * 2).optional(),
    clientKey: z.string().min(8).max(64),
  })
  .strict();

export type CompletionDraft = z.infer<typeof completionDraftSchema>;

export function completionQueueKey(classId: string): string {
  return `nature-class:completion-queue:v1:${encodeURIComponent(classId)}`;
}

function hashPart(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Stable for one class/session/run start, so a lost response or finish-page
 * reload retries the same server upsert instead of minting a duplicate.
 */
export function completionClientKey(
  classId: string,
  sessionId: string,
  startedAt: number
): string {
  const identity = `${classId}\u0000${sessionId}\u0000${startedAt}`;
  return [
    "completion-v1",
    startedAt.toString(36),
    hashPart(identity, 0x811c9dc5),
    hashPart(identity, 0x9e3779b9),
  ].join("-");
}

/**
 * A shared device is an untrusted storage boundary. Salvage valid entries,
 * but never adopt a draft belonging to another active class.
 */
export function parseCompletionQueue(
  raw: string | null,
  expected: { classId: string }
): CompletionDraft[] {
  if (!raw) return [];

  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => {
      const parsed = completionDraftSchema.safeParse(entry);
      if (!parsed.success || parsed.data.classId !== expected.classId) return [];
      return [parsed.data];
    });
  } catch {
    return [];
  }
}

/** One completion key is one record, even when a failed response is retried. */
export function enqueueCompletion(
  queue: readonly CompletionDraft[],
  draft: CompletionDraft
): CompletionDraft[] {
  const at = queue.findIndex((item) => item.clientKey === draft.clientKey);
  if (at === -1) return [...queue, draft];
  const next = [...queue];
  next[at] = draft;
  return next;
}

/** Remove only requests settled from a prior snapshot; later writes survive. */
export function removeCompletionKeys(
  queue: readonly CompletionDraft[],
  settledKeys: ReadonlySet<string>
): CompletionDraft[] {
  return queue.filter((draft) => !settledKeys.has(draft.clientKey));
}

/** The completion endpoint uses only 400/403 for requests that cannot become
 * valid on retry. Authentication, throttling and timeout responses stay queued. */
export function isTerminalCompletionStatus(status: number): boolean {
  return status === 400 || status === 403;
}
