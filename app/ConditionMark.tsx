/**
 * THE CONDITION MARKS — one drawn thing beside the runner's conditions note
 * (2026-09-08).
 *
 * Johan, on Today: *"the top slot can become smaller and less relevant. we can
 * add the lesson note on the runner inside with a conditions or something
 * label only when we have it"*.
 *
 * So the authored hinge reads in the runner now, under a label, and this is
 * the mark that sits on that label. It names the CONDITION KIND that actually
 * matched (`Hinge.kind`), not the day at large, so the note and the mark can
 * never disagree about why the note fired.
 *
 * ── THE PEN IS THE SKY MARKS' PEN, AND THAT IS THE WHOLE INHERITANCE ───────
 *
 * Sophia's sketch (docs/concepts/today-hinge-placement-2026-09-08.html) drew
 * the raindrop and the wind lines in the sky set's own pen, and the reason is
 * that a second drawing vocabulary on the same surface reads as a third-party
 * icon set: *"Never an emoji, never an icon font."*
 *
 *   44 viewBox, fill="none", stroke="currentColor", a 2px DRAWN line,
 *   round cap, round join
 *
 * Same as `app/SkyMark.tsx`, for the same reason it gave: a 24 box scaled up
 * gives a 3.67px stroke and stops matching every other mark in the product.
 * NO `fill` attribute on any path — the root's `fill="none"` is what every
 * contour inherits, which is the trap `tests/unit/sky-mark-fill.spec.ts` was
 * written to close. A closed contour here is a closed LINE, never a shape.
 *
 * ── THE PEN IS 2px ON THE PAGE, NOT 2 UNITS IN THE BOX (2026-09-08) ───────
 *
 * Johan, on the lesson page: *"can u maybe fix the font and icon change
 * color?"* — the mark read faint and grey beside the "Before class" glyphs.
 *
 * Grey was one half of it and the OTHER half was arithmetic. `SkyMark` draws
 * a 44 box at 44px, so one unit is one pixel and `strokeWidth={2}` is a 2px
 * line. This mark draws the same 44 box at 22px beside a label, so a literal
 * `strokeWidth={2}` came out as ONE pixel on the page: half the product's pen,
 * against `PreparationGlyph`'s true 2px in its 24 box at 24px. It was not a
 * lighter mark by anyone's decision, it was the same mark at half weight.
 *
 * So the pen is declared in RENDERED pixels and the viewBox number is derived
 * from the size. Draw this at any size and the line is the product's line.
 *
 * ── SEVEN KINDS, AND TWO OF THEM ARE THE SUN ──────────────────────────────
 *
 * `hot` and `bright` both draw the sun, and that is a decision rather than an
 * oversight: the two conditions differ by what the air is doing, not by what
 * is in the sky, and a mark that is COARSER than its data is the third rule
 * this product draws marks by (#341). A mark invented to tell them apart would
 * be claiming a distinction the drawing cannot honestly carry.
 *
 * `cold` is a frost line and not a snowflake: snow is a sky mark and already
 * drawn, and a cold morning is very often a dry one. The frost sits ON the
 * ground the class is about to kneel on, which is the fact the note is about.
 *
 * ── WHY IT IS `aria-hidden`, WHICH IS THE OPPOSITE OF `SkyMark` ───────────
 *
 * #341's second rule — no unlabelled glyph — is paid here by the words, the
 * way Sophia's sketch specified it: *"The raindrop does not have a caption of
 * its own, but the sentence next to it contains 'after rain', so the word that
 * licenses the mark is in the reading order, every time it draws."* The label
 * "Today's conditions" says what the block is and the authored note says what
 * the day is, both as real text, both before it. A third announcement would
 * read the same fact to a screen-reader user that nobody else is told twice.
 */

import type { ReactElement } from "react";
import type { ConditionKind } from "@/schema/pack";

/**
 * THE SEVEN DRAWINGS, AND THIS RECORD IS THE ONLY THING A REDRAW TOUCHES.
 *
 * One call site (`app/run/HybridJourney.tsx`), the sizing on the `<svg>` below
 * rather than in any body, and no CSS that knows a path. Whoever redraws these
 * keeps the 44 viewBox at 1:1 and the pen, and changes nothing else.
 */
