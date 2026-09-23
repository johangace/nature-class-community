import { parseCuratedPhenology, curatedAlongsideFallback, type CuratedPhenology } from "./curated-phenology";
import { tideStations, type TideStationId } from "./tide-stations";
import { validPlaceEvidence, placeEvidenceEnabled, sourceFields, type PlaceQuery, type PlaceSource } from "./place-evidence";
import { parseCoastalTides, noaaReferenceEnabled, type CoastalTides, type CoastalTideQuery } from "./coastal-tides";
// Server-only: the single Pointmoon client. One fetch per read feeds both
// today's sky and the photographed sightings; never import from a client.

import { parseSeasonalObservations, seasonalObservationsEnabled, type SeasonalObservations } from "./seasonal-observations";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parsePointmoonNatureProjection,
  type PointmoonNatureReady,
  type PointmoonHistoricalObservation,
  type PointmoonObservation,
  type PointmoonPhenophase,
  type PointmoonPhotoAsset,
  type PointmoonPresenceEvidence,
  type PointmoonSpeciesRecency,
} from "./pointmoon-contract";

export {
  POINTMOON_NATURE_CONTRACT_VERSION,
  POINTMOON_SOURCE_SCHEMA_VERSION,
  parsePointmoonNatureProjection,
} from "./pointmoon-contract";
export type {
  ParsePointmoonNatureOptions,
  PointmoonNatureProjection,
  PointmoonNatureReady,
  PointmoonNatureThin,
  PointmoonNatureThinReason,
  PointmoonHistoricalEvidence,
  PointmoonHistoricalObservation,
  PointmoonObservation,
  PointmoonObservationSource,
  PointmoonOpenPhotoLicense,
  PointmoonPhenophase,
  PointmoonPhenophaseEvidence,
  PointmoonLeafState,
  PointmoonLeavesEvidence,
  PointmoonPhotoAsset,
  PointmoonPhotoRole,
  PointmoonPlaceHintStatus,
  PointmoonPresenceEvidence,
  PointmoonSpeciesRecency,
} from "./pointmoon-contract";

/**
 * Pointmoon (https://pointmoon.ai, a separate product consumed over
 * HTTP) returns sourced field-truth — weather, and real recent species
 * observations near a point (iNaturalist-backed, with photos). We read only
 * the slices the "outside now" surface needs; everything is optional, and a
 * thin or unreachable read resolves to null so the surface shows less. The
 * voice is ours; the facts and photos are Pointmoon's.
 */

const HOSTED_POINTMOON = "https://pointmoon.ai";
// Pointmoon's measured cold response is ~8.3s. The surface treats this read as
// optional enrichment, so allow one honest cold start while still bounding
// both renderer and nightly-archive transport with the same abort contract.
const FETCH_TIMEOUT_MS = 10_000;

/**
 * One observed species near the point — a real, photographed sighting.
 *
 * The recurrence fields are the ones the cast recipe ranks on (#167): how many
 * years this species has been recorded here, its own historical baseline, and
 * where this read sits against that baseline. Pointmoon has always returned
 * them; this type simply did not say so, so lib/cast/resolve.ts had to
 * re-declare the shape locally and #175's own fixture cast through it, which
 * is what turned `npx tsc --noEmit` red on main. Declaring them here is
 * additive and describes the payload we already receive. Everything stays
 * optional: a thin read omits them and the resolver reads the absence, exactly
 * as it does today.
 */
export interface ObservationEntry {
  name?: string;
  scientificName?: string;
  count?: number;
  /** @deprecated Input compatibility only. Sanitized reads never return it. */
  photoUrl?: string | null;
  /** Versioned, validated image evidence. A renderer must gate this whole asset. */
  photo?: PointmoonPhotoAsset | null;
  /**
   * Every picture Pointmoon holds of this species, best claim first, with
   * `photo` as element zero (pointmoon#153, #984). Each element is the same
   * validated asset and must be gated whole, exactly as `photo` is. Absent,
   * never empty — a payload from before the field existed simply has none.
   */
  photos?: PointmoonPhotoAsset[];
  /** Versioned, validated evidence for the local-presence claim. */
  presence?: PointmoonPresenceEvidence | null;
  iconicTaxon?: string;
  /** Distinct years this species has been recorded here. The entry gate.
   * Explicitly null in the recorded payloads for single-ping entries. */
  yearsObserved?: number | null;
  /** Years actually sampled to compute the baseline below. */
  sampledYears?: number;
  /** This species' own typical count here, from those years. Null when the
   * baseline could not be computed. */
  historicalAvgCount?: number | null;
  /** This read's count against that baseline. The child-findability handle.
   * Null whenever the baseline is. */
  ratioToHistorical?: number | null;
  /** How often it is present at all across the baseline window. */
  presenceRate?: number;
  /** Whether this read is an emergence against its own record. */
  emerged?: boolean;
  /** Per-species freshness and coarse place, when the direct sample saw it (#959). */
  recency?: PointmoonSpeciesRecency;
  /** Observed flowering / fruiting / leaf annotations, when any record carried one (#959). */
  phenophase?: PointmoonPhenophase;
}

export interface HistoricalObservationEntry {
  name: string;
  scientificName: string | null;
  avgCount: number | null;
  photo: PointmoonPhotoAsset | null;
  iconicTaxon: string | null;
  yearsObserved: number | null;
  sampledYears: number | null;
}

/**
 * One sky event Pointmoon is expecting, with its own words for it.
 *
 * Read verbatim from a live payload rather than assumed: the producer returns
 * `label`, `note`, `daysOffset` and `peaksAt` on every entry in
 * `astronomy.upcomingEvents`. The eclipse on 28 August is the one in flight.
 */
