/**
 * THE DOOR — what introduce-today shows, and what it is allowed to claim
 * (#324).
 *
 * Johan, reading a lesson about trees: *"An Apple is usually around now. Let us
 * look for one."* Sophia's diagnosis, and it is one sentence: the door slot was
 * being fed a cast line, and a cast line's job is to describe a creature
 * honestly, not to open a lesson. Those are different jobs, and the moment a
 * regional member ranked first the honest description became a bad opening.
 *
 * So the slot gets its own selection rule, its own evidence, and its own
 * sentence — which is this file, and none of it is a cast line.
 *
 * ── ONE BAR, AND IT IS THE ONE ALREADY SHIPPED ─────────────────────────────
 *
 * A member may be spoken of as being near this school when the class is
 * LOCATED, the member is RECORDED, and it is not an absence. That is exactly
 * the gate `HybridJourney` already applied to the old door line, and it is
 * reused rather than restated. Sophia's sheet proposed a second, tighter bar
 * (within 500 m, inside 30 days) and it was ruled out on purpose: two
 * vocabularies for the same idea is how this repo ended up with two conditions
 * vocabularies, and neither number is measured.
 *
 * ── THREE STATES, KEYED ON THAT BAR AND ON WHETHER A PICTURE EXISTS ────────
 *
 *   photographed  the bar is cleared AND a releaseable photograph travelled.
 *                 The strong state: pictures a child can hold up next to a
 *                 trunk, under the claim that they were seen near here.
 *   named         the region's claim rather than the school's, with the gap
 *                 said out loud. It shows PHOTOGRAPHS when the members carry
 *                 them and drawn marks when they do not — the two states
 *                 differ in what may be CLAIMED, not in whether a picture is
 *                 allowed, and conflating those is what made a swift with a
 *                 perfectly good photograph render as a drawing (#341).
 *   none          nothing clears. No strip, no plates standing in, no reserved
 *                 space. The question moves up and is the page.
 *
 * A PHOTOGRAPH AND A DRAWING NEVER SHARE THE ROW. At this size the page's job
 * is matching a picture to a trunk, and a drawn mark beside a photograph reads
 * as a photograph that failed to load rather than as the honest drawing it is.
 * So the row is all photographs or all marks, and which one it is decides the
 * heading above it.
 *
 * ── AND THE HEADINGS ARE THE TWO THAT ALREADY EXIST ────────────────────────
 *
 * `SEEN_CAPTION` and `USUALLY_AROUND_CAPTION` are the shipped, reviewed words
 * for exactly these two claims, and they live together in one file precisely
 * so they cannot drift. A third phrasing invented here would be a third claim
 * nobody had reviewed.
 *
 * Pure and client-safe: cast members in, a discriminated union out. No fetch,
 * no server-only import, so the runner can render it without a round trip.
 */

import { displayPhotoAsset, type CastMember, type DisplayPhotoAsset } from "@/lib/cast/member";
import {
  REGIONAL_GAP_CAPTION,
  SEEN_CAPTION,
  usuallyAroundCaption,
  type OutsideScope,
} from "@/lib/outside/captions";
import { hasTaxa, matchesTopic } from "@/lib/outside/observations";
import { asDoorQuestion } from "@/lib/lesson/pictures";
import type { DoorQuestion, TopicTag } from "@/schema/pack";

/** One thing standing outside, with its picture when it has one. */
export interface DoorSpecimen {
  member: CastMember;
  /** The photograph, or null when this is a drawn mark. */
  asset: DisplayPhotoAsset | null;
}

export type DoorEvidence =
  | { kind: "photographed"; heading: string; specimens: DoorSpecimen[] }
  | { kind: "named"; heading: string; gap: string; specimens: DoorSpecimen[] }
  | { kind: "none" };

