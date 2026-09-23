import { z } from "zod";

/**
 * Nature Class pack schema, v1.
 *
 * Everything the app renders is data. A PACK holds SESSIONS; a session is
 * metadata plus ordered PHASES; a phase is ordered BLOCKS of typed kinds.
 * The engine is a registry keyed on `block.type` — adding a block kind is
 * one schema entry plus one renderer file, never an engine change.
 */

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/** Ability bands a block's text can be overridden for. */
export const abilityBands = ["reception", "y1", "y2"] as const;
export type AbilityBand = (typeof abilityBands)[number];

/** Per-ability text overrides. Absent band = use the block's base text. */
const abilityVariantsSchema = z
  .object({
    reception: z.string().optional(),
    y1: z.string().optional(),
    y2: z.string().optional(),
  })
  .strict();

export type AbilityVariants = z.infer<typeof abilityVariantsSchema>;

/**
 * Conditions a phase can carry an alternate version for, and a hinge can fire
 * on. ONE vocabulary, honestly defined off the Pointmoon payload
 * (`lib/outside/bucket.ts`, #1007):
 *
 *   wet     rain falling now
 *   windy   39 kph or more
 *   cold    feels like 6 °C or below
 *   hot     feels like 26 °C or above
 *   dry     no meaningful rain for 48 hours, and not raining
 *   still   under 5 kph, and not raining
 *   bright  clear or mostly clear sky
 *
 * `dry` used to be the word the HOT bucket mapped to, so a genuinely dry-ground
 * line could never fire and a hot-day line was authored as "dry". Both now say
 * what they mean.
 */
export const conditionKinds = ["wet", "dry", "windy", "cold", "hot", "still", "bright"] as const;
export type ConditionKind = (typeof conditionKinds)[number];

/**
 * The neutral shape of a teaching sequence. These are delivery modes, not
 * lesson genres: a nature lesson can present an idea, give children real work,
 * and gather what happened without becoming a meditation or a detective game.
 */
export const teachingModes = ["present", "work", "gather"] as const;
export type TeachingMode = (typeof teachingModes)[number];
const teachingModeSchema = z.enum(teachingModes);

/**
 * What a phase's field-media strip is FOR (nc#403), authored on the phase
 * because `mode` alone cannot carry it: a legacy pack's `work` phase can be a
 * child recognising a species against a reference photo just as easily as it
 * can be open counting, and the runtime's `present -> work -> gather` adapter
 * (`lib/run/teaching-flow.ts`) already leans on `work` meaning "most phases",
 * so overloading it here would silently re-hide media on phases nobody
 * intended to touch.
 *
 * "open-count": the phase is open observation or noticing — children decide
 * what is there. Showing candidate species photographs first turns that into
 * confirming a supplied list, so none render, however many the session has
 * queued.
 *
 * Absent (every phase in the catalogue except the ones re-authored for this
 * ticket) keeps the runner's long-standing behaviour: the smallest
 * topic-matched reference set may show. That is correct for a recognition or
 * comparison beat, and it is also the safe default for the 40-plus phases
 * nobody has looked at yet — this ticket fixes Counting Life, not every pack.
 */
/**
 * WHAT A PICTURE IN A LESSON IS FOR (#1078).
 *
 * A picture in the runner is doing one of four jobs, and until this existed
 * the code had no word for the difference. Five components mounted into one
 * container and four of them decided by comparing `session.id` to a string
 * they were written for — so the arrangement worked exactly where somebody
 * had hardcoded it, and the same four mask illustrations rendered on three
 * consecutive screens because nothing could see that they already had.
 *
 * The purpose is not a category for tidiness. It decides what may be claimed,
 * whether the picture is tappable, and what "the right number" means:
 *
 *   example      a photograph of the thing being discussed. No claim about
 *                this place. Read, not used. "This is what I mean."
 *   how-to       a step in making something. An instruction drawn rather
 *                than written, and it belongs with the demonstration.
 *   choose-from  explicitly imaginative, tappable, enlarges. "Pick one."
 *
 * THE FOURTH IS DELIBERATELY NOT AUTHORABLE. Species evidence is resolved
 * live, tiered and credited (`lib/lesson/door.ts`), and authoring it would be
 * authoring a claim about a place — the exact move `resolveDoor` exists to
 * prevent. A moment asks for it by staying silent, and says how many it wants
 * with `species` on a door question.
 */
export const picturePurposes = ["example", "how-to", "choose-from"] as const;
export type PicturePurpose = (typeof picturePurposes)[number];

export interface LessonPicture {
  /** Absolute public path, e.g. `/lesson-examples/woodlice.webp`. */
  src: string;
  /** What is in it, for a screen reader. Never the caption twice. */
  alt: string;
  /** The line under it, in the house voice. Absent renders no caption. */
  caption?: string;
}

/**
 * One authored picture set, anchored to ONE moment.
 *
 * ONE SET PER ANCHOR, which is what makes "one slot" structural rather than a
 * rule somebody has to enforce. Every real case fits: the mask lesson's
 * making steps are one `how-to` of two pictures, not two of one.
 */
export interface LessonPictures {
  purpose: PicturePurpose;
  items: LessonPicture[];
}

export const materialPurposes = ["open-count"] as const;
export type MaterialPurpose = (typeof materialPurposes)[number];
const materialPurposeSchema = z.enum(materialPurposes);

const lessonPictureSchema = z
  .object({
    src: z.string().min(1),
    alt: z.string().min(1),
    caption: z.string().min(1).optional(),
  })
  .strict();

const lessonPicturesSchema = z
  .object({
    purpose: z.enum(picturePurposes),
    // At least one. An empty set is a slot held by nothing, which renders as a
    // gap where the species board would otherwise have been.
    items: z.array(lessonPictureSchema).min(1),
  })
  .strict();

/**
 * ONE QUESTION THE INTRODUCTION ASKS, AND WHAT BELONGS BESIDE IT (#1078).
 *
 * The minibeast hunt is the case that forced this. It asks two questions on
 * the same screen component, one after the other:
 *
 *   "If you were the size of a woodlouse, where would you hide?"
 *   "What is your favourite minibeast and why?"
 *
 * The first is about PLACES and answering it with three species cards is the
 * priming nc#403 exists to prevent. The second is about creatures, and a
 * child is meant to walk up and tap one. Same screen, opposite needs, and
 * before this there was nowhere to say so — which is why the shipped code
 * matched the exact question string.
 *
 * A bare string still parses and means what it always meant: ask this, and
 * let the species board fill the slot as a glance. Outside packs do not break
 * to gain a field they have not used.
 */
const doorQuestionSchema = z
  .object({
    question: z.string().min(1),
    /** Authored pictures, which hold the slot against the species board. */
    pictures: lessonPicturesSchema.optional(),
    /**
     * How many creatures, when no pictures are authored. `glance` is the
     * shipped three; `choose` fills the board because a child is going to
     * touch it. Absent means `glance`.
     */
    species: z.enum(["glance", "choose"]).optional(),
  })
  .strict();

