/**
 * "Carry outside" has a zero case, and the zero case is where a product looks
 * cheap. Several sessions genuinely need nothing carried, and the packs say so
 * by putting the sentence "None required" INTO the list — so the sheet printed
 * a tick box beside it and asked a child to tick nothing.
 *
 * A check square is a promise that there is a thing to find and carry. When
 * there is no such thing there should be no box and no list, just the sentence.
 * This reads the kit rather than trusting its length, because the emptiness is
 * expressed as content, not as an empty array.
 *
 * The hedged variants a few packs still carry ("None required, binoculars
 * optional") are content faults, not render faults: they hold real information
 * and belong in a proper item. They deliberately do NOT match here, so they
 * stay visible until the content is fixed rather than being silently swallowed.
 */
const NOTHING = "none required";

/** True when this session's kit is a statement that there is nothing to carry. */
export function carriesNothing(kit: readonly string[]): boolean {
  if (kit.length === 0) return true;
  if (kit.length > 1) return false;
  return kit[0]?.trim().toLowerCase().replace(/\.$/, "") === NOTHING;
}

/** The sentence that replaces the list when there is nothing to carry. */
export const NOTHING_TO_CARRY = "Nothing to carry.";
