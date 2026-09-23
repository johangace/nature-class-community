/**
 * THE SKY MARKS — the one drawn thing on Today (#341).
 *
 * Johan rejected the drawn weather band: *"the drawings are ugly... just more
 * iconography"*. This is what replaced it, and the restraint is the design:
 * ONE mark on the block, the sky, which is exactly what his reference has.
 * Light left and the ground are quantities and stay as digits and words.
 *
 * ── WHY THIS IS NOT IN engine/icons.tsx ────────────────────────────────────
 *
 * That file is keyed on `BlockKind`, a lesson-runner union, in a 24 viewBox.
 * Weather is not a block kind, and a 24 box scaled to 44 gives a 3.67px stroke
 * against the 2px pen every other mark in the product is drawn with. So these
 * are a sibling rather than an extension, and what they inherit from it is the
 * PEN and nothing else:
 *
 *   fill="none" stroke="currentColor" strokeWidth={2} round cap, round join
 *
 * Drawn at shipping size: a 44 viewBox rendered at 44px, so one SVG unit is
 * one CSS pixel, the 2px stroke is 2px, and there is no `vector-effect` and no
 * viewBox arithmetic anywhere in the build.
 *
 ── NO FILL, AND THAT IS THE WHOLE POINT ───────────────────────────────────

 * These marks carry NO `fill` attribute. Not "fill none as a default" — none
 * at all, so the root's `fill="none"` is what every contour inherits. THE MARK
 * IS A LINE, and it survives on its 2px stroke alone.
 *
 * The first cut of this file wrote `fill="var(--cloud)"` on seven paths. It
 * came out of the concept sheet, where it had never rendered: the sheet
 * defines `--sand` and has no `--cloud` at all, an unresolvable `var()` is
 * invalid at computed-value time, and `fill` inherits — so in the sheet it
 * silently fell back to the root's `fill="none"` and drew as open line.
 * `app/today.module.css` DID define `--cloud`, so the same eight paths drew as
 * solid cream shapes in the product. Two surfaces, one set of paths, opposite
 * results, and nobody could see it in review.
 *
 * Johan judged these "too geometric" against the filled version. The fill was
 * never a design decision anyone made; it was a variable name that happened to
 * resolve on one side and not the other. `tests/unit/sky-mark-fill.spec.ts`
 * now makes that failure mode impossible rather than merely fixed.
 *
 * ── THE THREE RULES THIS SET IS BUILT ON ───────────────────────────────────
 *
 * 1. A glyph names a STATE. A number states a QUANTITY. A glyph never carries
 *    a quantity. That is why light left is digits and why there is no ground
 *    mark: neither is a small closed set a shape can name.
 * 2. NO UNLABELLED GLYPH. The word directly under a mark is what licenses it,
 *    and it is printed every day rather than taught once and withdrawn. Delete
 *    the word and the mark goes with it.
 * 3. A glyph may be COARSER than its label, never finer. The label keeps the
 *    producer's full resolution, which is what lets one mark serve two strings
 *    without ever claiming more than the data says.
 */

import type { ReactElement } from "react";
import { SKY_MARK_LABEL, type SkyMarkKind } from "@/lib/outside/sky-mark";

/**
 * THE ELEVEN DRAWINGS, AND THIS RECORD IS THE ONLY THING A REDRAW TOUCHES.
 *
 * Johan has already called these too geometric — *"ground marks look ugly tbh
 * ... design something less geometric.. maybe just line or something"* — and
 * the visual lead is redrawing them as line work. They ship as specified in
 * the meantime, so the hierarchy is not held up behind an illustration pass.
 *
 * The swap is deliberately one place. There is exactly ONE call site in the
 * product (`<SkyMark kind={...} />` in `app/TodayDay.tsx`), the chooser and
 * the labels live in `lib/outside/sky-mark.ts` and do not move, and the sizing
 * lives on the `<svg>` below rather than in any of the eight bodies. So a
 * redraw replaces the eight values in this record and nothing else: no call
 * site changes, no CSS changes, and no test that asserts the block's structure
 * needs rewriting.
 *
 * Whoever redraws these keeps two things: the 44 viewBox at 1:1 (a 24 box
 * scaled up gives a 3.67px stroke and stops matching every other mark in the
 * product), and the pen — 2px, round cap, round join, `currentColor`. The
 * mark carries no fill at all, so it must read on its stroke alone in glare —
 * which is what it is drawn to do.
 */