export type DoorQuestion = z.infer<typeof doorQuestionSchema>;

/**
 * The closed topic vocabulary (#161): what a session is ABOUT, machine-
 * readable, so the engine can set today's context on the right cast — the
 * Outside-now card and the grounding facts lead with insects on a bugs day
 * and plants on a trees day. Deliberately small; a tag earns its place by
 * changing what the engine does, not by describing the session better.
 */
export const topicTags = [
  "minibeasts",
  "birds",
  "trees",
  "plants",
  "animals",
  "seasons",
  "soil",
  "water",
  "weather",
  "art",
  "senses",
] as const;
export type TopicTag = (typeof topicTags)[number];
const topicTagSchema = z.enum(topicTags);

/**
 * What a session is FOR, in the words a head or a parent uses: the one or two
 * subject labels a lesson earns, shown beside it on the season shelf (Johan,
 * 2026-09-06: "for each session add 1-2 labels: sustainability, climate
 * action, making, science, etc"). Not the same thing as `topicTags`, which
 * say what is outside (trees, minibeasts) and drive the species read; these
 * say what kind of learning it is. The teacher's own plan of 2026-09-04
 * headed its lessons Art, Biodiversity and Sustainability, which is the
 * register this list is written in. Closed, so the shelf reads as one system;
 * add a word here before using it in a pack.
 */
export const lessonLabels = [
  "science",
  "biodiversity",
  "sustainability",
  "climate action",
  "making",
  "art",
  "storytelling",
  "maths",
] as const;
export type LessonLabel = (typeof lessonLabels)[number];
const lessonLabelSchema = z.enum(lessonLabels);

// ---------------------------------------------------------------------------
// Stable node identity
// ---------------------------------------------------------------------------

/**
 * A STABLE NODE ID: the handle a dependency is recorded against.
 *
 * Everything downstream of a lesson — a worksheet, an audio clip, a prepared
 * day, a proposed rewrite — is derived from PARTICULAR LINES, not from a
 * lesson. Today the only handle those things have is a positional path
 * (`phases[1].blocks[2].text`), and a position is not an identity: reorder a
 * phase, splice a block out, and every stored reference silently points at a
 * different sentence. That is the accounting this id exists to fix, and it is
 * the reason node-level dependency recording comes before anything that
 * composes or judges a day.
 *
 * SHAPE: one letter for the kind, then a number.
 *
 *   p   phase              b   block (including a child-sheet block)
 *   v   condition variant  t   phase tip
 *
 * NOT A UUID, and the reason is the diff. There are 898 blocks in the
 * catalogue; 36 characters each makes every pack diff unreadable, and a pack
 * diff a curriculum author cannot read is a review nobody does.
 *
 * THE NUMBER IS UNIQUE WITHIN ITS SESSION, across all four kinds — `b7` and
 * `p7` never both exist. One counter per session is what makes
 * `session.nodeSeq` mean something a check can hold: an id above the
 * high-water mark was minted by something that did not bump it.
 *
 * The full address is `${session.id}#${nid}`. The session id is already the
 * catalogue-wide resolution key and is already guarded against silent renames
 * (`scripts/lib/session-ids.snapshot.json`), so identity does not need a
 * second global namespace to sit beside it.
 *
 * OPTIONAL, and optional means UNMINTED — never "this node has no identity".
 * A pack authored outside this repo parses without ids, and the mint
 * (`scripts/mint-node-ids.mjs`) is what gives it them. It is optional in the
 * schema and REQUIRED in the catalogue: `scripts/validate-packs.mjs` fails a
 * shipped pack whose nodes are unminted, so the schema stays open to an
 * outside author while the packs we ship stay fully addressable.
 *
 * IT SITS BESIDE THE OTHER IDENTITIES, it replaces none of them. `session.id`
 * resolves a lesson, `phase.key` tracks a runner's progress through a phase,
 * `demoStep.mark` names a drawing, and the audio manifests are keyed on the
 * spoken string and on a clip hash precisely so that a generated line has no
 * clip. Those are correct as they are. This one answers a different question:
 * which authored node did that output come from.
 */
export const NODE_ID_PATTERN = /^[pbvt][0-9]+$/;

/** The kind letter a node id opens with, by what it identifies. */
export const nodeIdKinds = {
  phase: "p",
  block: "b",
  variant: "v",
  tip: "t",
} as const;

export type NodeIdKind = keyof typeof nodeIdKinds;

const nodeIdSchema = z
  .string()
  .regex(NODE_ID_PATTERN, {
    message:
      "a node id is one of p/b/v/t followed by digits, e.g. p1, b2, v3, t4 — see NODE_ID_PATTERN",
  });

/** The kind letter and the number, or null when the string is not a node id. */
export function readNodeId(nid: string): { kind: NodeIdKind; seq: number } | null {
  if (!NODE_ID_PATTERN.test(nid)) return null;
  const letter = nid[0];
  const kind = (Object.keys(nodeIdKinds) as NodeIdKind[]).find(
    (k) => nodeIdKinds[k] === letter
  );
  if (!kind) return null;
  return { kind, seq: Number(nid.slice(1)) };
}

// ---------------------------------------------------------------------------
// Blocks — discriminated union on `type`
// ---------------------------------------------------------------------------

/**
 * Per-pack-key overrides of a HABITAT-BEARING instruction (#207).
 *
 * "Look under logs" is FALSE in Phoenix. Not stylistically off, not slightly
 * regional — false, and confidently so, which is the worst kind. A class sent
 * to turn over logs in a Sonoran schoolyard finds no logs, and the lesson has
 * taught them that the instruction was for somebody else.
 *
 * WHY THIS CANNOT GO THROUGH A WORD MAP. The obvious fix is a vocabulary
 * substitution: log becomes rock, hedgerow becomes shrub. It is the wrong
 * mechanism, because a word swap produces a sentence that is grammatical,
 * confident, and still wrong. "Look under rocks, on leaves, in trees" reads
 * fine and quietly keeps every other assumption the original made about damp
 * ground and shade. A habitat instruction is a claim about where living things
 * actually shelter in a place, and claims get REWRITTEN by someone who knows
 * the place, not patched a noun at a time.
 *
 * So this is a whole-sentence seam. The key is a pack key (the climate group
 * spine, per J4's fallback chain), and lookup walks from the most specific key
 * to `global`, falling back to the AUTHORED BASE TEXT when nothing matches.
 * The base is the London text, untouched — which is also why the verbatim
 * guard never sees a diff: variants render in parallel with the source string
 * rather than replacing it in the pack (the #142 pattern).
 *
 * Absent means this instruction carries no habitat claim, or nobody has
 * written the variant yet. Both render the base, which is the honest degrade:
 * a London instruction shown in Phoenix is a known bug with a ticket, whereas
 * a machine-generated desert instruction is a new one with nobody's name on it.
 */
const habitatVariantsSchema = z.record(z.string().min(1), z.string().min(1));

