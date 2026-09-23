import { z } from "zod";
import type { HazardEntry } from "@/lib/lesson/hazards";
import { sessionSchema, type Session } from "@/schema/pack";

/** The full authored session is the basic offline lesson; it is not reduced. */
export type CoreSession = Session;

export const coreShelfSeasons = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

const coreShelfEntrySchema = z
  .object({
    packId: z.string().min(1),
    packTitle: z.string().min(1),
    subject: z.string().min(1),
    ageBand: z.string().min(1),
    season: z.enum(coreShelfSeasons),
    sessionIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type CoreShelfEntry = z.infer<typeof coreShelfEntrySchema>;

const publicHazardEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    note: z.string().min(1),
  })
  .strict();

export interface CoreLessonReleaseV1 {
  version: 1;
  releaseKind: "open-core";
  contentFingerprint: string;
  generatedAt: string;
  shelf: CoreShelfEntry[];
  sessions: Record<string, CoreSession>;
  retiredSessionIds: Record<string, string>;
  universalSafety: HazardEntry[];
}

/**
 * Strict at every boundary: the top-level release, shelf rows, sessions, and
 * safety entries all reject unknown fields. A public core artifact must never
 * quietly begin carrying owner, class, school, or place data.
 */
export const coreLessonReleaseV1Schema: z.ZodType<CoreLessonReleaseV1> = z
  .object({
    version: z.literal(1),
    releaseKind: z.literal("open-core"),
    contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.iso.datetime(),
    shelf: z.array(coreShelfEntrySchema).min(1),
    sessions: z.record(z.string().min(1), sessionSchema),
    retiredSessionIds: z.record(z.string().min(1), z.string().min(1)),
    universalSafety: z.array(publicHazardEntrySchema).min(1),
  })
  .strict();

export function parseCoreLessonReleaseV1(value: unknown): CoreLessonReleaseV1 {
  return coreLessonReleaseV1Schema.parse(value);
}
