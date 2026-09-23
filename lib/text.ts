import type { AbilityBand, AbilityVariants } from "@/schema/pack";

/**
 * Ability resolution: a block's primary text may be overridden per ability
 * band. Absent override = the base text. Pure function; every renderer that
 * carries text calls this, so variants are engine-native, not per-surface.
 *
 * AN ABSENT BAND IS A CASE, NOT A GAP TO FILL (#860). A class can genuinely
 * have no band — signed out, or a year group `bandForYearGroup` does not
 * recognise — and the surfaces above pass that straight through. `undefined`
 * here means "no variant", never "pick one": the honest answer for a class
 * whose age nobody knows is the words as written, the same answer an authored
 * band with no variant gets. The alternative was three components defaulting to
 * the real band `"y1"`, which was harmless only because no pack had authored a
 * y1 variant yet — a coincidence of what nobody had written, not a property of
 * the code.
 */
export function resolveText(
  base: string,
  variants: AbilityVariants | undefined,
  ability: AbilityBand | undefined
): string {
  if (!ability) return base;
  return variants?.[ability] ?? base;
}

/**
 * A spoken line, ready to sit inside a surface that draws its own quotation
 * marks. Returns the line without its authored wrapping pair; everything else
 * comes back untouched.
 *
 * WHY THIS IS A RENDER DECISION AND NOT AN EDIT.
 *
 * Johan wrote the spring say-aloud lines wrapped in quote marks, because a
 * quoted line is how you write down something meant to be said out loud. Every
 * surface that shows one ALSO draws quotes of its own: the runner and the
 * circle card hang an oversized leaf-green opening glyph inside the plate, the
 * printed plan wraps the line in curly quotes, and /read wraps each
 * child-friendly phrasing the same way. Restoring his text verbatim (#140)
 * therefore put two sets of quotes on one line — an opening curly glyph
 * immediately followed by a straight one, with its partner left dangling.
 *
 * Something has to give, and there are exactly two honest places to give it:
 * the pack or the renderer. Giving in the pack is what happened last time. The
 * port deleted his quote marks, and his line breaks, and his emphasis, and his
 * em dashes, and nobody could see it because nothing compared the two. So it
 * gives here instead, at the last possible moment, in the layer whose whole job
 * is presentation. The pack, the fixture and the fidelity check all still hold
 * the string exactly as he typed it; only the pixels differ, and the decision
 * is one function a reviewer can read and reverse in a line.
 *
 * Deliberately narrow: it unwraps only when the line opens and closes with a
 * quote and contains no others, so there is exactly one pair and no judgement
 * to make. A line with quotes inside it — someone speaking within the line — is
 * left completely alone. That is his structure rather than a wrapper, and
 * guessing at it is the bug this seam exists to prevent.
 */
export function spokenLine(text: string): string {
  if (!text.startsWith('"') || !text.endsWith('"') || text.length < 2) return text;
  if ((text.match(/"/g) ?? []).length !== 2) return text;
  return text.slice(1, -1);
}

/**
 * One demo block as a single line of prose (#252).
 *
 * A demo used to BE a string, so four surfaces read `block.technique` directly:
 * the glossary/entity scan, the journey text scan, the work-phase fallback and
 * the paper plan. Now that the block is a move plus an array plus an optional
 * closing beat, they need one agreed flattening rather than four, or they drift
 * into four different answers to "what does this block say".
 *
 * Sentences are joined with a space and each is terminated, so a scan that
 * looks for a word finds it and a reader that prints the result gets prose
 * rather than run-on. The move name leads, because it is what the teacher
 * calls the thing when she talks about it.
 */
export function demoPlainText(block: {
  move: string;
  steps: { text: string }[];
  look?: string;
}): string {
  const parts = [block.move, ...block.steps.map((step) => step.text)];
  if (block.look) parts.push(block.look);
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(" ");
}