const MARKS: Record<SkyMarkKind, ReactElement> = {
  "clear": (
    <>
      <path d="M29.1 26.8A8.5 9 -14 1 1 30 19.1"/><path d="M21.6 11.1 21.2 5.2M29.9 14.1 33.3 10.6M33.1 21.5 39.1 21.9M30.4 29.7 33.6 33.2M21.9 33 21.6 38.6M13.7 29.9 10 33.1M10.6 22.2 4.9 21.8M13.9 14.2 10.8 11"/>
    </>
  ),
  "mostly-clear": (
    <>
      <path d="M22.9 20.8A7.4 8 -20 1 1 24.3 14"/><path d="M16.7 8.7 16.2 4.4M23.3 10.4 26.1 7.3M9.9 12.9 6.4 10.2M8.2 19.9 4.1 20.6M9.8 26 6.9 29.1"/><path d="M25.4 33.3C22.5 32.9 21.2 29.3 23.1 27C24.2 25.6 26 25.1 27.6 25.7C27.7 21.6 31.6 18.8 35.2 20.1C37.6 21 39.2 23.2 39.3 25.6C41.6 26.4 42.1 29.6 40.3 31.7C39.4 32.8 38 33.3 36.6 33.4C32.9 33.6 28.1 33.5 24.2 33.3"/>
    </>
  ),
  "partly-cloudy": (
    <>
      <path d="M18.1 15.4A5.7 6.2 -16 1 1 18.3 8.4"/><path d="M12.9 4.9 12.5 1.4M18.9 5.9 21.3 3.2M6.9 9.5 3.8 7.4M6.1 15.6 2.4 16.2"/><path d="M15.4 33.1C11.5 32.5 9.8 27.7 12.3 24.6C13.8 22.8 16.3 22.1 18.4 23C18.6 17.6 23.8 13.9 28.6 15.6C31.8 16.7 34 19.6 34.1 22.8C37.2 23.8 38 28.1 35.6 30.9C34.3 32.4 32.5 33.2 30.6 33.3C25.6 33.6 19.2 33.5 13.9 33.1"/>
    </>
  ),
  "cloudy": (
    <>
      <path d="M13.4 32.1C9.4 31.5 7.6 26.6 10.2 23.5C11.7 21.7 14.2 21 16.3 21.9C16.5 16.4 21.8 12.6 26.7 14.3C30 15.4 32.2 18.4 32.3 21.7C35.4 22.7 36.2 27.1 33.8 29.9C32.5 31.4 30.7 32.2 28.8 32.3C23.7 32.6 17.2 32.5 11.8 32.1"/>
    </>
  ),
  "overcast": (
    <>
      <path d="M9.6 34.9C4.4 34.4 2 28.6 5.2 24.7C7.1 22.4 10.2 21.5 12.7 22.6C12.6 15.4 18.7 10.5 25.1 12C30 13.2 33.4 17.1 33.8 21.5C38.6 21.3 42 25.6 40.9 30.1C40.1 33.2 37.4 35.1 34.4 35.2C26.3 35.5 15.2 35.4 7.6 34.9"/>
    </>
  ),
  "fog": (
    <>
      <path d="M3.6 12.4C8.9 9.9 13.7 14.6 19.1 12.2C23.6 10.2 27.9 13.4 32.3 12.6"/><path d="M12.1 20C16.4 17.9 20 21.6 24.4 19.7C27.6 18.3 30.7 19.9 33.8 19.4"/><path d="M4.9 27.6C10.7 24.9 15.9 29.9 21.8 27.2C26.6 25 31.3 28.5 36.1 27.6"/><path d="M14.8 35.1C18.6 33.2 21.8 36.4 25.7 34.7C28.4 33.5 30.9 34.8 33.6 34.4"/>
    </>
  ),
  // HAZE: a sun you can still find, over air you cannot see far into.
  // Deliberately NOT fog's four wavy lines. Fog is what you are standing IN;
  // haze is what sits between you and the distance — so these bands are
  // straight where fog's are wavy, and they shorten as they recede. The disc
  // alone would read as a moon; the bands are what make it an afternoon.
  // Two bands rather than three: at 32px, which is the size this block
  // actually renders, three crowded the disc and the whole mark went muddy.
  "haze": (
    <>
      <path d="M14 15A8 8 0 1 1 30 15A8 8 0 1 1 14 15"/><path d="M6 29L38 29M11 36.5L33 36.5"/>
    </>
  ),
  // SMOKE: three columns rising, drawn VERTICALLY because every other
  // obscuring mark in this set lies flat. That is the whole read at a glance —
  // fog and haze sit across the view, smoke climbs through it.
  // Three full bends each, not one: the first cut used a single C-curve per
  // column and at 32px it read as three chevrons, like a signal-strength
  // glyph. Smoke has to double back on itself to look like smoke.
  "smoke": (
    <>
      <path d="M9 39C9 35.8 13 34.2 13 31C13 27.8 9 26.2 9 23C9 19.8 13 18.2 13 15"/><path d="M20 40.5C20 37 24 35.2 24 31.7C24 28.1 20 26.4 20 22.8C20 19.3 24 17.5 24 14"/><path d="M31 39C31 35.9 35 34.4 35 31.3C35 28.3 31 26.7 31 23.7C31 20.6 35 19.1 35 16"/>
    </>
  ),
  // SNOW: the same cloud as the two rains, because it IS the same cloud —
  // what changes is what falls out of it. Six-armed asterisks rather than the
  // rains' slanted streaks, which is the distinction a teacher needs without
  // reading the word.
  // TWO flakes at r=3.4, not three at r=2.6. Three were drawn first and at
  // 32px the arms filled in at a 2px stroke and read as blobs — the shape that
  // says "snow" is the asterisk, so it has to survive being small.
  "snow": (
    <>
      <path d="M10.6 28.4C5.7 27.9 3.4 22.4 6.4 18.7C8.2 16.5 11.1 15.7 13.5 16.7C13.4 9.9 19.2 5.3 25.2 6.7C29.8 7.8 33 11.5 33.4 15.6C37.9 15.4 41.1 19.5 40.1 23.7C39.3 26.7 36.8 28.5 33.9 28.6C26.3 28.9 15.9 28.8 8.7 28.4"/><path d="M16.5 32.1 16.5 38.9M13.56 33.8 19.44 37.2M13.56 37.2 19.44 33.8"/><path d="M27.5 33.1 27.5 39.9M24.56 34.8 30.44 38.2M24.56 38.2 30.44 34.8"/>
    </>
  ),
  "rain-light": (
    <>
      <path d="M10.6 28.4C5.7 27.9 3.4 22.4 6.4 18.7C8.2 16.5 11.1 15.7 13.5 16.7C13.4 9.9 19.2 5.3 25.2 6.7C29.8 7.8 33 11.5 33.4 15.6C37.9 15.4 41.1 19.5 40.1 23.7C39.3 26.7 36.8 28.5 33.9 28.6C26.3 28.9 15.9 28.8 8.7 28.4"/><path d="M18.4 32.6 15.4 39.8M28.9 32.3 26.4 39.4"/>
    </>
  ),
  "rain": (
    <>
      <path d="M10.6 28.4C5.7 27.9 3.4 22.4 6.4 18.7C8.2 16.5 11.1 15.7 13.5 16.7C13.4 9.9 19.2 5.3 25.2 6.7C29.8 7.8 33 11.5 33.4 15.6C37.9 15.4 41.1 19.5 40.1 23.7C39.3 26.7 36.8 28.5 33.9 28.6C26.3 28.9 15.9 28.8 8.7 28.4"/><path d="M14.4 31.7 10.9 40.9M23.6 32.4 20.4 41.2M32.4 31.6 29.6 40.2"/>
    </>
  ),
};

