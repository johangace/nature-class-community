import { safeLookForNote } from "@/lib/outside";
// Server-only: resolves a Pointmoon read plus disk-read teaching notes into
// today's cast. Never import from a client component.

/**
 * THE ONE CAST ACCESSOR.
 *
 * Every surface that shows a species — the daily card, the species profile,
 * the in-lesson speak-and-show, the printed cast cards — reads its cast from
 * `getClassCast` and from nowhere else. That is the whole point of this file:
 * the door, the lesson and the paper must agree on which creatures today is
 * about, or the promise "the cards she showed outside are the cards that
 * print" is a lie.
 *
 * ── ONE PATH, RESOLVED FROM NOW (#284) ─────────────────────────────────────
 *
 * There used to be two paths. A class carried a stored cast — `CastMember`
 * rows written once at the onboarding location step — and `readStoredCast`
 * preferred it over everything; a class without one fell through to a poorer
 * per-request composition. Johan's ruling on 2026-08-17 ended that: the cast
 * is resolved from the current Pointmoon payload, per request, and it is not
 * written down. See lib/cast/live.ts for the ruling and the reasoning.
 *
 * What that bought, beyond honesty: the live path is now the RICHER one, not
 * the poorer one. The old composed fallback could not produce `absent`
 * members or fill `yearsObserved`, because it went through `getOutsideNow`,
 * which flattens the payload to a card's slice. The live path runs the same
 * `resolveCast` the stored writer ran, over the same payload, so it gets the
 * multi-year recurrence, the striking absences, the findability ranking and
 * the provenance-gated photographs — every morning rather than once.
 *
 * `ClassCast.source` is `"live"` for a resolved cast. Nothing branches on it
 * to show more or less; it is there so a surface or a test can say which path
 * answered without guessing.
 *
 * ── WHAT A FAILED READ LOOKS LIKE ──────────────────────────────────────────
 *
 * An empty cast, and a surface that says it could not see outside. There is no
 * previous generation to fall back on, deliberately. Nothing is padded, and a
 * thin read makes a SHORTER cast, never a longer one with invented entries.
 */

import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { pointmoonObservationTaxa } from "@/lib/outside/observations";
import { curatedEntries } from "@/lib/outside/curated-phenology";
import { classLearnerFields, resolveLiveCast } from "./live";
import type { ResolvedCastMember } from "./resolve";
import { calmLine, childLine, commonNameKey, type CastMember, type ClassCast } from "./member";
import type { TopicTag } from "@/schema/pack";
import type { ClimateGroup, HabitatTag } from "@/lib/outside";

export interface CastReadOptions {
  /** The school's coordinates. Without them there is no cast for a place. */
  lat?: number | null;
  lng?: number | null;
  /** The school's habitats, when known. */
  habitats?: HabitatTag[];
  /** Today's lesson's topic tags: the cast leads with the matching species. */
  topicTags?: readonly TopicTag[];
  /** Today's authored primary topic, when the session has one. */
  primaryTopic?: TopicTag | null;
  /** The species profile target, protected from the resolver's display cap. */
  profileSlug?: string | null;
  /**
   * Strict topic filter (nc#233) — see `lib/cast/resolve.ts`'s
   * `ResolveCastQuery.topicFilter`. Off by default (the general, ranked
   * cast); the in-lesson speak-and-show, the door's evidence and the printed
   * reference cards turn it on so a mismatched species can never fill a thin
   * lesson's cast.
   */
  topicFilter?: boolean;
  /**
   * How many members to resolve, when a surface has a layout reason to ask for
   * fewer. Unset means the count follows the context — see
   * `lib/cast/live.ts`'s `LiveCastQuery.limit` (#1030).
   */
  limit?: number;
  /** The moment to read for; defaults to now. Injectable for tests. */
  date?: Date;
  /**
   * The class's stored climate tag. Passed through so a composed cast reads
   * the same phenology region the rest of the app does — a Sonoran school
   * whose coordinates fall in a Rockies box must not get a mountain cast on
   * the card and a desert one everywhere else.
   */
  climate?: ClimateGroup | null;
}

