import { z } from "zod";

/**
 * The bioregion declaration, wave 1: all 26 dimensions, empty.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT HOLDS NO DATA
 *
 * An undeclared slot is an invitation to invent. A declared-empty slot renders
 * as silence.
 *
 * That sentence is the whole of office#330's one structural amendment (J1,
 * adopted by Johan 2026-08-12), and it is a claim about failure modes rather
 * than about tidiness. When a surface asks this pack what the water regime is
 * near a school and the concept does not exist in the schema, the question has
 * no answer and no shape — the model downstream fills the hole, because a hole
 * is exactly what a model is for. When the concept exists and is empty, the
 * answer is "nobody has written that yet", which every honest surface in this
 * repo already knows how to render: it shows less (lib/outside, #172, #177).
 *
 * So the schema wave separates from the data wave, and this is the schema
 * wave. All 26 dimensions are declared here and every one of them is EMPTY.
 * Filling them is #209-#215 (true, then safe, then enriched), and nothing in
 * this file should be read as an invitation to start.
 *
 * THE BOUNDARY (Johan, on office#330, before the session)
 *
 * Pointmoon owns world truth keyed by PLACE. Nature Class owns pedagogy keyed
 * by LEARNER. The lesson is the intersection. So the 26 dimensions land on two
 * types, and which type a dimension lands on is a design decision recorded per
 * dimension below, not an accident of who typed it:
 *
 *   BioregionPack   what is true of this place — seasons, hazards, statutes,
 *                   what lives here, what is expected to be silent here.
 *   LearnerContext  who is being taught and under what rules — age, ability,
 *                   jurisdiction, term dates, policy numbers, language.
 *
 * Four dimensions genuinely have a half on each side (4, 9, 14, 25). They are
 * declared on both, and the registry names both paths, because collapsing them
 * onto one side is how "jurisdiction" ends up derived from "locale" — Phoenix
 * and Sacramento share `us` and differ on everything that matters.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Rejected dimensions, with the reasons on office#330: light pollution (sky
 * variability becomes a validity input instead), soil-as-axis (folds into the
 * site profile), weekend/makeup dynamics, indoor-fallback quality, and the
 * outdoor-teaching baseline (varies by school, not by region — an onboarding
 * question, not a dimension). A dimension earns a slot by varying with
 * bioregion or jurisdiction AND having something key off it. Both legs.
 */

// ---------------------------------------------------------------------------
// Dimension 1 — pack key and spatial resolution
// ---------------------------------------------------------------------------

/**
 * How coarsely this pack is keyed, and therefore what it may claim.
 *
 * J4: the polygon framework is DEFERRED and the fallback chain ships instead —
 * polygon → koppen → latitude → global. The one-way door is not the framework,
 * it is content authored per key: a paragraph written for a polygon cannot be
 * re-used at Koppen granularity, so the standing instruction is to author at
 * the COARSEST key that still changes the teaching.
 *
 * Ordered coarsest-last on purpose: the chain walks this array.
 */
export const packKeyResolutions = ["polygon", "koppen", "latitude", "global"] as const;
export type PackKeyResolution = (typeof packKeyResolutions)[number];

/**
 * The key itself, plus the stamp saying which link of the chain produced it.
 *
 * `resolvedBy` is a resolver-version string, not a boolean and not a free note.
 * It is what makes a wrong pack traceable: the live Phoenix and Miami spine
 * mislabels are this bug, and they were invisible for months because nothing
 * recorded which rule had picked the file a school was reading.
 */
export const packKeySchema = z
  .object({
    resolution: z.enum(packKeyResolutions),
    /** The key at that resolution: a polygon id, a Koppen group, a band, "global". */
    value: z.string().min(1),
    /** Resolver version stamp, e.g. "pack-key@1". Provenance, never decoration. */
    resolvedBy: z.string().min(1),
  })
  .strict();

export type PackKey = z.infer<typeof packKeySchema>;

// ---------------------------------------------------------------------------
// Dimension 3 — the silence profile, and the shape every gap in here mirrors
// ---------------------------------------------------------------------------

/**
 * One signal this pack expects to have nothing to say about, and why.
 *
 * The silence profile is the oldest honest-absence mechanism in the design and
 * the model for the rest of this file: it does not merely omit a signal, it
 * NAMES the omission and gives it a reason and a fallback. That is what turns
 * "we have no autumn colour data for Phoenix" from a hole into a statement.
 *
 * `degradeTo` is optional because sometimes the honest degrade is nothing at
 * all. Absent means render nothing, which is a decision, not a default.
 */
