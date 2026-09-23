import { z } from "zod";
import { abilityBands, NODE_ID_PATTERN } from "@/schema/pack";
import { packKeySchema } from "@/schema/bioregion";

/**
 * The adaptive-lessons record: what was prepared, from what, judged how, and
 * approved by whom (office#330 §2 and §4).
 *
 * A prepared day must be true, safe and faithful. All three are judgments, so
 * a model makes them, and nothing about the text in here is a rule, a regex,
 * an allowlist or a length. What this file fixes is not the content: it is
 * WHAT WAS WRITTEN, WHAT WAS PRODUCED FROM IT, WHO APPROVED WHICH EXACT
 * REVISION, AND WHAT DEPENDS ON WHAT. Memory, not rules.
 *
 * ── THE FIVE REVISIONS, and every one of them is addressable ───────────────
 *
 *   SOURCE      The authored lesson in the pack: base text plus author notes,
 *               per stable node id. Canonical, never mutated by adaptation,
 *               always recoverable exactly.
 *
 *   CONTEXT     The teacher's inputs for a preparation: place and its
 *               resolution, chosen ability, the weather snapshot for the hour
 *               she teaches, site profile, her notes. Advances whenever any of
 *               them changes.
 *
 *   PROPOSAL    A composed day, or a set of proposed changes, produced by a
 *               model from a named source revision and a named context
 *               revision. Not yet judged.
 *
 *   JUDGED      A proposal the judge has answered on: true, safe, faithful,
 *               with reasons. A judge answer names the exact proposal revision
 *               it saw.
 *
 *   ACCEPTED    The exact judged revision a teacher (for a prepared day) or an
 *               author (for a source change) approved. Acceptance and the
 *               judge's answer refer to the same saved content, always.
 *
 * That last sentence is the whole reason these are five separate fields rather
 * than a status column. Acceptance is atomic: it verifies in ONE step that the
 * proposal revision, the context revision and the judge result all match the
 * content on screen, and fails back to review when any of them has moved. An
 * earlier judge result can never approve newer text, and a shape that cannot
 * express the mismatch cannot refuse it.
 *
 * ── TWO RULES THIS FILE ENFORCES BY SHAPE ──────────────────────────────────
 *
 * 1. NO FIELD CARRIES A GO/NO-GO VERDICT FROM UPSTREAM. A weather reading says
 *    what the sky is doing; it does not say whether to go outside. A policy
 *    threshold names a published guideline and its source; it does not pass or
 *    fail a lesson. A provenance says where a line came from; it does not say
 *    the line is good. The ONLY verdict in this file is the judge's three
 *    answers on `judgedRevision`, and the only approval is a person's on
 *    `acceptedRevision`. Anything else would be a machine's opinion wearing a
 *    reading's clothes, and the surface downstream could not tell them apart.
 *
 *    `checkedNone` and `couldNotCheck` exist for the same reason: "we looked,
 *    nothing there" and "we could not look" both render as nothing today, so a
 *    nullable string makes them the same value and a blank card reads as
 *    reassurance when nothing was checked (lib/expected-silence.ts).
 *
 * 2. JURISDICTION IS ITS OWN FIELD AND IS NEVER DERIVED FROM LOCALE. Phoenix
 *    and Sacramento share `us` and differ on every dimension that keys off a
 *    legal boundary; the year-group vocabulary offers England's words only.
 *    Deriving from either stamps every school on earth `england`. Same ruling
 *    as `learnerContext.jurisdiction` in schema/bioregion.ts, restated here
 *    because a context revision is the next place somebody would reach for a
 *    shortcut.
 *
 * ── WHAT THIS FILE IS NOT ──────────────────────────────────────────────────
 *
 * Types only. There is no composer here, no judge, no surface, no persistence
 * and no behaviour: this is the contract the rest of the slice is built
 * against, landing first so that the composer and the judge cannot each invent
 * their own shape of the same record.
 *
 * It is also NOT an extension of `PreparedFieldOverlayV1`
 * (lib/offline/prepare.ts). That lives only in the browser, one key in
 * IndexedDB, one prepared lesson per device, and its own contract states it
 * "intentionally has no slots for class, school, ability, coordinates, teacher
 * notes, child data, or raw provider payloads". Everything below is exactly
 * those things. This is the server record; a device projection of it carries
 * the subset a shared iPad may hold, and reversing that on the overlay is the
 * mistake this separation exists to prevent.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * A revision id: opaque, comparable, never parsed for meaning.
 *
 * Deliberately not a number and not a timestamp. Two writers on one counter
 * disagree, and "later" is not the question any check in this design asks —
 * every check asks "is this the SAME revision", which an opaque handle answers
 * exactly and an ordering invites you to answer approximately.
 */
