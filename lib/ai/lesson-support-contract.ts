export const lessonSupportTasks = [
  "age",
  "hyperlocal",
  "time",
  "space",
  "materials",
  "explain",
  "simpler",
  "movement",
  "challenge",
  "child-question",
] as const;

export type LessonSupportTask = (typeof lessonSupportTasks)[number];

export interface LessonSupportDraft {
  headline: string;
  teacherNote: string;
  sayAloud: string | null;
  change: string | null;
}

/**
 * Trim, cap, and refuse markup/URLs in one model-drafted field.
 *
 * Exported so every drafter that puts a model sentence in front of a teacher
 * gets the same caps, not just the ones that happened to be written after
 * this helper existed — the plate-draft module's read-aloud composer (#244)
 * had a field of its own with a hand-rolled trim and no length cap, no
 * markup check and no URL check, the exact caps this issue asked for from
 * the start. It still runs its own `crossesSafetyBoundary` check
 * separately: that guard is about WHAT the sentence says, this one is
 * about its SHAPE, and a drafter may need one without the other.
 */
export function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  if (/[<>]/.test(text) || /https?:\/\//i.test(text)) return null;
  return text.replace(/\s*[—–]\s*/g, ", ");
}

function optionalShortText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  return shortText(value, max) ?? undefined;
}

/**
 * The field-safety deny-list, one pattern per kind of unsafe instruction.
 *
 * EXPORTED FOR ITS FIXTURES, and for nothing else (#229). Until now the only
 * coverage was seven phrases lifted from the phenology corpus, each of which
 * trips several patterns at once — so eight of the fourteen had never been
 * shown to fire on their own, and nobody could say which of them worked.
 * `tests/unit/safety-boundary-fixtures.spec.ts` holds one ISOLATING fixture per
 * entry: a sentence that matches this pattern and no other. It also asserts
 * the two sets are the same size, so a pattern added here without a fixture
 * fails the suite rather than joining the eight nobody had checked.
 *
 * Read `crossesSafetyBoundary` below for what this is and is not.
 */
export const UNSAFE_FIELD_ADVICE = [
  /\b(?:taste|lick|ingest|suck|sip)\b/i,
  /\bfree\s+(?:sweets?|snacks?|fruit)\b/i,
  /\b(?:eat|drink)\b.{0,32}\b(?:it|them|this|that|berries?|plants?|mushrooms?|water|fruit|nuts?|insides?|ones?)\b/i,
  /\b(?:swallow|consume|nibble|chew)\b/i,
  /\b(?:pop|put|place)\b.{0,24}\b(?:mouth|tongue)\b/i,
  /\b(?:\w*berr(?:y|ies)|fruit)\s+picking\b/i,
  /\bpull\b.{0,48}\b(?:flower|nectar|string|thread)\b/i,
  /\bfill\s+your\s+pockets\b/i,
  /\b(?:pick|pluck|gather)\b.{0,40}\b(?:living|fresh|berries?|mushrooms?|flowers?|fruit|ones)\b/i,
  /\b(?:touch|handle)\s+(?:an?\s+)?unknown\b/i,
  /\b(?:touch|handle|hold)\s+(?:any|unfamiliar)\b/i,
  /\bclimb\s+(?:a|the|that|this)\b/i,
  // `in(?:to)?`, not `into`: "Children may go in the water" is about as plain
  // as an unsafe instruction gets and it walked past this on the missing "to"
  // (#229 review). The named-body pattern below does not cover it either,
  // because that one is about streams and ponds, not the literal word.
  /\b(?:enter|wade in(?:to)?|go in(?:to)?)\s+(?:the\s+)?water\b/i,
  /\b(?:leave|cross)\s+(?:the\s+)?(?:safe\s+)?boundary\b/i,
  // The two bypasses the #220 audit proved, closed as their own patterns
  // rather than by widening the two above them.
  //
  // "Let them climb onto the log" walked past `climb (a|the|that|this)`
  // because a preposition sits between the verb and the article. "Children can
  // wade in the stream" walked past the water pattern on `in` rather than
  // `into`, and on a stream not being the literal word "water".
  //
  // WHAT THESE TWO PATTERNS ACTUALLY SEPARATE, said accurately because the
  // first version of this comment got it wrong (#229 review). They do NOT tell
  // an instruction from a description. What they separate is the BARE STEM
  // from the inflected forms, and only by accident: this product's descriptive
  // copy writes "climbs" and "climbing", so `\bclimb\s` misses it. Bare-stem
  // description is rejected freely — "Watch a squirrel climb up the trunk" and
  // "Ducks paddle in the pond" both cross this boundary today, and the margin
  // to real shipped copy is one word (us-midwest.json's "watch a fuzzy bee
  // climb ALL over a pink flower ball" survives on "all"). Measured against the
  // 8,776 look-for notes in the corpus, these two patterns suppress nothing
  // that was not already suppressed — but that is today's corpus, not a
  // property of the patterns. Reshaping them around an instruction lead-in
  // rather than an article is #1171, with the 32 sentences that still walk
  // past the whole list.
  //
  // What the article requirement DID buy is worth keeping while that is open:
  // the obvious repair, allowing `climb(s|ing)` plus any following word, was
  // measured against the corpus and would falsely reject six authored lines,
  // among them "Green grape balls hang from vines climbing up the trees."
  /\bclimb\s+(?:up|on|onto|into|over|across)\s+(?:a|an|the|that|this)\b/i,
  /\b(?:wade|paddle|splash)\s+(?:in|into)\s+(?:the\s+|a\s+)?(?:water|stream|pond|river|brook|lake|canal|sea)\b/i,
];

/** Fail the whole optional draft when any field crosses the release boundary. */
/**
 * True when a drafted sentence crosses the field-safety boundary.
 *
 * Exported so every path that puts model words in front of a teacher runs the
 * same check, rather than only the lesson-support draft. It is a BACKSTOP, not
 * the control: the prompt forbids this material, the teacher reads before she
 * speaks, and the authored lesson is untouched either way. Its patterns are
 * known to be narrower than English (see #229 for the isolating fixtures and
 * the proven bypasses) — widen them there, with mutation proof, not here.
 */
export function crossesSafetyBoundary(text: string): boolean {
  return UNSAFE_FIELD_ADVICE.some((pattern) => pattern.test(text));
}

export function parseLessonSupportDraft(value: unknown): LessonSupportDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowed = new Set(["headline", "teacherNote", "sayAloud", "change"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;

  const headline = shortText(record.headline, 80);
  const teacherNote = shortText(record.teacherNote, 400);
  const sayAloud = optionalShortText(record.sayAloud, 240);
  const change = optionalShortText(record.change, 240);
  if (!headline || !teacherNote || sayAloud === undefined || change === undefined) return null;

  const combined = [headline, teacherNote, sayAloud, change].filter(Boolean).join(" ");
  if (crossesSafetyBoundary(combined)) return null;

  return { headline, teacherNote, sayAloud, change };
}