/**
 * How many the strip holds. TWO, and the number is measured rather than
 * chosen.
 *
 * Sophia asked Johan directly: two photographs or three? *"Three fills the
 * width and reads as a set; two are bigger and read as specimens. I drew
 * three and I am genuinely unsure."* Her own sheet also sets the floor: below
 * about 120px a picture stops being something a child can hold up beside a
 * trunk and becomes decoration, which is what a 40px circle has always been.
 *
 * Measured on the built page at 375px, which is the phone a teacher is holding
 * at the classroom door: the runner's content column is 327px after its
 * `--edge`, and three columns with 16px gaps give each specimen 98px. That is
 * under the floor. Two give 155px, which clears it.
 *
 * THAT MEASUREMENT STILL HOLDS AND THE ANSWER IS NOW THREE (#350), because the
 * floor moved into the stylesheet, which is the only layer that knows the
 * viewport. Johan asked for a spread of kinds — "bird tree, insect" — and two
 * slots cannot hold three kinds. So the DATA carries three and
 * `.slotRow[data-count="3"]` lays them two-across below 480px, where the third
 * wraps under at its full 155px rather than every specimen shrinking to 98px,
 * and three-across above it, where each one is over 200px.
 *
 * SIZE STILL BEATS COUNT, and it never pads: one thing that cleared the bar is
 * shown large rather than joined by a mark standing in for a set we do not
 * have.
 */
const GLANCE_SPECIMENS = 3;

/**
 * AND THE CAP WAS SOLVING A PROBLEM THE LAYOUT HAD ALREADY SOLVED (#1079).
 *
 * Everything above is still true and none of it is a case for a fixed number.
 * The measurement is about cards SHRINKING: three across a 375px phone gives
 * each 98px, under the floor. Wrapping shrinks nothing — it adds rows, and
 * `.slotRow` on the board is `repeat(auto-fill, minmax(14rem, 1fr))`, which
 * holds every card above the floor however many arrive.
 *
 * So the number is not one number. It follows what the moment is asking a
 * child to do, which is exactly the distinction #1078 gave the runner a word
 * for:
 *
 *   glance   "here is what you might meet", read at a distance by a room.
 *            Three, unchanged, and it must fit without scrolling — anything
 *            below the fold on a projector is content the class cannot see
 *            and only the teacher can reach.
 *   choose   "walk up and tap one". Eight: two rows of four on a board, still
 *            one screen, and enough that the choice is a real one.
 *
 * BOTH ARE LAYOUT BOUNDS, NOT RELEVANCE CAPS. What is relevant is bounded
 * upstream by `CAST_LAYOUT_MAX` and by the topic filter; this only says how
 * many of them fit the container. That distinction is the whole of ADR-005,
 * and one constant serving as both is what blurred it.
 */
const CHOOSE_SPECIMENS = 8;

/**
 * A SPREAD OF KINDS, NOT THE TOP OF A RANKED LIST (#350).
 *
 * Johan: *"having a couple of samples eg bird tree, insect or somehting"*.
 *
 * Findability is the right ORDER and the wrong FILTER. Taking its top two
 * hands a class two birds on a day when two birds happened to rank, and a
 * lesson called Counting life then opens on a picture of life that is all one
 * thing. A bird, a plant and an insect is not decoration; it is the answer to
 * the question the page is asking.
 *
 * So the first of each unseen kind is taken, in findability order, and only
 * once every kind on the list has been offered does a second of any kind get a
 * place. This REORDERS and never invents: a list of nothing but birds still
 * yields birds, no creature is dropped to make the set look balanced, and the
 * order within a kind is untouched.
 *
 * A member with no `iconicTaxon` counts as its own kind rather than sharing a
 * null bucket, so one unclassified creature never crowds out another.
 */
function spreadByKind<T extends { member: CastMember }>(rows: readonly T[], limit: number): T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const kind = row.member.iconicTaxon?.trim() || `unclassified:${row.member.sortRank}`;
    if (seen.has(kind)) rest.push(row);
    else {
      seen.add(kind);
      first.push(row);
    }
  }
  return [...first, ...rest].slice(0, limit);
}

/** Cleared the bar: a located class, a recorded member, not an absence. */
export function standsOutside(member: CastMember, located: boolean): boolean {
  return located && member.honestyTier === "recorded" && !member.absent;
}

/**
 * Which tag this lesson's door should stand on (#339).
 *
 * Authored where a session carries two tags and only the author knows which
 * one the lesson is about; DERIVED where it carries one, because one tag is
 * unambiguously the primary and nobody should have to type it twice.
 *
 * Null where a session carries several tags and has authored none, and null
 * means today's behaviour: no filtering at all. Nothing regresses while the
 * packs fill in.
 */
export function primaryTopicOf(session: {
  primaryTopic?: TopicTag | undefined;
  topicTags?: readonly TopicTag[] | undefined;
}): TopicTag | null {
  if (session.primaryTopic) return session.primaryTopic;
  const tags = session.topicTags ?? [];
  return tags.length === 1 ? tags[0] ?? null : null;
}

