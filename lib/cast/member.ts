/**
 * The cast's shape, and the four pure functions that make it honest.
 *
 * Split out of lib/cast/read.ts because read.ts is SERVER-ONLY: it reaches the
 * database and, through lib/outside, the phenology reader, which imports
 * node:path. The in-lesson speak-and-show is a client component and needs
 * `castMaterial` and `castSlug` to render a portrait, so importing them from
 * read.ts pulled a Node builtin into the browser bundle and failed the build.
 *
 * The split is not just a build fix, it is the right seam: NOTHING here
 * touches IO. These are the rules about what a cast member means — which
 * material its portrait is rendered in, what its tier may be called, what its
 * evidence entitles us to say, and what its stable link is — and they must be
 * identical on the server that prints the sheet and the client that swipes
 * through the lesson. One definition, both sides of the wire.
 *
 * read.ts re-exports all of this, so every existing import path still works.
 */

import type { TopicTag } from "@/schema/pack";
import { slotPlace } from "@/lib/outside/pointmoon-contract";
import type {
  PointmoonPhenophase,
  PointmoonPhenophaseEvidence,
  PointmoonPhotoAsset,
  PointmoonSpeciesRecency,
} from "@/lib/outside/pointmoon-contract";

/**
 * How a member earned its place, and therefore what may be claimed of it.
 * Field-for-field the string workstream A stores on `CastMember.honestyTier`.
 *
 *   "recorded" — actually observed near here in the recent window.
 *   "regional" — in season for this region per the phenology, not observed.
 *
 * Never upgraded from regional to recorded. The tiers are the whole point.
 */
export type HonestyTier = "recorded" | "regional";
export type PhotoRole = "observation" | "taxon-reference";

/**
 * The licence a photograph arrived with, recorded rather than judged.
 *
 * Was `"cc0" | "cc-by"`, which was the whole reason a teacher saw no photos.
 * iNaturalist's commonest licence is `cc-by-nc` and this rejected it, along
 * with `cc-by-sa` and `cc-by-nd`, silently — a `null` return that renders as
 * "nothing photographed near this school" rather than as the gate it was.
 *
 * Johan, 2026-08-17: "if pointmoon is passing those photos dont add stupid
 * gates... keep attribution but accept any photos we can get."
 *
 * Credit and source are still required. They are what make a photograph
 * publishable, they already travel with every asset, and they cost one line
 * under the image.
 */
export type OpenPhotoLicense = string;

/**
 * One member of a class's cast.
 *
 * This mirrors workstream A's `CastMember` row (prisma) and its
 * `ResolvedCastMember` (lib/cast/resolve) field for field, so the seam swap
 * below is an assignment and not a translation. Everything past the name is
 * optional, because everything past the name is evidence we may not have.
 */
