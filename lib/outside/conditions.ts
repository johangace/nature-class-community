import { composeConditionsLine } from "@/lib/conditions";
import { resolveSkyKey, type SkyKey } from "@/lib/outside/sky-key";
import type { Locale } from "@/lib/localization";
import { phenologyConditionNote, readPhenologyCondition } from "./phenology-signals";
import type { FieldTruth } from "./pointmoon";
import type { ConditionsSummary } from "./types";

/**
 * Structured conditions for the "outside now" card, derived from a Pointmoon
 * field-truth read (fetched once in pointmoon.ts). Reuses the run block's
 * composition (composeConditionsLine in lib/conditions) for the one warm
 * sentence, and adds a quiet instrument row (meta) from the same fields. A
 * thin or absent read resolves to { line: null, meta: null }.
 */

/**
 * ONE OWNER FOR THE TEMPERATURE, in the reader's own scale.
 *
 * Pointmoon reports Celsius. Everything a teacher reads goes through here, so
 * a US class cannot meet Fahrenheit on one screen and Celsius on the next.
 * That is not hypothetical: onboarding said "13 degrees" while Today said
 * "55°F" for the same Berkeley class moments apart, because the card had
 * learned about locale and the composers underneath it had not.
 *
 * The conversion rounds AFTER converting, once. Rounding to 13°C and then
 * converting gives 55°F where the honest answer is 56°F, and a number that is
 * a degree out for no reason is the kind of small wrongness that makes a
 * teacher stop trusting the rest of the card.
 *
 * This lives in the weather layer rather than in the localization table on
 * purpose: a table maps words to words and cannot convert a number, which is
 * exactly why lib/localization documented units as riding the grounding seam.
 * This IS that seam.
 */
export function formatFeltTemperature(
  apparentC: number,
  locale: Locale = "uk"
): string {
  const degrees = spokenTemperature(apparentC, locale);
  return locale === "us" ? `${degrees}°F` : `${degrees}°C`;
}

/**
 * The same number without its unit, for a sentence read aloud to a class:
 * "it feels like 55 degrees out". THE conversion lives here and only here —
 * the formatter above delegates to it rather than repeating the arithmetic,
 * because two copies of a unit conversion is precisely how one surface ends
 * up a degree off from another.
 */
export function spokenTemperature(apparentC: number, locale: Locale = "uk"): number {
  return Math.round(locale === "us" ? apparentC * 1.8 + 32 : apparentC);
}

const SKY_LABELS: Record<SkyKey, string> = {
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

/**
 * The air in its SHORT form ("a light breeze"), exported for Today's sky block
 * (#341) so that block reuses this vocabulary rather than growing a fourth
 * wind map beside the three that already exist.
 */
export function windLabel(windKph?: number): string | null {
  if (typeof windKph !== "number" || !Number.isFinite(windKph)) return null;
  if (windKph >= 39) return "a strong wind";
  if (windKph >= 20) return "a fresh wind";
  if (windKph >= 6) return "a light breeze";
  return "still air";
}

/** "18°C · a soft grey sky · a light breeze" — only what was actually returned.
 * The unit is carried, not implied: a bare "18°" is a puzzle in Phoenix. */
function composeMeta(data: FieldTruth, locale: Locale): string | null {
  const current = data.facts?.fieldSnapshot?.weather?.current;
  if (!current) return null;
  const parts: string[] = [];

  const apparentC = current.felt?.apparentC;
  if (typeof apparentC === "number" && Number.isFinite(apparentC)) {
    parts.push(formatFeltTemperature(apparentC, locale));
  }
  // One resolver, never a lookup on the render enum (#368).
  const skyKey = resolveSkyKey(current);
  const sky = skyKey ? SKY_LABELS[skyKey] : undefined;
  if (sky) parts.push(sky);

  const rainRate = current.precipitationRateMmPerHour;
  if (typeof rainRate === "number" && rainRate > 0.1) {
    parts.push(rainRate >= 2.5 ? "rain falling" : "a light rain");
  } else {
    const wind = windLabel(current.windKph);
    if (wind) parts.push(wind);
  }

  return parts.length >= 2 ? parts.join(" · ") : null;
}

/** Compose the card's conditions from an already-fetched field-truth read.
 * The locale rides all the way down: both the spoken sentence and the quiet
 * instrument row must agree with each other and with every other surface. */
export function summarizeConditions(
  data: FieldTruth | null,
  locale: Locale = "uk"
): ConditionsSummary {
  if (!data) return { line: null, meta: null, seasonalNote: null };
  return {
    line: composeConditionsLine(
      data as Parameters<typeof composeConditionsLine>[0],
      locale
    ),
    meta: composeMeta(data, locale),
    // Live phenology-condition signals (#284 step 4): how the season is
    // actually running here, from Pointmoon's own read, not a stored file.
    seasonalNote: phenologyConditionNote(readPhenologyCondition(data)),
  };
}