/**
 * A LESSON ABOUT TREES SHOWS TREES (#339).
 *
 * Johan's surviving complaint, in one function. `matchesTopic` is membership
 * over ALL of a session's tags, so a trees lesson tagged
 * `["minibeasts", "trees"]` scored a bumble bee exactly as highly as an oak
 * and the findability order decided the rest. It is left exactly as it is for
 * every other caller; the door narrows it to ONE tag instead.
 *
 * FEWER AND RIGHT BEATS TWO AND WRONG. This filters rather than ranks, so a
 * school with no tree recorded nearby gets a shorter door or none, and the
 * page says so, which is the same rule that killed the apple line.
 *
 * Two things it deliberately does not do. It does not fire for a topic
 * taxonomy cannot express — seasons, senses, weather, art, roughly forty per
 * cent of sessions — because "does this creature match `art`?" has no
 * meaningful answer and filtering on it would empty the row for no reason.
 * And it does not fire when no primary topic is known, which is today's
 * behaviour exactly.
 *
 * A member with no `iconicTaxon` fails the filter, and that is right rather
 * than harsh: the regional tier carries a taxon for every real species now
 * (#321, via the taxon reference), so the ones without are the phenology rows
 * that are not species at all — "Autumn Colour", "Dawn Chorus", "First
 * Frost". None of them is a thing standing outside the gate.
 *
 * THAT SENTENCE USED TO BE THE WHOLE RULE, AND IT WAS AN INFERENCE (#1020).
 * It read the absence of a taxon as proof that a row was not a species, which
 * held only until a row named an EVENT and carried a taxon anyway: "Swallow
 * Gathering", `Hirundo rustica`, resolving to Aves and to a photograph of one
 * barn swallow, clearing this filter for `birds` and for `animals` because
 * taxonomically it genuinely is on topic. Nothing here could have caught it —
 * by the time a member reaches this function the mislabelling is already
 * baked into its taxon. The row now says what it is (`PhenologyEntry.kind`),
 * and `resolvePhenologyReference` gives an event no taxon at all, so what
 * arrives here is again exactly what this paragraph describes.
 */
function servesTopic(member: CastMember, topic: TopicTag | null): boolean {
  if (topic === null || !hasTaxa(topic)) return true;
  return matchesTopic(member.iconicTaxon ?? undefined, [topic], member.scientificName);
}

/**
 * The kind of creature a drawn mark stands for, in a child's word.
 *
 * `FieldGuidePlate` already chooses its mark by ICONIC TAXON rather than by
 * species, which is what keeps it honest: it does not claim to show you this
 * coot, it shows you that this is a bird. What it has never done is SAY so, so
 * on a page whose whole job is "go and find this outside", two birds rendering
 * as the same bird reads as a portrait that is wrong rather than as a category
 * mark that is right (#321).
 *
 * These words make it visible. Where the taxon is absent — the regional tier
 * carries none — there is no word, and the plate keeps its own "drawn, not
 * photographed" without claiming a kingdom nobody reported.
 */
const KIND_WORDS: Record<string, string> = {
  Aves: "bird",
  Insecta: "insect",
  Arachnida: "spider",
  Plantae: "plant",
  Fungi: "fungus",
  Mammalia: "mammal",
  Amphibia: "amphibian",
  Reptilia: "reptile",
  Mollusca: "mollusc",
  Actinopterygii: "fish",
};

/**
 * "bird", "insect", "plant" — the kind, in a child's word, or null.
 *
 * Exported because the door's drafter needs the same word the caption uses
 * (#342). A creature the model is told is a bird writes a different sentence
 * from one it has to guess about, and a second table of kind words would be a
 * second answer to "what is this?" in a repo that has already paid for having
 * two of those.
 */
export function kindWordOf(member: CastMember): string | null {
  const word = member.iconicTaxon ? KIND_WORDS[member.iconicTaxon.trim()] : undefined;
  return word ?? null;
}

/** "a drawn bird, not a photograph", or the plain form when we do not know. */
export function markCaption(member: CastMember): string {
  const word = kindWordOf(member);
  return word ? `a drawn ${word}, not a photograph` : "drawn, not photographed";
}

/**
 * Why there is no photograph, in one line that names the actual rule.
 *
 * Two different gaps, never blended, because they are two different facts. A
 * teacher who is told which one she is holding does not think the app is
 * broken; a teacher given a hedge covering both learns that it always says
 * something and stops reading it.
 */
