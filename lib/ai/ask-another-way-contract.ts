import { crossesSafetyBoundary } from "./lesson-support-contract";
import type { GuardVerdict } from "./draft";

/**
 * ASK IT ANOTHER WAY (#390, superseding #27) — the contract half.
 *
 * A circle question falls flat and the class goes quiet. The teacher taps one
 * fixed option and gets ONE other way to ask the SAME question, which she can
 * put on the plate in place of the authored one.
 *
 * ── THE TEACHER PICKS THE AXIS, NOT THE MODEL ──────────────────────────────
 *
 * #27's version asked the model to choose the two doors itself ("make one
 * CONCRETE and one SENSORY") and handed back two alternatives to compare.
 * Johan, 2026-08-24: *"ask another way should be a prompt on its own fixed
 * with a few options, eg shorter, simpler etc."* So the axis is the teacher's
 * and the sentence is the model's, which is the same split every other drafter
 * in this repo already makes.
 *
 * ── THE SET IS THREE, CUT FROM FIVE ────────────────────────────────────────
 *
 * The issue opened with five — shorter, simpler, concrete, sensory, easier to
 * start — and said to settle the set before building, because five is too wide
 * a row for cold thumbs outdoors. Three, because three cover the three ways a
 * circle question actually dies, and each cut folds a door into the one beside
 * it rather than throwing a capability away:
 *
 *   they did not follow the words       → simpler   (shorter folded in)
 *   it was too abstract to picture      → concrete  (sensory folded in)
 *   they followed it and cannot begin   → easier-to-start
 *
 * SHORTER INTO SIMPLER is not a new judgement: #378 already ruled it for the
 * assistant sheet — *"Simpler absorbed Shorter (one answer, plainer wording
 * leading)"* — and a row that reopens a door Johan closed one ticket ago is
 * the drift, not the feature.
 *
 * SENSORY INTO CONCRETE, because both send the question to a thing in front of
 * the child. Asking a teacher to decide, mid-silence, whether the trouble is
 * that the question is not about an object or not about a smell is a diagnosis
 * she has no time to make; the rule keeps both senses of it and lets the model
 * pick which sense the thing in front of them offers.
 *
 * And the row is one row. At 375px with the page's own padding, three chips
 * take about 109px each and four take about 79px, which is where the labels
 * start truncating — the cut is literally the reason the issue gave for it.
 */

export const askAnotherWayOptions = ["simpler", "concrete", "easier-to-start"] as const;

export type AskAnotherWayOption = (typeof askAnotherWayOptions)[number];

/**
 * What the teacher reads on the chip. Plain speech, sentence case: she is
 * choosing a way in under pressure, not reading a taxonomy of rephrasings.
 */
export const askAnotherWayLabels: Record<AskAnotherWayOption, string> = {
  simpler: "Simpler",
  concrete: "Something out here",
  "easier-to-start": "Easier to start",
};

/** The question, and the option and original it must be held against. */
export interface AskAnotherWayFacts {
  /**
   * The AUTHORED question, always — never the previous rephrasing.
   *
   * Structural, not a promise: the route reads this out of the pack by phase
   * and index on every call, so a second tap cannot drift off a first one even
   * if a client sent something else. There is no client-supplied question text
   * anywhere on this path.
   */
  question: string;
  /** The lesson's aim, so a rephrase can be held to it. */
  objective: string;
  option: AskAnotherWayOption;
}

/**
 * Words a rephrasing may introduce even though the original did not have them,
 * because they are how a question gets simpler rather than facts about the
 * world. Everything else capitalised mid-sentence is a name, and a name the
 * original did not carry is an invented fact.
 */
const SENTENCE_OPENERS = /^(what|where|when|who|why|how|which|can|could|do|does|did|is|are|was|were|shall|will|would|if|tell|look|point|find|show|listen|touch|think)\b/i;

const WORD = /[a-zà-öø-ÿ][a-zà-öø-ÿ'-]*/gi;

function words(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).map((w) => w.replace(/^'+|'+$/g, ""));
}

/** Strip punctuation and case so "the same question" can be recognised. */
function bones(text: string): string {
  return words(text).join(" ");
}

