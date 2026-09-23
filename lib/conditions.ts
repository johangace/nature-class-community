/**
 * Live conditions, grounded or silent.
 *
 * Pointmoon (https://pointmoon.ai, a separate product, consumed
 * strictly over HTTP) returns sourced field-truth tokens — it never writes
 * prose. The voice here is ours: this module reads the few weather fields
 * the API actually returned and composes at most ONE warm sentence for the
 * conditions-line block. Anything thin, stale, low-confidence, slow, or
 * unreachable resolves to null, and the caller falls back to the block's
 * authored fallbackText. We never invent weather.
 */

import { localizeText, type Locale } from "@/lib/localization";
import { resolveSkyKey, type SkyKey } from "@/lib/outside/sky-key";
import { draftConditionsLine } from "@/lib/ai/conditions-line";
import { spokenTemperature } from "@/lib/outside/conditions";
import { fetchFieldTruth, type FieldTruth } from "@/lib/outside/pointmoon";

/** The composer reads the same field-truth shape the outside surface does —
 * one client (lib/outside/pointmoon, location-keyed, deduped, validated per
 * #49), one facts type, two composers with different jobs. */
type FieldTruthResponse = FieldTruth;

const SKY_PHRASES: Record<SkyKey, string> = {
  clear: "a clear sky",
  "mostly-clear": "an almost clear sky",
  "partly-cloudy": "a sky of drifting clouds",
  cloudy: "a cloudy sky",
  overcast: "a soft grey sky",
  fog: "a foggy sky",
  haze: "a hazy sky",
  smoke: "a smoky sky",
  snow: "a sky of falling snow",
  // Reached only when no precipitation rate came back. Every caller
  // decides rain from the rate first, on its own two thresholds.
  rain: "a rainy sky",
};

/**
 * The sky phrase for a reading, or null (#368).
 *
 * `SKY_PHRASES` used to be looked up directly on `skyCondition`, which is a
 * render enum: it holds no value for "partly cloudy" and collapses every
 * cloud amount below 85% into `clear`.
 */
function skyPhraseFor(current: {
  skyCondition?: string | null;
  skyCover?: string | null;
  cloudCoverPct?: number | null;
} | null | undefined): string | null {
  const key = resolveSkyKey(current);
  return key ? SKY_PHRASES[key] : null;
}

function windPhrase(windKph: number): string | null {
  if (windKph >= 39) return "a strong wind";
  if (windKph >= 20) return "a fresh wind";
  if (windKph >= 6) return "a light breeze";
  return null; // near-calm: saying nothing beats inventing stillness drama
}

/**
 * Compose one plain warm sentence from what Pointmoon returned, or null.
 * Grounding gate: the sentence needs a confident feels-like temperature
 * plus at least one texture (sky, rain, or wind); anything less is silence.
 */
/**
 * The measured facts behind the line, so a model can be asked to say them
 * without ever being asked what the weather is (#266 pattern, lib/ai).
 *
 * Extracted from the composer rather than duplicated: there is one place that
 * decides what counts as raining, what a wind speed is called, and when a
 * temperature is too weakly sourced to speak. That place stays here, in the
 * grounding layer, and the model receives its output.
 */
export function conditionsFacts(
  data: FieldTruthResponse,
  locale: Locale = "uk"
): import("@/lib/ai/conditions-line").ConditionsFacts | null {
  const line = composeConditionsLine(data, locale);
  if (!line) return null;

  const current = data.facts?.fieldSnapshot?.weather?.current;
  const apparentC = current?.felt?.apparentC;
  if (typeof apparentC !== "number") return null;

  const rainRate = current?.precipitationRateMmPerHour;
  const raining = typeof rainRate === "number" && rainRate > 0.1;

  return {
    degrees: spokenTemperature(apparentC, locale),
    // One resolver, never a lookup on the render enum (#368).
    sky: skyPhraseFor(current),
    wind:
      typeof current?.windKph === "number" && Number.isFinite(current.windKph)
        ? windPhrase(current.windKph)
        : null,
    raining,
    heavyRain: raining && typeof rainRate === "number" && rainRate >= 2.5,
    fallback: line,
  };
}

export function composeConditionsLine(
  data: FieldTruthResponse,
  /** The reader's own scale. A US class hears Fahrenheit, everyone else
   * Celsius. Defaults to the product's native voice, so every existing caller
   * is unchanged. */
  locale: Locale = "uk"
): string | null {
  const current = data.facts?.fieldSnapshot?.weather?.current;
  if (!current) return null;

  const apparentC = current.felt?.apparentC;
  if (typeof apparentC !== "number" || !Number.isFinite(apparentC)) return null;

  // The signals array carries per-token confidence; when the temperature
  // token is present but the source barely stands behind it, stay silent.
  const tempSignal = data.facts?.signals?.find(
    (s) => s.id === "nature.weather.temperature"
  );
  if (tempSignal && typeof tempSignal.confidence === "number" && tempSignal.confidence < 0.6) {
    return null;
  }

  const sky = skyPhraseFor(current);
  const rainRate = current.precipitationRateMmPerHour;
  const raining = typeof rainRate === "number" && rainRate > 0.1;
  const wind =
    typeof current.windKph === "number" && Number.isFinite(current.windKph)
      ? windPhrase(current.windKph)
      : null;

  if (!sky && !raining && !wind) return null;

  // Spoken aloud, so no unit symbol: "55 degrees" is what a teacher in
  // Phoenix says, and "13 degrees" is what one in London says. The number is
  // what has to change, not the word.
  let sentence = `Right now it feels like ${spokenTemperature(apparentC, locale)} degrees out`;
  if (sky) sentence += ` under ${sky}`;
  if (raining) {
    sentence += rainRate >= 2.5 ? ", and rain is falling" : ", and a light rain is falling";
  } else if (wind) {
    sentence += `, with ${wind}`;
  }
  return `${sentence}.`;
}

/**
 * Fetch Pointmoon for a given location and compose the line. The location is
 * the active class's own (passed by the caller); with none, there is no line
 * — the reader returns null and the caller's authored text stands (#1234).
 * Only a surface that can NAME what it read may ask for the sample patch, and
 * this one cannot. Caching lives in the shared client (location-keyed,
 * ~15 minutes, in-flight deduped), so composition here is a pure pass over
 * already-cached facts. Every failure path returns null.
 */
export async function getConditionsLine(
  lat?: number | null,
  lng?: number | null,
  locale: Locale = "uk"
): Promise<string | null> {
  const data = await fetchFieldTruth({
    lat: typeof lat === "number" && Number.isFinite(lat) ? lat : undefined,
    lng: typeof lng === "number" && Number.isFinite(lng) ? lng : undefined,
  });
  if (!data) return null;

  // The measurements are ours; the sentence is the model's (lib/ai/conditions-line).
  // Johan, 2026-08-17: "add ai intelligence instead of hard coded intelligence".
  // A draft that moves the temperature, invents weather nobody measured, or
  // slips the register is discarded, and the composed line renders instead —
  // which is also what renders wherever no model is configured.
  const facts = conditionsFacts(data, locale);
  if (!facts) return null;
  // The sentence is localized on its way out, drafted or composed (#393).
  // The authored path has gone through this seam since #142; a model-written
  // line beside it saying "autumn" while the lesson says "fall" is the same
  // class reading two vocabularies off one screen. The transform runs AFTER
  // the guard, so what the guard checked is what the model actually wrote.
  return localizeText((await draftConditionsLine(facts)) ?? facts.fallback, locale);
}