export interface SkyEvent {
  label?: string;
  note?: string;
  daysOffset?: number;
  peaksAt?: string | null;
}

/** The slice of Pointmoon's field-truth the card reads. All optional. */
export interface FieldTruth {
  facts?: {
    /**
     * The raw signal list, carried through unfiltered (unlike every other
     * slice on this type, which is narrowly projected). Two readers currently
     * pick their own ids out of it: `lib/outside/place.ts` for the
     * `outdoor.place.*` / `nature.management.*` proxies, and
     * `lib/outside/phenology-signals.ts` for the `nature.phenology.*`
     * condition signals (#284). `label` and `evidence` are additional to the
     * three fields the first reader ever needed; both are optional so a
     * signal that omits them still passes through as it always has.
     */
    signals?: Array<{
      id?: string;
      value?: string | number;
      confidence?: number;
      label?: string;
      evidence?: string[];
      epistemicType?: string;
      provider?: string;
    }>;
    fieldSnapshot?: {
      phenology?: CuratedPhenology;
      seasonalObservations?: SeasonalObservations;
      coastalTides?: CoastalTides;
      placeEvidence?: Record<string, unknown>;
      /**
       * The day's own clock. `windows.daylightMinutesRemaining` is the fact
       * the old prototype's teacher tip was built on ("about 35 minutes of
       * usable light"), and it is the single most actionable number Pointmoon
       * returns for a teacher standing at a door with a coat in her hand.
       */
      time?: {
        timezone?: string;
        timeOfDay?: string;
        daylightChangeMinutes?: number;
        windows?: {
          daylightMinutesRemaining?: number | null;
          isNearSunset?: boolean;
        };
      };
      /** Sunrise, sunset, the moon, and what the sky is about to do. */
      astronomy?: {
        /** Local wall clock, no zone: "2026-08-17T05:49". Read as written. */
        sunriseIso?: string | null;
        sunsetIso?: string | null;
        moonPhaseLabel?: string | null;
        moonIlluminationPct?: number | null;
        daysToNextFullMoon?: number | null;
        isDay?: boolean;
        upcomingEvents?: SkyEvent[];
      };
      /** What the ground underfoot is doing. Decides shoes, and worms. */
      ground?: {
        state?: string;
        hoursSinceMeaningfulPrecipitation?: number | null;
      };
      weather?: {
        current?: {
          /**
           * Pointmoon's RENDER enum: clear | rain | snow | smoke | haze | fog
           * | overcast. Read through `lib/outside/sky-key.ts`, never directly
           * into a phrase table — it collapses 0-84% cloud into `clear` and
           * has no value for "partly cloudy" (#368).
           */
          skyCondition?: string;
          /**
           * The cloud band in prose terms (pointmoon#34): clear |
           * mostly-clear | partly-cloudy | cloudy | overcast. Optional
           * because it post-dates this reader; `cloudCoverPct` covers the gap.
           */
          skyCover?: string | null;
          /** 0-100. On the payload all along, and never read until #368. */
          cloudCoverPct?: number | null;
          windKph?: number;
          precipitationRateMmPerHour?: number;
          felt?: { apparentC?: number | null };
        };
        /**
         * THE DATED FORECAST (pointmoon#125).
         *
         * Pointmoon was fetching Open-Meteo's 14-day daily forecast on every
         * read and reducing it to trend adjectives, so this client had nothing
         * it could print under a named future day and /outside printed a
         * paragraph explaining the absence instead. It carries the days now.
         *
         * WHAT A DAY DOES NOT CARRY, and this is what keeps #755 standing: no
         * ground, no light, no daylight window. Those are read for the hour
         * they are asked for and a forecast day has no hour. The refusal on
         * /outside NARROWS to them; it does not disappear.
         *
         * Stamped `predicted` upstream. It is a model run and not a reading,
         * and the surface has to say so out loud.
         */
        outlook?: {
          days?: Array<{
            /** Local calendar day at the school, `YYYY-MM-DD`. */
            date?: string | null;
            /** 0 is the day the read was made. */
            offsetDays?: number | null;
            /** The same RENDER enum as `current.skyCondition`. */
            skyCondition?: string | null;
            /**
             * Carried because #368 is not repealed by a forecast.
             * `skyCondition` collapses every cloud amount below overcast into
             * `clear`, so a day at 80% cloud would be read out as "clear" all
             * over again if this were dropped. `resolveSkyKey` bands it.
             */
            cloudCoverMeanPct?: number | null;
            temperatureMaxC?: number | null;
            temperatureMinC?: number | null;
            precipitationProbabilityMaxPct?: number | null;
            windMaxKph?: number | null;
          }> | null;
        } | null;
      };
      /**
       * The reverse geocode of the point this read is OF. Pointmoon has always
       * served it and this client has always dropped it, which is how
       * onboarding could show a teacher a sky with no way to tell whose sky it
       * was (#315). Two fields only: the name and the full address string. The
       * ~35 `outdoor.place.*` proxies beside them keep their existing route in
       * through `facts.signals`, where lib/outside/place.ts reads them.
       */
      place?: {
        placeName?: string | null;
        /**
         * Provenance strings from the geocoder, e.g. `displayName=...`. Read
         * defensively: this is evidence, not a promised schema.
         */
        evidence?: string[];
      epistemicType?: string;
      provider?: string;
      };
      observations?: {
        nearby?: ObservationEntry[];
        birds?: { notable?: ObservationEntry[] };
        /** Species with a record here that this read did not return (#167). */
        absent?: ObservationEntry[];
        /** How many days back the observation window reaches. */
        recentWindowDays?: number;
        /** Explicit source freshness when the producer supplies an expiry. */
        validUntil?: string | null;
        freshness?: PointmoonNatureReady["freshness"];
        historical?: {
          resolutionStatus?: "resolved" | "partial" | "unresolved" | null;
          resolutionReason?: string | null;
          nearby?: HistoricalObservationEntry[];
        };
      };
    };
  };
}

