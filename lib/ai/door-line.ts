import { isModelAvailable } from "./model";
import { draft, stringField } from "./draft";
import { loadPrompt } from "./prompt-registry";
import {
  nameStemSource,
  nameToPattern,
  namedOutsideSet,
  normaliseName,
} from "./species-names";
import { kindWordOf, type DoorEvidence } from "@/lib/lesson/door";
import { localizeText, type Locale } from "@/lib/localization";

/**
 * THE JOINING SENTENCE AT THE DOOR (#342), written by the model over creatures
 * it cannot add to.
 *
 * ── THE SEAT WAS RESERVED AND LEFT EMPTY ───────────────────────────────────
 *
 * `HybridJourney` has carried this comment since #324: *"the model's seat here
 * is the JOINING SENTENCE over species, counts and phases that already came
 * back — not the question, which is a teaching decision, and not the naming,
 * which is gated on a photograph having travelled."* Nobody built it. The door
 * shows a caption and a strip of pictures, and between them there is nothing
 * that tells a class what to do with what they are looking at.
 *
 * Johan: *"we have opportunities to add some more magic in the other screen eg
 * ai suggested habitat, species etc.. this should be pure AI and contextual"*.
 * This is the half of that which is honest today, because every creature it
 * writes about is already on the screen and already carries its own claim.
 *
 * ── WHAT THE MODEL MAY AND MAY NOT DO ──────────────────────────────────────
 *
 *   NOT THE MODEL'S, EVER: which creatures are up there. `resolveDoor` picked
 *   them from the cast, under the honesty tier, filtered to the lesson's own
 *   topic. A model adding a creature is the apple line again in a better
 *   sentence, and it is unfalsifiable at the exact moment a child is sent to
 *   look.
 *
 *   NOT THE MODEL'S EITHER, AND THIS ONE IS NEW: the CLAIM. The caption above
 *   the pictures already says whether these were seen near this school or are
 *   what the season brings to the region, and those are the two shipped,
 *   reviewed phrasings in `lib/outside/captions.ts`. A joining sentence that
 *   says "these are in your playground" has quietly upgraded a regional tier
 *   to a local one, in prose, under a caption that says otherwise. So the
 *   guard rejects locality and recency outright, in both tiers.
 *
 *   THE MODEL'S: the sentence. What the two creatures have to do with each
 *   other, which one to look at first, what a five-year-old should notice.
 *   That is a judgement over a true list, which is the shape of work a model
 *   is actually good at.
 *
 * Same split as `conditions-line.ts` (NUMBERS UNCHANGED) and
 * `look-for-line.ts` (NAMES UNCHANGED), and the names half is literally the
 * same code, in `species-names.ts`.
 *
 * ── AND THERE IS NO FALLBACK ───────────────────────────────────────────────
 *
 * Its two siblings fall back to an authored composition. This one returns
 * null and the door renders exactly as it does today: caption, pictures,
 * question. There is nothing to fall back TO, and inventing a canned joining
 * sentence to fill the space would be the hardcoded intelligence this is
 * supposed to replace. Absence ships as absence here as it does everywhere
 * else on this page.
 */

/** One creature on the screen, as the drafter is allowed to know it. */
export interface DoorSpecimenFact {
  name: string;
  /** "bird", "insect", "plant"... or null when the taxon was not reported. */
  kind: string | null;
  /** True when a photograph of it is on the screen rather than a drawn mark. */
  photographed: boolean;
  /**
   * True when THIS creature was recorded near the school, false when it is a
   * regional member (nc#1012).
   *
   * Per specimen because the row is no longer one tier. #1012's door fills a
   * recorded row from the region up to its cap, and every card carries its own
   * `tierLabel` — "recorded nearby" or "around the region". A single row-level
   * claim could not describe that row, and said "seen-here" about the regional
   * card in it.
   *
   * NOT RENDERED INTO THE PROMPT, deliberately. The claim is the caption's and
   * the card's, never the model's — see the header — and the guard rejects
   * locality and recency in both tiers whatever this says. It is here so the
   * facts object is true about the screen, for the checker and the evals.
   */
  recorded: boolean;
  /** Look-don't-touch phrasing. Present means the line must not invite a hand. */
  safetyNote: string | null;
}

