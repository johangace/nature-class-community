/**
 * The daily card's condition state — the answer to #168's sharpest finding:
 * "37 degrees with no unit, and at 37 degrees the card gives no heat guidance
 * at all. A card that knows the conditions should shape the outing."
 *
 * Five states, and the whole design rests on the fifth one saying nothing:
 *
 *   hot    tint warm, one adjustment line
 *   rain   tint cool, one adjustment line
 *   cold   tint pale, one adjustment line
 *   wind   tint dry,  one adjustment line
 *   fine   no tint, NO adjustment line, airy
 *
 * MILD-SAYS-LITTLE IS THE BENCHMARK. The fine day is built first and is almost
 * empty; every other state is measured against it. If the hot card does not
 * read as visibly busier than the fine card sitting next to it, the system has
 * not earned its keep — a card that speaks on an ordinary day has no register
 * left for the day that matters. This is why `adjustment` is null for fine and
 * why there is exactly one line for the rest: two pieces of advice is a
 * briefing, and she is putting coats on thirty children.
 *
 * The lines are hers, not the class's. They are written to decide with
 * ("plan for shade and water"), never to read aloud. Read-aloud copy lives on
 * the in-lesson surface, and look-don't-touch lives in the spoken line there —
 * never as a warning glyph on the morning card.
 *
 * Pure: a payload in, a state out. No fetch, no invention. A payload with no
 * weather at all resolves to `null`, which the card renders as the dead-signal
 * shape (no faces, no invented sky), not as a fine day.
 */

import { conditionsBucket, type ConditionsBucket } from "@/lib/outside/bucket";
import { resolveSkyKey, type SkyKey } from "@/lib/outside/sky-key";
import { formatFeltTemperature } from "@/lib/outside/conditions";
import type { Locale } from "@/lib/localization";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * Sky words. A private copy of the labels lib/outside/conditions uses for its
 * own meta row, kept here deliberately rather than imported: `skyPhrase` below
 * belongs to the card, and reaching into the outside module for two lookup
 * tables would put the daily card's copy inside the data layer's file, where
 * the next person to change a sky word would not know a card depended on it.
 */
const SKY_WORDS: Record<SkyKey, string> = {
  clear: "a clear sky",
  "mostly-clear": "an almost clear sky",
  "partly-cloudy": "drifting clouds",
  cloudy: "a cloudy sky",
  overcast: "a soft grey sky",
  fog: "fog",
  haze: "haze",
  smoke: "smoke",
  snow: "falling snow",
  // Reached only when no precipitation rate came back. Every caller
  // decides rain from the rate first, on its own two thresholds.
  rain: "falling rain",
};

function windWords(windKph?: number): string | null {
  if (typeof windKph !== "number" || !Number.isFinite(windKph)) return null;
  if (windKph >= 39) return "a strong wind";
  if (windKph >= 20) return "a fresh wind";
  if (windKph >= 6) return "a light breeze";
  return "still air";
}

/**
 * The sky and the air, WITHOUT the temperature: "a clear sky · a light breeze".
 *
 * The outside module's own `composeMeta` welds a unitless temperature onto the
 * front of this, which is exactly what #168 caught on the live card. The daily
 * card renders the temperature itself, with its unit and in the teacher's own
 * scale, and needs the rest of the read on its own — so it composes the rest
 * itself rather than slicing a string apart on a separator.
 *
 * One part is enough here: "a clear sky" beside a real temperature is a whole
 * readout, where "a clear sky" alone as a meta row was not. Null when there
 * was nothing to report.
 */
