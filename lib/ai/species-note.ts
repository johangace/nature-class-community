import { createHash } from "node:crypto";
import type { SpeciesLearning } from "@/lib/cast/species-learning";
import { isModelAvailable } from "./model";
import { draft } from "./draft";
import { loadPrompt } from "./prompt-registry";
import type { SpeciesSource } from "@/lib/outside/species-source";

/**
 * The two notes a species profile owed and never paid (#218).
 *
 * ── WHAT JOHAN REJECTED, TWICE ─────────────────────────────────────────────
 *
 * 2026-08-11, on a hornet: *"it says it is an insect .. that is so bad.. no
 * info at all."*
 *
 * 2026-08-18, on a Short-toed Snake-Eagle, against the same two sections:
 *
 *   what it is      → "This is a bird."
 *   for the teacher → "This is on the list because the season and the region
 *                      say it should be about, not because it has a nearby
 *                      record. Worth pointing at the right habitat and letting
 *                      the class be the ones who find it, or do not."
 *
 * *"this is wrong stop giving so much clarification.. maybe some safety or
 * some fun fact for the teacher or anything better than this.. we dont need to
 * explain everything.. maybe habits or something if they encounter"*
 *
 * The second is the more interesting failure, because it was not a gap. It was
 * a deliberate paragraph, written from the honest position that we had no
 * natural history and would not invent any, so we explained our own method
 * instead. That is a page about US on a page that should be about the animal.
 * The honesty already lives on the tier chip and in the "how we know" strip,
 * and saying it a third time in a longer register is not more honest, it is
 * just the third time.
 *
 * ── THE SPLIT, SAME AS THE OTHER THREE HELPERS ─────────────────────────────
 *
 *   OBSERVED, never the model's: the article text from lib/outside/species-source.ts.
 *   THE MODEL'S: which two facts out of five thousand words a teacher standing
 *   outside with thirty children can actually use, and how to say them.
 *
 * No article, no sections. Not a generic line about birds.
 */

export interface SpeciesNoteInput {
  commonName: string;
  scientificName?: string | null;
  /** The article. The only facts the model may use. */
  source: SpeciesSource;
}

export interface SpeciesNote {
  /** What it is: real, and enough to recognise the creature. */
  whatItIs: string;
  forChildren: SpeciesLearning | null;
  /** For the teacher: one thing worth knowing if the class meets it. */
  forTeacher: string;
}

/**
 * The limits, and they are NAMED INTO THE PROMPT below rather than only
 * enforced here.
 *
 * This is where a live profile broke. Warming the teacher note's brief ("the
 * single most surprising or delightful thing") also dropped the word count out
 * of the prompt, while the guard still capped at forty-five. The model had no
 * target and wrote fifty to sixty words of genuinely good material, three
 * drafts out of three were rejected on length, and because the pair is
 * both-or-neither the whole profile fell back to "This is a plant." on
 * production.
 *
 * A cap the writer cannot see is not a cap, it is a coin toss. So the numbers
 * live here, the prompt is built from them, and a test asserts the two agree.
 */
export const CHILD_LIMITS = { words: 40, chars: 260 };

/** Preserve complete opening sentences when a supported introduction runs long.
 * Never clip a sentence midway or weaken the content/source checks. */