function gapLine(
  specimens: DoorSpecimen[],
  located: boolean,
  scope: OutsideScope
): string {
  // Only the drawn row is a MISSING PHOTOGRAPH. A regional row that found its
  // pictures still needs its provenance said out loud — the picture is a
  // reference for the species, not a sighting on these grounds — so that line
  // stays and the "we are showing the drawn marks" line is kept for the rows
  // that actually are drawn marks.
  const drawn = specimens.every((s) => s.asset === null);
  const anyRecorded = specimens.some((s) => standsOutside(s.member, located));
  return drawn && anyRecorded
    ? "No photograph of these came back with its credit attached, so we are showing the drawn marks."
    : REGIONAL_GAP_CAPTION[scope];
}

export function resolveDoor({
  members,
  located,
  placeName = null,
  scope = "school",
  topic = null,
  purpose = "glance",
}: {
  members: readonly CastMember[];
  /** True only when the class carries real coordinates. */
  located: boolean;
  /**
   * What the geocoder called this point, e.g. "Canonbury" (#350). It names the
   * zoom on the regional caption and does nothing else: it changes no claim
   * and gates no member, so a missing or wrong name costs a word, never a
   * fact.
   */
  placeName?: string | null;
  /** Whose patch this is. "sample" is the signed-out demo and says so. */
  scope?: OutsideScope;
  /** What this lesson is about, from `primaryTopicOf`. Null filters nothing. */
  topic?: TopicTag | null;
  /**
   * What this moment is asking a child to do (#1079). A glance is read; a
   * choice is touched, and takes more. Both bound the CONTAINER, never
   * relevance — see the constants above.
   */
  purpose?: "glance" | "choose";
}): DoorEvidence {
  const want = purpose === "choose" ? CHOOSE_SPECIMENS : GLANCE_SPECIMENS;
  // For a taxon-mapped lesson, off-topic life is not lesson context. If no
  // matching evidence survived, the complete answer is no strip and no model
  // sentence. Topics taxonomy cannot express keep the existing broad cast.
  const onTopic = members.filter((member) => servesTopic(member, topic));
  const serving = topic !== null && hasTaxa(topic) ? onTopic : members;

  // The strong state first: what cleared the bar AND has a picture.
  const allPhotographed: DoorSpecimen[] = [];
  for (const member of serving) {
    if (!standsOutside(member, located)) continue;
    const asset = displayPhotoAsset(member);
    if (asset) allPhotographed.push({ member, asset });
  }
  // The spread happens BEFORE the cap, or capping at three would throw away
  // the only plant on the list to keep a third bird.
  const photographed = spreadByKind(allPhotographed, want);
  if (photographed.length > 0) {
    /*
     * ONE ROW, RECORDED FIRST, FILLED FROM THE REGION (#1012; Johan,
     * 2026-09-06: "right now it only picks 1 thing... needs to be more so
     * children can interact"). This branch used to return the moment one
     * photographed, recorded member cleared the bar, so a school with one
     * moth on record got one card while the cast held seven honest regional
     * minibeasts behind it. The row now fills to its cap from the regional
     * members that carry a photograph, and the claim travels on each card
     * rather than on a row heading: `tierLabel` says "recorded nearby" or
     * "around the region" beside every credit, so nothing regional is ever
     * read as a sighting. What is relaxed is #324's all-recorded-or-all-
     * regional row; what is kept is that a regional member never wears the
     * school's claim.
     */
    const taken = new Set(photographed.map(({ member }) => member));
    const regionalPictured: DoorSpecimen[] = [];
    for (const member of serving) {
      if (member.absent || taken.has(member)) continue;
      const asset = displayPhotoAsset(member);
      if (asset) regionalPictured.push({ member, asset });
    }
    const filled = [
      ...photographed,
      ...spreadByKind(regionalPictured, want - photographed.length),
    ];
    return { kind: "photographed", heading: SEEN_CAPTION[scope], specimens: filled };
  }

  // Otherwise, whatever there is to name. An absence is never named here: it
  // is the one thing a picture cannot illustrate, and this page is a picture.
  //
  // ── AND IT SHOWS THE PICTURE WHEN THERE IS ONE (Johan, #341) ─────────────
  //
  // Johan, reading the running app: "Comon swift mild majoram etc can we have
  // photos for them". Both had one. This branch used to hardcode `asset: null`
  // on every member, so a regional species arrived here carrying a releasable
  // photograph and rendered as a drawn mark anyway — the picture was fetched,
  // paid for with an API call, carried through the resolver, and thrown away
  // on the last line before the screen.
  //
  // The three states were keyed on ONE question ("did the bar clear?") and
  // silently answered a second one ("is there a picture?") with no. Those are
  // orthogonal: `castMaterial` has always had a state for exactly this member
  // — "regional: a licensed reference image inset in a paper frame" — and the
  // door was the one surface that could not reach it.
  //
  // NOTHING HERE UPGRADES A CLAIM, which is the whole reason it is safe. The
  // heading stays `USUALLY_AROUND_CAPTION`, the tier stays regional, the
  // asset's `taxon-reference` role still says "this is what the species looks
  // like" rather than "someone photographed this one here", and the gap line
  // still says whose ground it is. Only the picture is no longer discarded.
  //
  // THE ROW IS STILL ALL PHOTOGRAPHS OR ALL MARKS. A mark beside a photograph
  // reads as a photograph that failed to load, so the members that have
  // pictures are preferred as a group, and the row falls to marks only when
  // nothing in it has one.
  const showable = serving.filter((member) => !member.absent);

  const allPictured: DoorSpecimen[] = [];
  for (const member of showable) {
    const asset = displayPhotoAsset(member);
    if (asset) allPictured.push({ member, asset });
  }
  const pictured = spreadByKind(allPictured, want);

  const named: DoorSpecimen[] =
    pictured.length > 0
      ? pictured
      : spreadByKind(
          showable.map((member) => ({ member, asset: null })),
          want
        );

  if (named.length === 0) return { kind: "none" };

  return {
    kind: "named",
    heading: usuallyAroundCaption(placeName),
    gap: gapLine(named, located, scope),
    specimens: named,
  };
}

