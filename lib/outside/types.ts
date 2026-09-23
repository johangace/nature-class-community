/**
 * lib/outside — what's alive outside the classroom right now.
 *
 * Two grounded sources, one shape for the surfaces that read them:
 *  - conditions: today's sky, from Pointmoon (weather field-truth).
 *  - phenology: what's stirring near this school this week, from the
 *    regional phenology data (real species, real windows, sourced offline).
 *
 * Everything here is optional and degrades to silence: a thin read never
 * invents nature, it simply shows less. The voice is ours; the facts are not.
 */

export type HabitatTag =
  | "pond"
  | "stream"
  | "woodland"
  | "hedgerow"
  | "grassland"
  | "meadow"
  | "urban"
  | "coast"
  | "garden"
  | "playing_field"
  | "wall_fence";

export type Sense = "sight" | "sound" | "smell" | "touch";
export type NarrativePhase = "emerging" | "peak" | "fading";
export type Confidence = "high" | "medium" | "low";

/**
 * WHAT A ROW IS, AUTHORED RATHER THAN INFERRED (#1020).
 *
 *   "species"  a findable specimen. A child can be sent to go and look at one,
 *              and a picture of one is a picture of the thing named.
 *   "event"    a thing the season is DOING. Swallows massing on wires, starlings
 *              turning over a roost, a rut, a solstice. Real, worth telling a
 *              class about, and not a specimen: there is nothing to hold up
 *              beside a trunk, and a portrait of one bird is not a portrait of
 *              a gathering.
 *
 * Johan, 2026-09-06, on seeing "Swallow Gathering" printed in a leaf-mask
 * lesson's specimen strip: *"a seasonal EVENT, not a findable specimen — a
 * child sorting leaves cannot go and look at it."*
 */
export type PhenologyKind = "species" | "event";

/** One thing to meet outside this week — the phenology record, as authored. */
export interface PhenologyEntry {
  id: string;
  species: string;
  /**
   * Which of the two this row is. Absent means "species", because that is what
   * the overwhelming majority of the 4,388 rows are and a field that is right
   * by default on 98% of rows gets rubber-stamped on the other 2%.
   *
   * ── WHY THIS IS A FIELD AND NOT AN INFERENCE ───────────────────────────────
   *
   * Until #1020 the product answered "is this a specimen?" by asking whether
   * the row carried a `scientificName`. `lib/outside/taxon-reference.ts` and
   * `lib/lesson/door.ts` both say so in prose: *"the ones without a taxon are
   * the phenology rows that are not species at all — Autumn Colour, Dawn
   * Chorus, First Frost."* That is an inference from an absence, and it held
   * only for as long as no event row was authored with a taxon.
   *
   * `uk-north.json` week 35 carries one:
   *
   *     { "id": "uk_north_w35_swallow_gathering",
   *       "species": "Swallow Gathering",
   *       "scientificName": "Hirundo rustica",
   *       "description": "Swallows massing on wires before migration" }
   *
   * Hirundo rustica resolves in the generated taxon reference to Aves and a
   * photograph of one barn swallow, so the row cleared `matchesTopic` for
   * `birds` and for `animals` — taxonomically it IS on topic — and printed as
   * a specimen under an event's name. #1019's topic gate cannot reach it:
   * that gate is about the LESSON's subject, and this defect is a row claiming
   * to be a kind of thing it is not.
   *
   * The scientific name stays on the row on purpose. It is true, the "what to
   * look for" note legitimately wants to know which bird is massing, and
   * deleting it would be a second inference to remember rather than a fact to
   * read. What `kind: "event"` buys is that no reader has to guess: the two
   * seams that turn a row into a specimen — `resolvePhenologyReference` and
   * `getOutsideNow`'s `usuallyAround` — ask this field and stop.
   *
   * Declared beside `species` rather than beside `scientificName` because it
   * qualifies the NAME, and that is where it is written in the region files.
   */
  kind?: PhenologyKind;
  scientificName?: string;
  /** What to look or listen for — the teacher-facing line. */
  description: string;
  habitats: HabitatTag[];
  senses: Sense[];
  confidence: Confidence;
  narrativePhase?: NarrativePhase;
  /** Vivid language for a child — the "what to look for" line. */
  childFriendlyNote?: string;
}