/**
 * One mark, at 44px, AND IT CARRIES ITS OWN WORD NOW (#355).
 *
 * It used to be `aria-hidden`, and that was correct for exactly as long as
 * rule 2 put the label on the page as real text directly underneath: two
 * announcements of the same sky would have read it twice.
 *
 * `skyLabel` is gone from Today, because "Overcast · a light breeze" under a
 * sentence that has just said the sky is a soft grey and there is a light
 * breeze is one fact printed twice. The sentence is what licenses the mark
 * VISUALLY. A screen reader gets no help from a sentence three blocks up in
 * the reading order, so the word travels with the glyph instead of beside it —
 * the licence moves, it is not dropped.
 *
 * `role="img"` with an `aria-label` rather than a `<title>`: a title element
 * inside an inline SVG is announced inconsistently across the iPad's own
 * VoiceOver and Chrome, and this is the one screen a teacher opens every day.
 */
/**
 * WHERE EACH MARK'S INK ACTUALLY STARTS, AND WHY THIS TABLE EXISTS (#355).
 *
 * The marks' leftmost stroke lands anywhere from 1.4 to 9 units
 * inside the 44 viewBox — a spread the eye reads as many different
 * left edges across a week. No CSS fixes it, because it is in the path data.
 *
 * `dx = 3 − bbox.x`, so every mark's ink starts at 3, and the wrapper then
 * pulls 3 units back out so the INK lands on the rail rather than the BOX.
 * The offsets are in viewBox units, so they hold at any rendered size.
 *
 * MEASURED WITH LIVE `getBBox()`, NOT DERIVED FROM PATH ENDPOINTS. The design
 * lead's first cut inferred them from the endpoints and four of them came
 * out wrong — Cloudy by 1.38, Overcast by 1.76 and changing sign, both rains
 * by 1.66 — because Béziers bow outside the points that define them.
 * Re-measure in a browser after any redraw; do not recompute them by reading.
 */
