import { z } from "zod";

const nonNegativeInteger = z.number().int().nonnegative();

/**
 * The hybrid journey's own resumable steps (see `Step` in `HybridJourney.tsx`).
 * `intro` and `celebrate` are deliberately absent: `intro` is the doorstep a
 * fresh open already lands on, and `celebrate` is the lesson's own "done" —
 * neither is a place worth naming back to a teacher.
 */
const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("settle"), card: nonNegativeInteger }).strict(),
  /**
   * The introduction's four beats (#1004): topic, day, the indexed question,
   * and the outside screen. A run saved by an older build carries `introduce`
   * or an unindexed `ask` and fails closed here — the resume gate's existing
   * posture, costing a teacher one tap rather than a wrong page. The index is
   * clamped to the session's question count on resume, never thrown on.
   */
  z.object({ kind: z.literal("topic") }).strict(),
  z.object({ kind: z.literal("look") }).strict(),
  z.object({ kind: z.literal("day") }).strict(),
  z.object({ kind: z.literal("ask"), index: nonNegativeInteger }).strict(),
  z.object({ kind: z.literal("outside") }).strict(),
  z
    .object({
      kind: z.literal("phase"),
      phase: nonNegativeInteger,
      moment: nonNegativeInteger,
    })
    .strict(),
  z.object({ kind: z.literal("circle") }).strict(),
  z.object({ kind: z.literal("reflect") }).strict(),
]);

const journeyProgressSchema = z
  .object({
    version: z.literal(1),
    ownerScope: z.string().min(1).max(240),
    sessionId: z.string().min(1).max(240),
    step: stepSchema,
    startedAt: nonNegativeInteger.nullable(),
    pausedAt: nonNegativeInteger.nullable(),
    pausedMs: nonNegativeInteger,
    introductionSetting: z.enum(["indoors", "outside"]).optional(),
  })
  .strict();

export type JourneyProgress = z.infer<typeof journeyProgressSchema>;
export type JourneyStep = JourneyProgress["step"];

/**
 * A run belongs to one owner/class and one authored session. Encoding each
 * segment prevents ids containing punctuation from creating the same key.
 * Mirrors `lib/run/progress.ts`'s `runProgressKey` exactly, one version
 * namespace of its own so the two runners' saved shapes can never collide or
 * be misread as each other.
 */
export function journeyProgressKey(ownerScope: string, sessionId: string): string {
  return [
    "nature-class:journey-progress:v1",
    encodeURIComponent(ownerScope),
    encodeURIComponent(sessionId),
  ].join(":");
}

/**
 * localStorage is an untrusted boundary on a shared device. A value must be
 * exactly the current schema and exactly the owner/session the page placed
 * in this journey; malformed, legacy and cross-class state all fail closed.
 */
export function parseJourneyProgress(
  raw: string | null,
  expected: { ownerScope: string; sessionId: string }
): JourneyProgress | null {
  if (!raw) return null;

  try {
    const parsed = journeyProgressSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (
      parsed.data.ownerScope !== expected.ownerScope ||
      parsed.data.sessionId !== expected.sessionId
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
