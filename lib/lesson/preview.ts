import type { Phase, PrimerTerm, Session } from "@/schema/pack";
import type { SourceFieldRef } from "@/schema/prepared-day";
import { drivingQuestion } from "./driving-question";

/**
 * THE LESSON PREVIEW (nc#515) — a narrated deck a teacher can play from the
 * lesson she has already opened.
 *
 * An Assembly Code reviewer, to Johan: *"Teachers really like to know what they're going to do
 * before they decide to do a lesson, but they also don't have much time."*
 * Johan, on Sophia's prototype: *"this is good scope it and lets wire it."*
 *
 * This file is the whole content half of that: one pure function from a
 * session's authored fields to the cards and the words spoken over them. It is
 * the ONLY place narration text is decided, and there is no model call in it.
 *
 * WHY A FUNCTION AND NOT A MODEL, AND NOT FIFTY-SIX HAND-WRITTEN SCRIPTS.
 *
 * A model at request time would put a paraphrase of Johan's curriculum into a
 * teacher's ears with nothing standing between the two, and the verbatim guard
 * (`scripts/verbatim-fidelity.mjs`) governs the pack file rather than whatever
 * a synthesiser was handed. Fifty-six hand-written scripts would be fifty-six
 * more strings to keep in step with fifty-six lessons that move every
 * fortnight. A pure function over the fields cannot drift from the pack,
 * because it IS the pack, rearranged.
 *
 * The output is committed to `preview-narration.json` so a reviewer can read
 * every word that will be spoken across all fifty-six sessions in one file,
 * and `tests/unit/lesson-preview.spec.tsx` fails when that file and this
 * function disagree.
 *
 * ── THE TWO RULES THAT WERE LEARNED BY GETTING THEM WRONG ──────────────────
 *
 * 1. THE VOICE NEVER READS THE SCREEN BACK.
 *
 *    Where a card is a LIST — the kit, the words to have ready —
 *    the narration describes it and stops. It never recites the items, and it
 *    never speaks a minute count that is printed on the card beside it. A
 *    voice reading out what the eye is already reading is the thing that makes
 *    a narrated slide feel like a corporate deck.
 *
 * 2. NO RHETORICAL KICKERS.
 *
 *    The prototype's early drafts ended sentences with invented flourishes:
 *    *"the difference between a calm fifteen minutes and a scramble"*, *"so you
 *    are not inventing an explanation while thirty children wait"*. Johan
 *    called them out by name as jarring filler. The pack itself never does
 *    this — it says *"Ground-only collecting keeps the trees whole"* and stops.
 *
 *    This is held structurally rather than by taste. Every segment below is
 *    exactly one of three things:
 *
 *      a. a FIXED HOUSE CONSTANT — the section titles, and nothing else;
 *      b. an AUTHORED FIELD, spoken verbatim (see the transform note below);
 *      c. a DERIVED CLAUSE from a count or a comparison, in a fixed template.
 *
 *    There is no fourth kind, so there is nowhere for a flourish to live.
 *
 * ── THE TWO TRANSFORMS ALLOWED ON AUTHORED TEXT ────────────────────────────
 *
 * `prompt`, `title` and `objective` are Johan's verbatim source and are SHOWN
 * exactly as written. What is handed to the synthesiser differs from what is
 * shown in two ways and no others:
 *
 *   1. An ampersand becomes the word "and". `Create & glue` is a phase title
 *      written for a page; nobody says "ampersand" to a colleague.
 *   2. A terminal full stop is appended where a field has none, so the voice
 *      lands the sentence instead of running into the next one.
 *
 * `speakableFrom()` below is those two rules and nothing else, and the spec
 * asserts that every spoken segment reduces to its authored field under them.
 *
 * Sophia's concept proposed a third — spelling numerals out — and it is
 * deliberately NOT here. Applied to authored text it is a rewrite, not a
 * reading: `A5 card, one per child` would be spoken as "A five card". Counts
 * this file DERIVES spell themselves (`spellCount`), which is where that rule
 * actually belonged.
 *
 * ── WHY TEACHER NOTES, AND WHY THAT MAKES THE AUDIO ONE-DIMENSIONAL ────────
 *
 * The per-part cards read `teacher-note`, which is present on 237 of 237
 * phases and is already written to the teacher in the second person. It is
 * also, with every other block type except `say-aloud`, free of
 * `abilityVariants` — so one narration set serves Reception, Year 1 and Year 2
 * alike and a session needs one set of recordings rather than three.
 *
 * `say-aloud` is deliberately never narrated here. Not as a hedge against
 * nc#358, which is ruled and shipped — but because a teacher who hears one
 * voice describe the lesson and then teach it cannot tell which words are hers
 * to say. The runner's play control speaks those lines, in its own voice, to
 * thirty children. This one speaks to one teacher.
 *
 * ── ABSENT MEANS ABSENT ────────────────────────────────────────────────────
 *
 * 32 of 237 phases carry no `durationMin`, four sessions carry no `kit`, eight
 * no `primer.glossary`, and forty-five no `childWorkSummary`. Nothing here
 * fills a gap in: a missing field drops its clause, or drops its whole card.
 * A deck that divides a session total by its phase count to produce a minute
 * figure would put an invented number into a teacher's ears, where — unlike on
 * a page — she cannot see that it was inferred.
 */