export const revisionIdSchema = z.string().min(1);

/** A node id from the pack: `p1`, `b2`, `v3`, `t4`. See schema/pack.ts. */
export const nodeRefSchema = z.string().regex(NODE_ID_PATTERN, {
  message: "a node ref is a pack node id — one of p/b/v/t followed by digits",
});

/** An ISO-8601 instant. Recorded, never inferred from when a row was read. */
export const instantSchema = z.string().datetime({ offset: true });

/**
 * FREE TEXT A TEACHER TYPED, carried as data and never as instruction.
 *
 * §7: teacher free text enters context as delimited data; it can never license
 * a place, access or safety claim. So it arrives wrapped rather than bare, and
 * the wrapper is a type rather than a convention because the convention is the
 * thing that gets forgotten at the one call site that matters.
 *
 * `delimiter` is the marker the prompt builder wraps the body in, stored
 * alongside so the record says how the model was actually shown it — a
 * delimiter chosen at render time is a delimiter nobody can audit afterwards.
 * `body` is her words, verbatim, never trimmed or tidied.
 */
export const untrustedTextSchema = z
  .object({
    body: z.string(),
    delimiter: z.string().min(1),
    /** Who typed it. A role, never a name: this record is not a personnel file. */
    enteredBy: z.enum(["teacher", "author"]),
    enteredAt: instantSchema,
  })
  .strict();

export type UntrustedText = z.infer<typeof untrustedTextSchema>;

// ---------------------------------------------------------------------------
// Context revision
// ---------------------------------------------------------------------------

/**
 * WHICH ABILITY BAND, AND WHICH RULE PICKED IT.
 *
 * Ability is answered five different ways today — the stored band on print,
 * the year group on the runner, `y1` hardcoded in the field shell, `reception`
 * hardcoded in the field print — so the same class reads at two different
 * bands on two surfaces of the same lesson. `resolvedBy` is the fix's other
 * half: one resolver, and a stamp saying which link of its precedence chain
 * answered, mirroring `packKey.resolvedBy`. A band with no stamp is a band
 * nobody can trace back to a rule when it turns out wrong.
 *
 * Once a preparation exists the value is FROZEN into it. A later override
 * changes the next preparation, never the printed one.
 */
export const resolvedAbilitySchema = z
  .object({
    band: z.enum(abilityBands).nullable(),
    /** Resolver version plus the link that answered, e.g. "ability@1/class-row". */
    resolvedBy: z.string().min(1),
  })
  .strict();

export type ResolvedAbility = z.infer<typeof resolvedAbilitySchema>;

/**
 * WHAT A WEATHER READING IS OF, and therefore which day it may be shown under.
 *
 * `the-hour` and `the-season` are `ReadingReach` in lib/outside/session-day.ts
 * and mean exactly what they mean there: the hour reaches today and nothing
 * else, the season reaches a week and a region.
 *
 * `the-planned-hour` is the third one this design needs and NOTHING PRODUCES
 * YET. A preparation is made the night before, and `reaches("the-hour")`
 * correctly nulls the condition kind on any day but today — so a day prepared
 * in advance selects no condition variant at all. The forecast we do hold
 * (`weather.outlook.days[]`) is a DAILY aggregate of air temperature, and the
 * product speaks felt temperature, so a warm-up keyed on the day's minimum
 * fires on a mild afternoon after a frosty dawn. Those daily fields cannot
 * honestly produce an hour's bucket, and loosening `the-hour` to cover a
 * future day would print this morning's ground and light under Thursday's
 * name.
 *
 * So the class is declared and the field is null with a reason until Pointmoon
 * carries `outlook.hours[]`. A declared-empty slot renders as silence; an
 * undeclared one is an invitation to invent.
 */
export const weatherReachClasses = ["the-hour", "the-planned-hour", "the-season"] as const;
export type WeatherReachClass = (typeof weatherReachClasses)[number];

