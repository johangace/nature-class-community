import type { AbilityBand, Block } from "@/schema/pack";
import { resolveText, spokenLine } from "@/lib/text";
import type { SpokenAudio, SpokenClip } from "@/lib/lesson/spoken-audio";

/**
 * Which recording, if any, belongs to the moment on screen (nc#358).
 *
 * Its own module, holding no data, so the runner — a client component — can
 * call it without dragging the whole manifest into the browser bundle, and so
 * the one type check this feature turns on can be tested against every real
 * pack rather than asserted in a comment.
 *
 * `block.type === "say-aloud"` IS THE FEATURE'S SAFETY PROPERTY. A moment
 * routinely carries a teacher-note beside its spoken line — that is what
 * `groupViews` is for — and a note is direction to the teacher. Reading one to
 * thirty children is the worst thing this control could do, so the note is
 * never even looked up.
 *
 * There is a second, independent guard behind this one: the synthesis script
 * offers the synthesiser nothing but say-aloud text, so no note has a manifest
 * key to find. Both would have to be broken in the same change.
 */
export function clipForMoment(
  blocks: readonly Block[],
  ability: AbilityBand | undefined,
  audio: SpokenAudio
): SpokenClip | null {
  const said = blocks.find((block) => block.type === "say-aloud");
  if (said?.type !== "say-aloud") return null;
  // The line as the page renders it, so what plays and what is printed under
  // the button are the same sentence.
  const line = spokenLine(resolveText(said.text, said.abilityVariants, ability));
  return audio[line] ?? null;
}
