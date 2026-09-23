/**
 * WHICH SKY MARK, AND THE WORD THAT LICENSES IT (#341).
 *
 * Pure and free of JSX so the composer in `lib/outside/today.ts` can pick the
 * mark server-side without pulling a component into the read. The eight
 * DRAWINGS live in `app/SkyMark.tsx`, keyed on the type below — the logic and
 * the label are here because the label is not a caption, it is the licence:
 * no glyph ships on this screen without the word printed under it.
 *
 * ── A NOTE ON THE THREE PARALLEL MAPS, WHICH THIS DELIBERATELY DOES NOT JOIN
 *
 * The six sky states are already written out three times — `SKY_CLAUSES` in
 * `lib/outside/day-read.ts` (sentence lead), `lib/outside/conditions.ts` and
 * `lib/cast/conditions.ts` (list and card labels). That is a real duplication
 * and it is the ENUM being restated three times rather than the strings, which
 * genuinely differ by register.
 *
 * This file adds a fourth register (the mark's own short label) because rule 2
 * requires the word to travel with the glyph. It is NOT a fourth copy of the
 * enum to leave lying around: the right fix is one exported union with the
 * label maps keyed off it, which touches three files and their callers and is
 * filed rather than smuggled into a layout change.
 */

/**
 * Every sky the resolver can name, and each one has a drawing (#371).
 *
 * This is `SkyKey` plus `rain-light`, which is the one distinction the marks
 * make that the words do not: the sentence says "a light rain is falling" off
 * the same rate this splits on, so the mark needs two rain glyphs where the
 * phrase tables need one.
 *
 * It used to hold six sky states and stop. `haze`, `smoke` and `snow` are all
 * real values Pointmoon sends, and until #371 they drew nothing — a school in
 * snow got an empty sky block on the morning the weather most decides the
 * lesson.
 */
import { resolveSkyKey } from "./sky-key";

export type SkyMarkKind =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "fog"
  | "haze"
  | "smoke"
  | "snow"
  | "rain-light"
  | "rain";

/** The word under the mark. Rule 2: no glyph ships without one. */
export const SKY_MARK_LABEL: Record<SkyMarkKind, string> = {
  "clear": "Clear",
  "mostly-clear": "Almost clear",
  "partly-cloudy": "Drifting clouds",
  "cloudy": "Cloudy",
  "overcast": "Overcast",
  "fog": "Fog",
  "haze": "Haze",
  "smoke": "Smoke",
  "snow": "Snow",
  "rain-light": "Light rain",
  "rain": "Rain",
};

/**
 * Which mark this morning gets.
 *
 * RAIN OUTRANKS THE SKY WORD, on the same thresholds `dayRead` already uses
 * for the sentence (0.1 and 2.5 mm/h) rather than on new ones — two vocabularies
 * for the same rain is how a screen ends up disagreeing with itself. On a wet
 * morning "overcast" is true and useless: what decides the next twenty minutes
 * is that it is raining.
 *
 * Null when the producer said nothing. Null draws no mark, and the block is
 * shorter rather than showing a sky nobody reported.
 */
export function skyMarkKind({
  skyCondition,
  skyCover,
  cloudCoverPct,
  precipitationRateMmPerHour,
}: {
  skyCondition?: string | null;
  skyCover?: string | null;
  cloudCoverPct?: number | null;
  precipitationRateMmPerHour?: number | null;
}): SkyMarkKind | null {
  const rate = precipitationRateMmPerHour;
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0.1) {
    return rate >= 2.5 ? "rain" : "rain-light";
  }

  // THE SAME RESOLVER THE SENTENCE USES (#368), so the glyph and the words
  // under it can no longer describe two different skies. It used to read
  // `skyCondition` raw, which meant a 61%-cloud morning drew the SUN.
  const key = resolveSkyKey({ skyCondition, skyCover, cloudCoverPct });
  if (!key) return null;

  // EVERY SKY THE RESOLVER CAN NAME NOW HAS A MARK (#371). Haze, smoke and
  // snow used to return null here, so a school in snow got no mark at all on
  // the morning the weather most decides the lesson.
  //
  // `rain` reaching this line means the producer said it is raining but sent
  // no rate. The rate branch above is the one that can tell light from heavy;
  // with no rate we cannot, so this draws the plain rain mark rather than
  // nothing. A morning we know is wet is not a morning to draw an empty sky.
  return key in SKY_MARK_LABEL ? (key as SkyMarkKind) : null;
}