export const expectedSilenceSchema = z
  .object({
    signalId: z.string().min(1),
    reason: z.string().min(1),
    degradeTo: z.string().min(1).optional(),
  })
  .strict();

export type ExpectedSilence = z.infer<typeof expectedSilenceSchema>;

// ---------------------------------------------------------------------------
// The 26-dimension registry
// ---------------------------------------------------------------------------

/** Which wave fills a dimension with data. The schema for all three is wave 1. */
export const dimensionWaves = ["true", "safe", "enriched"] as const;
export type DimensionWave = (typeof dimensionWaves)[number];

/** Which side of the Pointmoon/Nature Class boundary a dimension is declared on. */
export const dimensionSides = ["pack", "learner", "both"] as const;
export type DimensionSide = (typeof dimensionSides)[number];

export interface BioregionDimension {
  /** 1-26, the numbering used on office#330 and in every ticket that cites it. */
  n: number;
  id: string;
  /** What it is, in one line a person can check the slot against. */
  name: string;
  wave: DimensionWave;
  side: DimensionSide;
  /**
   * The field path(s) that declare this dimension, relative to the pack or the
   * learner context. Prefixed `pack.` or `learner.` so a both-sided dimension
   * can name its two halves. These are read at runtime by the gap declaration
   * and asserted against the parsed empty objects by the schema guard, so a
   * slot cannot be quietly deleted from the type and left standing here.
   */
  declaredIn: readonly string[];
}

/**
 * All 26, in office#330's numbering. The numbering is load-bearing: tickets
 * #204-#215 cite dimensions by number, so a row never moves and a retired
 * dimension would be marked, not deleted.
 */
export const BIOREGION_DIMENSIONS: readonly BioregionDimension[] = [
  // --- Wave 1: TRUE -------------------------------------------------------
  {
    n: 1,
    id: "pack-key",
    name: "Pack key and spatial resolution",
    wave: "true",
    side: "pack",
    declaredIn: ["pack.key"],
  },
  {
    n: 2,
    id: "season-ontology",
    name: "Season ontology and phenology driver",
    wave: "true",
    side: "pack",
    declaredIn: ["pack.seasonOntology"],
  },
  {
    n: 3,
    id: "silence-profile",
    name: "Silence profile — signals this place has nothing to say about",
    wave: "true",
    side: "pack",
    declaredIn: ["pack.expectedSilence"],
  },
  {
    n: 4,
    id: "teachable-calendar",
    name: "Teachable calendar — phenology intersected with term dates",
    wave: "true",
    side: "both",
    declaredIn: ["pack.teachableCalendar", "learner.termDates"],
  },
  {
    n: 5,
    id: "baseline-epoch",
    name: "Pack baseline epoch and review-by date",
    wave: "true",
    side: "pack",
    declaredIn: ["pack.baselineEpoch", "pack.reviewBy"],
  },
  {
    n: 6,
    id: "age-ability",
    name: "Age and ability, as an orthogonal axis",
    wave: "true",
    side: "learner",
    declaredIn: ["learner.ageBand", "learner.abilityBand"],
  },
  {
    n: 7,
    id: "site-profile",
    name: "Site profile — grounds, microclimate, substrate, managed-landscape override",
    wave: "true",
    side: "learner",
    declaredIn: ["learner.siteProfile"],
  },

  // --- Wave 2: SAFE -------------------------------------------------------
  {
    n: 8,
    id: "hazard-vector",
    name: "Hazard vector",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.hazardVectors"],
  },
  {
    n: 9,
    id: "policy-thresholds",
    name: "Policy thresholds — the go/no-go numbers, with their published source",
    wave: "safe",
    side: "both",
    declaredIn: ["pack.thresholdSignals", "learner.policyThresholds"],
  },
  {
    n: 10,
    id: "viability-window",
    name: "Viability window",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.viabilityWindows"],
  },
  {
    n: 11,
    id: "safety-as-content",
    name: "Safety as content",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.safetyContent"],
  },
  {
    n: 12,
    id: "collection-law",
    name: "Collection and protected-species law",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.collectionLaw"],
  },
  {
    n: 13,
    id: "water-regime",
    name: "Water regime",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.waterRegime"],
  },
  {
    n: 14,
    id: "accessibility",
    name: "Accessibility and traversability",
    wave: "safe",
    side: "both",
    declaredIn: ["pack.traversability", "learner.accessibilityDuty"],
  },
  {
    n: 15,
    id: "pollen",
    name: "Pollen — signal only, never per-child health data",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.pollen"],
  },
  {
    n: 16,
    id: "observance-windows",
    name: "Observance windows — dates, never children",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.observanceWindows"],
  },
  {
    n: 17,
    id: "off-site-access",
    name: "Off-site access regime",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.offSiteAccess"],
  },
  {
    n: 18,
    id: "no-go-rate",
    name: "Expected no-go rate per month",
    wave: "safe",
    side: "pack",
    declaredIn: ["pack.expectedNoGoRate"],
  },

  // --- Wave 3: ENRICHED ---------------------------------------------------
  {
    n: 19,
    id: "source-adapters",
    name: "Source adapters, each with its licence exposure flag",
    wave: "enriched",
    side: "pack",
    declaredIn: ["pack.sourceAdapters"],
  },
  {
    n: 20,
    id: "taxon-calendars",
    name: "Taxon calendars",
    wave: "enriched",
    side: "pack",
    declaredIn: ["pack.taxonCalendars"],
  },
  {
    n: 21,
    id: "ttl-profiles",
    name: "TTL profiles",
    wave: "enriched",
    side: "pack",
    declaredIn: ["pack.ttlProfiles"],
  },
  {
    n: 22,
    id: "locale",
    name: "Locale",
    wave: "enriched",
    side: "learner",
    declaredIn: ["learner.locale"],
  },
  {
    n: 23,
    id: "cultural-content",
    name: "Cultural content",
    wave: "enriched",
    side: "pack",
    declaredIn: ["pack.culturalContent"],
  },
  {
    n: 24,
    id: "validity-flags",
    name: "Validity flags as data",
    wave: "enriched",
    side: "pack",
    declaredIn: ["pack.validityOverrides"],
  },
  {
    n: 25,
    id: "standards-map",
    name: "Two-way standards map",
    wave: "enriched",
    side: "both",
    declaredIn: ["pack.standardsBias", "learner.standards"],
  },
  {
    n: 26,
    id: "instruction-language",
    name: "Instruction language",
    wave: "enriched",
    side: "learner",
    declaredIn: ["learner.instructionLanguage"],
  },
] as const;