/* ── pauses ─────────────────────────────────────────────────────────────── */

/**
 * The silences, in milliseconds, spliced between segments at generation time.
 *
 * NOT MARKUP, AND THIS IS THE REASON. `eleven_v3` ignores SSML, and its own
 * pause handling is non-deterministic — the same text synthesised twice comes
 * back with different rests. The first prototype relied on it and sounded
 * rushed, which is recipe step 3 of `recipes/voice-ai-pipeline/SKILL.md`
 * learned the expensive way. So each segment is synthesised alone, its ragged
 * head and tail are trimmed, and exactly these silences are spliced between.
 * See `scripts/synthesize-lesson-preview.mjs`.
 *
 * They are here rather than in the script because the gap is part of what is
 * spoken: change one and the clip is a different recording, so the content
 * hash has to move with it.
 */
export const SECTION_GAP_MS = 500;
export const SENTENCE_GAP_MS = 300;
/**
 * Between enumerated things — the count clause and the clause that says what
 * each of them carries. Sophia's spec named this "between definitions"; the
 * deck describes lists rather than reciting them, so this is where that beat
 * ended up.
 */
export const ITEM_GAP_MS = 450;

/**
 * How much authored prose one card speaks, in words.
 *
 * A CARD IS AS LONG AS ITS TEXT, AND THE TEXT IS LONGER THAN A CARD. Two
 * fields are paragraphs rather than sentences: `primer.summary` runs to 74
 * words on the subject session and 84 on `bark-rubbings`, and `primer.why` is
 * the same shape. Read whole they are half a minute each, on a deck Johan
 * asked to keep short.
 *
 * The cut is by WHOLE SENTENCES and never inside one, so what is spoken is
 * still exactly what was written — fewer sentences of it. The rest is one tap
 * away on Pre-reading, which is the page that exists to hold it and which this
 * preview sits above rather than replaces.
 *
 * 42 lands a body around fifteen seconds at this voice's pace, which is where
 * the prototype's cards sat when Johan approved them.
 */
export const BODY_WORD_BUDGET = 42;

/**
 * The beat after a card's voice stops, before the card turns, in seconds.
 *
 * Johan, after the first cut: it felt too fast. This is the part of that which
 * is not a fade — the moment where the last sentence is allowed to finish being
 * true before anything moves.
 */
export const HOLD_SECONDS = 1.1;

/**
 * How long a card is on screen, and therefore how wide its segment is.
 *
 * ONE FUNCTION FOR BOTH READERS. The player uses it to time the deck and the
 * doorway uses it to caption the row, so the row cannot promise two minutes
 * over a deck that runs two and a half. The first cut had the caption summing
 * clip lengths and the player adding holds and reading floors on top, which
 * agreed on this lesson by luck and would not have on a longer one.
 *
 * The end card has no length: she stops there.
 */
export function cardSeconds(card: PreviewCard, clipSeconds: number): number {
  if (card.kind === "end") return 0;
  return Math.max(clipSeconds + HOLD_SECONDS, card.readingSeconds);
}