export interface CastMember {
  commonName: string;
  scientificName: string | null;
  /** Candidate image URL. A legacy bare URL is never enough to render. */
  photoUrl: string | null;
  /** Named creator when the source provides one separately from attribution. */
  photoCreator?: string | null;
  /** What the image proves. Observation may support locality; a taxon
   * reference supports identification only. */
  photoRole?: PhotoRole | null;
  /** Visible creator/credit string supplied by the image source. */
  photoAttribution?: string | null;
  /** Only the two licences accepted by Pointmoon's open surface. */
  photoLicense?: OpenPhotoLicense | null;
  /** Public source page for the image and its rights statement. */
  photoSourceUrl?: string | null;
  /** Exact iNaturalist observation joined to this image, when role=observation. */
  photoObservationId?: string | null;
  /**
   * Every picture Pointmoon holds of this species, best claim first, of which
   * the seven flat fields above are element zero (#984, pointmoon#153).
   *
   * A SPECIES DOOR WANTS THREE SPECIMENS and could only ever be given one,
   * because there was nowhere on this shape to put a second (#233). There is
   * now, and the ONE thing it must not become is evidence: `role` still says
   * which pictures were taken near here and which are of the species anywhere,
   * `castMaterial` still carries the tier, and eight photographs of a regional
   * member say exactly what one said.
   *
   * Absent, never empty. Most members have no gallery — every regional and
   * historical member carries a single reference photograph — and those
   * surfaces must render precisely as they do today.
   */
  photos?: PointmoonPhotoAsset[];
  /** iNaturalist iconic taxon (Insecta, Aves, Plantae...), when reported. */
  iconicTaxon: string | null;
  honestyTier: HonestyTier;
  /** The recent observation window the read covered, in days, when reported. */
  lastSeenWindow: number | null;
  /** Distinct years this species has been recorded near here. */
  yearsObserved: number | null;
  /** Its own historical average count for this place and window. */
  historicalAvgCount: number | null;
  /** Look-don't-touch phrasing for anything that stings, bites or poisons.
   * Null for the ordinary majority. Present means the surfaces MUST show it. */
  safetyNote: string | null;
  /** Position in the cast, 0 first. Findability order, not importance. */
  sortRank: number;
  /** True for a striking absence: a strong multi-year record here that this
   * read did not return. Never produced by the composed path. */
  absent: boolean;
  /** One calm line for the face. Ours, composed from the evidence. */
  line: string;
  /**
   * The observed leg of phenology (#959), as the tokens Pointmoon sent:
   * per-species freshness, and dated flowering / fruiting / leaf annotations
   * each carrying their own coarse place (#967). Present only on a recorded
   * member the direct sample saw. The sentence is ours — see `observedLine` —
   * and it is a SECOND line under the face, never a replacement for the
   * curated one.
   *
   * `recency` is carried for its counts and its instant. Its `placeHint`
   * describes the freshest sampled record and belongs to no annotation, so
   * `observedLine` cannot see this field at all; a place on the observed line
   * comes from the annotated slot underneath it or not at all.
   */
  recency?: PointmoonSpeciesRecency;
  phenophase?: PointmoonPhenophase;
  /** The observed line, precomputed at resolve time; surfaces render this. */
  observed?: string | null;
}

export interface ClassCast {
  /** The cast to show and to print, in findability order. */
  members: CastMember[];
  /** Striking absences, carried separately. Never shown as findable. */
  absences: CastMember[];
  /**
   * Which path answered. There is only one now (#284): the cast is resolved
   * from the current Pointmoon payload at read time and is never stored. The
   * field survives so a surface or a test can name the path without guessing,
   * and so a future second path cannot appear unlabelled.
   */
  source: "live";
}


/* ---------------------------------------------------------------- materials */

/**
 * The honesty MATERIAL a member's portrait is rendered in.
 *
 * Four states, one component, every surface — and every one of them legible
 * in black and white and to colourblind eyes, because it is carried by the
 * image treatment rather than by a coloured chip:
 *
 *   "seen"     full-fidelity licensed image of a species recorded near here.
 *   "regional" a licensed reference image inset in a paper frame.
 *   "absent"   desaturated behind a hatched frame. Hoped for, not seen.
 *   "plate"    a drawn field-guide plate on paper. We have no photograph.
 *
 * Order matters: absence outranks a missing photo, because "we have not seen
 * this yet" is a truer thing to say about a species than "we have no picture
 * of it", and a hatched frame reads as hopeful where a plate reads as filed.
 */
export type CastMaterial = "seen" | "regional" | "absent" | "plate";

export interface DisplayPhotoAsset {
  url: string;
  role: PhotoRole;
  creator?: string;
  attribution: string;
  license: OpenPhotoLicense;
  sourceUrl: string;
}

type PhotoCandidate = Partial<
  Pick<
    CastMember,
    | "photoUrl"
    | "photoCreator"
    | "photoRole"
    | "photoAttribution"
    | "photoLicense"
    | "photoSourceUrl"
  >
> & {
  photo?: {
    url?: string | null;
    creator?: string | null;
    role?: PhotoRole | null;
    attribution?: string | null;
    license?: OpenPhotoLicense | null;
    sourceUrl?: string | null;
  } | null;
};