const EMPTY: ClassCast = { members: [], absences: [], source: "live" };

/**
 * A class's cast: the species this class can expect to meet today.
 *
 * Never throws and never blocks a page: a failed read is an empty cast, and
 * every surface that reads one is written to be whole without it. That is not
 * defensive coding, it is the product's primary state — on day one at a pilot
 * school there is no photography, no history, and often no live read.
 */
export async function getClassCast(
  classId: string | null,
  options: CastReadOptions = {}
): Promise<ClassCast> {
  try {
    return await readLiveCast(classId, options);
  } catch {
    return EMPTY;
  }
}

/**
 * Resolve this class's cast from the current read.
 *
 * THIS IS A RENDER PATH AND IT ONLY EVER READS. That rule survived the change
 * from stored to live and matters more now, not less: rendering is the moment
 * resolution happens, so a write here would mean every page view mutated the
 * class. Nothing is written. The resolution is held for sixty seconds in
 * lib/cast/live.ts and then it is gone.
 *
 * The learner half comes from the class row, which is legitimately stored: the
 * year group and ability band are facts about the people in the room, not
 * observations of a world that changes overnight. They decide the youngest-
 * years safety exclusion, which is why a signed-out cold URL (no classId)
 * resolves the safe general cast rather than a reception one.
 *
 * `absences` arrive with evidence and ship SILENT. They flow into
 * `ClassCast.absences` for the closing seam (lib/cast/closing.ts) to read, and
 * that seam returns nothing until the resolver token lands. An absence carried
 * is not an absence spoken. Note that the old composed path could not produce
 * these at all — going live is what gave them back.
 */
async function readLiveCast(
  classId: string | null,
  options: CastReadOptions
): Promise<ClassCast> {
  const learner = classId
    ? await classLearnerFields(classId)
    : { yearGroup: null, abilityBand: null };

  const [live, notes] = await Promise.all([
    resolveLiveCast({
      lat: options.lat,
      lng: options.lng,
      habitats: options.habitats,
      topicTags: options.topicTags,
      primaryTopic: options.primaryTopic,
      profileSlug: options.profileSlug,
      topicFilter: options.topicFilter,
      climate: options.climate,
      date: options.date,
      limit: options.limit,
      yearGroup: learner.yearGroup,
      abilityBand: learner.abilityBand,
    }),
    // Current producer-authored notes accompany identities already selected by
    // live evidence. Local calendar files never determine membership or notes.
    childNotes(options),
  ]);

  return {
    members: live.members.map((m) => fromResolved(m, notes)),
    absences: live.absences.map((m) => fromResolved(m, notes)),
    source: "live",
  };
}

/**
 * Read the entire current producer note pool, independent of the board's cap
 * and habitat ranking. An observed or historical member can inherit a note
 * even when its curated counterpart fell outside the visible seasonal tier.
 * No matching current producer note means no child line: the local calendar
 * cannot fill that gap by asserting an unverified season or event.
 */
async function childNotes(options: CastReadOptions): Promise<NoteIndex> {
  try {
    const data = await fetchFieldTruth({
      lat: options.lat ?? undefined, lng: options.lng ?? undefined,
      observationTaxa: pointmoonObservationTaxa(options.primaryTopic),
    });
    const entries = await curatedEntries(data, options.date ?? new Date());
    return buildNoteIndex(
      entries.filter(e => e.kind === "species").map(e => ({ id: e.id, name: e.species, scientificName: e.scientificName })),
      entries.map(e => ({ id: e.id, species: e.species, note: safeLookForNote(e) }))
    );
  } catch {
    return EMPTY_INDEX;
  }
}