/**
 * The weather as it was READ, with the three facts that make a reading
 * auditable after the day it was made for has passed.
 *
 * `observedAt` is when the reading was taken, `validUntil` is when it stops
 * being a reading of anything, and `source` names who said it. Two clocks
 * rather than one flat staleness window, because a reading taken at 08:00 for
 * a lesson at 14:00 is old the moment it lands and a single "prepared 7 days
 * ago" number cannot say that.
 *
 * IT CARRIES NO VERDICT. There is no `safeToGoOut`, no `tooWindy`, no
 * `recommendIndoors`. A threshold applied here would be a machine's go/no-go
 * arriving as though it were a fact about the sky, and the surface reading it
 * could not tell the two apart. Whether the class goes out is a judgment, and
 * judgments in this record are the judge's and the teacher's alone.
 */
export const weatherSnapshotSchema = z
  .object({
    reach: z.enum(weatherReachClasses),
    /**
     * The bucket vocabulary a phase's `conditionVariants` key on (`wet`,
     * `windy`, `cold`, `hot`, `dry`, `still`, `bright`), or null.
     *
     * NULL IS A REAL ANSWER and the common one for a day prepared in advance:
     * nothing turns a daily forecast into an hour's bucket honestly, so the
     * field is absent with a reason rather than filled with the nearest thing
     * to hand. `reasonCode` says which absence it is.
     */
    conditionKind: z.string().min(1).nullable(),
    /** Why `conditionKind` is null. Null when it is not. */
    reasonCode: z.enum(["out-of-reach", "no-signal", "not-asked"]).nullable(),
    /** When the reading was taken. Not when the record was written. */
    observedAt: instantSchema.nullable(),
    /** When it stops being a reading of anything. */
    validUntil: instantSchema.nullable(),
    /** Who said it, e.g. "pointmoon@2026-09-08". Never "the weather". */
    source: z.string().min(1).nullable(),
  })
  .strict();

export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>;

/**
 * The yard's own facts, as the teacher described them.
 *
 * Mirrors `learnerContext.siteProfile` (dimension 7) rather than importing it,
 * because a context revision FREEZES what she said at the moment she prepared,
 * and the class row keeps changing underneath. A field that resolved live
 * would make a printed day disagree with the record of how it was made.
 *
 * `managedLandscapeOverride` is the sneakiest lie surface in the inventory: a
 * watered landscape makes a place behave like a wetter one, and a lesson that
 * does not know it is being watered teaches the region instead of the yard.
 */
export const contextSiteProfileSchema = z
  .object({
    grounds: z.array(z.string().min(1)).default([]),
    microclimate: z.string().min(1).nullable().default(null),
    substrate: z.string().min(1).nullable().default(null),
    managedLandscapeOverride: z.string().min(1).nullable().default(null),
  })
  .strict();

export type ContextSiteProfile = z.infer<typeof contextSiteProfileSchema>;

/**
 * THE CONTEXT REVISION: the teacher's inputs for one preparation.
 *
 * "Advances whenever any of them changes" is the contract, and it is why this
 * is one addressable object rather than a scatter of columns: acceptance
 * compares ONE id to decide whether the world moved while the judge was
 * running. A per-field comparison would let a change slip through in whichever
 * field the comparison forgot.
 */
export const contextRevisionSchema = z
  .object({
    revisionId: revisionIdSchema,
    /** Where, and which link of the resolver chain answered. */
    placeKey: packKeySchema,
    ability: resolvedAbilitySchema,
    weather: weatherSnapshotSchema,
    siteProfile: contextSiteProfileSchema.nullable(),
    /** The wall-clock hour she plans to teach, and the zone it is an hour in. */
    plannedAt: instantSchema,
    plannedTimeZone: z.string().min(1),
    /**
     * ITS OWN FIELD, NEVER DERIVED FROM LOCALE OR FROM THE YEAR-GROUP WORDS.
     * See the header. Null means nobody has said, which is not `england`.
     */
    jurisdiction: z.string().min(1).nullable(),
    /** The language the class is taught in. Not a jurisdiction and not a place. */
    locale: z.string().min(1).nullable(),
    /** Her notes, delimited. Data the composer reads, never instruction it obeys. */
    teacherNotes: z.array(untrustedTextSchema).default([]),
    capturedAt: instantSchema,
  })
  .strict();