/** Return the releaseable photograph and its rights as one indivisible value. */
export function displayPhotoAsset(candidate: PhotoCandidate): DisplayPhotoAsset | null {
  const nested = candidate.photo;
  const url = nested?.url ?? candidate.photoUrl;
  const role = nested?.role ?? candidate.photoRole;
  const creator = nested?.creator ?? candidate.photoCreator;
  const attribution = nested?.attribution ?? candidate.photoAttribution;
  const license = nested?.license ?? candidate.photoLicense;
  const sourceUrl = nested?.sourceUrl ?? candidate.photoSourceUrl;

  // ONE CONDITION: a usable image address. Nothing else withholds a photograph.
  //
  // Johan, 2026-08-17: "all photos no gates! we need any photo we can get".
  // This function has thrown away more pictures than it has shown. It began
  // demanding six fields and two licences, which binned most of what
  // iNaturalist serves; then a byline, which binned anything credited to an
  // organisation rather than a person. Every one of those looked principled
  // and every one rendered as "nothing photographed near this school".
  //
  // Credit and licence are still CARRIED and still rendered wherever they
  // travelled. They are simply no longer a condition of showing the picture.
  // The legal exposure of publishing an uncredited image is real and is a
  // founder call that has been made; see #294.
  if (!url?.startsWith("https://")) return null;
  return {
    url,
    // An unrecognised role is recorded rather than rejected: it describes what
    // the picture IS, and a surface that cares can still read it.
    role: role === "observation" || role === "taxon-reference" ? role : "taxon-reference",
    ...(creator?.trim() ? { creator: creator.trim() } : {}),
    attribution: attribution?.trim() ?? "",
    // Recorded, never invented. A photograph that arrived without a stated
    // licence says so, so a surface can print "licence not stated" rather
    // than implying an openness nobody asserted.
    license: license?.trim() || "unstated",
    sourceUrl: sourceUrl?.startsWith("https://") ? sourceUrl : "",
  };
}

/**
 * Every releaseable picture of this member, best claim first.
 *
 * ONE GATE, SHARED. Each element goes through `displayPhotoAsset` above, so a
 * gallery can never show a picture the single portrait would have refused,
 * and the rights rules stay in one place rather than two that drift.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * It does not fabricate a gallery. A member with one photograph returns one
 * element, and a caller wanting "three specimens or nothing" tests the length
 * rather than being handed the same picture three times — which is precisely
 * what the species door was doing before #984, and what made one photograph
 * look like a rendering bug instead of the honest state it was.
 *
 * It does not reorder. Upstream's order is the claim: observation photographs
 * first, newest sighting first, then reference photographs. Sorting by role
 * here would silently promote a picture of the species over a picture of the
 * animal somebody actually saw this week.
 *
 * Element zero is the portrait. `displayPhotoAsset(member)` and
 * `displayPhotoGallery(member)[0]` are the same picture, so a surface showing
 * both a hero and a strip must skip the first or show it twice.
 */
export function displayPhotoGallery(
  member: Pick<
    CastMember,
    | "photos"
    | "photoUrl"
    | "photoCreator"
    | "photoRole"
    | "photoAttribution"
    | "photoLicense"
    | "photoSourceUrl"
  >
): DisplayPhotoAsset[] {
  const gallery: DisplayPhotoAsset[] = [];
  const seen = new Set<string>();

  // The flat fields lead, because they ARE element zero for every member
  // resolved before the gallery existed and for every regional member, which
  // has no gallery at all.
  const portrait = displayPhotoAsset(member);
  if (portrait) {
    gallery.push(portrait);
    seen.add(portrait.url);
  }

  for (const candidate of member.photos ?? []) {
    const asset = displayPhotoAsset({ photo: candidate });
    if (!asset || seen.has(asset.url)) continue;
    seen.add(asset.url);
    gallery.push(asset);
  }

  return gallery;
}

/**
 * The url of the picture to show, or null.
 *
 * THIS COMMENT USED TO SAY THE OPPOSITE, and in a rights-sensitive function
 * that is worse than no comment. It read: "a photograph is a releaseable
 * asset only when role, rights, credit and source travelled with it. This
 * deliberately rejects every legacy bare URL." That stopped being true at
 * #294 ("all photos no gates"), which left `displayPhotoAsset` with exactly
 * one condition — a usable https address — and nobody updated the line above
 * it. Anyone reading this file for the rights boundary was being told a gate
 * existed here that does not.
 *
 * Where the gate actually lives now: UPSTREAM, in Pointmoon, per surface.
 * `surface=open` receives cc0/cc-by only; a first-party consumer like this
 * one receives any stated licence with credit and source attached, and
 * `photoCreditText` prints whatever travelled (see pointmoon#33). Credit is
 * carried and rendered, it is simply no longer a condition of showing the
 * picture — a founder call, made deliberately, recorded in #294.
 */