/**
 * Location-and-scope cache (#49, #450). The old single module-global entry meant the
 * first school's read was served to EVERY school for 15 minutes — two classes
 * in different towns shared one sky and one set of sightings. Coordinates are
 * rounded to ~100m (three decimals, the same key rule as lib/conditions) so a
 * class keys one entry and two classes on the same field share it. A scoped
 * Plantae read cannot satisfy an unscoped surface, so the observation scope is
 * the other part of the key.
 */
const cache = new Map<string, { data: FieldTruth | null; at: number }>();
/** One fetch per location at a time: concurrent readers share the promise. */
const inFlight = new Map<string, Promise<FieldTruth | null>>();
/**
 * The last COMPLETE read per key, kept beside the ordinary cache (nc#1012).
 *
 * Separate rather than a field on the cache entry because the two have
 * different lifetimes on purpose: the cache holds whatever came back last,
 * including the empty ones, and this holds only what was worth showing.
 */
const lastGood = new Map<string, { data: FieldTruth; at: number }>();
const CACHE_TTL_MS = 15 * 60 * 1_000;
const SILENT_TTL_MS = 60 * 1_000;
/**
 * How long a DEGRADED read is held (nc#1012).
 *
 * A read that came back well-formed but with no species in it is not an
 * answer, it is a rate limit wearing an answer's clothes. Pointmoon's own
 * observation fetch aborts at 1500ms inside a 3800ms adapter budget, so a
 * throttled minute at iNaturalist returns HTTP 200 with `nearby: []` and
 * `resolutionStatus: "unresolved"` rather than an error. That is indis-
 * tinguishable from a genuinely empty place unless we look, and it used to be
 * cached for the full fifteen minutes — long enough to cover an entire lesson.
 * Nine of thirteen live London reads on 2026-09-06 were this.
 *
 * So a degraded read is held for a minute, the same as silence, and the next
 * class through asks again.
 */
const DEGRADED_TTL_MS = 60 * 1_000;
/**
 * How long a COMPLETE read may be served after a degraded one replaced it.
 *
 * Serving the last good answer through a rate-limited minute is the whole
 * point of nc#1012: a blank species row in front of a real class is worse than
 * a row of species that were near this school twenty minutes ago. It is
 * bounded, and it is bounded twice — by this window, and by the producer's own
 * `validUntil` via `observationsExpired`, which this must never outlive. When
 * the good answer ages out, the degraded one is served and the row goes quiet
 * honestly.
 */
const LAST_GOOD_TTL_MS = 45 * 60 * 1_000;

function locationKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/**
 * The general cache TTL must never extend Pointmoon's narrower evidence
 * promise. A projection can still be inside our 15-minute cache window while
 * its observation slice has crossed `validUntil`; that entry must be read
 * again rather than served as current local presence.
 */