/**
 * Parse the reply into one question, or refuse it.
 *
 * `{"question": null}` is the model's honest "this way in cannot be taken
 * without asking something else", which the prompt asks for by name. It parses
 * to null exactly like a miss, and the plate keeps the authored question.
 */
export function parseAskAnotherWayDraft(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "question")) return null;

  const raw = record.question;
  if (typeof raw !== "string") return null;
  // The model reaches for em dashes; the product never prints one. The same
  // deterministic swap groundingLine makes, for the same reason.
  const text = raw.trim().replace(/\s*[—–]\s*/g, ", ");
  return text.length > 0 ? text : null;
}

/**
 * Everything that must hold before a rephrasing is offered to the teacher.
 *
 * Pure and exported, so each rule is a thing a test can watch reject something
 * rather than a condition buried in a call site — the shape `checkDoorLine`
 * already set.
 *
 * Every reason is written `stable phrase: ${value}`, because `outcomeCode`
 * keeps only the text before the colon and model output must never enter the
 * trace store (nc#50, nc#66).
 */
export function checkAskAnotherWay(text: string, facts: AskAnotherWayFacts): GuardVerdict {
  const line = text.trim();

  if (line.length === 0) return { ok: false, reason: "empty" };
  if (line.length > 140) return { ok: false, reason: "too long" };
  if (/https?:\/\/|[<>]/.test(line)) return { ok: false, reason: "markup or link" };
  if (/[—–]/.test(line)) return { ok: false, reason: "em dash" };
  if (/\b[A-Z]{2,}\b/.test(line)) return { ok: false, reason: "all caps" };

  // It is still a question. Without this the axis quietly turns a question
  // into an instruction, and the plate is a question plate.
  if (!line.endsWith("?")) return { ok: false, reason: "not a question" };
  if ((line.match(/\?/g) ?? []).length > 1) return { ok: false, reason: "more than one question" };

  // One sentence a teacher says aloud, not a paragraph she has to perform.
  if (words(line).length > 24) return { ok: false, reason: "too many words" };

  // A rephrasing that returns the question it was given is not a rephrasing,
  // and a teacher who taps and reads back her own words learns the tap does
  // nothing.
  if (bones(line) === bones(facts.question)) {
    return { ok: false, reason: "gave the question back unchanged" };
  }

  // NO INVENTED FACT, half one: a number. Nothing on this path counted
  // anything, so a number that is not in the question is a claim about the
  // world made up to make the question easier.
  const grounded = new Set(facts.question.match(/\d+/g) ?? []);
  const number = (line.match(/\d+/g) ?? []).find((n) => !grounded.has(n));
  if (number) return { ok: false, reason: `carries a number the question does not: ${number}` };

  // NO INVENTED FACT, half two: a name. The same rule the door line holds, in
  // the only form available here — this path has no species lexicon, so the
  // question and its objective ARE the lexicon. A capitalised word mid-
  // sentence that neither of them carries is a creature, a place or a person
  // the model brought with it.
  const known = new Set([...words(facts.question), ...words(facts.objective)]);
  const invented = line
    .split(/\s+/)
    .slice(1)
    .map((token) => token.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ']+$/g, ""))
    .find((token) => /^[A-ZÀ-Þ]/.test(token) && token !== "I" && !known.has(token.toLowerCase()));
  if (invented) return { ok: false, reason: `named something the question did not: ${invented}` };

  // SIMPLER MEANS SIMPLER, and shorter is folded into it, so a "simpler"
  // rephrasing that is longer than the question it simplifies has not done
  // the one thing the teacher tapped for. Word count, not characters: "go
  // yellow and red" for "change colour" is longer in letters and plainer in
  // the mouth, and a character bound would throw it away.
  if (facts.option === "simpler") {
    const asked = words(facts.question).length;
    const said = words(line).length;
    if (said > asked) return { ok: false, reason: `longer than the question it simplifies: ${said}` };
  }

  // The backstop every path that puts drafted words in front of a teacher
  // runs. The prompt already forbids this material; this is the net under it.
  if (crossesSafetyBoundary(line)) {
    return { ok: false, reason: "crosses the field safety boundary" };
  }

  return { ok: true };
}