export type ContextRevision = z.infer<typeof contextRevisionSchema>;

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * WHERE ONE LINE CAME FROM. A discriminated union, and it is a union rather
 * than a string so that a new kind cannot be added without somebody deciding
 * what it means.
 *
 * The seven kinds, and the distinctions each one exists to keep:
 *
 *   pack                 the authored line, unchanged. The base case, and the
 *                        one every other kind is measured against.
 *   pointmoon-signal     a reading of the real world, with the signal named.
 *   teacher-onboarding   something a person at the school typed. Hers, not
 *                        ours, and not a claim we made.
 *   generated-accepted   a model wrote it AND a person approved that exact
 *                        text. There is deliberately no `generated` kind: a
 *                        generated line nobody accepted has no business in a
 *                        record of what was prepared, and a single kind
 *                        covering both would make the acceptance invisible.
 *   derived              computed from other fields in this record, by a named
 *                        rule. Traceable arithmetic, not a new claim.
 *   checked-none         WE LOOKED AND THERE WAS NOTHING. The only kind that
 *                        may read as reassurance.
 *   could-not-check      we could not look, and why. Renders as nothing today,
 *                        which is exactly why it must not be the same value as
 *                        the one above: a blank card that means "we checked"
 *                        and a blank card that means "we couldn't" are the
 *                        same pixels and opposite facts.
 *
 * THE REFRESH CLASS IS NOT STORED HERE. How often a kind goes stale is derived
 * from the kind (`refreshClassOf`), so a new kind cannot be added without
 * deciding its refresh — which is precisely what storing the class beside it
 * would allow somebody to skip.
 *
 * NO KIND CARRIES A VERDICT. Not one of them says the line is true, safe or
 * good. `generated-accepted` records that a person approved the text, which is
 * a fact about a person, not a quality judgment this record is entitled to
 * make on its own.
 */
export const fieldProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pack"), sessionId: z.string().min(1), nid: nodeRefSchema }).strict(),
  z
    .object({
      kind: z.literal("pointmoon-signal"),
      /** The signal's own id, e.g. "nature.weather.temperature". */
      signalId: z.string().min(1),
      observedAt: instantSchema,
      source: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("teacher-onboarding"),
      /** Which onboarding answer. A field name, never the answer's text. */
      field: z.string().min(1),
      enteredAt: instantSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("generated-accepted"),
      /** The judged revision the accepted text belongs to. */
      judgedRevision: revisionIdSchema,
      acceptedRevision: revisionIdSchema,
      acceptedBy: z.enum(["teacher", "author"]),
      acceptedAt: instantSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("derived"),
      /** The named rule, e.g. "ability@1". Not a description of the rule. */
      rule: z.string().min(1),
      /** What it was derived FROM, so the derivation can be walked back. */
      from: z.array(nodeRefSchema).default([]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("checked-none"),
      signalId: z.string().min(1),
      checkedAt: instantSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("could-not-check"),
      signalId: z.string().min(1),
      /** Why not, in a code. A silence with no reason is indistinguishable from a bug. */
      reasonCode: z.enum(["no-signal", "out-of-reach", "not-configured", "refused"]),
    })
    .strict(),
]);

export type FieldProvenance = z.infer<typeof fieldProvenanceSchema>;

/** The seven provenance kinds, for exhaustiveness checks and for tests. */
export const fieldProvenanceKinds = [
  "pack",
  "pointmoon-signal",
  "teacher-onboarding",
  "generated-accepted",
  "derived",
  "checked-none",
  "could-not-check",
] as const;

export type FieldProvenanceKind = (typeof fieldProvenanceKinds)[number];

// ---------------------------------------------------------------------------
// The judge
// ---------------------------------------------------------------------------

/**
 * THE JUDGE'S ANSWER ON ONE PROPOSAL REVISION. Three questions, each answered
 * with a reason, and the reason is required on a pass as well as on a refusal.
 *
 *   true     no line claims what the context did not supply
 *   safe     each safety line still means what the authored one meant
 *   faithful same meaning, intent and tone as the base and the author's notes.
 *            Words may change.
 *
 * `proposalRevision` is on the answer itself, not merely alongside it, because
 * the whole point is that a judge answer NAMES THE EXACT PROPOSAL IT SAW. An
 * answer that only sits next to a proposal in the same row can be carried
 * forward onto the next one by a bug nobody sees; an answer that names its
 * subject cannot.
 */