export type HabitatVariants = z.infer<typeof habitatVariantsSchema>;

const blockBase = {
  /** Stable node id. See NODE_ID_PATTERN. Absent means unminted. */
  nid: nodeIdSchema.optional(),
  /** Optional per-ability overrides of the block's primary text. */
  abilityVariants: abilityVariantsSchema.optional(),
  /** Optional per-pack-key rewrites, for text that names a habitat. */
  habitatVariants: habitatVariantsSchema.optional(),
  /**
   * Marks a line that makes a claim about WHERE — "look under logs", "at the
   * water's edge". Such a line is rewritten for the school actually reading
   * it, by the model, from grounded facts (lib/ai/place-instruction.ts).
   *
   * A flag rather than a structure, because the alternative was a fixed set of
   * authored fragments and that is a smaller hardcoding rather than an escape
   * from one. Absent means the line makes no place claim and is left alone.
   */
  adaptsToPlace: z.boolean().optional(),
};

export const sayAloudSchema = z
  .object({ type: z.literal("say-aloud"), text: z.string().min(1), ...blockBase })
  .strict();

export const teacherNoteSchema = z
  .object({ type: z.literal("teacher-note"), text: z.string().min(1), ...blockBase })
  .strict();

/**
 * One beat of a demonstration. `mark` names a drawing in the demo mark set
 * (engine/demo-marks.tsx) and is OPTIONAL on purpose: a pack that has not had
 * its pictures drawn yet still renders as a numbered list, so the marks are an
 * enrichment a pack can earn rather than a tax every new pack must pay before
 * it can ship. An unknown id draws nothing rather than throwing.
 */
export const demoStepSchema = z
  .object({
    text: z.string().min(1),
    mark: z.string().min(1).optional(),
  })
  .strict();

/**
 * Something the teacher shows with their hands (#252).
 *
 * It was one prose string, rendered in the spoken hero's face on the spoken
 * hero's plate and separated from it only by the ABSENCE of a quotation mark.
 * Johan, on a live screenshot: "what is this anyways? looks misleading". An
 * absence is not a signal, and the teacher never sees the two registers
 * together anyway — groupViews puts them in consecutive views — so the block
 * has to declare itself alone. Numbered steps do; a missing glyph cannot.
 *
 * `look` is the closing beat, and it is optional rather than the last element
 * of `steps` because six of the ten techniques end in an observation, three end
 * on the last action, and one ends in a wait. It is a different register from
 * an action step and renders as one.
 *
 * NOTE on `abilityVariants` / `habitatVariants`: both rewrite a block's PRIMARY
 * TEXT, and once the text is an array there is no single primary text for them
 * to replace, so an authored variant would validate cleanly and then never
 * reach a screen. They stay in the type — every other consumer reads them off
 * the block union without narrowing, and dropping them here rippled into
 * habitat.ts, moments.ts and the habitat tests for no gain — and are rejected
 * for demo blocks by the pack validator instead, which fails loud at authoring
 * time rather than quiet at render time. Per-step variants are the right shape
 * if this is ever needed; no demo block uses either field today.
 */
export const demoSchema = z
  .object({
    type: z.literal("demo"),
    /** The named move, on its own line. "The dab and press". */
    move: z.string().min(1),
    steps: z.array(demoStepSchema).min(1),
    /** The closing observation, when the move earns one. */
    look: z.string().min(1).optional(),
    materials: z.array(z.string().min(1)),
    ...blockBase,
  })
  .strict();

/** Live conditions later (Pointmoon); the spike renders the fallback. */
export const conditionsLineSchema = z
  .object({ type: z.literal("conditions-line"), fallbackText: z.string().min(1), ...blockBase })
  .strict();

export const circleQuestionSchema = z
  .object({ type: z.literal("circle-question"), text: z.string().min(1), ...blockBase })
  .strict();

export const namedSkillSchema = z
  .object({ type: z.literal("named-skill"), skill: z.string().min(1), ...blockBase })
  .strict();

// ---------------------------------------------------------------------------
// Child-sheet blocks
//
// The child's printout is a main feature, not an afterthought: every session
// ships its child sheet (product law — a session without its printable is not
// finished). These blocks compose the A4 sheet the same way the session blocks
// compose the runner — typed data, one renderer each — so the drafting
// pipeline emits a sheet with every session and the print surface walks it.
//
// The register is acquaintance, never assessment: the sheet meets, names, and
// notices; it never counts, scores, or tests. Child-facing sheet text is held
// to that bar by scripts/register-lint.mjs. No child PII lives here — the
// name line is a blank a child fills in by hand, never a stored field.
// ---------------------------------------------------------------------------

/**
 * The sheet's masthead: the session's own title plus an auto-composed place
 * line ("at {school}"). `place` is optional so a cold-URL demo sheet renders
 * with a neutral place; with auth, the class's school name fills it. `nameLine`
 * is the "made by ___" ownership prompt (the child writes their own name).
 */
export const sheetTitleSchema = z
  .object({
    type: z.literal("sheet-title"),
    title: z.string().min(1),
    place: z.string().min(1).optional(),
    nameLine: z.string().min(1),
    ...blockBase,
  })
  .strict();

/**
 * The make-space: a bordered zone the collage happens on. The sheet is the
 * activity, not a worksheet about it. `hint` is the child-facing invitation,
 * and it is OPTIONAL: the zone is a real space whether or not anyone has
 * written words above it, and a generated stand-in over a child's make-space
 * is worse than no words at all. Absent, the renderer draws the bordered
 * space and no label, rather than a labelled blank. Write a hint when there
 * is a hint worth writing.
 */
export const collageZoneSchema = z
  .object({
    type: z.literal("collage-zone"),
    hint: z.string().min(1).optional(),
    ...blockBase,
  })
  .strict();

/** One card in a match strip: a tree/species with a kid-recognizable clue. */
const matchCardSchema = z
  .object({
    name: z.string().min(1),
    clue: z.string().min(1),
  })
  .strict();

export type MatchCard = z.infer<typeof matchCardSchema>;

/**
 * The match strip: "whose leaf is this?" — meet the grounds' trees. Each card
 * is a species with one clue line; the child matches, ticks by hand. Acquaintance,
 * not tally. Two to four cards keep it a strip, not a checklist.
 */
export const matchStripSchema = z
  .object({
    type: z.literal("match-strip"),
    prompt: z.string().min(1),
    cards: z.array(matchCardSchema).min(2).max(4),
    ...blockBase,
  })
  .strict();

/** A single noticing prompt with a write-line: what you noticed outside today. */
export const noticeLineSchema = z
  .object({ type: z.literal("notice-line"), prompt: z.string().min(1), ...blockBase })
  .strict();

/**
 * The book-bag channel made explicit: one quiet line to the parent about what
 * happened. `url` is optional and unset in every shipped pack: no pack may
 * name a domain we do not control, because a sheet that goes home in a book
 * bag is a promise a parent acts on. Set it only when Nature Class has a real
 * home to send a parent to; absent, the sheet renders the line on its own.
 */