/** The count is asserted by the schema guard. 26 is not a coincidence, it is the inventory. */
export const BIOREGION_DIMENSION_COUNT = 26;

// ---------------------------------------------------------------------------
// BioregionPack — world truth keyed by place
// ---------------------------------------------------------------------------

/**
 * Every slot below is EMPTY BY DEFAULT and that is the point of the wave. A
 * `.default([])` here is not a convenience: it is what makes `parse({ key })`
 * produce an object carrying all 26 declarations at once, so the gap report
 * and the schema guard read the same source of truth the type does.
 *
 * Nothing here is `z.any()`. A slot whose inner shape has not been designed
 * yet is declared as an array of a NAMED minimal record rather than as an
 * escape hatch, because `any` is an undeclared slot wearing a declared slot's
 * clothes — the exact failure this wave exists to prevent.
 */

/** A named signal with a reason, the recurring shape of a declared-but-unfilled fact. */
const notedSignalSchema = z
  .object({ id: z.string().min(1), note: z.string().min(1) })
  .strict();

/** Dimension 2. `driver` is what MOVES the season — a date, a rain onset, a GDD sum. */
const seasonOntologySchema = z
  .object({
    /**
     * The season names this place actually has. NOT four by default: monsoon is
     * a fifth season with a non-calendar opener, and an empty list is the honest
     * state until someone writes this pack's seasons down. A season word that is
     * not in here has not been approved for this pack (the allowlist the AI
     * boundary needs — a model writing "autumn" for a wet/dry pack has invented
     * a season, and the proper-noun check cannot see it).
     */
    seasons: z.array(z.string().min(1)).default([]),
    /** What opens each season here: "calendar" | "rain-onset" | "gdd" | ... Null until decided. */
    driver: z.string().min(1).nullable().default(null),
    /**
     * The phenology events this place actually has — "deciduous-leaf-fall",
     * "monsoon-green-up", "sowing-window". The other half of dimension 2's
     * name, and the half a lesson's validity flags are checked against (#206):
     * "why leaves change" is not a season claim, it is a claim that leaves fall
     * here, and London and Miami disagree about that regardless of what either
     * one calls September.
     *
     * Empty in wave 1, like everything else. An empty list cannot answer, so
     * it never excludes a lesson — see lib/validity.ts.
     */
    drivers: z.array(z.string().min(1)).default([]),
  })
  .strict();