export const judgeAnswerSchema = z
  .object({
    verdict: z.boolean(),
    /** Why, in the judge's words. Required on a yes: a bare yes explains nothing later. */
    reason: z.string().min(1),
  })
  .strict();

export type JudgeAnswer = z.infer<typeof judgeAnswerSchema>;

export const judgedRevisionSchema = z
  .object({
    revisionId: revisionIdSchema,
    /** The exact proposal this answer is OF. Never inferred from position. */
    proposalRevision: revisionIdSchema,
    sourceRevision: revisionIdSchema,
    contextRevision: revisionIdSchema,
    true: judgeAnswerSchema,
    safe: judgeAnswerSchema,
    faithful: judgeAnswerSchema,
    judgedAt: instantSchema,
    /** Which judge said it: prompt version and model, both. */
    promptVersion: z.string().min(1),
    modelVersion: z.string().min(1),
  })
  .strict();

export type JudgedRevision = z.infer<typeof judgedRevisionSchema>;

// ---------------------------------------------------------------------------
// The prepared day
// ---------------------------------------------------------------------------

/**
 * WHAT ONE NODE ENDED UP SAYING, why, and where that came from.
 *
 * `text` is the rendered line. `reason` is the composer's own account of why
 * this line rather than the authored one — the sentence the teacher reads in
 * the why-this-changed row, so it is per node and it is required. "No change
 * needed" is a real outcome and it arrives here as `pack` provenance with the
 * authored text and a reason saying so, not as an absent entry: an absence
 * would make "the composer left this alone" and "the composer never saw this"
 * the same value.
 */
export const preparedFieldSchema = z
  .object({
    text: z.string(),
    provenance: fieldProvenanceSchema,
    reason: z.string().min(1),
  })
  .strict();

export type PreparedField = z.infer<typeof preparedFieldSchema>;

/**
 * OUTCOMES AS CODES, never as prose.
 *
 * A code is retrievable and countable; a sentence is neither, and an eval over
 * free text measures the wording of the outcome rather than the outcome. The
 * prose lives in each field's `reason` where a person reads it.
 */
export const preparedOutcomeCodes = [
  "composed",
  "no-change-needed",
  "judge-refused-true",
  "judge-refused-safe",
  "judge-refused-faithful",
  "context-moved-during-judging",
  "kill-flag-set",
  "model-unavailable",
] as const;

export type PreparedOutcomeCode = (typeof preparedOutcomeCodes)[number];

/**
 * THE SERVER RECORD OF ONE PREPARED DAY.
 *
 * Five revision fields, and each is nullable exactly where the cycle says a
 * day can honestly sit without it: a preparation exists before it is composed,
 * a proposal exists before it is judged, a judged revision exists before
 * anyone accepts. What is NOT allowed is a later stage with an earlier one
 * missing, which is what makes acceptance checkable rather than hopeful.
 *
 * `sourceRevision` and `contextRevision` are recorded on the day itself, not
 * looked up when it is read. A day that renders from whatever the pack says
 * TODAY is a day that changes after it was approved, and a taught day never
 * changes.
 */
