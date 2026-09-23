import { z } from "zod";
import { abilityBands, conditionKinds } from "@/schema/pack";

const nonNegativeInteger = z.number().int().nonnegative();

const locationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("phase"),
      phaseIndex: nonNegativeInteger,
      pageIndex: nonNegativeInteger,
    })
    .strict(),
  z
    .object({
      kind: z.literal("settle-checkpoint"),
      phaseIndex: nonNegativeInteger,
    })
    .strict(),
  z
    .object({
      kind: z.literal("show"),
      itemIndex: nonNegativeInteger,
      returnPhaseIndex: nonNegativeInteger,
    })
    .strict(),
  z.object({ kind: z.literal("finish") }).strict(),
]);

const runProgressSchema = z
  .object({
    version: z.literal(3),
    ownerScope: z.string().min(1).max(240),
    sessionId: z.string().min(1).max(240),
    location: locationSchema,
    startedAt: nonNegativeInteger,
    pausedAt: nonNegativeInteger.nullable(),
    pausedMs: nonNegativeInteger,
    ability: z.enum(abilityBands).nullable(),
    condition: z.enum(conditionKinds).nullable(),
  })
  .strict();

export type RunProgress = z.infer<typeof runProgressSchema>;
export type RunLocation = RunProgress["location"];

/**
 * A run belongs to one owner/class and one authored session. Encoding each
 * segment prevents ids containing punctuation from creating the same key.
 */
export function runProgressKey(ownerScope: string, sessionId: string): string {
  return [
    "nature-class:run-progress:v3",
    encodeURIComponent(ownerScope),
    encodeURIComponent(sessionId),
  ].join(":");
}

/**
 * localStorage is an untrusted boundary on a shared device. A value must be
 * exactly the current schema and exactly the owner/session the server placed
 * in this runner; malformed, legacy and cross-class state all fail closed.
 */
export function parseRunProgress(
  raw: string | null,
  expected: { ownerScope: string; sessionId: string }
): RunProgress | null {
  if (!raw) return null;

  try {
    const parsed = runProgressSchema.safeParse(JSON.parse(raw));
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
