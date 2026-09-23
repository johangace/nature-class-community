import type { AbilityBand, Block, Phase } from "@/schema/pack";
import { demoPlainText, resolveText } from "@/lib/text";

/**
 * Teaching-moment grouping (presentation only; schema and pack data unchanged).
 *
 * The runner shows one TEACHING MOMENT per screen, not one block. A moment is
 * anchored by something the teacher does with the class — say-aloud, demo,
 * circle-question, named-skill — and carries the quiet blocks that belong to
 * that beat: a teacher-note or conditions-line that follows the anchor in the
 * pack attaches to its screen. A teacher-note with no anchor before it (a
 * setup note opening a phase) still gets its own quiet screen.
 *
 * Pure data-in, data-out so every surface groups the same way.
 */

/** Block kinds that open a moment: the teacher addressing the class. */
const ANCHOR_TYPES: ReadonlySet<Block["type"]> = new Set([
  "say-aloud",
  "demo",
  "circle-question",
  "named-skill",
]);

export interface Moment {
  blocks: Block[];
}

export function groupMoments(blocks: Block[]): Moment[] {
  const moments: Moment[] = [];
  let open: Moment | null = null;
  for (const block of blocks) {
    if (ANCHOR_TYPES.has(block.type)) {
      open = { blocks: [block] };
      moments.push(open);
    } else if (open) {
      // teacher-note / conditions-line following an anchor: same screen.
      open.blocks.push(block);
    } else {
      // Leading quiet block (e.g. a set-up note before the class gathers):
      // its own quiet screen. It never collects followers.
      moments.push({ blocks: [block] });
    }
  }
  return moments;
}

/**
 * Teaching VIEWS: the same grouping, except a leading quiet block attaches
 * FORWARD to the anchor it was written to set up (nc#326).
 *
 * `groupMoments` gives a leading teacher-note a screen of its own, so the See
 * phase — authored as a note then a line — reads as two screens: the teacher
 * is told to encourage children to look up and under, taps, and that
 * instruction is gone before she says the line it was preparing her for.
 * Johan, against the old prototype: "these should be combined". A note set up
 * is read WITH the moment it sets up, above it, the way the prototype held
 * them.
 *
 * A quiet block AFTER an anchor still belongs to that anchor (unchanged): it
 * is a note about the line just said, not about the next one. Trailing quiet
 * blocks with no anchor to attach to keep their own view.
 *
 * Deliberately a second function rather than a change to `groupMoments`:
 * `?run=legacy` is the side-by-side control Johan asked to keep (#291), and a
 * control that moves under him is not a control.
 */
export function groupViews(blocks: Block[]): Moment[] {
  const views: Moment[] = [];
  let waiting: Block[] = [];
  let open: Moment | null = null;
  for (const block of blocks) {
    if (ANCHOR_TYPES.has(block.type)) {
      open = { blocks: [...waiting, block] };
      waiting = [];
      views.push(open);
    } else if (open) {
      open.blocks.push(block);
    } else {
      waiting.push(block);
    }
  }
  if (waiting.length > 0) views.push({ blocks: waiting });
  return views;
}

/** The primary text a block renders, before ability resolution. */
export function blockBaseText(block: Block): string {
  switch (block.type) {
    case "demo":
      return demoPlainText(block);
    case "conditions-line":
      return block.fallbackText;
    case "named-skill":
      return block.skill;
    default:
      return block.text;
  }
}

/** What one screen would actually read as under an ability band. */
export function momentAbilitySignature(moment: Moment, ability: AbilityBand | undefined): string {
  return moment.blocks
    .map((b) => resolveText(blockBaseText(b), b.abilityVariants, ability))
    .join("\u0000");
}

/**
 * What a phase's screens would actually read as under an ability band.
 * Two equal signatures mean a band switch changes nothing visible in that
 * phase — that is what drives the "where did my toggle land?" feedback.
 */
export function phaseAbilitySignature(phase: Phase, ability: AbilityBand | undefined): string {
  return phase.blocks
    .map((b) => resolveText(blockBaseText(b), b.abilityVariants, ability))
    .join("\u0000");
}