const INK_OFFSET: Record<SkyMarkKind, number> = {
  "clear": -1.9,
  "mostly-clear": -1.1,
  "partly-cloudy": 0.6,
  "cloudy": -5.98,
  "overcast": -0.76,
  "fog": -0.6,
  // Measured the same way (#371): rendered in a browser at the 44 viewBox and
  // read off live `getBBox()`, which also reproduced all six values above
  // exactly — that agreement is what says the method was right, not the
  // numbers looking plausible.
  "haze": -3,
  "smoke": -6,
  "snow": -2.06,
  "rain-light": -2.06,
  "rain": -2.06,
};

/**
 * One mark, and it carries its own word (#355).
 *
 * It used to be `aria-hidden`, and that was correct for exactly as long as
 * rule 2 put the label on the page as real text directly underneath. `skyLabel`
 * is gone — "Overcast · a light breeze" under a sentence that had just said
 * the sky is a soft grey and there is a light breeze was one fact printed
 * twice — and the read now sits directly beneath this mark and names the sky
 * in prose. That is the visual licence. A screen reader gets no help from
 * that, so the word travels with the glyph as well: the licence moved, it was
 * not dropped.
 *
 * `role="img"` with `aria-label` rather than a `<title>`: a title inside an
 * inline SVG is announced inconsistently across VoiceOver and Chrome, and this
 * is the one screen a teacher opens every day.
 *
 * ON THE RAIL BY ITS INK. `marginLeft` is the 3-unit landing point converted
 * to the rendered size, so the mark's leftmost stroke sits on the page's one
 * left edge at any size and for all eight drawings.
 */
export function SkyMark({ kind, size = 44 }: { kind: SkyMarkKind; size?: number }) {
  return (
    <svg
      viewBox="0 0 44 44"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={SKY_MARK_LABEL[kind]}
      style={{ marginLeft: `${-(3 * size) / 44}px` }}
    >
      <g transform={`translate(${INK_OFFSET[kind]},0)`}>{MARKS[kind]}</g>
    </svg>
  );
}
