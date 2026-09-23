import { spokenTemperature } from "./conditions";
import type { Locale } from "@/lib/localization";
import type { FieldTruth } from "./pointmoon";
import type { SessionDay } from "./session-day";
import { resolveSkyKey, type SkyKey } from "./sky-key";

/**
 * THE SKY ON A DAY THAT IS NOT TODAY (#755, reopened by pointmoon#125).
 *
 * ── WHAT CHANGED UPSTREAM ──────────────────────────────────────────────────
 *
 * /outside has served a day chooser — Today, Tomorrow, Sun 6, out to a week —
 * since #755, because the first real teacher pre-walks the ground the day before she
 * runs the class. On every day but today it printed a paragraph saying we had
 * no forecast and were therefore leaving the sky, the temperature, the ground
 * and the light out rather than printing them under tomorrow's name.
 *
 * That was true and it was the right refusal. It was also, it turned out, our
 * producer throwing away a forecast it was already paying for: Pointmoon
 * fetched Open-Meteo's 14-day daily forecast on every read and reduced it to
 * trend adjectives. pointmoon#125 keeps the days, so the refusal can narrow.
 *
 * ── WHAT IT NARROWS TO, AND WHY THAT IS NOT A LOOSENING ────────────────────
 *
 * The sky and the temperature become sayable for a future day. The GROUND and
 * the LIGHT do not, and they never will from this block: they are read for the
 * hour they are asked for, and a forecast day has no hour. #755's cardinal
 * rule is untouched — this morning's reading may not appear under Thursday's
 * heading — and what has changed is only that Thursday now has a reading of
 * its OWN for two of the four things that paragraph was covering.
 *
 * ── IT IS A FORECAST, AND IT HAS TO READ AS ONE ────────────────────────────
 *
 * Upstream stamps the block `predicted`. Everything composed here is worded so
 * a teacher cannot mistake it for a reading — "forecast" is in the label, and
 * the numbers are a range rather than the single settled figure `feltTemperature`
 * gives for the current hour. A forecast stated flat, in the register this app
 * uses for measurements, would be the same lie as printing today's weather
 * under Thursday's name; it would just be harder to catch.
 */

/** The one day of the forecast a chosen day resolves to, composed for reading. */
export interface DayForecast {
  /** "A soft grey sky", or null when upstream gave no usable sky. */
  sky: string | null;
  /** "13° to 22°", in her scale. Null when neither bound came back. */
  temperature: string | null;
  /** "80% chance of rain". Null below the threshold, and null when unreported. */
  rain: string | null;
  /** "A fresh wind", on the same thresholds the card uses. Null when calm or absent. */
  wind: string | null;
}

/**
 * The sky in a sentence-leading form.
 *
 * A separate table from `SKY_CLAUSES` in day-read.ts and `SKY_WORDS` in
 * lib/cast/conditions.ts, for the reason those two are separate from each
 * other: one writes the morning's opening clause, one writes a card's meta
 * row, and this one heads a forecast. Sharing a table would mean the next
 * person to reword a sky would silently reword all three registers.
 *
 * Present tense is deliberately avoided. "The sky's clear" is a statement
 * about now; under Thursday it has to be a noun the label can qualify.
 */
const FORECAST_SKY: Record<SkyKey, string> = {
  clear: "A clear sky",
  "mostly-clear": "An almost clear sky",
  "partly-cloudy": "Drifting clouds",
  cloudy: "A cloudy sky",
  overcast: "A soft grey sky",
  fog: "Fog",
  haze: "Haze",
  smoke: "Smoke in the air",
  snow: "Snow",
  rain: "Rain",
};

/**
 * Below this, saying it at all is worse than silence.
 *
 * A 20% chance of rain printed on a planning page reads as a warning, and a
 * teacher who moves a lesson indoors on it has been misled by our formatting
 * rather than by our data. The number is only worth her attention once it is
 * likelier than not to matter.
 */