/**
 * The question to ask at the door, or null.
 *
 * Authored with the lesson (`doorQuestion`), falling back to the lesson's own
 * driving question ONLY when that is already a question. Nine of the
 * fifty-six shipped sessions carry a statement in `prompt` ("Minibeast
 * hunting.", "Create art with nature."), and reading one of those out as a
 * door question is a smaller version of the sentence this ticket is about.
 *
 * The test is deliberately crude and deliberately not a rewrite: a question
 * mark, put there by the author. An app that turns a statement into a question
 * is an app editing teaching content, which is the same move as editing a
 * species name. No question is not a gap to fill with a generated one; the
 * page is simply shorter, and the nine are a content job.
 *
 * NOT `LessonJourney.question`, which falls back to the objective when the
 * prompt is blank. An objective is never a question and would arrive here
 * wearing one.
 */
export function doorQuestion(session: {
  doorQuestion?: string | undefined;
  prompt?: string | undefined;
}): string | null {
  const authored = session.doorQuestion?.trim();
  if (authored) return authored;
  const prompt = session.prompt?.trim();
  return prompt?.endsWith("?") ? prompt : null;
}

/**
 * THE QUESTIONS THE INTRODUCTION ASKS, IN ORDER (#1004).
 *
 * Johan: one or two questions the class answers out loud, before going
 * outside. The walk holds 1..n; the packs author one today (`doorQuestion`,
 * or a `prompt` that is already a question); `doorQuestions` is the authored
 * ordered list when a lesson asks more than one (the minibeast hunt asks two),
 * and it leads with the door question so the two fields never disagree about
 * what is asked first. The board, the walk and the resume clamp all read this
 * list and nowhere else.
 *
 * RETURNS THE OBJECT FORM, ALWAYS (#1078). A question may now carry the
 * pictures that belong beside it, so the walk reads `entry.question` where it
 * used to read the string. A bare authored string is normalised here rather
 * than at each call site: there is one shape downstream, and a pack that has
 * never heard of pictures parses and behaves exactly as it did.
 */
export function doorQuestions(session: {
  doorQuestion?: string | undefined;
  doorQuestions?: readonly (string | DoorQuestion)[] | undefined;
  prompt?: string | undefined;
}): DoorQuestion[] {
  const authored = (session.doorQuestions ?? [])
    .map(asDoorQuestion)
    .map((entry) => ({ ...entry, question: entry.question.trim() }))
    .filter((entry) => entry.question.length > 0);
  if (authored.length > 0) return authored;
  const first = doorQuestion(session);
  return first ? [{ question: first }] : [];
}