export function displayPhotoUrl(
  member: Pick<
    CastMember,
    | "photoUrl"
    | "photoCreator"
    | "photoRole"
    | "photoAttribution"
    | "photoLicense"
    | "photoSourceUrl"
  >
): string | null {
  return displayPhotoAsset(member)?.url ?? null;
}

export function castMaterial(
  member: Pick<
    CastMember,
    | "absent"
    | "photoUrl"
    | "photoCreator"
    | "photoRole"
    | "photoAttribution"
    | "photoLicense"
    | "photoSourceUrl"
    | "honestyTier"
  >
): CastMaterial {
  if (member.absent) return "absent";
  if (!displayPhotoUrl(member)) return "plate";
  return member.honestyTier === "recorded" ? "seen" : "regional";
}

/** The tier, in words, on the image. Short enough for a 4/5 face. */
export function tierLabel(member: Pick<CastMember, "absent" | "honestyTier">): string {
  if (member.absent) return "not seen yet";
  return member.honestyTier === "recorded" ? "recorded nearby" : "around the region";
}

/**
 * The honesty sentence for the profile: how we know this is here.
 *
 * Composed strictly from the fields that are populated. A member with no
 * evidence past its tier gets the tier's own sentence and nothing invented to
 * pad it out.
 *
 * **It never names a school, and it cannot be asked to.** This was caught on
 * screen, not in code: the profile rendered "Photographed near your school
 * recently" on the signed-out demo, which has no school. That is the
 * possessive-claim rule broken on the one surface built to hold it, and it
 * happened because the sentence assumed a school rather than being told about
 * one (#172).
 *
 * The first fix took a `scope: "school" | "here"` argument so a caller could
 * say when a located class was behind the request. No branch was ever written
 * against it — the body did `void scope`, both scopes returned byte-identical
 * strings, and the exported type went on advertising a discrimination the
 * function did not make. A parameter that promises a choice it does not make
 * is how the possessive claim comes back: the next caller passes "school",
 * believes the sentence is now allowed to say it, and writes the surface copy
 * accordingly. So the argument is gone rather than implemented — the safe
 * wording is the only wording, structurally (#548).
 *
 * If a surface ever does need to name a located class's own ground, that is a
 * new sentence with its own evidence rule, not a flag on this one.
 */
export function honestySentence(member: CastMember): string {
  const parts: string[] = [];

  if (member.absent) {
    parts.push("Usually around here at this time of year, but there are no sightings nearby this week.");
    if (typeof member.yearsObserved === "number" && member.yearsObserved > 1) {
      parts.push(`Recorded near here in ${member.yearsObserved} different years.`);
    }
    parts.push("Maybe your class will be the ones who find it.");
    return parts.join(" ");
  }

  if (member.honestyTier === "recorded") {
    parts.push(
      typeof member.lastSeenWindow === "number" && member.lastSeenWindow > 0
        ? `Recorded nearby within the last ${member.lastSeenWindow} days.`
        : "Recorded nearby recently."
    );
  } else {
    // Johan, 2026-08-18, struck the second half of this: "Not recorded nearby,
    // so keep looking and see if today is the day." The tier chip says "around
    // the region" one line above, and saying the absence again in a longer
    // register is not more honest, it is just longer.
    parts.push("Around this region at this time of year.");
  }

  if (typeof member.yearsObserved === "number" && member.yearsObserved > 1) {
    parts.push(`Recorded near here in ${member.yearsObserved} different years.`);
  }
  if (typeof member.historicalAvgCount === "number" && member.historicalAvgCount > 0) {
    parts.push(`Usually about ${member.historicalAvgCount} are logged nearby in a window like this one.`);
  }

  return parts.join(" ");
}

/**
 * The profile's URL handle. Scientific name when we have one (stable across
 * a common-name change), the common name otherwise. Deterministic, so a
 * composed cast and a stored cast produce the same link for the same species
 * and a bookmarked profile survives the seam swap.
 */