/** A species actually seen and photographed near the school lately. */
export interface Sighting {
  id: string;
  name: string;
  scientificName?: string;
  /** Validated exact-observation image evidence. Presence remains valid when null. */
  photo?: PointmoonPhotoAsset | null;
  /**
   * Every picture Pointmoon holds of this species, best claim first, with
   * `photo` as element zero (#984). Absent, never empty.
   *
   * Carried here so the live graft in `lib/cast/enrich.ts` can lay a whole
   * gallery over a stored cast that has none, for the same reason it already
   * lays a single photograph over one whose own image cannot be released.
   */
  photos?: PointmoonPhotoAsset[];
  /** Bounded evidence for the local-presence claim; never exact coordinates. */
  presence?: PointmoonPresenceEvidence | null;
  /** @deprecated Safe compatibility view of `photo.url`; never parse a raw URL here. */
  photoUrl: string | null;
  /** How many were logged nearby in the window, when Pointmoon reported it. */
  count?: number;
  /** iNaturalist iconic taxon (Insecta, Aves, Plantae...), when reported —
   * the handle topic-aware ranking sorts by (#161). */
  iconicTaxon?: string;
}

/**
 * A species the regional phenology says is usually about here this week.
 *
 * NOT a sighting, and deliberately a DIFFERENT TYPE from one, with no
 * `photoUrl` field at all. #172 was fixed once by subtraction — stop pouring
 * regional entries into `sightings` — which is correct and holds as long as
 * everyone remembers. This type makes it structural: a `SeasonalName` cannot
 * be rendered in the seen list even by accident, because the field the seen
 * list renders does not exist on it. Nothing to remember, nothing to re-break.
 *
 * `LookFor` carries the same species with a teaching note, for the "what to
 * look for this week" panel. This carries the bare name, for the standing
 * caption on the card. Same source, two jobs.
 *
 * ── SPECIES ONLY (#1020) ───────────────────────────────────────────────────
 *
 * This list is what the week offers to GO AND MEET, and everything downstream
 * treats a name on it as a specimen: `subjectMediaFor` looks its scientific
 * name up to put a photograph under a lesson, `brief.ts` resolves it into a
 * cast member, `buildNoteIndex` keys the child-language note on it so a
 * recorded creature of the same species inherits that note.
 *
 * A seasonal EVENT is none of those things, so `getOutsideNow` does not put
 * one here. It is not dropped — it keeps its whole presence in `lookFors`
 * below, note and phase and all, which is the panel for what to NOTICE this
 * week rather than what to find. Two lists, two questions.
 */
export interface SeasonalName {
  id: string;
  name: string;
  scientificName?: string;
}

/** A seasonal "what to look for" line — the child-friendly phenology note. */
export interface LookFor {
  id: string;
  species: string;
  note: string;
  /**
   * "event" for a row that names a thing the season is doing (#1020), carried
   * so a reader rebuilding a member out of a look-for — `brief.ts` does — can
   * ask the row what it is instead of inferring it from a missing taxon.
   * Absent means species, exactly as on `PhenologyEntry`.
   */
  kind?: PhenologyKind;
  phase?: NarrativePhase;
}

/**
 * Where a read is anchored, in words a teacher can contradict.
 *
 * Onboarding's location step used to take coordinates from the browser and
 * show her a sky, with nothing on screen naming the place those coordinates
 * are. On a desktop behind a VPN, or on a school network whose carrier gateway
 * exits in another country, the browser hands back the exit node and every
 * line on that card is about somewhere she has never been. She is standing in
 * the real place and is the only person who can catch it, so the screen has to
 * say what it thinks the place is (#315).
 *
 * Both fields come out of Pointmoon's reverse geocode of the exact point being
 * read, verbatim. Nothing here is composed by us, and either can be null: an
 * unnamed point is a real answer, and the surface says so rather than filling
 * the gap.
 */
export interface ResolvedPlace {
  /** What the map calls this point, e.g. "Canonbury". Null when unnamed. */
  name: string | null;
  /**
   * The reverse geocoder's full address for the point, e.g. "Highbury Corner,
   * Canonbury, London Borough of Islington, Greater London, England, N5 1RA,
   * United Kingdom". Long on purpose: it runs out to the country, which is the
   * token that makes a wrong fix visible at a glance.
   */
  address: string | null;
}