export const parentLineSchema = z
  .object({
    type: z.literal("parent-line"),
    text: z.string().min(1),
    url: z.string().min(1).optional(),
    ...blockBase,
  })
  .strict();

/**
 * Runner blocks: the kinds that render on / and /run, one renderer each in
 * engine/registry.tsx. A phase holds only these. `Block` is the runner union;
 * the name is kept for the surfaces and lints that already speak it.
 */
export const blockSchema = z.discriminatedUnion("type", [
  sayAloudSchema,
  teacherNoteSchema,
  demoSchema,
  conditionsLineSchema,
  circleQuestionSchema,
  namedSkillSchema,
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

// ---------------------------------------------------------------------------
// Phase (recursive: conditionVariants carry whole alternate phases)
// ---------------------------------------------------------------------------

/**
 * One situational rescue tip for the phase — the runner's "Stuck?" whisper.
 * `when` names the moment ("Someone doesn't want to touch the bark"),
 * `then` is the move that usually works. Teacher-facing, pre-authored in
 * the pack: whispers are scripted contingencies, never live AI.
 */
const phaseTipSchema = z
  .object({ nid: nodeIdSchema.optional(), when: z.string().min(1), then: z.string().min(1) })
  .strict();

export type PhaseTip = z.infer<typeof phaseTipSchema>;

export interface ConditionVariant {
  nid?: string;
  when: ConditionKind;
  phase: Phase;
}

export interface Phase {
  /** Plain author context for composition; never a spoken instruction. */
  authorNotes?: string;
  key: string;
  /** Stable node id. See NODE_ID_PATTERN. Absent means unminted. */
  nid?: string;
  title: string;
  /**
   * Optional authored delivery mode. Legacy packs omit it and the runtime
   * compatibility adapter derives a neutral Present → Work → Gather flow from
   * phase position and block kinds without changing the phase itself.
   */
  mode?: TeachingMode;
  /**
   * Authored override: withhold the field-media strip on this phase (#403).
   * See `MaterialPurpose` above. Absent means the runner's existing
   * behaviour — the topic-matched reference set may show.
   */
  materialPurpose?: MaterialPurpose;
  /**
   * The one durable instruction shown while children are doing real work.
   * Authored only for `work` phases: it is not generated, inferred from a
   * topic tag or rewritten by the runner. Legacy phases omit it and keep
   * their current page-by-page rendering.
   */
  childTask?: string;
  /**
   * How long this phase is meant to run. OPTIONAL, because for most sessions
   * nobody ever decided. The source database carries a `durationHint` on some
   * steps and null on the rest, and the first port filled the nulls by
   * dividing the session total evenly between the phases. That produced a
   * Minibeast Hunting whose "Explore" phase was stamped 5 min above its own
   * say-aloud line, "give children 10 minutes to explore" — a number arguing
   * with the words beside it on a teacher's page.
   *
   * Absent means absent. The renderers omit the minute badge rather than
   * print a guess, and the session's own `durationMin` — which IS authored,
   * and is the number a teacher plans around — carries the timing.
   */
  durationMin?: number;
  /**
   * ONE LINE FOR THE OLDER CHILDREN IN THE GROUP (#466).
   *
   * The sessions are written for ages 4-6, and that is a hard ceiling with
   * nothing above it. Every non-classroom facilitator in the #454 panel runs
   * mixed ages against it: a home-ed parent with children of 4, 7 and 10 said
   * the four-year-old was the target and it landed, and the ten-year-old was
   * bored in ninety seconds; a camp lead will not gamble a ninety-minute block
   * on whether her tens roll their eyes; a Brownie unit of 7-9s sits two years
   * above the ceiling. One line per stage is what they asked for, and it is a
   * stage-sized ask: not a second curriculum, not an age-graded fork of the
   * pack, one sentence a facilitator can reach for when the stage is running
   * under its ceiling.
   *
   * It is OPTIONAL and it is EMPTY everywhere today, on purpose. The mechanism
   * is agent work; the words are not. These are teaching prompts in Johan's own
   * register, and the packs are guarded by scripts/verbatim-fidelity.mjs
   * precisely because agent-tidied copy has been reverted here three times.
   * Absent is therefore not a gap to be filled by anything that can generate a
   * sentence — it is the honest state of a stage nobody has written the line
   * for yet, and it renders as nothing at all rather than as a hint that
   * something is missing.
   *
   * Rendered as a TEACHER NOTE, in the existing teacher-note treatment, at the
   * head of the stage (lib/lesson/stretch.ts). It is not spoken, it is not
   * narrated into the preview deck, and it never reaches a child except
   * through the adult who decides to use it.
   */
  stretch?: string;
  /**
   * The pictures this phase's moment shows (#1078). Anchored to the phase, so
   * they appear on one screen rather than under every screen in the session —
   * the failure #1019 fixed for the species strip and that a hardcoded
   * component walked straight back in.
   *
   * WHICH moment is decided by the purpose, in `lib/lesson/pictures.ts`: a
   * `how-to` goes with the demonstration, because that is what it is; the
   * others go on the phase's first moment.
   */
  pictures?: LessonPictures;
  blocks: Block[];
  tips?: PhaseTip[];
  conditionVariants?: ConditionVariant[];
}

export const phaseSchema: z.ZodType<Phase> = z.lazy(() =>
  z
    .object({
      key: z.string().min(1),
      authorNotes: z.string().optional(),
      nid: nodeIdSchema.optional(),
      title: z.string().min(1),
      mode: teachingModeSchema.optional(),
      materialPurpose: materialPurposeSchema.optional(),
      pictures: lessonPicturesSchema.optional(),
      childTask: z.string().min(1).optional(),
      durationMin: z.number().positive().optional(),
      // A line, not a placeholder: whitespace would render an empty note
      // above the stage's first words, which reads as a rendering fault.
      stretch: z
        .string()
        .min(1)
        .refine((line) => line.trim().length > 0, {
          message: "stretch must be a line, not blank space",
        })
        .optional(),
      blocks: z.array(blockSchema).min(1),
      tips: z.array(phaseTipSchema).optional(),
      conditionVariants: z
        .array(
          z
            .object({
              nid: nodeIdSchema.optional(),
              when: z.enum(conditionKinds),
              phase: phaseSchema,
            })
            .strict()
        )
        .optional(),
    })
    .strict()
    .superRefine((phase, ctx) => {
      if (phase.childTask && phase.mode !== "work") {
        ctx.addIssue({
          code: "custom",
          path: ["childTask"],
          message: "childTask is only valid on a work phase",
        });
      }
      /**
       * MOVE A LINE, NEVER COPY IT.
       *
       * The stretch a stage needs is often already in the stage — the
       * alive-or-not-alive beat that a seven-year-old turns into an argument
       * about whether a seed is alive, the whole-grounds count a ten-year-old
       * turns into an estimation problem. Naming one of those as the stretch
       * is a legitimate way to author this field and needs no new words. But
       * the stretch note renders IN ADDITION to the phase's own blocks, so a
       * line left in `blocks` and also copied into `stretch` appears twice on
       * the same screen. Fail at authoring time rather than on a playground.
       */
      /**
       * NOT ON THE SETTLING RITUAL. The settle is the one phase the runners do
       * not read as blocks: it renders as paired cards, a spoken line with the
       * note that follows it riding along (HybridJourney's `settleCards`), so a
       * note with no line in front of it is dropped on the floor. A stretch
       * line authored here would validate, ship, and never reach a screen —
       * the quiet kind of wrong. Fail loud instead and send it to a teaching
       * stage, which is where a "for the older ones" line belongs anyway.
       */
      if (phase.stretch && phase.key === "settle") {
        ctx.addIssue({
          code: "custom",
          path: ["stretch"],
          message:
            "the settling ritual renders as paired cards, so a stretch line here would never reach a screen; author it on a teaching stage",
        });
      }
      if (phase.stretch) {
        const repeated = phase.blocks.some(
          (block) =>
            (block.type === "teacher-note" || block.type === "say-aloud") &&
            block.text === phase.stretch
        );
        if (repeated) {
          ctx.addIssue({
            code: "custom",
            path: ["stretch"],
            message:
              "stretch repeats a line this phase already carries; move the line out of blocks rather than copying it, or the teacher sees it twice",
          });
        }
      }
    })
);

// ---------------------------------------------------------------------------
// Session and Pack
// ---------------------------------------------------------------------------

/**
 * The child sheet: an ordered list of child-sheet blocks the print surface
 * lands on one A4 page. One sheet per session (product law: every session
 * ships its sheet). It is the same block model as a phase — typed blocks,
 * one renderer each — just held at the session level, since a sheet belongs
 * to a session, not a phase. The union is refined here so only sheet blocks
 * (never runner blocks) can sit on the sheet.
 */
const childSheetBlockSchema = z.discriminatedUnion("type", [
  sheetTitleSchema,
  collageZoneSchema,
  matchStripSchema,
  noticeLineSchema,
  parentLineSchema,
]);

export type ChildSheetBlock = z.infer<typeof childSheetBlockSchema>;

/**
 * The sheet templates: named presets that decide the sheet's GEOMETRY and the
 * arrangement of its blocks, never its data or its copy rules. The blocks, the
 * renderers, the place-fill and the register lint stay shared across all of
 * them — a template only picks how the paper is laid out.
 *
 *   animal-mask a full-size cutting pattern followed by the reflection sheet.
 *   field-card  one A4, single column. The make-on-the-sheet session: collage,
 *               rubbing, pressing. This is the universal default.
 *   field-book  one A4 imposed into an 8-panel fold, a pocket book carried
 *               outside. Named but not yet built: the fold imposition needs its
 *               own print-CSS spike, so it degrades to field-card until then.
 *   keepsake    one A4 duplex, doing on the front and the take-home on the
 *               back. A fast-follow, not a launch requirement.
 *
 * Naming a template that has no layout yet is safe by design: the resolver
 * falls back to field-card rather than failing, so a pack can be authored
 * ahead of the geometry landing (engine/sheet-templates).
 */
/**
 * THE STANDARDS SYSTEMS WE CAN CITE (#464).
 *
 * Two, and they are NOT two dialects of one thing. England has a national
 * statutory programme of study AND a half-term grid, so a session can name a
 * real slot a teacher recognises. The United States has neither: NGSS is
 * adopted by some states and not others, and scope-and-sequence is a district
 * decision. There is no American "Spring 2", and inventing one to make the two
 * sides look symmetrical would be a claim no teacher could check.
 *
 * So they are separate systems with separate shapes, authored independently
 * against their own published sources. Never derived from each other.
 */
export const standardsSystems = ["england", "ngss"] as const;
export type StandardsSystem = (typeof standardsSystems)[number];

/** What each system is called on screen. A teacher reads the name, not the slug. */
export const standardsSystemNames: Record<StandardsSystem, string> = {
  england: "National curriculum, England",
  ngss: "NGSS",
};

/**
 * ONE CITATION: what this session lets a class meet, in the jurisdiction's own
 * words (#464, and the session half of bioregion dimension 25's two-way
 * standards map — `learner.standards` is the other half and holds what a class
 * MUST meet).
 *
 * This exists because the crosswalk was the teacher's homework, and that
 * homework is what her head's approval waits on. Both teacher personas in #454
 * stopped at the same missing thing; Dana's words were "if they'd just print
 * those seven characters I'd have signoff by Friday".
 *
 * IT IS FREE, ON PURPOSE (Johan, 2026-08-27). It is the line that lets a
 * teacher justify the free sessions to her head, so gating it would make the
 * free core decorative. Reasoning is in the private ledger; do not re-open it
 * here.
 */
const sessionStandardSchema = z
  .object({
    system: z.enum(standardsSystems),
    /**
     * The jurisdiction's own reference, exactly as IT publishes it. Data,
     * never generated: a reference we composed ourselves is a citation to a
     * thing that does not exist.
     *
     * THE TWO SYSTEMS DO NOT PUBLISH THE SAME KIND OF THING, and this field
     * does not pretend otherwise. NGSS publishes real codes — "K-LS1-1" is
     * Dana's seven characters. **England publishes none.** The statutory
     * programme of study is organised by year and subheading and carries no
     * per-objective code anywhere in it; codes of the "Sc2/2.1a" shape come
     * from commercial schemes that number the statute themselves, and are not
     * the government's. Printing one as though it were statutory would be a
     * fabricated citation dressed as an official one.
     *
     * So England's reference is its own real addressable unit — the year and
     * the statutory subheading, "Year 2 · Living things and their habitats" —
     * and nothing here invents a code to make the two systems look alike.
     */
    code: z.string().min(1),
    /**
     * The published objective, carried VERBATIM. Verbatim so that a wrong
     * mapping shows up as a visible mismatch against the lesson rather than
     * hiding behind a paraphrase that flatters it.
     *
     * This is Crown wording (England) or NGSS wording (US) that we are
     * QUOTING. It is the reason this whole field is held out of the
     * localization word map — see SKIP_SUBTREES in lib/localization.ts.
     * Americanising "recognise" inside a quoted English statutory objective
     * produces a citation that does not exist.
     */
    text: z.string().min(1),
    /**
     * ENGLAND ONLY, and optional even there: the half-term slot a teacher
     * recognises from her own planning file — "Year 2 · Spring 2 · Our Local
     * Environment".
     *
     * This is the field that turns "defensible" into "this is my March
     * lesson", which is a far cheaper decision for her to make. It is the
     * COMMON slot — the shape shared across the schemes most schools' maps
     * derive from — not any one school's private map. A specific school's own
     * unit names are a bespoke mapping and do not belong in an open pack.
     *
     * Absent means absent: a session with no slot worked out says nothing
     * rather than guessing a term.
     */
    slot: z.string().min(1).optional(),
  })
  .strict();

export type SessionStandard = z.infer<typeof sessionStandardSchema>;

export const sheetTemplateIds = ["field-card", "field-book", "keepsake", "animal-mask", "seed-study", "leaf-sequence", "maths-record", "bark-study", "bird-watch", "seed-bomb-plan", "flower-study", "paint-palette", "feeder-watch", "life-survey", "minibeast-study", "tree-study", "a5-collage", "winter-sort", "life-sort", "micro-habitat-study", "habitat-needs", "food-chain"] as const;
export type SheetTemplateId = (typeof sheetTemplateIds)[number];

/**
 * The celebration: the warm close the old prototype ended on and this build
 * had lost. One class-facing headline naming what the class just did ("You
 * just planted wildflowers for pollinators"), with an optional small accent
 * emoji, an optional keepsake (the specific, poetic line a teacher screenshots)
 * and an optional tease for the week ahead. Shown as its own moment at the
 * finish, after the circle. Optional — a session without one still finishes
 * warmly on the minutes-outside line.
 */
export const celebrationSchema = z
  .object({
    headline: z.string().min(1),
    emoji: z.string().min(1).optional(),
    keepsake: z.string().min(1).optional(),
    nextWeekTease: z.string().min(1).optional(),
  })
  .strict();

export type Celebration = z.infer<typeof celebrationSchema>;

/** One glossary entry in the primer: the plain meaning, and how to say it to a child. */
export const primerTermSchema = z
  .object({
    term: z.string().min(1),
    definition: z.string().min(1),
    forChildren: z.string().min(1).optional(),
  })
  .strict();

export type PrimerTerm = z.infer<typeof primerTermSchema>;

/**
 * The teacher primer: the pre-reading depth behind /read. A short summary of
 * the concept, why it matters, key words explained simply, and ready-made
 * child-friendly phrasings. Teacher-facing only; nothing here reaches a
 * child surface directly.
 */
export const primerSchema = z
  .object({
    summary: z.string().min(1),
    why: z.string().min(1).optional(),
    glossary: z.array(primerTermSchema).optional(),
    childFriendlyExamples: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type Primer = z.infer<typeof primerSchema>;

/**
 * Where a session is TRUE, and therefore where it may be put in front of a
 * class (#206, office#330 wave 1).
 *
 * "Why leaves change" must not ship to Miami. Not because it is a weak lesson
 * — it is a good one — but because the thing it teaches does not happen there,
 * and a lesson that asks children to go and look at something absent teaches
 * them that looking does not work. September is London's wind-down and
 * Arizona's alive month, and that inversion is the whole design problem.
 *
 * THREE FLAGS, AND THEY ARE NOT INTERCHANGEABLE:
 *
 *   universal        this lesson is true anywhere. Counting what is alive, or
 *                    making a rubbing of bark, holds in a desert and in a
 *                    rainforest. Claim it only when it is genuinely true;
 *                    `universal` is not the default and is not a shortcut past
 *                    thinking about the other two.
 *   requiresSeason   named seasons the pack must HAVE. A lexical claim about a
 *                    pack's own season ontology, and a weak one on purpose: a
 *                    pack with a fifth season, or one that never named autumn,
 *                    fails it correctly.
 *   requiresDriver   phenology events the place must actually HAVE — leaves
 *                    falling, a monsoon greening up, a sowing window opening.
 *                    The stronger claim, and usually the right one: "why leaves
 *                    change" is not a claim about the word September, it is a
 *                    claim that leaves fall here.
 *
 * A session may state several of each. Within a flag they are ALTERNATIVES —
 * any one satisfied is enough — because a lesson that works in either the wet
 * season or the monsoon works in a pack that has either.
 *
 * Optional, and an absent block means UNDETERMINED rather than universal. That
 * distinction is the point: a lesson nobody has judged yet is not thereby
 * judged safe for everywhere. The resolver ships it (there is no evidence
 * against it) and says so, rather than quietly promoting it.
 */
export const validitySchema = z
  .object({
    universal: z.boolean().optional(),
    requiresSeason: z.array(z.string().min(1)).optional(),
    requiresDriver: z.array(z.string().min(1)).optional(),
    /**
     * Countries this session is true in, as ISO 3166-1 alpha-2 codes ("GB").
     * Johan, 2026-09-08, on the conker and acorn maths trail: "mark it UK only
     * for now we need this filter anyways". Horse chestnuts are a European
     * park tree; a class in the US would find one pile of the two. Judged
     * against the country the class's coordinates resolve to; an unknown
     * country admits, the same rule as an empty season slot.
     */
    requiresCountry: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  })
  .strict();

export type Validity = z.infer<typeof validitySchema>;

export const sessionSchema = z
  .object({
    id: z.string().min(1),
    /** Author intent and adaptation notes, kept with the source revision. */
    authorNotes: z.string().optional(),
    title: z.string().min(1),
    /**
     * The driving question a teacher asks: "What's living in our grounds?"
     *
     * It is the line the old prototype showed under each lesson title on the
     * season list, and it is what makes a teacher pick this session over the
     * next one — the title names the activity, the prompt says what the class
     * is actually going out to find. The first summer port dropped it: every
     * source row carried one and it reached no field in the pack (#130).
     *
     * NOT ALWAYS A QUESTION, and it is not normalised into one. Two of the
     * four summer prompts are statements ("Minibeast hunting.", "Create art
     * with nature.") and they ship exactly as written, full stops and all.
     * Carry it verbatim — no trimming, no punctuation, no improving. That
     * judgement belongs to whoever wrote the session, and taking it was the
     * bug (scripts/verbatim-fidelity.mjs now holds this shut).
     *
     * Optional because the packs that predate the field still parse.
     */
    prompt: z.string().min(1).optional(),
    /**
     * THE DOOR QUESTION (#324): the one thing the class is asked before they
     * go out, authored with the lesson.
     *
     * Sophia's finding on the introduce-today sheet, and the good idea on it:
     * *"The question at the bottom of the page does not change across the
     * three signal levels. Only the evidence above it does."* It can be
     * unchanging because it points at what is in front of the class rather
     * than at what we know — "of the trees you can see from here, which one is
     * doing the most for us right now?" is answerable by thirty children in a
     * playground with no data behind it at all.
     *
     * SO IT IS NOT THE MODEL'S JOB, and it is not the signal's. A question
     * with a stake is a teaching decision, made once, by whoever wrote the
     * lesson. The model's job on this page is the joining sentence over the
     * evidence, where the numbers and names are given to it.
     *
     * Distinct from `prompt`, which is the driving question of the WHOLE
     * lesson and is often the same sentence — where a session authors no door
     * question, the surface falls back to `prompt` when `prompt` is already a
     * question, and shows nothing when it is not. Nine of the forty-eight
     * shipped sessions carry a statement there ("Minibeast hunting.", "Create
     * art with nature."), and reading one of those aloud as a door question is
     * the same shape of failure this ticket exists to fix.
     */
    doorQuestion: z.string().min(1).optional(),
    /**
     * THE INTRODUCTION'S QUESTIONS, IN ORDER (#1004). Johan: one or two
     * questions the class answers out loud, on the board, before going out.
     * The whole ordered list, leading with the door question above so the
     * phone's single-question surfaces and the board agree on what is asked
     * first. Capped at two by review, not by schema. Where absent, the
     * introduction asks `doorQuestion` alone. House copy, held to the house
     * voice like `doorQuestion` (`introduce-today-door-line.spec.ts`).
     */
    doorQuestions: z.array(doorQuestionSchema).min(1).optional(),
    /**
     * THE PICTURES ON THE LESSON'S OPENING SCREEN (#1078).
     *
     * A third named anchor, not a session-wide bucket. `IntroduceTopic` is
     * before every phase and before every door question, so it has no phase
     * to key off — and "the opening screen" is a real, single place, which is
     * the whole difference between this and the arrangement it replaces.
     * Seed searchers shows its three seed photographs here and nowhere else.
     */
    openingPictures: lessonPicturesSchema.optional(),
    /**
     * THE FIRST THING THE CLASS READS (#1004, second pass). One child-facing
     * sentence under the title on the introduction's topic screen: what today
     * is about ("Today we are going to talk about minibeasts"). House copy,
     * authored per lesson; the app never composes it from a topic tag,
     * because that would be the app writing speech.
     */
    topicLine: z.string().min(1).optional(),
    /**
     * HOW THIS TOPIC SITS IN THIS TIME OF YEAR (Johan, 2026-09-06: "HOW does
     * today's topic relate to this day / time / season / weather of the
     * year"). Always shown on the day screen, true for the whole window the
     * lesson is taught in; the weather-specific `conditionNotes` speak on top
     * of it when the day earns them. Two registers, both authored whole.
     */
    seasonNote: z
      .object({
        teacher: z.string().min(1),
        child: z.string().min(1),
      })
      .strict()
      .optional(),
    topic: z.string().min(1),
    /**
     * The machine-readable handle the free-text topic cannot be (#161).
     * Optional: an untagged session simply gets the ungrouped card.
     * Additive metadata only, never authored prose - the verbatim guard
     * has no stake in it.
     */
    topicTags: z.array(topicTagSchema).optional(),
    /**
     * WHICH OF THE TAGS THE LESSON IS ACTUALLY ABOUT (#339).
     *
     * Johan, on a lesson called "Our Earth's magnificent trees" whose door
     * showed him a sun fly and a bumble bee: *"an apple is not a read of a
     * tree."* Both creatures were honestly recorded near the school and
     * honestly photographed. Neither is a tree.
     *
     * The cause is that `matchesTopic` is membership over ALL of a session's
     * tags, so `["minibeasts", "trees"]` scores an insect and an oak
     * identically and the order inside the cast is the resolver's own
     * findability order. Tag ORDER is read nowhere, which is why this is an
     * explicit field: making position load-bearing now would be an implicit
     * rule that costs somebody an afternoon in six months.
     *
     * A SINGLE-TAG SESSION NEEDS NO AUTHORING. One tag is unambiguously the
     * primary one, and the reader derives it. This field exists for the
     * sessions that legitimately carry two, where only the author knows which
     * one the door should stand on.
     *
     * ABSENT MEANS TODAY'S BEHAVIOUR, EXACTLY. No filtering, findability
     * order, nothing regresses while the packs fill in. Read by the
     * introduce-today door only (`lib/lesson/door.ts`); `matchesTopic` is
     * untouched for every other caller, which is the reason this was preferred
     * over turning that function into a score.
     *
     * Additive metadata, never authored prose. Must be one of this session's
     * own `topicTags`, which `scripts/validate-packs.mjs` enforces.
     */
    primaryTopic: topicTagSchema.optional(),
    /** One or two subject labels, shown on the season shelf. See `lessonLabels`. */
    labels: z
      .array(lessonLabelSchema)
      .min(1)
      .max(2)
      .refine((labels) => new Set(labels).size === labels.length, {
        message: "labels must not repeat",
      })
      .optional(),
    /**
     * Where this session is true. Additive metadata about the lesson, never
     * authored prose — the verbatim guard has no stake in it, exactly like
     * `topicTags`. Absent means nobody has judged this session yet.
     */
    validity: validitySchema.optional(),
    objective: z.string().min(1),
    /**
     * One authored account of the children's actual work. Plan owns this
     * sentence; it must not be guessed from an objective or a printable.
     * Older sessions may omit it and keep the explicit fallback path.
     */
    childWorkSummary: z.string().min(1).optional(),
    namedSkill: z.string().min(1),
    kit: z.array(z.string().min(1)),
    durationMin: z.number().positive(),
    /** How to get ready before the class arrives. Shown on /read and /session. */
    preparation: z.string().min(1).optional(),
    /**
     * THE HINGE (#323): one authored line, shown only on the days this lesson
     * and the weather actually meet.
     *
     * Sophia, drawing the home screen: this is *"the only element on the sheet
     * that makes the app look like it read the day rather than fetched it"*.
     * It cannot invent, because the sentence is written here, by whoever wrote
     * the lesson. The app's whole job is deciding whether the condition is met
     * today, and saying the line or staying silent.
     *
     * IT WAS ALREADY BEING WRITTEN, in the wrong place. Several sessions carry
     * an if-clause inside `preparation`: *"Nothing to bring. If it has rained,
     * bark is darker and smells stronger: even better."* A teacher reading that
     * has to resolve the condition herself, on a page she reads the night
     * before, about weather that has not happened yet. The app knows whether it
     * rained. So the condition gets to be explicit and machine-readable, and
     * the consequence gets to be stated rather than hedged.
     *
     * `preparation` is NOT edited when this is added. Those strings are the
     * author's own and the fidelity guard holds them shut; this field is
     * authored beside them, not carved out of them.
     *
     * THE VOCABULARY IS THE ONE THAT ALREADY EXISTS. `when` uses
     * `conditionKinds`, the same words a phase's `conditionVariants` use, and
     * resolves through the same bridge (`presentConditions` in
     * lib/outside/bucket.ts) from the same Pointmoon read. A third conditions
     * vocabulary is exactly the debt #291 is already carrying two of.
     *
     * A mild day maps to no kind at all, so an ordinary Tuesday is silent by
     * construction. That silence is the feature: a line that fires every day
     * has no register left for the day it matters.
     */
    conditionNotes: z
      .array(
        z
          .object({
            /** Any one of these true of today's read shows the note. */
            when: z.array(z.enum(conditionKinds)).min(1),
            /**
             * TWO REGISTERS, BOTH WHOLE SENTENCES (#1007). `teacher` is read
             * at home and on the Today card: what the day does to this
             * lesson's living subject and what to do with it. `child` is said
             * to the class on the introduction's day screen, in the
             * acquaintance register, and is optional only while content
             * catches up. Neither is a fragment the app completes: an app that
             * supplies the lead-in is an app that can get the lead-in wrong,
             * and these lines' entire claim to honesty is that a person wrote
             * all of them. The selector picks the first note whose `when`
             * meets the day; it never writes.
             */
            teacher: z.string().min(1),
            child: z.string().min(1).optional(),
          })
          .strict()
      )
      .min(1)
      .optional(),
    /**
     * A reviewed alternative when the lesson's listed natural material is not
     * safely available. Kept separate from setup so the UI and a future
     * preparation assistant never invent or conceal this decision.
     */
    materialFallback: z.string().min(1).optional(),
    /** What kind of outdoor space the session wants. Shown on /read and /session. */
    spaceNeeded: z.string().min(1).optional(),
    /**
     * Per-pack-key rewrites of `spaceNeeded` (#207). The same seam as a block's
     * habitatVariants and for the same reason: "Soil, a log, a bush or a tree"
     * is a list of places a teacher is asked to go and find, and in an arid
     * schoolyard two of the four are not there. This is the field a teacher
     * reads BEFORE deciding to run the lesson, so getting it wrong wastes their
     * preparation rather than their lesson.
     */
    spaceNeededVariants: habitatVariantsSchema.optional(),
    /** One line bridging from the previous session, for week-to-week continuity. */
    connectionToLast: z.string().min(1).optional(),
    /**
     * True when this session opens with THE settling — the one shared ritual
     * in `packs/settle.json`, prepended as phase one by `loadPack`.
     *
     * A flag rather than five authored cards per session, and that is the
     * content decision, not a convenience. The settling is a ritual a class
     * repeats every week, and a ritual whose words move every week is not one:
     * a five year old learns it by week two only if it is the same five lines
     * in the same order. It also never names the lesson, which is what keeps
     * it a settling rather than an early introduction — the topic is the next
     * beat, on its own screen.
     *
     * So there is one settling, held to one bar, edited in one file, and a
     * session opts into it here. Absent means this session opens straight on
     * its own first phase, which is what every off-shelf pack does.
     */
    settle: z.boolean().optional(),
    /** The pre-reading depth: summary, why, glossary, child-friendly phrasings. */
    primer: primerSchema.optional(),
    /**
     * THE HIGH-WATER MARK for this session's node ids (see NODE_ID_PATTERN).
     *
     * Every id minted in this session is a number at or below it, and the next
     * new node takes `nodeSeq + 1` and bumps this. That is the whole mechanism
     * that makes a node id STABLE rather than merely present: a number is only
     * ever handed out once per session, so a block that is deleted takes its id
     * out of circulation with it and nothing later can be given the same handle.
     * Without the mark, "the next free number" is whatever the current tree
     * happens not to be using, and a deleted node's id comes back attached to a
     * different sentence — with every worksheet, clip and prepared day that
     * recorded the old one now pointing, silently, at the new one.
     *
     * It is a COUNTER, not a count: it does not go down when a node is deleted,
     * and it is not the number of nodes in the session.
     *
     * Two writers bump it and they must not disagree:
     * `scripts/mint-node-ids.mjs` here, and the Studio when an author adds a
     * node to a draft. `scripts/validate-packs.mjs` fails an id above the mark,
     * which is what catches a writer that assigned without bumping.
     *
     * Optional because a pack authored outside this repo has no ids to mark.
     * Absent means unminted, and the same validation requires it of every pack
     * we ship.
     */
    nodeSeq: z.number().int().nonnegative().optional(),
    phases: z.array(phaseSchema).min(1),
    /**
     * DEFAULTS TO EMPTY, and empty means nobody has written this sheet YET.
     *
     * The product law has not moved: every session ships its sheet, and a
     * session without its printable is not finished. What changed is that an
     * unwritten sheet is now allowed to say so instead of being filled in.
     * The four summer sessions came from a database with no child sheet on
     * any row, so the sheet the first port shipped for them was generated
     * whole: one template across all four with the lesson title slotted in,
     * a make-space that could hold anything, and a line home to a parent
     * about a lesson the writer never saw. A sheet that fits any lesson
     * belongs to none of them.
     *
     * An empty list is therefore a GAP TO FILL, never a finished state. Do
     * not read this default as permission to ship a session without a sheet.
     *
     * A default rather than `.optional()` on purpose: the print surface maps
     * this list directly, so keeping the parsed type a plain array keeps every
     * reader honest without a null check at each one. `renderChildSheet`
     * returns null for an empty list, so the second A4 does not print at all
     * rather than printing bordered, folioed and blank.
     */
    childSheet: z.array(childSheetBlockSchema).default([]),
    /**
     * Which sheet template lays this session's child sheet out. Optional on
     * purpose: absent, the print surface derives one from the session's shape
     * and falls back to `field-card`, so every pack that shipped before this
     * field existed still renders, and a cold-URL demo needs no migration.
     * Authored rather than inferred when it matters — template choice is pack
     * data like everything else the app renders.
     *
     * Caught rather than thrown on a value we don't know: a mistyped template
     * name falls back to "absent" and the sheet degrades to the field card. A
     * strict enum here would fail the whole pack to parse, which takes every
     * session on that shelf down over one typo in one optional field. A plain
     * sheet is a far better failure than no sessions.
     */
    sheetTemplate: z.enum(sheetTemplateIds).optional().catch(undefined),
    /**
     * WHAT THIS SESSION LETS A CLASS MEET, in each system we can cite (#464).
     *
     * Defaults to empty, and empty means nobody has worked this session's
     * mapping out YET — not that the session meets nothing. A session may also
     * legitimately carry ONE side only: a session mapped in England with no
     * NGSS reading shows the English citation and stays silent for a US
     * teacher, rather than showing her a guess. Absent means absent.
     *
     * A default rather than `.optional()` for the same reason `childSheet` is:
     * the render surfaces map this list directly, so a plain array keeps every
     * reader honest without a null check at each one.
     */
    standards: z.array(sessionStandardSchema).default([]),
    celebration: celebrationSchema.optional(),
  })
  .strict();

export type Session = z.infer<typeof sessionSchema>;

/**
 * THE COLLECTION: an optional editorial grouping for related packs (#581).
 *
 * A label, never a licence or a lock. Open and separately licensed packs may
 * belong to the same editorial line, so availability cannot be inferred from
 * this field. Managed entitlements attach to an immutable content release in
 * the commercial manifest; the public pack schema only describes the lesson.
 *
 * `id` is the stable machine handle; `label` is what a teacher reads. Absent
 * means the pack is not grouped, not that it belongs to a particular edition.
 */
export const collectionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export type Collection = z.infer<typeof collectionSchema>;

export const packSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subject: z.string().min(1),
    ageBand: z.string().min(1),
    collection: collectionSchema.optional(),
    sessions: z.array(sessionSchema).min(1),
  })
  .strict();

export type Pack = z.infer<typeof packSchema>;

/** Parse unknown data into a validated Pack. Throws with zod detail on bad packs. */
export function parsePack(data: unknown): Pack {
  return packSchema.parse(data);
}