function observationsExpired(data: FieldTruth | null, now: number): boolean {
  const validUntil = data?.facts?.fieldSnapshot?.observations?.validUntil;
  if (typeof validUntil !== "string") return false;
  const expiresAt = Date.parse(validUntil);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

/**
 * True when a read carries no nearby species worth showing (nc#1012).
 *
 * Deliberately narrow. It asks only about the observation slice, because that
 * is the slice that goes thin under an upstream rate limit; the weather and
 * the place in the same payload are fine and are never second-guessed here.
 * A read with an explicit `unresolved` status is degraded whatever else it
 * holds, and so is one that simply came back with nothing in either lane.
 *
 * A genuinely empty place reads as degraded too, and that is the right trade:
 * the cost is re-asking once a minute at a location that has no records, and
 * the benefit is never seating a throttled read for a quarter of an hour.
 */
function observationsDegraded(data: FieldTruth | null): boolean {
  if (data === null) return true;
  const observations = data.facts?.fieldSnapshot?.observations;
  if (!observations) return true;
  if (observations.historical?.resolutionStatus === "unresolved") return true;
  const nearby = observations.nearby?.length ?? 0;
  const birds = observations.birds?.notable?.length ?? 0;
  const historical = observations.historical?.nearby?.length ?? 0;
  return nearby + birds + historical === 0;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toObservationEntry(entry: PointmoonObservation): ObservationEntry {
  return {
    name: entry.commonName,
    scientificName: entry.scientificName ?? undefined,
    count: entry.count ?? undefined,
    photo: entry.photo,
    presence: entry.presence,
    iconicTaxon: entry.iconicTaxon ?? undefined,
    yearsObserved: entry.yearsObserved ?? undefined,
    sampledYears: entry.sampledYears ?? undefined,
    historicalAvgCount: entry.historicalAvgCount ?? undefined,
    ratioToHistorical: entry.ratioToHistorical ?? undefined,
    presenceRate: entry.presenceRate ?? undefined,
    emerged: entry.emerged ?? undefined,
    // Carried only when present, so absence survives the boundary as absence.
    ...(entry.photos?.length ? { photos: entry.photos } : {}),
    ...(entry.recency ? { recency: entry.recency } : {}),
    ...(entry.phenophase ? { phenophase: entry.phenophase } : {}),
  };
}

function toHistoricalObservationEntry(
  entry: PointmoonHistoricalObservation
): HistoricalObservationEntry {
  return {
    name: entry.commonName,
    scientificName: entry.scientificName,
    avgCount: entry.avgCount,
    photo: entry.photo,
    iconicTaxon: entry.iconicTaxon,
    yearsObserved: entry.yearsObserved,
    sampledYears: entry.sampledYears,
  };
}

function projectedObservations(
  projection: PointmoonNatureReady
): NonNullable<NonNullable<NonNullable<FieldTruth["facts"]>["fieldSnapshot"]>["observations"]> {
  return {
    nearby: projection.observations
      .filter((entry) => entry.source === "nearby")
      .map(toObservationEntry),
    birds: {
      notable: projection.observations
        .filter((entry) => entry.source === "notable-bird")
        .map(toObservationEntry),
    },
    absent: projection.absences.map(toObservationEntry),
    recentWindowDays: projection.recentWindowDays ?? undefined,
    validUntil: projection.validUntil,
    freshness: projection.freshness,
    historical: projection.historical
      ? {
          resolutionStatus: projection.historical.resolutionStatus,
          resolutionReason: projection.historical.resolutionReason,
          nearby: projection.historical.observations.map(toHistoricalObservationEntry),
        }
      : undefined,
  };
}

/**
 * Project the place slice, narrowly.
 *
 * Pointmoon's `place` object carries roughly forty fields. Two of them answer
 * "where does this read think it is", and only those two cross the boundary:
 * everything else on it is either already read as a signal or is nobody's
 * business on a renderer. Returns undefined rather than an empty object when
 * neither field survives, so a caller reading the absence gets one answer
 * instead of two.
 */
function projectedPlace(
  snapshot: Record<string, unknown>
): NonNullable<NonNullable<FieldTruth["facts"]>["fieldSnapshot"]>["place"] {
  const place = plainObject(snapshot.place);
  if (!place) return undefined;

  const name = typeof place.placeName === "string" ? place.placeName : null;
  const evidence = Array.isArray(place.evidence)
    ? place.evidence.filter((line): line is string => typeof line === "string")
    : [];

  if (!name && evidence.length === 0) return undefined;
  return { placeName: name, evidence };
}

/** A payload is only trusted when it is a plain object with a `facts` object.
 * Weather/signals keep their legacy read path; observations are always
 * replaced by the narrow versioned projection (or omitted when thin). */
function validateFieldTruth(payload: unknown, seasonalQuery?: { lat: number; lng: number }, tideQuery?: CoastalTideQuery, placeQuery?: PlaceQuery): FieldTruth | null {
  const root = plainObject(payload);
  if (!root) return null;
  if (root.facts === undefined) return {};

  const facts = plainObject(root.facts);
  if (!facts) return null;

  const output: FieldTruth = { facts: {} };
  if (Array.isArray(facts.signals)) {
    output.facts!.signals = facts.signals as NonNullable<FieldTruth["facts"]>["signals"];
  }

  const snapshot = plainObject(facts.fieldSnapshot);
  if (!snapshot) return output;
  output.facts!.fieldSnapshot = {};
  output.facts!.fieldSnapshot!.phenology = parseCuratedPhenology(snapshot.phenology, plainObject(snapshot.time)?.date);
  const weather = plainObject(snapshot.weather);
  if (weather) {
    output.facts!.fieldSnapshot!.weather = weather as NonNullable<
      NonNullable<FieldTruth["facts"]>["fieldSnapshot"]
    >["weather"];
  }

  /* The day's clock, the sky and the ground. Carried on the same legacy terms
     as `weather` above — a plain object passes through and anything else is
     simply absent — because these three are read only by composers that treat
     every field as optional and drop their whole line when one is missing.
     Nothing here can widen a claim: none of it is evidence about a species. */
  for (const key of ["time", "astronomy", "ground"] as const) {
    const slice = plainObject(snapshot[key]);
    if (slice) {
      output.facts!.fieldSnapshot![key] = slice as NonNullable<
        NonNullable<FieldTruth["facts"]>["fieldSnapshot"]
      >[typeof key];
    }
  }

  /* The place gets a narrower rule than the four above, deliberately. Those
     pass through whole because everything on them is a reading about the day.
     This one carries roughly forty fields about a point, and only the two that
     answer "where does this read think it is" have any business on a renderer
     (#315). */
  const place = projectedPlace(snapshot);
  if (place) output.facts!.fieldSnapshot!.place = place;

  if (seasonalQuery && root.schemaVersion === "field-truth@1.1.0") {
    const seasonal = parseSeasonalObservations(snapshot.seasonalObservations, seasonalQuery);
    if (seasonal) output.facts!.fieldSnapshot!.seasonalObservations = seasonal;
  }

  if (placeQuery && root.schemaVersion === "field-truth@1.1.0") output.facts!.fieldSnapshot!.placeEvidence = validPlaceEvidence(snapshot, placeQuery);
  if (tideQuery && root.schemaVersion === "field-truth@1.1.0") {
    const tides = parseCoastalTides(snapshot.coastalTides, tideQuery);
    if (tides) output.facts!.fieldSnapshot!.coastalTides = tides;
  }
  const projection = parsePointmoonNatureProjection(payload);
  if (projection.status === "ready") {
    output.facts!.fieldSnapshot!.observations = projectedObservations(projection);
  }
  return output;
}

export interface FieldTruthQuery {
  /** Explicit opt-in, also guarded by POINTMOON_USANPN_ENABLED. */
  seasonalObservations?: boolean;
  tideStation?: TideStationId;
  tideDate?: string;
  placeSources?: PlaceSource[];
  lat?: number;
  lng?: number;
  /** Optional producer-side observation scope. Weather and place stay whole. */
  observationTaxa?: readonly PointmoonObservationTaxon[];
}

export type PointmoonObservationTaxon =
  | "Plantae"
  | "Insecta"
  | "Aves"
  | "Fungi"
  | "Amphibia"
  | "Mammalia"
  | "Reptilia";

/**
 * DEMO FIXTURE MODE (#172).
 *
 * A show-and-tell runs on one pinned class, and the live read behind it is
 * whatever iNaturalist and the weather happen to hold that morning: it can go
 * thin, or slow, or down, mid-demo. `POINTMOON_FIXTURE_PATH` points at a
 * recorded payload on disk (repo-relative, e.g. the four-city corpus under
 * `tests/fixtures/pointmoon/`) and this client serves that instead of the
 * network, for every location, until the flag is removed.
 *
 * THE FLAG IS LOUD AND IT IS FENCED. Every fixture read logs the file it
 * served, because a recorded payload presented as a live read is the same
 * class of lie the sightings backfill was. There is no fallback to the network
 * when a fixture is configured but broken: that would quietly turn the demo
 * back into a live read.
 *
 * ── THE ESCAPE HATCH IS GONE (#284) ────────────────────────────────────────
 *
 * This fence used to open for `DEMO_MODE=1`: a production build carrying both
 * variables served the recorded payload, on the theory that a deploy which
 * says out loud that it is a demo has earned the right to lie. That theory
 * cost weeks. `.env.local` carried `POINTMOON_FIXTURE_PATH=...berkeley_ca.json`
 * plus `DEMO_MODE=1` and every build made from it — including ones nobody
 * thought of as a demo — served a Berkeley cast to a London classroom, with
 * the whole live path underneath working perfectly.
 *
 * So a production build now refuses a fixture UNCONDITIONALLY. There is no
 * second variable, and therefore no combination of variables that turns a
 * production deploy into a recording. Development and preview may still pin a
 * payload, which is what the replay corpus and the tests need it for; a
 * production build reads Pointmoon or it says nothing.
 */
const FIXTURE_ENV = "POINTMOON_FIXTURE_PATH";
let refusalLogged = false;

/** The resolved fixture file when the flag is set AND allowed here; else null. */
function fixturePath(): string | null {
  const raw = process.env[FIXTURE_ENV]?.trim();
  if (!raw) return null;

  if (process.env.NODE_ENV === "production") {
    if (!refusalLogged) {
      refusalLogged = true;
      console.error(
        `[pointmoon] REFUSING ${FIXTURE_ENV}="${raw}": NODE_ENV is production. A production build never serves a recorded payload, with or without DEMO_MODE. Reading Pointmoon live.`
      );
    }
    return null;
  }

  // Repo-relative only. The fixture ships with the code, so a path climbing
  // out of the working directory is a misconfiguration, not a demo.
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, raw);
  if (!resolved.startsWith(root + path.sep)) {
    console.error(
      `[pointmoon] REFUSING ${FIXTURE_ENV}="${raw}": resolves outside the app directory. Reading Pointmoon live.`
    );
    return null;
  }
  return resolved;
}

/**
 * The coordinates a served fixture is a read OF.
 *
 * Production's URL of record is signed out, so it has no class and no
 * coordinates, and every locale fell back to the UK default — the deployed
 * demo showed a Berkeley cast at 23°C. In fixture mode the payload itself
 * knows where it was taken, so the demo can be honest about its own units
 * without anyone passing ?locale=us.
 *
 * Null whenever fixture mode is off, so live traffic is untouched.
 */
export function fixtureLocation(): { lat: number; lng: number } | null {
  if (!fixturePath()) return null;
  // Same blank-is-not-zero rule as readLocation below (#1234): a declared but
  // empty CONDITIONS_LAT used to make fixture mode claim Null Island.
  const lat = envCoord(process.env.CONDITIONS_LAT);
  const lng = envCoord(process.env.CONDITIONS_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * The place this read is for, or null when nothing real answers (#1234).
 *
 * Both readers below used to end a missing coordinate with
 * `?? Number(process.env.CONDITIONS_LAT ?? 51.546)`, so a class with no
 * coordinates was silently read at 51.546, -0.105 — a north London grid square,
 * and also the dev probe pair in `scripts/probe-seasonal.mjs`. Nothing on the
 * way down said so, and nothing on screen said so: the sentence a teacher reads
 * aloud, and the species beside it, were a TRUE reading of somewhere that may be
 * thousands of km from her classroom, presented as hers. That is the hard kind
 * of wrong to notice, because every value in it is internally consistent.
 *
 * The literal was not a bug when it was written. `README.md` still describes
 * `CONDITIONS_LAT`/`CONDITIONS_LNG` as the "demo school location (defaults to a
 * London primary school; per-school location comes later with auth)" — one demo
 * school, one place. Per-school location arrived; the fallback outlived it.
 *
 * So the env pair stays, and is now the only way to ask for a demo place: an
 * explicit answer to "where is this?", which someone configuring a demo gives on
 * purpose. What is gone is the implicit one. With neither a class coordinate nor
 * a configured place, this returns null, the reader returns null with it, and
 * the run page's own rule takes over — "when there is nothing true to say, the
 * authored line stands" (app/run/page.tsx:200-201).
 *
 * This is the same call `getOutsideNow` already made on the species side for
 * #305, where a school outside the phenology files gets nothing rather than a
 * silent `uk-south`. The two halves of one sentence now fail the same way.
 *
 * `??` and not `||`: latitude 0 and longitude 0 are real places.
 */
function readLocation(query: FieldTruthQuery): { lat: number; lng: number } | null {
  // The pair is atomic on each side, and that is not a detail. Resolving the
  // axes independently lets a caller who named ONE coordinate have the other
  // completed from the demo location — `{ lat: 42.36 }` with the London demo
  // configured reads 42.36,-0.105, a Boston latitude on a London meridian,
  // which is neither school and is the very defect this ticket is about, in a
  // worse form: it invents a third place rather than substituting a second.
  // Caught in review of this change (Codex, PR #1238); no caller does it today,
  // but "half a place" must not resolve to a whole one.
  const named = query.lat !== undefined || query.lng !== undefined;
  const lat = named ? query.lat ?? Number.NaN : envCoord(process.env.CONDITIONS_LAT);
  const lng = named ? query.lng ?? Number.NaN : envCoord(process.env.CONDITIONS_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * The sample patch: the one place a surface may deliberately read when it has
 * no class, and only because it then SAYS so (#463).
 *
 * This is the other half of #1234 and the reason that ticket offered two
 * shapes. The run page reads its sentence aloud with no room to name a place,
 * so with no class coordinate it must say nothing — `fetchFieldTruth` returns
 * null and the authored line stands. The cast is the opposite: it already
 * names what it read, down to "Seen lately near {name}, the sample patch"
 * (`lib/outside/captions.ts:63`), so a signed-out visitor reading the sample
 * patch is told exactly whose reading it is. That is honest, it is deliberate,
 * and #463 built it on purpose.
 *
 * What was wrong was never the sample patch. It was that the sample patch was
 * supplied by a `??` inside a data fetcher, so every caller got it whether or
 * not it could name it — which is how the run page came to read north London
 * in silence. Naming it here, and making the surfaces that want it ask for it,
 * is the ticket's own prescription: "a demo/fixture place should come from
 * fixture mode, which already exists and already fails closed, not from a `??`
 * in a data fetcher."
 *
 * `CONDITIONS_LAT`/`CONDITIONS_LNG` still override it, so a demo can be run
 * anywhere. Do NOT reach for this from a surface that cannot name what it read.
 */
export const SAMPLE_PATCH = { lat: 51.546, lng: -0.105 } as const;

export function samplePatchLocation(): { lat: number; lng: number } {
  const lat = envCoord(process.env.CONDITIONS_LAT);
  const lng = envCoord(process.env.CONDITIONS_LNG);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { ...SAMPLE_PATCH };
}

/**
 * An environment coordinate, or NaN when nobody set one.
 *
 * `Number("")` is **0**, not NaN, so a variable that is declared and left blank
 * — which is what a platform gives you for an env row with an empty value, and
 * what a `.env` line like `CONDITIONS_LAT=` produces — used to read as latitude
 * zero. That is a real coordinate in the Atlantic, so it passed every finite
 * check below it and became a place. Caught by this ticket's own test: the
 * silence assertions went red because a blank pair still reached the producer.
 *
 * Unset and blank are the same statement — nobody said where this is — so both
 * answer NaN and fail closed. A genuine `0` still has to arrive as a coordinate
 * from the caller, or as the string "0".
 */
function envCoord(raw: string | undefined): number {
  return raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
}

/** Return the recorded response unchanged. Never falls through to the network on failure. */
async function readFixturePayload(
  file: string,
  location: { lat: number; lng: number } | null
): Promise<unknown | null> {
  try {
    const payload: unknown = JSON.parse(await readFile(file, "utf8"));
    console.warn(
      `[pointmoon] FIXTURE MODE: served RECORDED payload ${file} for ${
        location ? `${location.lat},${location.lng}` : "a caller that named no place"
      } — this is not a live read.`
    );
    return payload;
  } catch (error) {
    console.error(
      `[pointmoon] FIXTURE MODE: ${FIXTURE_ENV}="${file}" could not be read (${
        error instanceof Error ? error.message : String(error)
      }). Serving nothing; deliberately NOT falling back to a live read.`
    );
    return null;
  }
}

/**
 * The ordinary transport path: one timed HTTP read, null on any failure.
 *
 * No `surface=open` here (nc#362). That param applied Pointmoon's
 * `license=cc0,cc-by&photo_license=cc0,cc-by` filter, built for third-party
 * surfaces that redistribute Pointmoon's data further downstream. Nature
 * Class isn't one of those — it reads Pointmoon and shows the result to its
 * own teachers and students, the same first-party pattern
 * `outdoorsBackend/modules/api/NatureIntel` already uses with no `surface`
 * param at all. Paying that filter's coverage cut (measured elsewhere at
 * 77-100% of iNaturalist observations withheld, depending on region) bought
 * nothing here and is believed to be the mechanism behind #305's thin
 * regional coverage.
 *
 * It also stopped matching this repo's own rights policy two days before it
 * was written into these docs: the #294/#296 "all photos, no gates" change
 * (2026-08-17) already made every downstream layer — the contract type in
 * pointmoon-contract.ts, the renderer in lib/cast/member.ts, PhotoCredit —
 * accept any photo licence Pointmoon sends, gating only on a usable HTTPS
 * URL and carrying whatever credit/licence/source travelled. `surface=open`
 * was the one place still discarding cc-by-nc (iNaturalist's most common
 * licence) before any of that code ever saw it — a gate the rest of the
 * pipeline had already decided not to have.
 */
function observationTaxaScope(
  taxa: readonly PointmoonObservationTaxon[] = []
): PointmoonObservationTaxon[] {
  return [...new Set(taxa)].sort();
}

async function fetchLivePayload(
  lat: number,
  lng: number,
  observationTaxa: readonly PointmoonObservationTaxon[] = [],
  seasonalObservations = false,
  tideStation?: TideStationId,
  tideDate?: string,
  placeSources?: PlaceSource[]
): Promise<unknown | null> {
  const base = process.env.POINTMOON_API_URL ?? HOSTED_POINTMOON;
  try {
    const scope = observationTaxaScope(observationTaxa);
    const taxonQuery = scope.length
      ? `&observationTaxa=${encodeURIComponent(scope.join(","))}`
      : "";
    const sources = [...(placeEvidenceEnabled() ? placeSources ?? [] : []), seasonalObservations && seasonalObservationsEnabled(lat, lng) ? "usanpn" : null, tideStation && tideDate && noaaReferenceEnabled() ? "noaa" : null].filter(Boolean);
    const evidenceQuery = sources.length ? `&evidenceSources=${sources.join(",")}` : "";
    const tideQuery = sources.includes("noaa") ? `&tideStation=${tideStation}&tideDate=${encodeURIComponent(tideDate!)}` : "";
    const url = `${base.replace(/\/$/, "")}/api/moon?audience=facts&lat=${lat}&lng=${lng}${taxonQuery}${evidenceQuery}${tideQuery}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {
    return null;
  }
  return null;
}

/**
 * ARCHIVE-ONLY raw Pointmoon transport.
 *
 * The nightly replay corpus must preserve the producer's versioned response
 * exactly, including fields no Nature Class renderer understands yet. Surface
 * code must use `fetchFieldTruth`, which validates and projects a deliberately
 * smaller object before returning it. This function does no projection and no
 * caching; its only production caller is the authenticated recording job.
 */
export async function fetchFieldTruthArchivePayload(
  query: FieldTruthQuery = {}
): Promise<unknown | null> {
  const fixture = fixturePath();
  const location = readLocation(query);
  if (!fixture && !location) return null;
  if (fixture) return readFixturePayload(fixture, location);
  const { lat, lng } = location!;
  return fetchLivePayload(lat, lng, query.observationTaxa, query.seasonalObservations, query.tideStation, query.tideDate, query.placeSources);
}

/**
 * The last complete read for this key, or null once it is too old to stand in
 * for a live one. Bounded by `LAST_GOOD_TTL_MS` and by the producer's own
 * `validUntil`, whichever comes first; a stale entry is dropped, not served.
 */
function lastGoodFor(key: string, now: number): FieldTruth | null {
  const good = lastGood.get(key);
  if (!good) return null;
  if (now - good.at >= LAST_GOOD_TTL_MS || observationsExpired(good.data, now)) {
    lastGood.delete(key);
    return null;
  }
  return good.data;
}

/**
 * Fetch Pointmoon for a location and cache it in memory ~15 minutes per
 * location and observation scope so a class session never hammers the API.
 * Concurrent calls for the same answer share one fetch. Returns null on any
 * failure (the callers show less).
 *
 * NOT EVERY 200 IS AN ANSWER (nc#1012). A read that comes back well-formed
 * with no species in it is held for a minute rather than fifteen, and the last
 * complete read for the same key is served in its place while that stays
 * honest — bounded by `LAST_GOOD_TTL_MS` and by the producer's own
 * `validUntil`. A blank species row in front of a class is worse than a list
 * from twenty minutes ago; a list presented as current after its evidence
 * window has closed would be worse than both, so it is never served.
 *
 * When `POINTMOON_FIXTURE_PATH` is set and permitted here, the recorded
 * payload at that path is served in place of the network — same cache, same
 * in-flight sharing, same null-on-failure contract. See fixturePath() above
 * for the fence and the logging.
 */
function freshSeasonal(data: FieldTruth | null, lat: number, lng: number): FieldTruth | null {
  const snapshot = data?.facts?.fieldSnapshot;
  if (!snapshot?.seasonalObservations) return data;
  const seasonalObservations = parseSeasonalObservations(snapshot.seasonalObservations, { lat, lng });
  return { ...data, facts: { ...data?.facts, fieldSnapshot: { ...snapshot, seasonalObservations: seasonalObservations ?? undefined } } };
}

/** Independent source success survives a fallback chosen for iNaturalist. */
function seasonalAlongsideFallback(selected: FieldTruth | null, current: FieldTruth | null, lat: number, lng: number): FieldTruth | null {
  const seasonal = parseSeasonalObservations(current?.facts?.fieldSnapshot?.seasonalObservations, { lat, lng });
  if (!seasonal) return freshSeasonal(selected, lat, lng);
  return { ...selected, facts: { ...selected?.facts, fieldSnapshot: { ...selected?.facts?.fieldSnapshot, seasonalObservations: seasonal } } };
}

/** Revalidate prediction/measurement expiry independently on cached and fallback reads. */
function tidesAlongsideFallback(selected: FieldTruth | null, candidate: FieldTruth | null, query?: CoastalTideQuery): FieldTruth | null {
  if (!query) return selected;
  const current = parseCoastalTides(selected?.facts?.fieldSnapshot?.coastalTides, query);
  const prior = parseCoastalTides(candidate?.facts?.fieldSnapshot?.coastalTides, query);
  const newest = <T extends { retrievedAt: string }>(a: T | null, b: T | null): T | null => !a ? b : !b ? a : Date.parse(b.retrievedAt) > Date.parse(a.retrievedAt) ? b : a;
  const tides = current && prior ? { ...current, predictions: newest(current.predictions, prior.predictions), measured: newest(current.measured, prior.measured) } : current ?? prior;
  if (!selected && !tides) return null;
  return { ...selected, facts: { ...selected?.facts, fieldSnapshot: { ...selected?.facts?.fieldSnapshot, coastalTides: tides ?? undefined } } };
}

function placeAlongsideFallback(selected: FieldTruth | null, candidate: FieldTruth | null, query?: PlaceQuery): FieldTruth | null {
  if (!query) return selected;
  const a = validPlaceEvidence(selected?.facts?.fieldSnapshot?.placeEvidence, query);
  const b = validPlaceEvidence(candidate?.facts?.fieldSnapshot?.placeEvidence, query);
  const merged = { ...b, ...a };
  for (const key of Object.keys(b)) {
    const at = (v: unknown) => { const o = v as Record<string, unknown>; return Date.parse(String(o?.retrievedAt ?? o?.readAt)); };
    if (!a[key] || at(b[key]) > at(a[key])) merged[key] = b[key];
  }
  if (!selected && !Object.keys(merged).length) return null;
  return { ...selected, facts: { ...selected?.facts, fieldSnapshot: { ...selected?.facts?.fieldSnapshot, placeEvidence: merged } } };
}

export async function fetchFieldTruth(query: FieldTruthQuery = {}): Promise<FieldTruth | null> {
  // Live traffic with no place asks nobody (#1234). Fixture mode is the one
  // exception and deliberately so: it is dev-only, never on in production
  // (`fixturePath()` is null without POINTMOON_FIXTURE_PATH), it is switched on
  // by hand, and the recorded payload knows where it was taken — so it answers
  // with or without a coordinate, exactly as it did before. The coordinates
  // only ever reach that path's log line.
  const location = readLocation(query);
  if (!fixturePath() && !location) return null;
  const lat = location?.lat ?? Number.NaN;
  const lng = location?.lng ?? Number.NaN;
  const observationTaxa = observationTaxaScope(query.observationTaxa);
  const seasonal = query.seasonalObservations === true && seasonalObservationsEnabled(lat, lng);
  const tide = query.tideStation && tideStations.some(s => s.id === query.tideStation) && query.tideDate && noaaReferenceEnabled() ? { lat, lng, stationId: query.tideStation, date: query.tideDate } : undefined;
  const placeSources = placeEvidenceEnabled() ? [...new Set(query.placeSources ?? [])].filter(s => s in sourceFields).sort() : [];
  const place = placeSources.length ? { lat, lng, sources: placeSources } : undefined;
  const key = `${seasonal || tide || place ? `${lat},${lng}` : locationKey(lat, lng)}|${observationTaxa.join(",") || "all"}${seasonal ? `|usanpn|${new Date().toISOString().slice(0, 10)}` : ""}${tide ? `|noaa|${tide.stationId}|${tide.date}` : ""}|${placeSources.join(",")}`;

  const hit = cache.get(key);
  if (hit) {
    // A degraded read is held for a minute, not a quarter of an hour, and it
    // never displaces a complete answer that is still standing (nc#1012).
    const degraded = observationsDegraded(hit.data);
    const ttl = hit.data === null ? SILENT_TTL_MS : degraded || tide ? DEGRADED_TTL_MS : CACHE_TTL_MS;
    const now = Date.now();
    if (now - hit.at < ttl && !observationsExpired(hit.data, now)) {
      return placeAlongsideFallback(tidesAlongsideFallback(seasonalAlongsideFallback(curatedAlongsideFallback(degraded ? (lastGoodFor(key, now) ?? hit.data) : hit.data, hit.data), hit.data, lat, lng), hit.data, tide), hit.data, place);
    }
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const fetchOnce = (async (): Promise<FieldTruth | null> => {
    // Validate after transport so no renderer can receive the archival object.
    let data = validateFieldTruth(
      await fetchFieldTruthArchivePayload({ lat, lng, observationTaxa, seasonalObservations: seasonal, tideStation: tide ? query.tideStation : undefined, tideDate: tide?.date, placeSources }),
      seasonal ? { lat, lng } : undefined, tide, place
    );
    const previous = cache.get(key)?.data;
    const retained = previous?.facts?.fieldSnapshot?.seasonalObservations;
    if (seasonal && !data?.facts?.fieldSnapshot?.seasonalObservations && retained) {
      const valid = parseSeasonalObservations(retained, { lat, lng });
      if (valid) data = { ...data, facts: { ...data?.facts, fieldSnapshot: { ...data?.facts?.fieldSnapshot, seasonalObservations: valid } } };
    }
    data = placeAlongsideFallback(tidesAlongsideFallback(data, previous ?? null, tide), previous ?? null, place);
    const at = Date.now();
    cache.set(key, { data, at });
    if (data !== null && !observationsDegraded(data)) {
      lastGood.set(key, { data, at });
      return data;
    }
    // The read came back empty. Show what was actually here recently rather
    // than a blank row, for as long as that stays honest.
    return placeAlongsideFallback(tidesAlongsideFallback(seasonalAlongsideFallback(curatedAlongsideFallback(lastGoodFor(key, at) ?? data, data), data, lat, lng), data, tide), data, place);
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, fetchOnce);
  return fetchOnce;
}
