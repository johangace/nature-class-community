/**
 * The teacher's reflection vocabulary — the words the TAP questions can store.
 *
 * This file is the single source of truth for every tapped answer the close of
 * a session records. The runner renders buttons from these lists; the API
 * validates against these same lists before anything is written. There is no
 * path by which a value that is not one of these tokens reaches one of those
 * four columns.
 *
 * WHAT THIS FILE NO LONGER CLAIMS. It used to say the close held no free-text
 * field and never should — that an "anything else?" box is exactly where a
 * teacher would write a child's name, and that adding one would be a product
 * decision with a data-protection answer attached rather than a component
 * someone adds. That decision has since been taken, by Johan, deliberately
 * (#347): the prototype's notebook had the box, teachers used it, and he
 * wants it back. The box is `note` on SessionCompletion, and it is handled in
 * lib/reflection-note.ts, not here.
 *
 * So the boundary moved, and it is worth being exact about where it now is
 * rather than leaving a comfortable sentence in place. The four TAP fields are
 * still closed, and they are still the only fields anything COUNTS — the term
 * summary in lib/journal.ts reads tokens and never the note, so no aggregate
 * this product shows can quote a child. What is no longer true is that the
 * shape of the data makes personal information impossible. It is now the
 * teacher's judgement, on her own private page, with the note shown back only
 * to her.
 *
 * Adding a tap question: add its list here, a nullable column on
 * SessionCompletion, and the render. Never widen one of those to a plain
 * string — they are counted, and counting needs a fixed set of words.
 */

export interface ReflectionOption<K extends string> {
  key: K;
  /** The button's words. Sentence case, like everything else in the product. */
  label: string;
}

/** How the session went, in the teacher's own register. One tap, skippable. */
export const moodOptions = [
  { key: "calm", label: "Calm" },
  { key: "energised", label: "Energised" },
  { key: "connected", label: "Connected" },
  { key: "mixed", label: "Mixed" },
  { key: "difficult", label: "Difficult" },
] as const satisfies readonly ReflectionOption<string>[];

export type Mood = (typeof moodOptions)[number]["key"];

/**
 * The three words the earlier one-tap reflection used. Retired from the UI,
 * but still accepted by the API and still readable in the journal: a teacher
 * whose iPad queued a completion offline before this shipped must not have it
 * rejected when it finally drains, and rows already written stay legible.
 */
export const legacyMoodWords: Record<string, string> = {
  "landed-well": "landed well",
  "hard-going": "hard going",
};

/** What happened out there. Multi-select — a session is rarely one thing. */
export const happeningOptions = [
  { key: "kids-engaged", label: "Kids engaged" },
  { key: "good-weather", label: "Good weather" },
  { key: "questions-flowed", label: "Questions flowed" },
  { key: "needed-more-time", label: "Needed more time" },
  { key: "too-cold", label: "Too cold" },
  { key: "too-hot", label: "Too hot" },
  { key: "behaviour", label: "Behaviour issues" },
  { key: "quiet-group", label: "Quiet group" },
  { key: "lots-of-sharing", label: "Lots of sharing" },
] as const satisfies readonly ReflectionOption<string>[];

export type Happening = (typeof happeningOptions)[number]["key"];

/** Did the session fit the slot it was given? */
export const timingOptions = [
  { key: "more-time", label: "Wished for more time" },
  { key: "just-right", label: "Just right" },
  { key: "shorter", label: "Could be shorter" },
] as const satisfies readonly ReflectionOption<string>[];

export type Timing = (typeof timingOptions)[number]["key"];

/** Where the class wants the curriculum to go next. */
export const moreOfOptions = [
  { key: "arts", label: "Arts" },
  { key: "identification", label: "Identification" },
  { key: "gardening", label: "Gardening" },
  { key: "making", label: "Making" },
] as const satisfies readonly ReflectionOption<string>[];

export type MoreOf = (typeof moreOfOptions)[number]["key"];

const keysOf = (options: readonly ReflectionOption<string>[]): string[] =>
  options.map((o) => o.key);

/** The accepted tokens per field, for the API's schema. */
export const moodKeys = [...keysOf(moodOptions), ...Object.keys(legacyMoodWords)];
export const happeningKeys = keysOf(happeningOptions);
export const timingKeys = keysOf(timingOptions);
export const moreOfKeys = keysOf(moreOfOptions);

const labels = new Map<string, string>(
  [
    ...moodOptions,
    ...happeningOptions,
    ...timingOptions,
    ...moreOfOptions,
  ].map((o) => [o.key, o.label])
);

/**
 * A stored token as words, for the journal's record line. Lowercased so it
 * reads as part of a sentence ("· calm · kids engaged"). An unknown token —
 * a row written by an older or newer client — falls back to itself rather
 * than disappearing: the journal is a record, and a record does not hide
 * what it holds.
 */
export function reflectionWords(key: string): string {
  const label = labels.get(key);
  if (label) return label.toLowerCase();
  return legacyMoodWords[key] ?? key;
}