function fitIntroduction(text: string, input: SpeciesNoteInput): string | null {
  const verdict = checkNote(text, input, CHILD_LIMITS);
  if (verdict.ok) return text;
  if (verdict.reason !== "too long" && verdict.reason !== "too many words") return null;
  let kept = "";
  for (const { segment } of new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)) {
    const candidate = `${kept} ${segment}`.trim();
    if (!checkNote(candidate, input, CHILD_LIMITS).ok) break;
    // A final fragment without punctuation is not a complete sentence to keep.
    if (!/[.!?]["'”’)]*$/.test(candidate)) break;
    kept = candidate;
  }
  return kept || null;
}

/** Require a supporting passage for each child line. This checks source
 * presence, not semantic entailment; editorial/browser evals still matter. */
export function parseChildLearning(value: unknown, input: SpeciesNoteInput, onRefusal?: (reason: string) => void): SpeciesLearning | null {
  if (!value || typeof value !== "object") { onRefusal?.("missing-child-object"); return null; }
  const child = value as Record<string, unknown>;
  const readField = (key: keyof SpeciesLearning): string | null => {
    const refuse = (reason: string): null => { if (key === "introduction") onRefusal?.(reason); return null; };
    const field = child[key] as { text?: unknown; evidence?: unknown } | undefined;
    if (!field || typeof field.text !== "string" || typeof field.evidence !== "string") return refuse("missing-introduction-field");
    const evidence = field.evidence.trim();
    if (evidence.length < 12 || evidence.length > 360) return refuse("invalid-evidence-length");
    if (!input.source.text.includes(evidence)) return refuse("evidence-not-in-source");
    const text = normaliseNote(field.text);
    const verdict = checkNote(text, input, CHILD_LIMITS);
    if (verdict.ok) return text;
    const fitted = key === "introduction" ? fitIntroduction(text, input) : null;
    return fitted ?? refuse(verdict.reason ?? "rejected-introduction");
  };
  const introduction = readField("introduction");
  if (!introduction) return null;
  const question = readField("question");
  return {
    introduction,
    lookFor: readField("lookFor") ?? "Look at the picture. What shapes and patterns can you find?",
    question: question?.endsWith("?") ? question : "What would you like to find out about this living thing?",
  };
}

export const WHAT_LIMITS = { words: 65, chars: 440 };
export const TEACHER_LIMITS = { words: 70, chars: 460 };



export function buildUser(input: SpeciesNoteInput): string {
  return [
    `The species: ${input.commonName}`,
    "",
    "The article:",
    input.source.text,
    "",
    `Write the teacher notes for ${input.commonName}.`,
  ].join("\n");
}

export interface NoteCheck {
  ok: boolean;
  reason?: string;
}

/**
 * The one dash we let through, rewritten rather than rejected.
 *
 * Found on Myathropa florea against the live article: the model copied the
 * range "7-12 mm" with the source's en dash and lost an otherwise good draft
 * to the no-dash rule. A dash between two digits is a range, not the clause
 * separator the rule is aimed at, and rewriting it as "to" is what the copy
 * should have said anyway. Everything else still fails the check — a rule that
 * quietly repaired clause dashes would stop being a rule.
 */
export function normaliseNote(draft: string): string {
  return draft.replace(/(\d)\s*[—–]\s*(\d)/g, "$1 to $2").trim();
}

/** Digit runs, commas dropped, so "1,600" and "1600" are the same number. */
function numbers(text: string): string[] {
  return (text.replace(/,(?=\d)/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map(String);
}

/**
 * The methodology register, which is the thing Johan struck out.
 *
 * Not a style preference. A note that argues for its own species' presence is
 * the app talking about itself on the one surface built to talk about the
 * animal, and the model WILL reach for it, because the rest of the product is
 * written in that voice and the prompt is one paragraph against a codebase.
 */
const EXPLAINS_ITSELF =
  /\b(on (the|this) list|recorded (nearby|near|here|in)|sightings?\b|our (data|records)|this region|the region|because the season|not because|evidence|chosen|selected)\b/i;

/** Claims about her place or her day, which this note cannot possibly know. */
const CLAIMS_HERE =
  /\b(your (school|class|grounds|playground|site|area)|today|this week|right now|nearby|near here)\b/i;

/**
 * What must hold before either note is shown.
 *
 * The expensive failure is a fact that reads well and is not in the article —
 * a diet, a nesting habit, a danger — because a teacher will repeat it to a
 * class as though we had checked it. The number rule is the observable half of
 * that; the register rules are what keep the note about the animal.
 */
export function checkNote(
  draft: string,
  input: SpeciesNoteInput,
  limits: { words: number; chars: number }
): NoteCheck {
  const text = draft.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > limits.chars) return { ok: false, reason: "too long" };
  if (text.split(/\s+/).length > limits.words) return { ok: false, reason: "too many words" };
  if (/[—–]/.test(text)) return { ok: false, reason: "em dash" };
  if (/!/.test(text)) return { ok: false, reason: "exclamation" };
  if (/\b[A-Z]{2,}\b/.test(text)) return { ok: false, reason: "all caps" };
  if (/https?:\/\/|[<>*_#]/.test(text)) return { ok: false, reason: "markup or link" };

  const self = text.match(EXPLAINS_ITSELF);
  if (self) return { ok: false, reason: `explains our own method: ${self[0]}` };

  const here = text.match(CLAIMS_HERE);
  if (here) return { ok: false, reason: `claims something about her place: ${here[0]}` };

  // Numbers-unchanged. Every figure must be in the article, verbatim.
  const source = input.source.text.replace(/,(?=\d)/g, "");
  for (const n of numbers(text)) {
    if (!new RegExp(`\\b${n}\\b`).test(source)) {
      return { ok: false, reason: `carries a number the article does not: ${n}` };
    }
  }

  return { ok: true };
}



/**
 * The note is held, and the reason is not only cost.
 *
 * Measured on the running dev server: three views of the same hoverfly gave
 * three different drafts, each about two seconds. A teacher who scrolls back to
 * a profile should find the same words she read out five minutes ago, and a
 * class of thirty tapping the same face should not be thirty model calls. The
 * per-instance AI rate limit (#332) is the other half of that.
 *
 * A SUCCESS IS HELD FOR A DAY, because natural history does not change over a
 * school term.
 *
 * A FAILURE IS HELD FOR A MINUTE, and the number came down from ten after
 * watching it: a profile that had briefly fallen back to "This is a bird." was
 * still saying it long after the model had recovered, which is the exact
 * sentence Johan has now rejected twice. A miss here is a stochastic one far
 * more often than a species we can never write about, so the hold only has to
 * be long enough to stop a class of thirty tapping one face into the
 * per-instance rate limit (#332). A minute does that, and a reload fixes it.
 */
const NOTE_TTL_MS = 24 * 60 * 60 * 1_000;
const MISS_TTL_MS = 60 * 1_000;
const inFlight = new Map<string, Promise<SpeciesNote | null>>();
const notes = new Map<string, { at: number; value: SpeciesNote | null }>();

function noteKey(input: SpeciesNoteInput): string {
  return createHash("sha256").update(JSON.stringify([input.scientificName, input.commonName, input.source.text])).digest("hex");
}

/**
 * Draft both notes, or null so the profile renders shorter.
 *
 * BOTH OR NEITHER. A profile carrying a real "what it is" above a teacher note
 * assembled from habitat tags would read as two people writing about two
 * different animals, and the pair is one piece of writing about one creature.
 */
export async function draftSpeciesNote(input: SpeciesNoteInput): Promise<SpeciesNote | null> {
  if (!isModelAvailable()) return null;
  if (!input.source.text.trim()) return null;

  const key = noteKey(input);
  const held = notes.get(key);
  if (held && Date.now() - held.at < (held.value ? NOTE_TTL_MS : MISS_TTL_MS)) {
    return held.value;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;
  const work = composeNote(input).then((value) => {
    if (notes.size >= 128) notes.delete(notes.keys().next().value!);
    notes.set(key, { at: Date.now(), value });
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

async function composeNote(input: SpeciesNoteInput): Promise<SpeciesNote | null> {
  // The word budgets come from the SAME constants the guard enforces, rather
  // than being frozen into the prompt file. A cap the writer cannot see is not
  // a cap (that is what took a live species profile down to "This is a
  // plant."), and a cap the writer sees but the guard no longer shares is the
  // same bug wearing a different coat. Passing them keeps the pair welded.
  const prompt = loadPrompt("species-note", {
    whatWords: String(WHAT_LIMITS.words - 5),
    teacherWords: String(TEACHER_LIMITS.words - 5),
  });
  if (!prompt) return null;

  return draft({
    prompt: { ...prompt, user: buildUser(input) },
    facts: input,
    maxTokens: 500,
    parse: (json) => {
      const reply = json as Record<string, unknown> | null;
      const whatItIs =
        typeof reply?.whatItIs === "string" ? normaliseNote(reply.whatItIs) : null;
      const forTeacher =
        typeof reply?.forTeacher === "string" ? normaliseNote(reply.forTeacher) : null;
      return whatItIs && forTeacher
        ? { whatItIs, forTeacher, forChildren: null }
        : null;
    },
    // Two notes, two budgets, one verdict: the first refusal is the outcome,
    // so a trace says which category of thing went wrong even though it does
    // not say which of the two fields carried it.
    check: (note, facts) => {
      const what = checkNote(note.whatItIs, facts, WHAT_LIMITS);
      return what.ok ? checkNote(note.forTeacher, facts, TEACHER_LIMITS) : what;
    },
  });
}