export interface DoorLineFacts {
  /** The creatures on the screen, in the order they render. */
  specimens: readonly DoorSpecimenFact[];
  /**
   * What the CAPTION above the row claims, so the line never restates it.
   *
   * Row-level because the caption is: one heading over the whole strip. It is
   * not a statement about any one creature, and since #1012 a "seen-here" row
   * may hold regional members — read `DoorSpecimenFact.recorded` for that.
   */
  claim: "seen-here" | "usually-around";
  /** Today's lesson, so the sentence joins the creatures to the work. */
  lessonTitle: string;
  /**
   * Species names the model may not introduce. Supplied rather than imported
   * so the guard stays pure and a test can hand it three words.
   */
  lexicon: readonly string[];
}

/** The line, and the creatures it was written over, so a render can check. */
export interface DoorLine {
  line: string;
  /** Names in render order. The screen must still be showing exactly these. */
  over: string[];
}



/** Exported for scripts/prompt-eval.mjs: the harness must render the user
 *  half exactly as production does, or it measures a prompt nobody ships. */
export function buildUser(facts: DoorLineFacts): string {
  const pictures = facts.specimens.map((s) => {
    const kind = s.kind ? `a ${s.kind}` : "kind not reported";
    return `- ${s.name} (${kind}, ${s.photographed ? "a photograph" : "a drawn mark"})`;
  });
  const safety = facts.specimens
    .filter((s) => s.safetyNote)
    .map((s) => `${s.name}: ${s.safetyNote}. Never invite anyone to touch or hold it.`);

  return [
    `Today's lesson: ${facts.lessonTitle}.`,
    "",
    "In the pictures:",
    ...pictures,
    ...(safety.length > 0 ? ["", "Take care:", ...safety] : []),
    "",
    "Write the line.",
  ].join("\n");
}

export interface DoorLineCheck {
  ok: boolean;
  reason?: string;
}

/**
 * The claim the caption owns, in every phrasing a model reaches for.
 *
 * Deliberately about PLACE AND TIME rather than about words we dislike. The
 * bare word "here" survives, because "start here" is a fine thing to say to a
 * class; "around here", "near your school" and "seen lately" do not, because
 * each is the caption's sentence said a second time by something that did not
 * check.
 *
 * BARE "NEAR" SURVIVES TOO, and it took a live run to see why. Measured on
 * 2026-08-18: "the coot floats near" and "the woodlouse and coot live near it"
 * were both thrown out by a pattern that matched "near" on its own. Neither is
 * a claim about this school — they are one creature's position relative to
 * ANOTHER, which is exactly the noticing this sentence exists to do. So "near"
 * only counts when it points at the reader's place: nearby, near here, near
 * you, near your school.
 */
const CLAIMS =
  /\b(nearby|near (here|you|your|us|the school)|around here|close by|your (school|grounds|playground|patch|yard|garden|field)|out there|lately|recently|this week|this month|today|right now|just outside|(has |have |was |were )?(been )?(seen|spotted|recorded|found) (here|near|around|lately|recently))\b/i;

/** A promise about what the class will find. Nothing here can support one. */
const PROMISES = /\b(you('| wi)?ll|they('| wi)?ll|will (see|find|spot|meet)|is waiting|are waiting|guarantee)\b/i;

/**
 * How much of it there is out there, which nothing on this page measured.
 *
 * The digits ban below is the siblings' rule and it holds here too. What it
 * does NOT catch is "look for several hoverflies", which is a claim about
 * abundance in exactly the way "an Apple is usually around now" was a claim
 * about presence.
 *
 * Spelled-out small numbers are deliberately left alone. At most two creatures
 * are ever on this screen, so "both of these" and "the two pictures" are true
 * and visible, and a guard that forbade them would push the model into worse
 * sentences to avoid counting things the class can see.
 *
 * "How many" is exempted for the same reason and it is not a nicety: the
 * lesson this fires under is called Counting life, and "count how many
 * hoverflies can sit on one leaf" is the WORK. A claim says how much there is;
 * a question asks the class to go and find out. The lookbehind is the whole
 * difference between the two.
 *
 * AND IT ONLY FIRES ON A CREATURE. Measured against the live model on
 * 2026-08-18: "the woodlouse has a long body with lots of legs" was rejected
 * by a bare quantity ban, and a woodlouse's legs are not a population. The
 * quantity word has to be attached to one of the creatures on the screen
 * before it is a claim about how much of it is out there.
 */