export const preparedDayV1Schema = z
  .object({
    version: z.literal(1),
    preparedId: z.string().min(1),
    sessionId: z.string().min(1),

    /** The authored lesson this was prepared from. Canonical, never mutated. */
    sourceRevision: revisionIdSchema,
    contextRevision: contextRevisionSchema,
    /** Composed but not yet judged. Null before the composer has run. */
    proposalRevision: revisionIdSchema.nullable(),
    /** Inputs bound when composing; a context edit cannot relabel an old proposal. */
    proposalInputs: z.object({
      sourceRevision: revisionIdSchema,
      contextRevision: revisionIdSchema,
    }).strict().nullable(),
    /** The judge's three answers on that exact proposal. Null before it ran. */
    judgedRevision: judgedRevisionSchema.nullable(),
    /**
     * The exact judged revision a person approved. Null until she does.
     *
     * Acceptance is atomic: it is only written when the proposal revision, the
     * context revision and the judge result all still match the content on
     * screen. An earlier judge result can never approve newer text.
     */
    acceptedRevision: revisionIdSchema.nullable(),

    /** What each node ended up saying, keyed by node id. */
    fields: z.record(nodeRefSchema, preparedFieldSchema).default({}),

    /** Which composer wrote it: prompt version and model, both, always. */
    promptVersion: z.string().min(1).nullable(),
    modelVersion: z.string().min(1).nullable(),

    /** What happened, in codes. Plural: a day can be composed AND kill-flagged. */
    outcomes: z.array(z.enum(preparedOutcomeCodes)).default([]),

    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .superRefine((day, ctx) => {
    if (Boolean(day.proposalRevision) !== Boolean(day.proposalInputs)) {
      ctx.addIssue({ code: "custom", path: ["proposalInputs"], message: "proposal and its input revisions must be recorded together" });
    }
    if (day.proposalInputs && (
      day.proposalInputs.sourceRevision !== day.sourceRevision ||
      day.proposalInputs.contextRevision !== day.contextRevision.revisionId
    )) {
      ctx.addIssue({ code: "custom", path: ["proposalInputs"], message: "proposal input revisions do not match the recorded source and context" });
    }
    if (day.judgedRevision && day.proposalInputs && (
      day.judgedRevision.sourceRevision !== day.proposalInputs.sourceRevision ||
      day.judgedRevision.contextRevision !== day.proposalInputs.contextRevision
    )) {
      ctx.addIssue({ code: "custom", path: ["judgedRevision"], message: "judge input revisions do not match the proposal" });
    }
    if (day.acceptedRevision && day.judgedRevision &&
      (!day.judgedRevision.true.verdict || !day.judgedRevision.safe.verdict || !day.judgedRevision.faithful.verdict)) {
      ctx.addIssue({ code: "custom", path: ["acceptedRevision"], message: "a refused judgment cannot be accepted" });
    }
    // A stage may be absent; a stage may not be present without the one it is
    // OF. Each of these is a state the acceptance check could not evaluate.
    if (day.judgedRevision && !day.proposalRevision) {
      ctx.addIssue({
        code: "custom",
        path: ["judgedRevision"],
        message: "a judged revision with no proposal revision: the judge answered on nothing",
      });
    }
    if (
      day.judgedRevision &&
      day.proposalRevision &&
      day.judgedRevision.proposalRevision !== day.proposalRevision
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["judgedRevision", "proposalRevision"],
        message:
          "the judge answered on a different proposal than the one recorded — an earlier " +
          "judge result cannot approve newer text",
      });
    }
    if (day.acceptedRevision && !day.judgedRevision) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptedRevision"],
        message: "an accepted revision with no judged revision: nothing was approved by anybody",
      });
    }
    if (day.acceptedRevision && day.judgedRevision && day.acceptedRevision !== day.judgedRevision.revisionId) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptedRevision"],
        message:
          "acceptance names a revision the judge did not answer on. Acceptance and the " +
          "judge's answer refer to the same saved content, always",
      });
    }
  });

export type PreparedDayV1 = z.infer<typeof preparedDayV1Schema>;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * The things that render FROM a revision, and therefore go stale when it moves.
 *
 * `core` and `print` genuinely consume the whole session, and they record all
 * of its nodes. That is honest rather than coarse: the alternative is a
 * shorter list that is wrong, and a print that failed to go stale is a teacher
 * holding a page that disagrees with her screen.
 */
export const outputKinds = [
  "runner",
  "pre-read",
  "print",
  "worksheet",
  "audio-clip",
  "lesson-overview",
  "overview-narration",
  "offline-core",
  "field-copy",
] as const;

export type OutputKind = (typeof outputKinds)[number];

/**
 * ONE OUTPUT'S DEPENDENCY, RECORDED AT NODE LEVEL.
 *
 * Lesson-level links alone would mark a whole lesson stale on every small
 * edit, which trains everybody to ignore staleness. So a worksheet records the
 * collect-count node, an audio clip records the spoken-line node, an
 * adaptation records the nodes it rewrote — and a source edit to one node
 * finds exactly the outputs and preparations that depend on it, and nothing
 * else.
 *
 * Each source pairs its node with its field because a node has more than one string on it: an
 * audio clip depends on a say-aloud's `text` and not on its `abilityVariants`,
 * and rebuilding every clip in the session because a variant was added is the
 * same over-marking one level down.
 */