/** Today's sky, composed from what Pointmoon actually returned — or silent. */
export interface ConditionsSummary {
  /** One warm grounded sentence, or null when the read was thin. */
  line: string | null;
  /** A quiet instrument row: "18° · a soft grey sky · a light breeze". */
  meta: string | null;
  /**
   * How the season is running here, from Pointmoon's live
   * `nature.phenology.dominant_phase` / `season_progress` signals (#284 step
   * 4) and, under #1281's measured floor, Pointmoon's own headline sentence —
   * never a stored or authored claim. Null when Pointmoon sent none of them,
   * or sent a value this reader does not recognise. Optional on the type only
   * so a hand-built fixture from before this field existed still type-checks;
   * every real read sets it.
   *
   * WHO READS IT (#1292). Two consumers, and they are two different claims
   * about the same sentence. `lib/lesson/support-context.ts` carries it to the
   * model as `regionalExpectation`, in a channel of its own that states what a
   * regional expectation cannot do. `/outside` renders it as the caption over
   * "Seasonal highlights", which is the teacher's own copy of the same
   * calendar — see `OutsideBrief.seasonalNote` for why it does not travel to a
   * day in another week the way that list does. It was composed on every read
   * and rendered nowhere between #284 and #1292; if a change here would leave
   * it with no reader again, close it rather than keep composing it.
   */
  seasonalNote?: string | null;
}

/** Everything the "outside now" surface needs, composed once, server-side. */
export interface OutsideNow {
  conditions: ConditionsSummary;
  /**
   * Where this read is anchored, when Pointmoon could name it. Null when the
   * payload carried no place at all, which is a different thing from a place
   * with no name and is said differently by the surfaces (#315).
   */
  place: ResolvedPlace | null;
  /**
   * Species actually recorded near the school lately (Pointmoon observations).
   * Empty when the read returned none — never backfilled from the regional
   * phenology (#172). A surface may caption these "seen near your school",
   * which is only true because nothing regional can reach this list.
   */
  sightings: Sighting[];
  /**
   * The same regional phenology as `lookFors`, as bare names, for the card's
   * standing "usually around here now" caption. Regional, never recorded: it
   * is what the season brings to this region, not what anyone saw here.
   *
   * It exists so the honest tier has a home on the card's face rather than
   * only behind the "see what's out there" tap. Removing the backfill (#177)
   * made the day-one card truthful and empty; this makes it truthful and
   * useful, under a caption that claims exactly what the phenology file knows.
   *
   * As of #284/#305 this is two sources, authored first: the phenology file
   * answers for the week, then `lib/outside/live-lookfors.ts` adds species
   * Pointmoon's own multi-year record names near this exact point that the
   * file did not already carry. See `getOutsideNow`'s header for why that is
   * additive rather than a replacement in this pass.
   */
  usuallyAround: SeasonalName[];
  /**
   * Seasonal "what to look for" lines (regional phenology, plus Pointmoon's
   * live regional record — see `usuallyAround`). Regional, not recorded:
   * caption these as what is usually about this week, never as something
   * seen here.
   */
  lookFors: LookFor[];
  /**
   * The region the phenology was read from, for provenance. Null when the
   * school's coordinates fall outside every region file we have, which is
   * also when `lookFors` and `usuallyAround` are empty by construction: there
   * is no region to make a claim about, so no claim is made (#305).
   */
  regionId: RegionId | null;
  /** ISO week number the phenology was read for (1–52). */
  week: number;
}

export type RegionId =
  | "uk-south"
  | "uk-north"
  | "uk-scotland"
  | "ireland"
  | "western-europe"
  | "us-southeast"
  | "us-mid-atlantic"
  | "us-new-england"
  | "us-midwest"
  | "us-south-central"
  | "us-mountain-west"
  | "us-california"
  | "us-pacific-nw"
  | "canada-east"
  | "canada-west";
import type { PointmoonPhotoAsset, PointmoonPresenceEvidence } from "./pointmoon-contract";