/**
 * The index that finds a species' child-language note.
 *
 * Two keys, because the two sources name the same creature differently.
 * Pointmoon reports what an observer typed ("Monarch"); the phenology file
 * carries the fuller form ("Monarch Butterfly"). An exact-string match finds
 * neither from the other, which is why the first build of this shipped a card
 * whose every recorded face had no line at all — the exact species Johan was
 * looking at when he asked for the child's language.
 *
 * SCIENTIFIC NAME FIRST. It is the same string on both sides by construction
 * (`Danaus plexippus`), so it is an identity match rather than a guess, and it
 * is the only key that can never pair two different animals.
 *
 * The common-name key is the fallback, and it is deliberately timid. It strips
 * ONE trailing taxon word so "Monarch Butterfly" and "Monarch" meet in the
 * middle — and REFUSES the match when stripping empties the name, so a bare
 * "Bee" never inherits the note written for "Honey Bee". A wrong note on a
 * face is an invented nature fact in the child's own language, which is worse
 * than no line, and no line is a perfectly good face.
 */
interface NoteIndex {
  byScientific: Map<string, string>;
  byCommon: Map<string, string>;
}

/**
 * TWO SOURCES, ONE PER KEY, AND THAT IS THE POINT (#1020).
 *
 * The scientific key is built from `usuallyAround`, which is now the SPECIES
 * rows only. That is what stops an event's note travelling on a species'
 * identity: "Swallow Gathering" used to write `hirundo rustica →
 * "Swallows massing on wires before migration"`, so a barn swallow somebody
 * actually photographed on the school field could take that line onto its
 * face. It is a note about a season, worn by a specimen.
 *
 * The common-name key is built from `lookFors`, which is EVERY row. An event's
 * note still finds the event's own face — "Dawn Chorus" keeps its line — and
 * an event's name matches nothing but itself.
 */
function buildNoteIndex(
  usuallyAround: ReadonlyArray<{ id: string; name: string; scientificName?: string }>,
  lookFors: ReadonlyArray<{ id: string; species: string; note: string }>
): NoteIndex {
  const noteById = new Map(lookFors.map((lf) => [lf.id, lf.note]));
  const byScientific = new Map<string, string>();
  const byCommon = new Map<string, string>();

  for (const entry of usuallyAround) {
    const note = noteById.get(entry.id);
    if (!note) continue;
    const scientific = entry.scientificName?.trim().toLowerCase();
    if (scientific && !byScientific.has(scientific)) byScientific.set(scientific, note);
  }

  for (const lookFor of lookFors) {
    if (!lookFor.note) continue;
    const common = commonNameKey(lookFor.species);
    // An empty key means the name was a bare kind. Not indexed, so nothing
    // can match it. First row to claim a name keeps it, as it always did.
    if (common && !byCommon.has(common)) byCommon.set(common, lookFor.note);
  }

  return { byScientific, byCommon };
}

/** The note for a species, or undefined. Scientific identity, then the timid
 * common-name fallback. */
function noteFor(
  index: NoteIndex,
  commonName: string,
  scientificName?: string | null
): string | undefined {
  const scientific = scientificName?.trim().toLowerCase();
  if (scientific) {
    const hit = index.byScientific.get(scientific);
    if (hit) return hit;
  }
  const common = commonNameKey(commonName);
  return common ? index.byCommon.get(common) : undefined;
}

const EMPTY_INDEX: NoteIndex = { byScientific: new Map(), byCommon: new Map() };

/**
 * A stored row as a renderable member. The row carries the evidence; the line
 * is ours to compose and was never A's to store — a sentence in the child's
 * language does not belong in a database column, and composing it here means
 * a copy change is a deploy, not a re-resolution of every class's cast.
 */
function fromResolved(member: ResolvedCastMember, notes: NoteIndex): CastMember {
  return {
    ...member,
    line: childLine(member, noteFor(notes, member.commonName, member.scientificName)),
  };
}

/* -------------------------------------------------------------------- lines */

/* ------------------------------------------------------------ re-exports */

/**
 * The pure half lives in ./member so a client component can import it without
 * dragging this file's database and filesystem reads into the browser. Every
 * existing import of `@/lib/cast/read` keeps working through here.
 */
export {
  calmLine,
  childLine,
  castMaterial,
  castSlug,
  displayPhotoGallery,
  findBySlug,
  honestySentence,
  observedLine,
  relativeDayPhrase,
  speciesHref,
  tierLabel,
} from "./member";
export type { CastMaterial, CastMember, ClassCast, HonestyTier } from "./member";