/* ── the shape of a deck ────────────────────────────────────────────────── */

/** One spoken run, and the silence that follows it. */
export type NarrationSegment = {
  /** Exactly what the synthesiser is handed. */
  text: string;
  /** Milliseconds of silence spliced after it. Zero on the last segment. */
  gapAfterMs: number;
  /**
   * Which part of the lesson this segment names, as an index into a part
   * slide's `parts` (nc#625/#675). The slide opens that section inline while
   * this segment is being spoken. Absent on every segment that names no part.
   *
   * Deliberately NOT part of the content address: `clip-key.mjs` hashes the
   * words and their silences, and which row opens is presentation rather than
   * recording. A part tag can move without re-voicing anything.
   */
  part?: number;
};

type CardBase = {
  /** Stable within a session, so a clip and a card cannot come apart. */
  id: string;
  /** The small label above the card. Null on the title and end cards. */
  eyebrow: string | null;
  /** Empty on the end card, which is where she acts rather than listens. */
  narration: NarrationSegment[];
  /**
   * The floor on how long this card stays up, in seconds — see
   * `readingSeconds`. The player holds a card for the longer of its narration
   * and this, so a list card the voice describes in three seconds is not
   * turned before she has read it. Zero on the end card, which never advances.
   */
  readingSeconds: number;
};

export type PreviewCard =
  | (CardBase & {
      kind: "title";
      /** Verbatim. Never trimmed, never smoothed. */
      title: string;
      prompt: string | null;
      meta: string;
    })
  | (CardBase & {
      kind: "prose";
      lead: string;
      body: string | null;
      meta: string | null;
    })
  | (CardBase & { kind: "kit"; items: string[]; note: string | null })
  | (CardBase & {
      kind: "phase";
      /** This slide's own place in the walk — the section it holds open. */
      at: number;
      /** Every part's header, on every slide: "the headers in place" (nc#675). */
      parts: Array<{ title: string; minutes: number | null }>;
      name: string;
      minutes: number | null;
      notes: string[];
    })
  | (CardBase & { kind: "words"; terms: PrimerTerm[] })
  | (CardBase & { kind: "end" });

/* ── speech ─────────────────────────────────────────────────────────────── */

/**
 * The two transforms, applied in order. Everything else about the string is
 * left exactly as its author typed it.
 */
export function speakableFrom(authored: string): string {
  return terminated(spokenTitle(authored));
}

/**
 * Transform one, alone: an ampersand becomes the word "and".
 *
 * Split out because a phase title is spoken INSIDE a sentence on the part
 * slides ("Then Create and glue."), where a full stop after the ampersand's
 * expansion would stop the voice halfway through the connective.
 */
export function spokenTitle(authored: string): string {
  return authored.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim();
}