export function skyPhrase(data: FieldTruth | null): string | null {
  const current = data?.facts?.fieldSnapshot?.weather?.current;
  if (!current) return null;
  const parts: string[] = [];

  // One resolver, never a lookup on the render enum (#368).
  const skyKey = resolveSkyKey(current);
  const sky = skyKey ? SKY_WORDS[skyKey] : undefined;
  if (sky) parts.push(sky);

  const rainRate = current.precipitationRateMmPerHour;
  if (typeof rainRate === "number" && rainRate > 0.1) {
    parts.push(rainRate >= 2.5 ? "rain falling" : "a light rain");
  } else {
    const wind = windWords(current.windKph);
    if (wind) parts.push(wind);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The card's five states. `fine` is the quiet one. */
export type CardConditionState = "hot" | "rain" | "cold" | "wind" | "fine";

export interface CardCondition {
  state: CardConditionState;
  /**
   * The single adjustment line, in her register. Null on a fine day, and null
   * is the point: silence is a state, not a missing string.
   */
  adjustment: string | null;
}

/**
 * One line per state. Sentence case, no em dashes, no exclamation marks.
 * Each is a decision she can act on at the door, and each names WHY where the
 * why is a teaching opportunity rather than a caution.
 *
 * THE STATE NAME CAME OFF THE FRONT (#323). Each of these opened by naming the
 * day back at her — "Wet day. Wellies and close to shelter." — and every
 * surface that renders an adjustment renders the conditions directly above it:
 * the temperature and sky on the daily card, the read sentence on Today, the
 * conditions header on /outside. She has just been told it is raining. Telling
 * her again costs the first two words of the only line here she can act on,
 * and it is the clause a teacher's eye has already learned to skip.
 *
 * Every consumer is checked, not assumed: `condition.adjustment` is read in
 * exactly two places (`app/DailyCard.tsx` and the brief's `quietWord`), and
 * both state the day above it. If a third ever renders this line alone, it has
 * to say what the day is itself rather than getting it back in here.
 */
const ADJUSTMENTS: Record<CardConditionState, string | null> = {
  hot: "Plan for shade and water, and keep it short.",
  rain: "Wellies and close to shelter. Rain brings the worms up.",
  cold: "Coats and gloves, and keep everyone moving.",
  wind: "Hold the paper down, and stay clear of the big trees.",
  // The ordinary day adds nothing. This null is load-bearing.
  fine: null,
};

/** The bucket's vocabulary is the runner's; the card's is the teacher's. */
const STATE_BY_BUCKET: Record<ConditionsBucket, CardConditionState> = {
  wet: "rain",
  windy: "wind",
  cold: "cold",
  hot: "hot",
  mild: "fine",
};

/**
 * The card's condition state for a field-truth read, or null when there was
 * no read to speak of.
 *
 * Null is NOT "fine". A silent Pointmoon means we could not see outside, and
 * the card says exactly that rather than reporting an ordinary day it did not
 * observe. That distinction is the difference between a quiet card and a
 * lying one.
 */
export function cardCondition(data: FieldTruth | null): CardCondition | null {
  const bucket = conditionsBucket(data);
  if (bucket === null) return null;
  const state = STATE_BY_BUCKET[bucket];
  return { state, adjustment: ADJUSTMENTS[state] };
}

/** The same mapping, for a bucket already in hand. */
export function cardConditionFromBucket(bucket: ConditionsBucket | null): CardCondition | null {
  if (bucket === null) return null;
  const state = STATE_BY_BUCKET[bucket];
  return { state, adjustment: ADJUSTMENTS[state] };
}

/**
 * The temperature as a teacher reads it, in her own unit. #168's screenshot
 * showed "37 degrees" with no unit on a card that then said nothing about the
 * heat; both halves of that are fixed, and this is the first half.
 *
 * The unit rides the locale, because a bare "37°" is worse than useless in
 * Phoenix: it is either a lie or a puzzle, and a teacher at the door has time
 * for neither. This is the units case the localization layer deliberately left
 * to the grounding seam (lib/localization.ts) — a table cannot convert a
 * number, so the conversion lives where the number is read.
 *
 * Rounding happens after conversion, once. Converting a pre-rounded value is
 * how 37.4°C becomes 98°F instead of 99°F.
 */
export function feltTemperature(data: FieldTruth | null, locale: Locale = "uk"): string | null {
  const apparentC = data?.facts?.fieldSnapshot?.weather?.current?.felt?.apparentC;
  if (typeof apparentC !== "number" || !Number.isFinite(apparentC)) return null;
  // Delegated rather than duplicated: two copies of a unit conversion is how
  // one surface ends up a degree off from another.
  return formatFeltTemperature(apparentC, locale);
}