/** Dimension 4, pack half. The term-date mask is the learner half. */
const teachableWindowSchema = z
  .object({
    id: z.string().min(1),
    /** ISO date the window opens and closes, inclusive. */
    opensOn: z.string().min(1),
    closesOn: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .strict();

/** Dimension 12. A legal claim, which is why it is a Pointmoon fact and not vocabulary. */
const collectionLawSchema = z
  .object({
    taxon: z.string().min(1),
    /** "gather" | "observe-only". Rendered in Nature Class's own phrasing. */
    rule: z.string().min(1),
    /** The statute or guidance this comes from. A rule with no source does not ship. */
    source: z.string().min(1),
  })
  .strict();

/** Dimension 19. `exposure` decides whether a source may sit in a public pack file. */
const sourceAdapterSchema = z
  .object({
    id: z.string().min(1),
    /**
     * "exposable" | "grounding-only". J9: Johan declined a blanket licence rule,
     * so this is evaluated CASE BY CASE at wave 3 and every case lands on the
     * board before data ships. The flag exists so the case has somewhere to be
     * recorded; it does not decide anything on its own. A public pack file is a
     * redistribution, and this repo is AGPL under a grant.
     */
    exposure: z.string().min(1),
  })
  .strict();

export const bioregionPackSchema = z
  .object({
    // 1
    key: packKeySchema,
    // 2
    seasonOntology: seasonOntologySchema.default({ seasons: [], driver: null, drivers: [] }),
    // 3
    expectedSilence: z.array(expectedSilenceSchema).default([]),
    // 4 (pack half)
    teachableCalendar: z.array(teachableWindowSchema).default([]),
    // 5 — when this pack's baseline was taken, and when it must be looked at again.
    //     A pack with no review date is a pack that silently ages into a lie.
    baselineEpoch: z.string().min(1).nullable().default(null),
    reviewBy: z.string().min(1).nullable().default(null),
    // 8
    hazardVectors: z.array(notedSignalSchema).default([]),
    // 9 (pack half) — the SIGNALS a threshold compares against. The numbers and
    //     the go/no-go verdict live on the learner side: Pointmoon serves "heat
    //     index 41", never "too hot for school".
    thresholdSignals: z.array(notedSignalSchema).default([]),
    // 10
    viabilityWindows: z.array(teachableWindowSchema).default([]),
    // 11
    safetyContent: z.array(notedSignalSchema).default([]),
    // 12
    collectionLaw: z.array(collectionLawSchema).default([]),
    // 13 — the largest gap in the original nine. Drowning is the top-consequence
    //      risk at ages 4-6 and water appeared nowhere.
    waterRegime: notedSignalSchema.nullable().default(null),
    // 14 (pack half) — what the terrain here is like. The legal duty is learner-side.
    traversability: notedSignalSchema.nullable().default(null),
    // 15 — SIGNAL ONLY. We decline to hold per-child health data (FERPA/COPPA),
    //      so this is a place fact about the air and never a fact about a child.
    pollen: notedSignalSchema.nullable().default(null),
    // 16 — dates, never children. Ramadan x heat is a real scheduling collision;
    //      whose observance it is is not ours to record.
    observanceWindows: z.array(teachableWindowSchema).default([]),
    // 17
    offSiteAccess: notedSignalSchema.nullable().default(null),
    // 18 — indoor-fallback reframed as a market-viability number.
    expectedNoGoRate: z.array(notedSignalSchema).default([]),
    // 19
    sourceAdapters: z.array(sourceAdapterSchema).default([]),
    // 20
    taxonCalendars: z.array(notedSignalSchema).default([]),
    // 21
    ttlProfiles: z.array(notedSignalSchema).default([]),
    // 23 — J8: EXCLUDE FOR NOW. No indigenous-specific content in packs until a
    //      partnership makes permission real; non-indigenous local culture
    //      (conkers, hurricane lore) ships normally. The slot is declared so the
    //      exclusion is visible rather than merely absent.
    culturalContent: z.array(notedSignalSchema).default([]),
    // 24 — per-pack overrides of a session's authored validity flags. The flags
    //      themselves ship on Session in wave 1 (#206); this is the data half.
    validityOverrides: z.array(notedSignalSchema).default([]),
    // 25 (pack half) — where this region's own standards carry a climate bias.
    //      England's Y1 science literally requires four-season observation, which
    //      is unsatisfiable in a wet/dry pack, and that has to be representable.
    standardsBias: z.array(notedSignalSchema).default([]),
  })
  .strict();

export type BioregionPack = z.infer<typeof bioregionPackSchema>;

// ---------------------------------------------------------------------------
// LearnerContext — pedagogy keyed by learner
// ---------------------------------------------------------------------------

/** Dimension 7. One onboarding object; the grounds list already lives on Class. */
const siteProfileSchema = z
  .object({
    /** Habitat words the teacher says are actually out there. Mirrors Class.grounds. */
    grounds: z.array(z.string().min(1)).default([]),
    /** Urban heat island, shade, exposure — the yard's own climate. */
    microclimate: z.string().min(1).nullable().default(null),
    substrate: z.string().min(1).nullable().default(null),
    /**
     * The sneakiest lie surface in the whole inventory: Sacramento's worms live
     * where the sprinklers run. A managed landscape can make a place behave like
     * a wetter one, and a pack that does not know it is being watered will teach
     * the region instead of the yard.
     */
    managedLandscapeOverride: z.string().min(1).nullable().default(null),
  })
  .strict();

/** Dimension 9, learner half. J6, SIGNED: named published default + source + school override + provenance. */
const policyThresholdSchema = z
  .object({
    id: z.string().min(1),
    /** The published guideline this defaults to, named on screen. Never unsourced. */
    source: z.string().min(1),
    /** The school's own override, when it set one. Null means the default stands. */
    schoolOverride: z.string().min(1).nullable().default(null),
  })
  .strict();

/** Dimension 25, learner half. `satisfiableIn` is the state London never produces. */
const objectiveRefSchema = z
  .object({
    /** The jurisdiction's own code, e.g. an NGSS or EYFS reference. Data, never generated. */
    code: z.string().min(1),
    /** The published objective text, carried VERBATIM so a wrong mapping shows as a mismatch. */
    text: z.string().min(1),
    /**
     * Pack keys this objective can actually be met in. An empty list means
     * nobody has worked it out yet; a list that excludes this class's pack is
     * the unsatisfiable-here state, which is a real answer and must render as
     * one rather than as a quiet pass.
     */
    satisfiableIn: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const learnerContextSchema = z
  .object({
    // 4 (learner half) — J5: the teacher enters three ranges at onboarding,
    //     prefilled per jurisdiction. An event inside a holiday does not exist
    //     for Nature Class, so this mask is what makes the calendar teachable.
    termDates: z.array(teachableWindowSchema).default([]),
    // 6 — declared day one as an ORTHOGONAL axis even though the data stays 4-6.
    //     Age is not a band of ability and ability is not a proxy for age.
    ageBand: z.string().min(1).nullable().default(null),
    abilityBand: z.string().min(1).nullable().default(null),
    // 7
    siteProfile: siteProfileSchema.nullable().default(null),
    // 9 (learner half)
    policyThresholds: z.array(policyThresholdSchema).default([]),
    // 14 (learner half) — ADA in the US, the Equality Act in England. A duty,
    //     not a terrain fact, and it varies by jurisdiction rather than by biome.
    accessibilityDuty: z.string().min(1).nullable().default(null),
    // 22
    locale: z.string().min(1).nullable().default(null),
    // 25 (learner half)
    standards: z.array(objectiveRefSchema).default([]),
    // 26 — slot only. Spanish vernacular names are already in the GBIF/iNat fact
    //      fields and cost nothing; the instruction text itself is wave 3.
    instructionLanguage: z.string().min(1).nullable().default(null),

    /**
     * NOT one of the 26, and deliberately its own field.
     *
     * `jurisdiction` is never derived from `locale`. Phoenix and Sacramento
     * share `us` and differ on standards, policy and seasons — every dimension
     * that actually keys off a legal boundary. Deriving one from the other is
     * the specific mistake this field exists to make impossible.
     *
     * It lands on the Class table in #205 alongside abilityBand and sessionShape.
     */
    jurisdiction: z.string().min(1).nullable().default(null),
    /** Also not one of the 26: the shape of the hour a class can actually give. */
    sessionShape: z.string().min(1).nullable().default(null),
  })
  .strict();

export type LearnerContext = z.infer<typeof learnerContextSchema>;

// ---------------------------------------------------------------------------
// The empty declarations
// ---------------------------------------------------------------------------

/**
 * A pack with every dimension declared and none of them filled.
 *
 * Built by PARSING rather than by writing an object literal, so the slots come
 * from the schema itself. Delete a slot from `bioregionPackSchema` and it stops
 * appearing here, which is what makes the schema guard's path assertions a real
 * fixture instead of a second hand-maintained list that can drift.
 */
export function emptyBioregionPack(key: PackKey): BioregionPack {
  return bioregionPackSchema.parse({ key });
}

/** The same, for the learner side. Every slot present, every slot empty. */
export function emptyLearnerContext(): LearnerContext {
  return learnerContextSchema.parse({});
}

// ---------------------------------------------------------------------------
// The schema-gap declaration
// ---------------------------------------------------------------------------

/**
 * What a surface may conclude about a dimension.
 *
 * Three states, and the third is the one that matters:
 *
 *   filled          someone wrote this down for this place. Render it.
 *   declared-empty  the slot exists and nobody has filled it. Render SILENCE.
 *   undeclared      the concept does not exist in the schema. This is not a
 *                   data state — it is a bug, and it is the state a model
 *                   invents into. Reaching it means someone asked about a
 *                   dimension that was never declared.
 *
 * This mirrors the silence profile one level up: the silence profile names the
 * signals a PLACE has nothing to say about, and this names the dimensions the
 * SCHEMA has nothing written in yet. Same discipline, same reason.
 */
export const slotStates = ["filled", "declared-empty", "undeclared"] as const;
export type SlotState = (typeof slotStates)[number];

export interface SchemaGap {
  n: number;
  id: string;
  name: string;
  wave: DimensionWave;
  side: DimensionSide;
  state: SlotState;
  /** The paths inspected, so a report can say exactly what was read. */
  declaredIn: readonly string[];
}

/** Empty means: null, undefined, an empty array, or an object with no filled field. */
function isEmptySlot(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isEmptySlot);
  }
  if (typeof value === "string") return value.length === 0;
  return false;
}

/**
 * Resolve one `pack.foo` / `learner.foo` path. Returns the `undeclared` marker
 * rather than undefined when the path is not present at all, because "declared
 * and null" and "not declared" are the two states this whole file exists to
 * keep apart, and `undefined` cannot tell them apart.
 */
const UNDECLARED = Symbol("undeclared");

function readPath(
  path: string,
  pack: BioregionPack | null,
  learner: LearnerContext | null
): unknown | typeof UNDECLARED {
  const [root, ...rest] = path.split(".");
  let cursor: unknown =
    root === "pack" ? pack : root === "learner" ? learner : UNDECLARED;
  if (cursor === UNDECLARED) return UNDECLARED;
  // A side that was not supplied is not the same as a missing slot: asking the
  // pack about a learner dimension is a caller error, and it reads as empty
  // rather than as a schema hole.
  if (cursor === null) return null;
  for (const step of rest) {
    if (typeof cursor !== "object" || cursor === null) return UNDECLARED;
    if (!(step in (cursor as Record<string, unknown>))) return UNDECLARED;
    cursor = (cursor as Record<string, unknown>)[step];
  }
  return cursor;
}

/**
 * The state of one dimension. A both-sided dimension counts as filled when
 * EITHER half is filled: the teachable calendar with phenology but no term
 * dates is half-written, not unwritten, and a report that called it empty
 * would hide real work.
 */
export function slotState(
  dimension: BioregionDimension,
  pack: BioregionPack | null,
  learner: LearnerContext | null
): SlotState {
  const values = dimension.declaredIn.map((path) => readPath(path, pack, learner));
  if (values.some((value) => value === UNDECLARED)) return "undeclared";
  return values.some((value) => !isEmptySlot(value)) ? "filled" : "declared-empty";
}

/**
 * The whole declaration: all 26 dimensions and what each one currently holds.
 *
 * In wave 1 the honest answer for every row is `declared-empty`, and that is a
 * shipped result rather than an unfinished one. Pass whichever sides you have;
 * a missing side reads as empty, never as undeclared.
 */
export function schemaGapDeclaration(
  pack: BioregionPack | null,
  learner: LearnerContext | null
): SchemaGap[] {
  return BIOREGION_DIMENSIONS.map((dimension) => ({
    n: dimension.n,
    id: dimension.id,
    name: dimension.name,
    wave: dimension.wave,
    side: dimension.side,
    declaredIn: dimension.declaredIn,
    state: slotState(dimension, pack, learner),
  }));
}

/** Look a dimension up by its office#330 id. Unknown ids return null, loudly. */
export function findDimension(id: string): BioregionDimension | null {
  return BIOREGION_DIMENSIONS.find((dimension) => dimension.id === id) ?? null;
}
