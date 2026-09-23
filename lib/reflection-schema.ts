import { z } from "zod";
import {
  happeningKeys,
  moodKeys,
  moreOfKeys,
  timingKeys,
} from "@/lib/reflection";
import { NOTE_MAX } from "@/lib/reflection-note";

/**
 * The wire schema for a reflection written after the fact (#327).
 *
 * It lives beside the vocabulary rather than inside the route so that it can
 * be tested for what it REFUSES without standing a request up: the value of a
 * closed vocabulary is entirely in what it turns away, and a validator whose
 * rejections are never exercised is a promise, not a boundary.
 *
 * `.strict()` keeps the JOURNAL out of the north-star number: `headcount`,
 * `startedAt`, `endedAt`, `sessionId` and `classId` are not in this object, so
 * a payload carrying one is refused rather than ignored. Minutes outside stay
 * a property of what the runner recorded on the day, never of anything typed
 * into a journal afterwards.
 *
 * It also means the ONE open field is the one named here. `note` is free text
 * on purpose (#347); every other key is refused, so a second free field cannot
 * appear by someone adding it to a fetch body.
 *
 * Null is meaningful and distinct from absent only in intent: the route
 * replaces all four fields on every write, so an omitted key clears its
 * column exactly as an explicit null does. That is what lets a teacher un-tap
 * an answer she gave in the field.
 */

const oneOf = (values: string[]) =>
  z.string().refine((value) => values.includes(value), {
    message: "not an accepted value",
  });

export const reflectionPatchSchema = z
  .object({
    mood: oneOf(moodKeys).nullable().optional(),
    happenings: z.array(oneOf(happeningKeys)).max(happeningKeys.length).optional(),
    timing: oneOf(timingKeys).nullable().optional(),
    moreOf: oneOf(moreOfKeys).nullable().optional(),
    // "Anything else?", in her own words. Bounded generously here and measured
    // against NOTE_MAX after trimming in the route, so trailing whitespace
    // never costs a teacher the end of her sentence.
    note: z.string().max(NOTE_MAX * 2).nullable().optional(),
  })
  .strict();

export type ReflectionPatch = z.infer<typeof reflectionPatchSchema>;