export function castSlug(member: Pick<CastMember, "commonName" | "scientificName">): string {
  const raw = (member.scientificName ?? member.commonName) ?? "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The profile destination for one resolved member.
 *
 * A lesson may scope Pointmoon's producer read to its primary topic before the
 * member is selected. Carrying that closed-vocabulary topic on the link lets
 * the profile replay the same producer boundary; generic surfaces keep the
 * clean, bookmarkable path they have always used.
 */
export function speciesHref(
  member: Pick<CastMember, "commonName" | "scientificName">,
  topic: TopicTag | null = null,
  /**
   * The live lesson this face was tapped from (#874). Carried so the profile
   * can offer the way back into that run rather than out to Today. Surfaces
   * outside a run pass nothing and keep the bookmarkable path.
   */
  fromRun: string | null = null
): string {
  const path = `/species/${castSlug(member)}`;
  const query = new URLSearchParams();
  if (topic) query.set("topic", topic);
  if (fromRun) query.set("session", fromRun);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Find one member of a cast by its slug, absences included. */
export function findBySlug(cast: ClassCast, slug: string): CastMember | null {
  const all = [...cast.members, ...cast.absences];
  return all.find((m) => castSlug(m) === slug) ?? null;
}

/**
 * One calm sentence out of an authored phenology note.
 *
 * The note files are older than the register rules and carry exactly what #168
 * called out on the live card: em dashes in the middle of a line, exclamation
 * marks, and two or three clauses where a face has room for one. This is where
 * that is fixed for every surface at once rather than at each call site.
 *
 * It edits punctuation and length only. It never rewrites a fact, never adds
 * a word, and never touches a species name — the sentence that comes out is a
 * prefix of the sentence that went in.
 */
export function calmLine(note: string): string {
  const cleaned = unshout(note)
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/!+/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return "";

  // The first clause is the face's line. A comma-spliced list of three things
  // to notice belongs on the profile, not under a thumbnail.
  const firstSentence = cleaned.split(/(?<=\.)\s+/)[0] ?? cleaned;
  let line = firstSentence;
  if (line.length > 64) {
    const cut = line.slice(0, 64);
    const lastComma = cut.lastIndexOf(",");
    // A comma is the only cut this function can make honestly. Falling back to
    // the nearest word boundary severs the sentence mid-phrase, and the full
    // stop added below then presents the fragment as a finished thought: the
    // broad-bodied chaser "zooms over the pond like a tiny." — a simile with
    // its object amputated, printed under a thumbnail and read aloud to a
    // class. A whole first sentence a few characters over the cap is the
    // honest answer, so when there is no clause boundary the sentence stands.
    if (lastComma > 24) line = cut.slice(0, lastComma);
  }
  line = line.replace(/[\s,;:]+$/, "");
  // A note that OPENED with a shouted word now opens lowercase, so the
  // sentence gets its own capital back. Harmless on every other line, which
  // already started with one.
  line = line.charAt(0).toUpperCase() + line.slice(1);
  // A sentence that ends on a quoted call — `sings "conk-la-REE."` — is
  // already terminated; the closing quote is not the reason to add a second
  // full stop after it.
  return /[.?!]["'”’]?$/.test(line) ? line : `${line}.`;
}

/**
 * Take the shouting out of an authored note.
 *
 * DEFENCE AT THE SURFACE, not instead of the fix. The phenology data is dirty:
 * us-california.json alone carries 86 all-caps runs (#188), and Edison is
 * sweeping it in its own PR. This is the guard that means the two can land in
 * either order and a child-facing face never prints shouting in the meantime —
 * and that a note authored badly next year is calm anyway.
 *
 * THE RULE IS LOWERCASE, NOT DELETE, and that is the whole reason it is safe
 * to apply to everything. The data mixes two kinds of capitals that no regex
 * can tell apart:
 *
 *   emphasis      "TONIGHT is the best night", "the choir is SO loud"
 *   onomatopoeia  "listen for a loud RIBBIT RIBBIT"
 *
 * Lowercasing both gives "tonight is the best night", "so loud", and "a loud
 * ribbit ribbit". Every one of those is correct English and still says exactly
 * what it said. No word is dropped, no sound is mangled, and the sentence's
 * own first letter is restored afterwards by the caller's own capitalisation.
 * The alternative — an allowlist of animal noises living in a TypeScript file —
 * is content knowledge in the wrong place, and it would be wrong the first
 * time a region file names a bird we did not think of.
 *
 * Runs of two or more letters only, so a lone "I" or "A" is untouched.
 */
function unshout(note: string): string {
  return note.replace(/\b[A-Z]{2,}\b/g, (word) => word.toLowerCase());
}

/**
 * The calm boundary a child hears about a species that stings or bites.
 *
 * Not a warning, a rule of the game: "we watch from here" is something a
 * four-year-old can DO, where "careful, it stings" is a thing to be afraid of.
 * It replaces the ordinary child line rather than sitting beside it, because a
 * face has room for one line and this is the one that matters.
 */
/** Trailing words that name a KIND, not a creature. */
const TAXON_WORDS = new Set([
  "butterfly", "moth", "bee", "wasp", "hornet", "bird", "tree", "grass",
  "fern", "spider", "beetle", "fly", "bug", "worm", "snail", "slug", "frog",
  "toad", "newt", "shrub", "flower", "blossom", "berry", "mushroom",
]);

/**
 * A species name reduced to the key two sources can meet on.
 *
 * Pointmoon reports what an observer typed ("Monarch"); the phenology authored
 * "Monarch Butterfly". Stripping ONE trailing taxon word lets the two habits
 * meet. Stripping into nothing returns "", which matches nothing on purpose:
 * a bare "Bee" must never inherit the note or the depth written for "Honey
 * Bee". A wrong fact attached to the right picture is still a wrong fact.
 */
export function commonNameKey(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const last = words[words.length - 1] as string;
  return (TAXON_WORDS.has(last) ? words.slice(0, -1) : words).join(" ");
}

export const SAFETY_CHILD_LINE = "If you see one, we watch from here.";

/**
 * THE ONE LINE ON A FACE, in the child's language.
 *
 * Johan, on the deployed card: "would also give some info about the species in
 * the childs language". The face used to carry provenance — "seen here lately",
 * "34 logged nearby" — which is a sentence about our DATA, addressed to nobody.
 * A teacher cannot read it out, and a child has no use for it. Provenance is
 * carried by the image material and stated properly on the profile; the face
 * gets the thing a class can actually hear.
 *
 * The words are the phenology's own `childFriendlyNote`, already written for
 * children and already in the look-for data. Nothing here composes a fact: a
 * species with no note gets NO LINE, and the face shows a photograph and a
 * name, which is a complete face.
 *
 * A species carrying a safety note gets the boundary instead, whatever note it
 * had. That is the only case where this overrides the authored words.
 */
/* ----------------------------------------------------------- observed leg */

/**
 * The one positive phenophase slot a face may name, freshest first.
 *
 * Pointmoon keeps every annotation as independent evidence and writes no
 * sentence; this chooses the one record a child can act on today. Only a
 * DATED positive slot qualifies: the typed negative `noFlowersOrFruits` is
 * never spoken to a child ("not flowering" is not something to go and look
 * for), and an undated slot has no instant to be honest about. Among dated
 * slots the freshest wins; on a tie, the order below, which is also the
 * order a child notices things in.
 */
type ObservedSlot = "flowering" | "fruiting" | "flowerBudding" | "leaves";

const OBSERVED_SLOTS: readonly ObservedSlot[] = [
  "flowering",
  "fruiting",
  "flowerBudding",
  "leaves",
];

function observedPhase(
  phenophase: PointmoonPhenophase
): { slot: ObservedSlot; evidence: PointmoonPhenophaseEvidence; at: number } | null {
  let best: { slot: ObservedSlot; evidence: PointmoonPhenophaseEvidence; at: number } | null =
    null;
  for (const slot of OBSERVED_SLOTS) {
    const evidence = phenophase[slot];
    if (!evidence || typeof evidence.latestObservedAt !== "string") continue;
    // A negative leaf record is not a candidate at all, so a newer
    // "no live leaves" cannot hide an older, still-valid flowering record
    // (Codex review on PR #960, round four).
    if (slot === "leaves" && phenophase.leaves?.state === "no-live-leaves") continue;
    const at = Date.parse(evidence.latestObservedAt);
    if (!Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { slot, evidence, at };
  }
  return best;
}

/** The child's words for what the record said, or null for a leaf state we do not name. */
function phaseWords(slot: ObservedSlot, phenophase: PointmoonPhenophase): string | null {
  switch (slot) {
    case "flowering":
      return "In flower";
    case "fruiting":
      return "Fruiting";
    case "flowerBudding":
      return "In bud";
    case "leaves":
      switch (phenophase.leaves?.state) {
        case "breaking-buds":
          return "Leaf buds opening";
        case "green":
          return "Leaves out";
        case "coloured":
          return "Leaves turning";
        case "no-live-leaves":
          // A negative observation, the leaf twin of `noFlowersOrFruits`:
          // true, but not something a child can go and look for, so it is
          // not an observed line (Codex review on PR #960, round three).
          return null;
        default:
          return null;
      }
  }
}

/**
 * "today", "yesterday", "3 days ago", "last week", "3 weeks ago" — computed
 * HERE from the record's own instant and our own clock, which is the whole
 * division of labour: Pointmoon supplies the instant, Nature Class writes the
 * phrase. Counted in calendar days, not 24-hour spans, because "yesterday" to
 * a child is the day before this one, not 24 hours and one minute ago; UTC
 * days, since the server rendering this has no school clock and being an
 * hour out at midnight is a smaller lie than a phrase computed twice.
 * A record stamped after our clock (skew, a timezone-naive upload) reads as
 * today rather than as a negative number.
 */
export function relativeDayPhrase(instant: string, now: Date = new Date()): string | null {
  const at = Date.parse(instant);
  if (!Number.isFinite(at) || !Number.isFinite(now.getTime())) return null;
  const dayMs = 86_400_000;
  const days = Math.max(0, Math.floor(now.getTime() / dayMs) - Math.floor(at / dayMs));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

/**
 * THE OBSERVED LINE ON A FACE (#959): "In flower, seen 2 days ago".
 *
 * A second, smaller line under the curated one, and it appears ONLY when a
 * dated record exists. It never falls back to the seasonal calendar — that is
 * what `line` already is, and the two must stay visibly different things: the
 * calendar says what a typical year does, this says what somebody actually
 * saw and when. Absent tokens render nothing, which is the honest default of
 * silence.
 *
 * Every word traces to ONE record's tokens: the phase to one annotation slot,
 * the day phrase to that slot's own `latestObservedAt`, and the place to that
 * same slot's own `placeHint` (pointmoon#122, live since PR pointmoon#126).
 * One sighting, one sentence.
 *
 * `recency` is deliberately NOT in the parameter type. Its `placeHint` is the
 * freshest SAMPLED record's place, which is a different sighting from the
 * freshest ANNOTATED one, and printing it here would be inventing where a
 * flower was seen — the exact defect pointmoon#122 exists to prevent. The
 * ticket asked for that to be structurally hard to get wrong rather than
 * merely right today (#967), so this function cannot reach `recency` at all,
 * and `slotPlace()` — the only route to a printable place — takes an
 * annotated slot, which a recency object is not (it has no `license`).
 *
 * A member carrying a safety note keeps its one line; the boundary is the
 * line that matters on that face, and this one is not added beside it.
 */
export function observedLine(
  member: Pick<CastMember, "phenophase" | "safetyNote" | "absent">,
  now: Date = new Date()
): string | null {
  if (member.absent || member.safetyNote) return null;
  const phenophase = member.phenophase;
  if (!phenophase) return null;
  const chosen = observedPhase(phenophase);
  if (!chosen) return null;
  const words = phaseWords(chosen.slot, phenophase);
  const when = chosen.evidence.latestObservedAt
    ? relativeDayPhrase(chosen.evidence.latestObservedAt, now)
    : null;
  if (!words || !when) return null;

  // The chosen slot's OWN place, or nothing. `slotPlace` yields a string only
  // under `placeHintStatus: "coarse"`; "withheld-obscured", "unavailable", a
  // status this consumer does not know, and a payload from before
  // pointmoon#126 all render as silence — which is the same line #959
  // shipped, so nothing regresses when the producer has no place to give.
  //
  // Verbatim, never trimmed: the hint is the producer's own coarse wording,
  // and choosing which comma-separated part of it to keep would be this
  // surface guessing at a place rather than quoting one.
  const place = slotPlace(chosen.evidence);
  return place ? `${words}, seen ${when} near ${place}` : `${words}, seen ${when}`;
}

export function childLine(member: {
  safetyNote: string | null;
  absent: boolean;
}, note?: string | null): string {
  if (member.safetyNote) return SAFETY_CHILD_LINE;
  if (member.absent) return "Nobody has found one yet. Maybe you will be first.";
  const authored = typeof note === "string" ? calmLine(note) : "";
  return authored;
}
