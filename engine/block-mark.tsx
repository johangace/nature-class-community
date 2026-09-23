import type { ReactElement } from "react";
import { KindIcon, kindCaption, kindTone, type BlockKind } from "./icons";

/**
 * The mark a block wears — a glyph in the margin, and NO WORDS.
 *
 * Johan: "maybe maybe instead of say aloud a stronger visual language could
 * work", after twice saying the built surface was too dense and that the
 * visual language was too weak (nc#252, a ticket he titled exactly that).
 *
 * The captions are gone. They were tracked, letterspaced, 800-weight labels
 * repeated on every block — 781 instances across the packs, three of them in a
 * single viewport — and they were doing a job that type and position should
 * have been doing all along. Worse, they were the ONLY thing distinguishing
 * the two voices, because the differential left edge the design rests on was
 * never actually built: measured, the spoken line and the teacher direction sat
 * 1.8px apart in identical ink. So the labels could not be removed until the
 * edge was real. It is now, and they can.
 *
 * Two independent design passes reached this same conclusion separately, and
 * both landed on the same detail: SPEECH NEEDS NO GLYPH. The hanging quotation
 * mark already is the say-aloud mark — it is unique on the page, it measures
 * 6.28:1 in daylight and 1.75:1 under glare, and it survives a mono
 * photocopier where hue does not. Giving speech a second mark would be saying
 * the same thing twice.
 *
 * Size is not a style choice. At arm's length the shipped 21px glyph at a 1.6
 * stroke subtends about 1.6 arc-minutes — at the limit of human acuity, and
 * below it in glare — so it failed for the same physical reason the brown ink
 * did. 26px at a 2.0 stroke clears it. That number is measured, not taste, and
 * should not be trimmed for tidiness.
 *
 * The convention is stated ONCE, in the lesson's front matter, the way a field
 * guide has a symbols page: visible everywhere, readable-aloud nowhere. A
 * teacher never has to be told twice, and a label can never be read to the
 * class by mistake.
 *
 * The name still travels for screen readers, because a mark that means
 * something must announce that meaning to someone who cannot see it.
 */
export function BlockMark({ kind }: { kind: BlockKind }): ReactElement | null {
  // Speech is marked by its quotation mark, in say-aloud.tsx. Nothing here.
  if (kind === "say-aloud") return null;

  return (
    <span className={`block-mark tone-${kindTone[kind]}`}>
      <KindIcon kind={kind} size={26} />
      <span className="sr-only">{kindCaption[kind]}</span>
    </span>
  );
}
