/**
 * ONE VOCABULARY FOR THE SKY, AND ONE PLACE THAT RESOLVES IT (#368).
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 *
 * Four tables in this app were keyed on Pointmoon's `weather.current
 * .skyCondition`, and every one of them was written against a vocabulary the
 * producer does not speak. `SkyCondition` is exactly seven values:
 *
 *     clear | rain | snow | smoke | haze | fog | overcast
 *
 * The tables held `clear`, `mostly-clear`, `partly-cloudy`, `cloudy`,
 * `overcast`, `fog`. So THREE keys could never be reached, and THREE real
 * values had no entry at all — on a hazy, smoky or snowy morning the sentence
 * simply lost its opening clause and rendered as the ground alone.
 *
 * This is #284's failure mode again, and the reason the tests never saw it is
 * the same: a producer that never returns a value never contradicts a reader
 * that invented it.
 *
 * ── AND `clear` COVERS 0% TO 84% CLOUD ─────────────────────────────────────
 *
 * `skyCondition` is a RENDER enum. Its own doc comment says so: *"skyCondition
 * is the data the renderer should reason about"*, with the adjacent
 * `condition` string *"reserved for prose"*. It answers "which sky do I draw",
 * so it is precipitation-and-obscuration first and collapses every cloud
 * amount below overcast into `clear`.
 *
 * We were using it to write prose. Measured on a live London payload,
 * 2026-08-23: `skyCondition: "clear"`, `cloudCoverPct: 61`, `condition:
 * "Partly cloudy"`. A class was told "The sky's clear" under a 61%-cloud sky.
 *
 * ── THE LADDER ─────────────────────────────────────────────────────────────
 *
 * 1. THE THINGS THAT OUTRANK CLOUD. Rain, snow, fog, haze and smoke come off
 *    `skyCondition`, which is the field that knows about them. How much cloud
 *    sits above a fog bank is not the sentence anyone needs.
 * 2. THE PRODUCER'S OWN BAND. `skyCover` (pointmoon#34) is an okta-aligned
 *    cloud band built for exactly this. Preferred whenever it arrives.
 * 3. THE PRODUCER'S OWN NUMBER. `cloudCoverPct` has been on this payload the
 *    whole time. Banded here on the same boundaries, so this fix works
 *    against the Pointmoon deployed today rather than waiting on one.
 * 4. THE RENDER ENUM, coarsely. `clear` and `overcast` only, and only when
 *    nothing above answered.
 * 5. Null. Nothing was reported, and every caller renders a shorter thing.
 *
 * Rungs 2 and 3 agree by construction — same boundaries, one table — so a
 * school does not get a different word the week Pointmoon deploys.
 */

/**
 * Every sky word this app can say, and the ONLY thing a sky table may be
 * keyed on.
 *
 * `lib/outside/sky-mark.ts` said the right fix was "one exported union with
 * the label maps keyed off it, which touches three files and their callers".
 * This is it. Each map below is a `Record<SkyKey, string>`, so the COMPILER
 * now refuses a table that invents a key or forgets a real one — which is a
 * guard the tests could not be, because they can only assert about values the
 * producer actually sends.
 */
export type SkyKey =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "cloudy"
  | "overcast"
  | "fog"
  | "haze"
  | "smoke"
  | "snow"
  | "rain";

/**
 * The values `skyCondition` can carry that outrank any amount of cloud.
 *
 * `clear` and `overcast` are deliberately absent: those are cloud statements,
 * and cloud is answered better one rung down.
 */
const OUTRANKS_CLOUD = new Set(["rain", "snow", "fog", "haze", "smoke"]);

/**
 * Okta-aligned bands, the same boundaries a METAR report uses (FEW / SCT /
 * BKN / OVC) and the same ones `classifySkyCover` uses inside Pointmoon.
 *
 * The 85% boundary is also where Pointmoon's own `classifySkyCondition`
 * switches to `overcast`, so rungs 2, 3 and 4 cannot disagree at the edge.
 */
export function bandCloudCover(cloudCoverPct: unknown): SkyKey | null {
  if (typeof cloudCoverPct !== "number" || !Number.isFinite(cloudCoverPct)) return null;
  const pct = Math.max(0, Math.min(100, cloudCoverPct));
  if (pct >= 85) return "overcast";
  if (pct >= 60) return "cloudy";
  if (pct >= 30) return "partly-cloudy";
  if (pct >= 10) return "mostly-clear";
  return "clear";
}

export interface SkyReading {
  skyCondition?: string | null;
  /** pointmoon#34. Absent until that deploys, which rung 3 covers. */
  skyCover?: string | null;
  cloudCoverPct?: number | null;
}

const SKY_COVER_VALUES = new Set<string>([
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "cloudy",
  "overcast",
]);

/**
 * The one word for this sky, or null when nothing was reported.
 *
 * Pure. A reading in, a key out, and the same reading always gives the same
 * key — which is the property that lets a test assert a whole sentence rather
 * than assert that a string is non-empty.
 *
 * NOTE ON RAIN. This returns `"rain"` when the producer's `skyCondition` says
 * so, but every caller in this app decides rain from
 * `precipitationRateMmPerHour` FIRST, on its own two thresholds (0.1 and 2.5
 * mm/h), because the sentence distinguishes "a light rain" from "rain
 * falling" and a single enum value cannot. `"rain"` here is the floor for a
 * caller that has no rate to read, never a second vocabulary for the same
 * rain.
 */
export function resolveSkyKey(reading: SkyReading | null | undefined): SkyKey | null {
  if (!reading) return null;

  const condition =
    typeof reading.skyCondition === "string" ? reading.skyCondition.trim() : "";

  // 1. Rain, snow, fog, haze, smoke. Nothing about cloud improves these.
  if (OUTRANKS_CLOUD.has(condition)) return condition as SkyKey;

  // 2. The producer's own band.
  const cover = typeof reading.skyCover === "string" ? reading.skyCover.trim() : "";
  if (SKY_COVER_VALUES.has(cover)) return cover as SkyKey;

  // 3. The producer's own number, banded on the same boundaries.
  const banded = bandCloudCover(reading.cloudCoverPct);
  if (banded) return banded;

  // 4. The render enum, coarsely, and only what it can honestly say.
  if (condition === "clear" || condition === "overcast") return condition;

  // 5. Nothing was reported. The caller renders something shorter.
  return null;
}