const RAIN_WORTH_SAYING_PCT = 40;

function windWords(windKph: unknown): string | null {
  if (typeof windKph !== "number" || !Number.isFinite(windKph)) return null;
  // The card's own thresholds (lib/cast/conditions.ts), so a Thursday that
  // becomes today does not change its mind about what "fresh" means.
  if (windKph >= 39) return "A strong wind";
  if (windKph >= 20) return "A fresh wind";
  return null;
}

/**
 * The forecast for a chosen day, or null when there is none for it.
 *
 * Null on today, and that is a rule rather than an omission: today has real
 * readings, and offering a model's guess beside a measurement would invite a
 * teacher to compare them as if they were two opinions about the same thing.
 *
 * Null past the forecast's horizon, and null when the day upstream dated
 * matches nothing we asked for. MATCHED ON `date`, NOT ON `offsetDays`, and
 * that matters: `offsetDays` is counted from the day the READ was made, which
 * is the server's day, while the chosen day is the teacher's. A cached read
 * that crosses local midnight would slide every offset by one and hand
 * Thursday's sky to Wednesday, silently and only for the class whose morning
 * straddled the boundary. The ISO day is the same string on both sides.
 */
export function dayForecast(
  data: FieldTruth | null,
  day: SessionDay,
  locale: Locale = "uk"
): DayForecast | null {
  if (day.offsetDays === 0) return null;

  const days = data?.facts?.fieldSnapshot?.weather?.outlook?.days;
  if (!Array.isArray(days)) return null;

  const match = days.find(
    (entry) => typeof entry?.date === "string" && entry.date.slice(0, 10) === day.iso
  );
  if (!match) return null;

  const skyKey = resolveSkyKey({
    skyCondition: match.skyCondition,
    cloudCoverPct: match.cloudCoverMeanPct,
  });

  const rainPct = match.precipitationProbabilityMaxPct;
  const forecast: DayForecast = {
    sky: skyKey ? FORECAST_SKY[skyKey] : null,
    temperature: temperatureRange(match.temperatureMinC, match.temperatureMaxC, locale),
    rain:
      typeof rainPct === "number" && Number.isFinite(rainPct) && rainPct >= RAIN_WORTH_SAYING_PCT
        ? `${Math.round(rainPct)}% chance of rain`
        : null,
    wind: windWords(match.windMaxKph),
  };

  // A day upstream dated and could say nothing about is not a forecast. It
  // ships as absence, exactly like every other thin read on this page, rather
  // than as an empty block under a heading that promises one.
  const saysSomething =
    forecast.sky !== null ||
    forecast.temperature !== null ||
    forecast.rain !== null ||
    forecast.wind !== null;
  return saysSomething ? forecast : null;
}

/**
 * "13° to 22°", or one bound when only one came back.
 *
 * A RANGE, WHERE TODAY GETS A SINGLE NUMBER, and the difference is the point.
 * `feltTemperature` gives the current hour one settled figure because there is
 * one. A day has a high and a low, and collapsing them to a mean would hand a
 * teacher a number that will not occur, in the same shape as one that is being
 * measured right now.
 *
 * The unit is written once, on the second figure, so the range reads as one
 * quantity rather than two.
 */
function temperatureRange(
  minC: number | null | undefined,
  maxC: number | null | undefined,
  locale: Locale
): string | null {
  const unit = locale === "us" ? "°F" : "°C";
  const low = typeof minC === "number" && Number.isFinite(minC) ? spokenTemperature(minC, locale) : null;
  const high = typeof maxC === "number" && Number.isFinite(maxC) ? spokenTemperature(maxC, locale) : null;

  if (low !== null && high !== null) {
    // A range whose ends round to the same figure is not a range.
    return low === high ? `${high}${unit}` : `${low}° to ${high}${unit}`;
  }
  if (high !== null) return `${high}${unit}`;
  if (low !== null) return `${low}${unit}`;
  return null;
}