/** Transform two: land the sentence where a field carries no terminal mark. */
function terminated(said: string): string {
  return /[.!?]["'”’]?$/.test(said) ? said : `${said}.`;
}

/**
 * THE SHAPE OF THE SESSION, IN ORDER, FROM THE PHASE TITLES — ONE SEGMENT PER
 * PART.
 *
 * Johan asked for this card twice, the second time in his own words: *"instead
 * should not read the minutes and do like you will start by and describe a bit
 * of the…"*. The first build of it said "Five parts." and stopped, which is a
 * count the segment bar above already implies — not a description of anything.
 *
 * The prototype's line was fluent prose no generator can derive. The SEQUENCE
 * can be: `phases[].title` is authored on 237 of 237 phases, so walking them in
 * order is a description made entirely of the author's own words. The only
 * words this function adds are the three connectives below, and the spec
 * asserts that nothing else ever appears around the titles.
 *
 * ONE SEGMENT PER PART, NOT ONE SENTENCE NAMING ALL FOUR (nc#625), AND EACH
 * SEGMENT OPENS ITS OWN SLIDE (nc#675). The walk is the part slides now: slide
 * i speaks segment i before that part's notes, so "Then Count." is heard as
 * Count expands inline. A segment per part is also a splice point per part,
 * and the manifest records where each lands (`marks`), which is how a section
 * opens AS it is named. Johan, raising the ticket: the narration changes with
 * the presentation.
 *
 * THE CLOSER'S PREPOSITION IS READ OFF THE TITLE IT GOVERNS (nc#861).
 *
 * It used to be assumed. Every session closed on "And finish in <title>",
 * which was written when forty-eight of the fifty-six sessions closed on a
 * phase titled "Circle" — a place a class finishes INSIDE, which "finish in"
 * is right for and which "finish with" would flatten. The comment that stood
 * here named the risk exactly ("a session closing on a verb phrase — 'Take a
 * rubbing' — would read 'finish in Take a rubbing'") and then left it, and
 * the curriculum moved underneath it: autumn-garden closes on named phases,
 * so a teacher previewing the compost lesson was told "And finish in Open the
 * compost diary."
 *
 * A preposition governs the words after it, so the words after it are what
 * decides it. `CLOSES_INSIDE_IT` below is the closed set of closing titles
 * "in" can take; everything else closes with "with", which is the same
 * governance the opener already uses on the same authored titles ("You start
 * with Gather the ingredients.", shipped and unremarkable). That fallback
 * cannot be WRONG on a title nobody here has read — only plainer than a
 * hand-chosen preposition would be — which is the direction a default should
 * fail in. English cannot be parsed for this in a pure function, and a
 * heuristic over determiners and verbs would guess: it would read "finish in"
 * over "Circle the tree" and "finish with" over "Sharing circle", and both
 * mistakes reach a teacher's ears as a recording.
 *
 * The phase KEY is not the signal, tempting as it looks. Two autumn-garden
 * phases carry `key: "circle"` under the titles "The detectives report" and
 * "The winter plans" — structurally the closing circle, and still not
 * something a class finishes *in*. What is spoken is the title.
 */
export const CLOSES_INSIDE_IT: readonly string[] = ["Circle", "Circle time"];

/** The connective a closing title takes, from the title itself. */
function closingConnective(said: string): "And finish in" | "And finish with" {
  const bare = said.replace(/[.!?]+$/, "").trim().toLowerCase();
  return CLOSES_INSIDE_IT.some((title) => title.toLowerCase() === bare)
    ? "And finish in"
    : "And finish with";
}

export function sequenceSegments(
  titles: string[]
): Array<{ text: string; part: number }> {
  const said = titles.map(spokenTitle);
  return said.map((title, at) => {
    const connective =
      at === 0
        ? "You start with"
        : at === said.length - 1
          ? closingConnective(title)
          : "Then";
    return { text: terminated(`${connective} ${title}`), part: at };
  });
}

/** Counts this file derives spell themselves; authored numerals never do. */
const COUNT_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

export function spellCount(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** A derived clause opens a sentence, so its spelled count is capitalised. */
function opening(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * How long the card takes to READ, in seconds.
 *
 * THE FLOOR THE AUTOPLAY NEEDS. The deck advances when a card's narration
 * ends, and on the two list cards the narration is deliberately shorter than
 * the card: the voice says "Four things to gather" in three seconds and the
 * kit takes six to read. Left alone, autoplay would turn the page while she
 * was still on the second item — which is the same defect as a story that
 * ticks every five seconds, arriving from the opposite direction.
 *
 * So a card is on screen for the longer of its voice and its reading load.
 * About 200 words a minute, with a couple of seconds for arriving at it, and a
 * ceiling because a long card is one she can dwell on herself.
 */
function readingSeconds(visible: string[]): number {
  const words = visible.reduce((total, text) => total + wordCount(text), 0);
  return Math.min(14, Math.round((2.4 + words / 3.4) * 10) / 10);
}

/**
 * Split authored prose into sentences without breaking one open.
 *
 * A boundary is terminal punctuation, optionally followed by a closing quote,
 * then whitespace, then something that starts a sentence. The lookahead is
 * what keeps `oak, maple, birch. Children absorb` apart while leaving
 * `layout: "Which tree do you think this one came from?" Keep a small pool`
 * as the two sentences it is.
 */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?]["'”’]?)\s+(?=["'“‘(]?[A-Z0-9])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/**
 * Whole leading sentences, up to the budget. Always at least one, because a
 * card that speaks nothing is worse than a card that runs slightly long.
 */
export function withinBudget(sentences: string[], budget = BODY_WORD_BUDGET): string[] {
  const kept: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const next = words + wordCount(sentence);
    if (kept.length > 0 && next > budget) break;
    kept.push(sentence);
    words = next;
  }
  return kept;
}

/** Sentences of an authored field, budgeted, as segments with sentence gaps. */
function bodySegments(text: string, budget = BODY_WORD_BUDGET): NarrationSegment[] {
  return withinBudget(sentencesOf(text), budget).map((sentence) => ({
    text: speakableFrom(sentence),
    gapAfterMs: SENTENCE_GAP_MS,
  }));
}

/** Close a card: the last segment never trails a silence. */
function close(segments: NarrationSegment[]): NarrationSegment[] {
  if (segments.length === 0) return segments;
  return segments.map((segment, index) =>
    index === segments.length - 1 ? { ...segment, gapAfterMs: 0 } : segment
  );
}

/* ── the house's own sentences ──────────────────────────────────────────── */

/**
 * Every fixed sentence the preview is allowed to say.
 *
 * THE WHOLE LIST, IN ONE PLACE, AND THE SPEC READS IT. A narration segment is
 * one of exactly three things: a member of this set, a derived clause matching
 * one of the frames below, or an authored field spoken verbatim. There is no
 * fourth kind, and `tests/unit/lesson-preview.spec.tsx` walks all fifty-six
 * decks proving it — which is how "no rhetorical kickers" stops being taste and
 * becomes a red build. A flourish would have nowhere to be.
 */
export const HOUSE_SENTENCES = [
  "What it is for.",
  "The idea to carry.",
  "Why it matters.",
  "Before you go out.",
  "How it runs.",
  "Each has a plain definition and a child's version, already written.",
  "Each has a plain definition.",
] as const;

/**
 * The frames a derived clause may take. Each is a count or a comparison this
 * file worked out from the pack, in a fixed template; the `(.+)` in the last
 * two is an authored name, spoken verbatim, and the spec checks that too.
 *
 * None of them contains a number as a NUMERAL, and none of them names a
 * duration — the minutes are on the card, and the voice never reads the screen
 * back.
 *
 * The part slides' sequence segments are NOT here, because a regex is the
 * wrong check for them: each carries an authored title and the thing worth
 * asserting is that every word around it is one of `SEQUENCE_CONNECTIVES`.
 * The spec rebuilds them from the pack with `sequenceSegments` and compares.
 */
export const DERIVED_FRAMES = [
  /^(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve) things? to gather\.$/,

  /^(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve) words? to have ready\.$/,
  /^The skill is (.+)\.$/,
] as const;

/**
 * Every word `sequenceSegments` is allowed to add around the authored titles.
 *
 * The list is short on purpose and the spec reads it: strip the phase title
 * out of each generated segment and what is left must be exactly one of these.
 * That is how "describe the shape" stays a reading of the pack rather than a
 * place a flourish could grow.
 */
export const SEQUENCE_CONNECTIVES = [
  "You start with",
  "Then",
  "And finish in",
  "And finish with",
] as const;

/* ── the cards ──────────────────────────────────────────────────────────── */

/** Every teacher-note a phase carries, in authored order. */
function teacherNotes(phase: Phase): string[] {
  return phase.blocks
    .filter((block): block is Extract<typeof block, { type: "teacher-note" }> =>
      block.type === "teacher-note"
    )
    .map((block) => block.text);
}

/**
 * The deck for one session.
 *
 * PHASES ARE READ AS AUTHORED, not as `resolvePhases` would resolve them for
 * today's weather. A preview is about the lesson, not about this morning: a
 * recording made in August cannot honestly speak a wet-day variant chosen in
 * November, and the deck is pre-generated ahead of need precisely so nobody
 * waits for it.
 */
export type PreviewProvenance = {
  narrationSources(cardId: string, sources: SourceFieldRef[]): void;
  /** The loader knows when a phase was inserted from a shared document. */
  phaseSource?(index: number, field: string): SourceFieldRef | undefined;
};
export function previewDeck(session: Session, provenance?: PreviewProvenance): PreviewCard[] {
  const cards: PreviewCard[] = [];
  const sessionSource = (field: string): SourceFieldRef => ({scope: "session", sessionId: session.id, field});
  const phaseSource = (index: number, field: string): SourceFieldRef => {
    const supplied = provenance?.phaseSource?.(index, field);
    if (supplied) return supplied;
    const phase = session.phases[index]!;
    const block = /^blocks\.(\d+)\.(.+)$/.exec(field);
    if (block && phase.blocks[Number(block[1])]?.nid) return {scope: "node", sessionId: session.id, nid: phase.blocks[Number(block[1])]!.nid!, field: block[2]!};
    return phase.nid ? {scope: "node", sessionId: session.id, nid: phase.nid, field}
      : sessionSource(`phases.${index}.${field}`);
  };
  const record = (card: string, fields: string[]) => provenance?.narrationSources(card, fields.map(sessionSource));

  /* The title. Verbatim, and the only card that speaks no house sentence.
     The driving question under it goes through `drivingQuestion` (nc#150),
     the same rule the shelf, the journal, the journey and the flash cards
     use: this card is already the title, so a prompt that only restates it
     ("Minibeast hunting." under "Minibeast hunting") is left out, and the
     voice stops saying the lesson's name twice in a row. Every other prompt
     renders and is spoken byte for byte. */
  record("title", ["title", "prompt", "objective"]);
  const question = drivingQuestion(session);
  cards.push({
    id: "title",
    kind: "title",
    eyebrow: null,
    title: session.title,
    prompt: question,
    meta: `${session.durationMin} min`,
    readingSeconds: readingSeconds([session.title, question ?? ""]),
    narration: close([
      { text: speakableFrom(session.title), gapAfterMs: SECTION_GAP_MS },
      ...(question ? [{ text: speakableFrom(question), gapAfterMs: 0 }] : []),
    ]),
  });

  record("objective", ["objective", "namedSkill"]);
  /* What it is for: the objective, verbatim, and the skill it names. */
  cards.push({
    id: "objective",
    kind: "prose",
    eyebrow: "What it is for",
    lead: session.objective,
    body: null,
    meta: `the skill: ${session.namedSkill}`,
    readingSeconds: readingSeconds([session.objective, session.namedSkill]),
    narration: close([
      { text: HOUSE_SENTENCES[0], gapAfterMs: SECTION_GAP_MS },
      { text: speakableFrom(session.objective), gapAfterMs: SENTENCE_GAP_MS },
      { text: `The skill is ${speakableFrom(session.namedSkill)}`, gapAfterMs: 0 },
    ]),
  });

  /* The idea to carry. */
  record("idea", ["primer.summary"]);
  const summary = session.primer?.summary;
  if (summary) {
    const spoken = withinBudget(sentencesOf(summary));
    cards.push({
      id: "idea",
      kind: "prose",
      eyebrow: "The idea to carry",
      // The card shows exactly what the voice says. The paragraph in full is
      // one tap away on Pre-reading; a card whose text outruns its narration
      // leaves her reading after the voice has stopped.
      lead: spoken[0] ?? summary,
      body: spoken.slice(1).join(" ") || null,
      meta: null,
      readingSeconds: readingSeconds(spoken),
      narration: close([
        { text: HOUSE_SENTENCES[1], gapAfterMs: SECTION_GAP_MS },
        ...bodySegments(summary),
      ]),
    });
  }

  /* Why it matters. */
  record("why", ["primer.why"]);
  const why = session.primer?.why;
  if (why) {
    const spoken = withinBudget(sentencesOf(why));
    cards.push({
      id: "why",
      kind: "prose",
      eyebrow: "Why it matters",
      lead: spoken[0] ?? why,
      body: spoken.slice(1).join(" ") || null,
      meta: null,
      readingSeconds: readingSeconds(spoken),
      narration: close([
        { text: HOUSE_SENTENCES[2], gapAfterMs: SECTION_GAP_MS },
        ...bodySegments(why),
      ]),
    });
  }

  /*
    Before you go out. A LIST CARD: the kit is on the screen, so the voice
    counts it and moves on to the one thing that is not a list — how to be
    ready before the class arrives.
  */
  record("kit", ["kit", "preparation"]);
  const kit = session.kit ?? [];
  const preparation = session.preparation ?? null;
  if (kit.length > 0 || preparation) {
    cards.push({
      id: "kit",
      kind: "kit",
      eyebrow: "Before you go out",
      items: kit,
      note: preparation,
      readingSeconds: readingSeconds([...kit, preparation ?? ""]),
      narration: close([
        { text: HOUSE_SENTENCES[3], gapAfterMs: SECTION_GAP_MS },
        ...(kit.length > 0
          ? [
              {
                text: opening(
                  `${spellCount(kit.length)} ${kit.length === 1 ? "thing" : "things"} to gather.`
                ),
                gapAfterMs: preparation ? ITEM_GAP_MS : 0,
              },
            ]
          : []),
        ...(preparation ? bodySegments(preparation) : []),
      ]),
    });
  }

  /*
    How it runs — AS THE PART SLIDES THEMSELVES (nc#675).

    #647 built the smaller reading of Johan's ask: a drawer inside one "How it
    runs" card, with the part cards still following it as their own chip-and-
    notes slides. His correction, verbatim: *"i wanted a closer connection
    between this and the section.. like how the session runs: You will start
    with settling the class.. And then settle expands inline.. Second slide:
    -> Count Count expands in line (settle is closed) and so on.with the
    headers in place"*.

    So the standalone shape card is gone and the walk IS the slides. Every
    part slide shows the whole section list — the headers in place — with its
    own section expanded inline holding what the chip slide used to show: the
    minutes and the teacher notes. The first slide opens the family with "How
    it runs." and each slide speaks its connective segment ("You start with
    Settle." / "Then Count." / "And finish in Circle.") before that part's
    notes, so the expansion happens in the story, and the previous slide's
    open section is visibly closed on this one.

    The connective segment carries its `part` index and the synthesis writes
    where it lands (`marks`), so the section can open AS it is named rather
    than on arrival. Where there is nothing to follow — no clip, no marks,
    Silent, reduced motion — the slide rests with its own section open, which
    is the readable state.

    THE LONGEST-STRETCH CLAUSE STAYS GONE, ON JOHAN'S CALL (nc#625). And no
    slide speaks a minute count: the minutes sit in the opened section, and
    the voice never reads the screen back. Where the pack carries no minutes
    (32 of 237 phases) the section simply shows none.
  */
  /*
    GROUNDING IS A SECTION HERE TOO, EVEN WHERE THE PACK DOES NOT AUTHOR ONE.

    Johan: *"ground the class is missing from the Runner and also preview"*.

    Fourteen sessions carry a settle phase — four author their own, ten opt
    into the shared one that `loadPack` composes in as phase one — and those
    fourteen have always listed it. The other forty-two DO NOT, and the runner
    grounds them anyway off `DEFAULT_SETTLE` (`app/run/HybridJourney.tsx`). So
    a teacher previewing one of those forty-two was shown a shape that started
    somewhere the lesson does not: five sections listed, six taught.

    A HEADER, NOT A SLIDE, AND THAT IS THE WHOLE OF THE FIX HERE. The list of
    parts is presentation — `part` tags and `at` indices move without changing
    a word, which is exactly why they were kept out of the content address
    (see `NarrationSegment.part`). A slide of its own would need a spoken
    connective, and adding one shifts "You start with…" onto grounding and
    every other segment down a part: forty-two sessions re-voiced, and every
    committed clip key stale in the meantime — the same silent-miss failure
    `build-preview-narration.mjs` documents from the shared-settle seam. The
    voice naming grounding is the other half of this and needs a synthesis
    run; the shape does not, and the shape is what was wrong.

    Minutes are absent because they are absent: the ritual is chrome, no pack
    authored a duration for it, and this file never fills a gap in.
  */
  const grounded = session.phases.some((phase) => phase.key === "settle");
  const parts = [
    ...(grounded ? [] : [{ title: "Ground the class", minutes: null }]),
    ...session.phases.map((phase) => ({
      title: phase.title,
      minutes: phase.durationMin ?? null,
    })),
  ];
  /* Built from the PHASE titles alone, never from `parts`: what is spoken is
     unchanged by the header above it. */
  const sequence = sequenceSegments(session.phases.map((phase) => phase.title));
  const offset = grounded ? 0 : 1;
  session.phases.forEach((phase, index) => {
    provenance?.narrationSources(`phase-${index}`, [
      sessionSource("phases.$order"), phaseSource(index, "title"), phaseSource(index, "$teacherNotes"),
      ...phase.blocks.flatMap((block, at) => block.type === "teacher-note" ? [phaseSource(index, `blocks.${at}.text`)] : []),
    ]);
    const notes = teacherNotes(phase);
    const spoken = withinBudget(notes.flatMap(sentencesOf));
    cards.push({
      id: `phase-${index}`,
      kind: "phase",
      // Spoken on the first slide of the family, and shown there alone: the
      // headers below it carry the structure on every later slide.
      eyebrow: index === 0 ? "How it runs" : null,
      at: index + offset,
      parts,
      name: phase.title,
      minutes: phase.durationMin ?? null,
      notes: spoken,
      // The headers are on every slide now, so they are part of its reading.
      readingSeconds: readingSeconds([...parts.map((part) => part.title), ...spoken]),
      narration: close([
        ...(index === 0
          ? [{ text: HOUSE_SENTENCES[4], gapAfterMs: SECTION_GAP_MS }]
          : []),
        {
          text: sequence[index]?.text ?? speakableFrom(phase.title),
          part: index + offset,
          gapAfterMs: SECTION_GAP_MS,
        },
        ...spoken.map((sentence) => ({
          text: speakableFrom(sentence),
          gapAfterMs: SENTENCE_GAP_MS,
        })),
      ]),
    });
  });

  /*
    Words to have ready. THE THIRD LIST CARD. The terms, their meanings and
    their child-facing versions are all on screen; the voice says how many
    there are and what each one carries, and leaves the reading to her.
  */
  const glossary = session.primer?.glossary ?? [];
  record("words", ["primer.glossary.$order", ...glossary.map((_, i) => `primer.glossary.${i}.forChildren`)]);
  if (glossary.length > 0) {
    const everyTermHasAChildVersion = glossary.every((term) => Boolean(term.forChildren));
    cards.push({
      id: "words",
      kind: "words",
      eyebrow: "Words to have ready",
      terms: glossary,
      readingSeconds: readingSeconds(
        glossary.flatMap((term) => [term.term, term.definition, term.forChildren ?? ""])
      ),
      narration: close([
        {
          text: opening(
            `${spellCount(glossary.length)} ${glossary.length === 1 ? "word" : "words"} to have ready.`
          ),
          gapAfterMs: ITEM_GAP_MS,
        },
        {
          text: everyTermHasAChildVersion ? HOUSE_SENTENCES[5] : HOUSE_SENTENCES[6],
          gapAfterMs: 0,
        },
      ]),
    });
  }

  /* The end card. She acts here, so nothing is spoken over it. */
  cards.push({ id: "end", kind: "end", eyebrow: null, narration: [], readingSeconds: 0 });

  return cards;
}

/* ── the manifest a person reads ──────────────────────── */

/** The words alone, for a manifest a person has to be able to read. */
export function narrationText(narration: NarrationSegment[]): string {
  return narration.map((segment) => segment.text).join(" ");
}

/**
 * The doorway row's caption: how long the whole thing runs.
 *
 * HERE RATHER THAN BESIDE THE MANIFEST, and the reason is a build error worth
 * writing down. `preview-audio.ts` reaches for `node:crypto` to hash a content
 * address, which makes it server-only; the doorway that renders this caption is
 * a client component. Importing one function out of that module pulled the whole
 * thing — crypto, and a 485-entry manifest — into the browser bundle, and
 * webpack said so. This file has no runtime dependencies at all, which is why
 * both sides can have it.
 *
 * Rounded to whole minutes and floored at one, because this is a promise she
 * checks against her breaktime rather than a figure she needs to the second —
 * and the segmented bar tells the exact truth the moment she opens the deck.
 */
export function previewLength(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min, narrated`;
}