/** Exact source address. Shared source dependencies remain document-level until
 * that independently owned source has stable node ids; never fabricate an id. */
export const sourceFieldRefSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("node"), sessionId: z.string().min(1), nid: nodeRefSchema, field: z.string().min(1) }).strict(),
  z.object({ scope: z.literal("session"), sessionId: z.string().min(1), field: z.string().min(1) }).strict(),
  z.object({ scope: z.literal("shared"), sourceId: z.string().min(1), field: z.string().min(1) }).strict(),
]);
export type SourceFieldRef = z.infer<typeof sourceFieldRefSchema>;
export const sourceDependencySchema = z.object({
  source: sourceFieldRefSchema,
  sourceRevision: revisionIdSchema,
}).strict();

export const outputDependencySchema = z
  .object({
    kind: z.enum(outputKinds),
    /**
     * The output's own key in its own namespace: a clip hash, a narration card
     * name, an artifact path. Opaque here on purpose — this record does not get
     * to decide how another surface names its things.
     */
    key: z.string().min(1),
    sessionId: z.string().min(1),
    /** Paired addresses avoid the accidental cross-product of nodes and fields. */
    sources: z.array(sourceDependencySchema).min(1),
    preparedId: z.string().min(1).nullable(),
    /**
     * The accepted revision it was rendered from, when it came from a prepared
     * day. Null for an output rendered straight from the authored source, which
     * is most of them today.
     */
    acceptedRevision: revisionIdSchema.nullable(),
    renderedAt: instantSchema,
  })
  .strict()
  .superRefine((output, ctx) => {
    if (Boolean(output.preparedId) !== Boolean(output.acceptedRevision)) {
      ctx.addIssue({ code: "custom", path: ["preparedId"], message: "prepared output must name both its preparation and accepted revision" });
    }
  });

export type OutputDependency = z.infer<typeof outputDependencySchema>;

// ---------------------------------------------------------------------------
// The decision ledger
// ---------------------------------------------------------------------------

/**
 * WHAT A PERSON DECIDED, AND WHY.
 *
 * "Acceptance does not assert truth; dismissal does not assert badness." A day
 * dismissed because the materials were missing says nothing about the day, and
 * a ledger that recorded only accept/reject would teach an eval the opposite.
 * That is why the reason is a required code rather than an optional note.
 */
export const decisionKinds = ["accepted", "edited", "dismissed", "withdrawn"] as const;
export type DecisionKind = (typeof decisionKinds)[number];

export const decisionReasonCodes = [
  "accepted-unchanged",
  "edited-for-this-class",
  "dismissed-materials-missing",
  "dismissed-not-right-today",
  "dismissed-prefer-authored",
  "rejected-unsupported-claim",
  "rejected-safety-line-changed",
  "withdrawn-corrected-after-teaching",
] as const;

export type DecisionReasonCode = (typeof decisionReasonCodes)[number];

/**
 * A ROLE, NEVER A NAME. Who may decide what differs — a teacher accepts a
 * prepared day, an author accepts a source change — and that difference is
 * what this field is for. Which human it was belongs to the auth layer, and
 * putting it here would make a curriculum record into a personnel one.
 */
export const actorRoles = ["teacher", "author", "admin"] as const;
export type ActorRole = (typeof actorRoles)[number];

export const decisionRecordSchema = z
  .object({
    preparedId: z.string().min(1),
    decision: z.enum(decisionKinds),
    reasonCode: z.enum(decisionReasonCodes),
    /** Her own words, when she gave any. The code is what a query reads. */
    note: untrustedTextSchema.nullable(),
    actorRole: z.enum(actorRoles),
    /** The revision she was looking at when she decided. */
    decidedRevision: revisionIdSchema,
    decidedAt: instantSchema,
    /** When it was written down, which is not always when it was decided. */
    recordedAt: instantSchema,
  })
  .strict();

export type DecisionRecord = z.infer<typeof decisionRecordSchema>;

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parsePreparedDayV1(data: unknown): PreparedDayV1 {
  return preparedDayV1Schema.parse(data);
}

export function parseOutputDependency(data: unknown): OutputDependency {
  return outputDependencySchema.parse(data);
}

export function parseDecisionRecord(data: unknown): DecisionRecord {
  return decisionRecordSchema.parse(data);
}