const QUANTITY =
  "several|dozens? of|hundreds of|thousands of|lots of|plenty of|loads of|(?<!how )many|a few|countless|swarms? of|flocks? of|covered in";

/**
 * A hand reaching for something we were told stings, bites or poisons.
 *
 * TWO GROUPS, BECAUSE THE SUBJECT MATTERS. Measured on 2026-08-18: every
 * remaining rejection in a live run was "the spider spins its web to catch its
 * food", thrown out by a bare ban on "catch". A spider catching flies is the
 * creature's own behaviour and one of the better things a class could be told
 * about it; the guard was reading it as an instruction to a child.
 *
 * So the words that are only ever addressed to a person stay bare, and the
 * ones a creature can also do — hold, catch, pick up — must take an object
 * that makes them an instruction: "catch one", "hold the stem". "Catch its
 * food" and "the trunk holds up its branches" are the creature acting, and
 * both survive.
 *
 * The word boundaries on the pronouns are load-bearing: without them "catch
 * its food" matches on the "it" inside "its", which is the whole case this
 * was written for.
 *
 * AND THE THIRD PERSON IS NOT IN THE LIST AT ALL, which is the cleaner half of
 * the same idea. "Catches" and "holds" cannot be imperatives — "the spider's
 * web catches the light", "the trunk holds up its branches" — so a verb that
 * has agreed with a subject has already told us the subject is not the child.
 * Only the bare form can be an instruction, and only the bare form is checked.
 */
const HANDS =
  /\b(touch|stroke|pet|grab|handle)\b|\b(hold|catch|pick up)\s+(it\b|them\b|one\b|the\s)/i;

/**
 * A WARNING IS NOT AN INVITATION.
 *
 * "The nettle has hairs that sting if you touch them" is the right thing for a
 * teacher to say to a class about a nettle. It is not a child being handed a
 * nettle. The hazard this guard exists for is "put your hand on this", and a
 * conditional clause is the opposite of that: it is the reason not to.
 *
 * The reasoning is already in this file, one comment up — hold, catch and pick
 * up are only checked in the bare form, because a verb that has agreed with a
 * subject cannot be an imperative. That nuance was never applied to touch,
 * stroke, pet, grab and handle, so any appearance of the word fired.
 *
 * Measured 2026-08-25 on the nettle fixture: 3 of 30 drafts refused, and the
 * ones refused were warnings — "tiny hairs that prick your skin if you touch
 * them". A guard that rejects the sentence you wanted is a guard that makes
 * the model pay for the instruction's own vocabulary.
 *
 * `do not touch` deliberately still fires. It is also a warning, but it is a
 * warning phrased as the instruction, and whether a door line should say it
 * aloud is a content question rather than a safety one.
 *
 * AND "IF" ALONE IS NOT ENOUGH, which the existing suite caught before this
 * shipped. "See if you can catch one on the bramble" is an instruction wearing
 * a conditional: the "if" governs an attempt, not a consequence. So a hand
 * verb reached through see-if / try / can-you / let's is still a hand on the
 * creature, whatever word sits in front of it.
 */