const MARKS: Record<ConditionKind, ReactElement> = {
  // WET: the sketch's own raindrop, with the light on its lower left. Closed
  // and unfilled, so it reads as a drawn outline at 22px in glare.
  wet: (
    <>
      <path d="M22 6.5C22 6.5 32.5 19.2 32.5 26.4C32.5 32.3 27.8 37 22 37C16.2 37 11.5 32.3 11.5 26.4C11.5 19.2 22 6.5 22 6.5Z"/><path d="M17.4 26.9C17.4 29.4 19.2 31.4 21.5 31.8"/>
    </>
  ),
  // WINDY: two lines that curl back on themselves. Two rather than the
  // sketch's three: at the size this actually renders beside a label, the
  // third line closed the gaps and the mark went from moving air to a
  // hamburger menu.
  windy: (
    <>
      <path d="M5 17.5H26.5C29.5 17.5 31.9 15.1 31.9 12.1C31.9 9.1 29.5 6.7 26.5 6.7C24.1 6.7 22.1 8.2 21.4 10.3"/><path d="M5 28.5H23.9C26.9 28.5 29.3 30.9 29.3 33.9C29.3 36.9 26.9 39.3 23.9 39.3C21.5 39.3 19.5 37.8 18.8 35.7"/>
    </>
  ),
  // COLD: frost standing up off a line. Three feathers with their spurs, on
  // the ground rather than in the sky, and deliberately not a six-armed flake
  // — `snow` is a SKY mark and it already exists in the other set.
  cold: (
    <>
      <path d="M5 29H39"/><path d="M13 29V19M22 29V13M31 29V19"/><path d="M9.8 22.2 13 19M16.2 22.2 13 19M18.8 16.2 22 13M25.2 16.2 22 13M27.8 22.2 31 19M34.2 22.2 31 19"/>
    </>
  ),
  // HOT: the sky set's own sun, unchanged, so the two sets read as one hand.
  hot: (
    <>
      <path d="M29.1 26.8A8.5 9 -14 1 1 30 19.1"/><path d="M21.6 11.1 21.2 5.2M29.9 14.1 33.3 10.6M33.1 21.5 39.1 21.9M30.4 29.7 33.6 33.2M21.9 33 21.6 38.6M13.7 29.9 10 33.1M10.6 22.2 4.9 21.8M13.9 14.2 10.8 11"/>
    </>
  ),
  // DRY: ground that has opened. One line for the surface and one crack
  // running down out of it, because the fact a dry note is about is what the
  // soil under a lifted log will be like.
  dry: (
    <>
      <path d="M5 21H39"/><path d="M22 21 18.6 29.2 24 32.4 21.2 39"/><path d="M24 32.4 29.4 34.8"/>
    </>
  ),
  // STILL: one horizontal line, and nothing else in the box. Still air has no
  // shape, and every mark drawn to give it one would be inventing weather.
  still: <path d="M7 22H37"/>,
  // BRIGHT: the sun again. See the header for why this is deliberate.
  bright: (
    <>
      <path d="M29.1 26.8A8.5 9 -14 1 1 30 19.1"/><path d="M21.6 11.1 21.2 5.2M29.9 14.1 33.3 10.6M33.1 21.5 39.1 21.9M30.4 29.7 33.6 33.2M21.9 33 21.6 38.6M13.7 29.9 10 33.1M10.6 22.2 4.9 21.8M13.9 14.2 10.8 11"/>
    </>
  ),
};

/** The product's pen, in pixels as they land on the page. */
const PEN = 2;

/** The box every path above is drawn in. */
const BOX = 44;

/**
 * One mark, decorative, at whatever size the caller asks for, always drawn
 * with the product's own 2px line.
 *
 * `strokeWidth` is derived rather than literal: at 22px the 44 box is at half
 * scale, so it takes 4 viewBox units to put 2 pixels on the page. See the
 * header for the bug this closes.
 */
export function ConditionMark({
  kind,
  size = 22,
  className,
}: {
  kind: ConditionKind;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={(PEN * BOX) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {MARKS[kind]}
    </svg>
  );
}