const CONDITIONAL = /\b(if|when|whenever|unless|should)\b[^.!?]{0,40}$/i;
const ATTEMPT = /\b(see if|try|can you|could you|let's|lets|have a go|see whether)\b/i;

/**
 * The ways a teacher actually says a species name out loud.
 *
 * "Pedunculate Oak" becomes "the oak". "European Garden Spider" becomes "the
 * spider". Measured against the live model on 2026-08-18, that shortening was
 * the single biggest cause of a good sentence being thrown away: seven of
 * eight drafts for the trees and minibeast doors were rejected as naming
 * nothing, and every one of them named the creature the way a five-year-old
 * would hear it.
 *
 * It is also the RIGHT register. "Look at how the pedunculate oak's leaves are
 * rounder" is a sentence nobody says to a class. A guard that only accepts the
 * catalogue form is not protecting the child, it is protecting the catalogue.
 *
 * The head word only, never a middle one: "Garden" is not a spider and
 * "Common" is not a woodlouse.
 *
 * AND THE HYPHEN COUNTS AS A SPACE. Measured against the live model on
 * 2026-08-18 with a three-creature door: four of ten drafts were rejected as
 * naming nothing, and three of them had written "the pigeon" for a "Common
 * Wood-Pigeon". Splitting on spaces alone leaves the head as "wood-pigeon",
 * which "pigeon" does not match, so the guard threw away the only word a
 * five-year-old would use. The last hyphenated part is the same shortening as
 * the last word, one level down.
 */
function spokenForms(name: string): string[] {
  const full = normaliseName(name);
  const words = full.split(" ");
  const head = words[words.length - 1] ?? "";
  const forms = new Set<string>([full]);
  if (head.length >= 3) forms.add(head);
  const bare = head.split("-").pop() ?? "";
  if (bare.length >= 3) forms.add(bare);
  return [...forms];
}

/**
 * Everything that must hold before a drafted joining sentence reaches a class.
 *
 * Pure and exported, so the rule is a thing with a name that a test can watch
 * reject something, rather than a condition buried in a call site.
 */
export function checkDoorLine(draft: string, facts: DoorLineFacts): DoorLineCheck {
  const line = draft.trim();

  if (line.length === 0) return { ok: false, reason: "empty" };
  if (line.length > 160) return { ok: false, reason: "too long" };
  if (line.split(/\s+/).length > 28) return { ok: false, reason: "too many words" };
  if (/[—–]/.test(line)) return { ok: false, reason: "em dash" };
  if (/!/.test(line)) return { ok: false, reason: "exclamation" };
  if (/\b[A-Z]{2,}\b/.test(line)) return { ok: false, reason: "all caps" };
  if (/https?:\/\/|[<>]/.test(line)) return { ok: false, reason: "markup or link" };

  // No number is grounded here. The counts and the observation window are
  // evidence for us, not copy for a class, and a share is a statistic nobody
  // reads aloud to a five-year-old.
  if (/\d/.test(line)) return { ok: false, reason: "numbers are not spoken" };


  // THE CLAIM IS THE CAPTION'S. Both tiers, because in the regional tier this
  // is the apple line returning, and in the photographed tier it is the same
  // sentence printed twice.
  const claimed = line.match(CLAIMS);
  if (claimed) return { ok: false, reason: `restated the caption's claim: ${claimed[0]}` };

  const promised = line.match(PROMISES);
  if (promised) return { ok: false, reason: `promised a sighting: ${promised[0]}` };

  // SAFETY TRAVELS WITH THE CREATURE. A member carrying a look-don't-touch
  // note may be named, and may not be handed to a child.
  if (facts.specimens.some((s) => s.safetyNote)) {
    const hand = HANDS.exec(line);
    // Only when it is not sitting inside a conditional clause: what precedes
    // the verb is what says whether the child is being warned or instructed.
    const before = hand ? line.slice(0, hand.index) : "";
    const warned = hand ? CONDITIONAL.test(before) && !ATTEMPT.test(before) : false;
    if (hand && !warned) {
      return { ok: false, reason: `invited a hand onto a safety-noted creature: ${hand[0]}` };
    }
  }

  // THE NAMES CHECK. It must name at least one of the creatures on the screen,
  // in the catalogue form or the one a teacher says out loud, or it is not
  // joining them to anything.
  const allowed = new Map(facts.specimens.map((s) => [normaliseName(s.name), s.name]));
  const spoken = facts.specimens.flatMap((s) => spokenForms(s.name));
  if (!spoken.some((form) => nameToPattern(form).test(line))) {
    return { ok: false, reason: "names none of the creatures on the screen" };
  }

  // HOW MUCH OF IT THERE IS, which nothing on this page measured. Anchored on
  // a creature so a woodlouse may still have lots of legs.
  const quantified = spoken
    .map((form) =>
      line.match(
        new RegExp(`\\b(${QUANTITY})\\s+(?:\\w+\\s+){0,2}${nameStemSource(form)}\\b`, "i"),
      ),
    )
    .find(Boolean);
  if (quantified) {
    return { ok: false, reason: `claimed abundance: ${quantified[1]}` };
  }

  // And it must name nothing else alive. Shared with `look-for-line.ts`, which
  // must agree with this file on what counts as inventing a creature.
  // The spoken forms join the allowed map for the mask's sake only: "the oak"
  // is our own species said plainly, and a vocabulary entry it happens to sit
  // inside must not read as an invention.
  const forMask = new Map(allowed);
  for (const form of spoken) forMask.set(form, form);
  const invented = namedOutsideSet(line, forMask, facts.lexicon);
  if (invented) {
    return { ok: false, reason: `named a creature the door did not show: ${invented}` };
  }

  return { ok: true };
}

/**
 * The facts a piece of resolved evidence permits, or null.
 *
 * Pure, and the only place the evidence union is turned into a prompt, so the
 * drafter cannot be handed a creature the door is not rendering. `none` has
 * nothing to join and returns null WITHOUT reaching a model, because a door
 * with nothing on it is a door with nothing to say and the one thing this must
 * never do is ask a model to fill the gap.
 */
export function doorLineFacts({
  evidence,
  lessonTitle,
  lexicon,
}: {
  evidence: DoorEvidence;
  lessonTitle: string;
  lexicon: readonly string[];
}): DoorLineFacts | null {
  if (evidence.kind === "none") return null;
  return {
    specimens: evidence.specimens.map(({ member, asset }) => ({
      name: member.commonName,
      kind: kindWordOf(member),
      photographed: asset !== null,
      // The card's own tier, not the row's (nc#1012). An absence is never
      // spoken as recorded, which matches what `tierLabel` prints beside it.
      recorded: member.honestyTier === "recorded" && !member.absent,
      safetyNote: member.safetyNote,
    })),
    claim: evidence.kind === "photographed" ? "seen-here" : "usually-around",
    lessonTitle,
    lexicon,
  };
}

/**
 * The drafted sentence in the reader's own English, with the names it was
 * given left exactly as they are (#393).
 *
 * The localizer is a word map, and a word map run over a sentence that names
 * species will happily turn a "Grey heron" into a "Gray heron" — a bird that
 * is called Grey heron wherever you are standing. `localizeDeep` keeps
 * `commonName` out of the walk for that reason; a free sentence has no keys to
 * skip, so the names are put back after the swap. Every specimen the line was
 * written over is known here, which is why this lives at the drafter rather
 * than at the page.
 */
export function localizeDoorSentence(
  line: string,
  names: readonly string[],
  locale: Locale
): string {
  let out = localizeText(line, locale);
  for (const name of names) {
    const swapped = localizeText(name, locale);
    if (swapped !== name) out = out.split(swapped).join(name);
  }
  return out;
}

/**
 * Draft the line, or return null so the door renders as it does today.
 *
 * Null on: no facts, no model, a slow or failed call, unparseable output, or a
 * draft that fails the check. All of those are ordinary.
 *
 * `locale` is the reader's own English, defaulting to the product's native UK
 * voice. The swap happens AFTER the guard, so the model is checked on what it
 * actually wrote and the teacher reads the same vocabulary the authored lesson
 * beside it uses.
 */
export async function draftDoorLine(
  facts: DoorLineFacts | null,
  locale: Locale = "uk"
): Promise<DoorLine | null> {
  if (!facts) return null;
  if (facts.specimens.length === 0) return null;
  if (!isModelAvailable()) return null;

  const prompt = loadPrompt("door-line");
  if (!prompt) return null;

  const line = await draft({
    prompt: { ...prompt, user: buildUser(facts) },
    facts,
    maxTokens: 150,
    parse: stringField("line"),
    check: checkDoorLine,
  });
  if (!line) return null;

  const names = facts.specimens.map((s) => s.name);
  return { line: localizeDoorSentence(line, names, locale), over: names };
}
