import { producerWeek } from "./producer-week";
import { crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";
import type { FieldTruth } from "./pointmoon";

/** Pointmoon's curated calendar is a regional expectation, not a measured
 * account of what the season is doing at this point. Unknown lineage is silent. */

/** One thing Pointmoon's regional phenology names as the week's headline. */
export interface PhenologyPrimary {
  /** The common name, from the signal's `label`. */
  species: string;
  /** Pointmoon's own sentence about it, from the signal's `value`. */
  note: string;
  /**
   * The signal's own `confidence`, raw and unjudged, or null when Pointmoon
   * sent none. Carried rather than applied here: `readPhenologyCondition`
   * reports what arrived, and `phenologyConditionNote` is the one place that
   * decides what a number this size licenses. See `PRIMARY_CONFIDENCE_FLOOR`.
   */
  confidence: number | null;
}

export interface PhenologyCondition {
  /** `nature.phenology.dominant_phase` — which stage most of this week's
   * regional phenology sits in, e.g. "emerging" | "peak" | "fading" | "mixed".
   * Raw and unjudged: a value this reader does not recognise still appears
   * here, it just does not reach a composed sentence. */
  dominantPhase: string | null;
  /** `nature.phenology.season_progress` — whether the season is running
   * ahead of, behind, or on pace with an average year here. */
  seasonProgress: string | null;
  /** `nature.phenology.agdd_anomaly` — accumulated growing-degree-day
   * anomaly. A number only; see the file header for why it stops there. */
  agddAnomaly: number | null;
  /** `nature.phenology.primary`, when Pointmoon sent one. */
  primary: PhenologyPrimary | null;
}

function signalMap(
  data: FieldTruth | null
): Map<string, { value: string | number; label?: string; confidence?: number }> {
  const p = data?.facts?.fieldSnapshot?.phenology;
  const now = new Date();
  const current = p && p.week === producerWeek(now).week && producerWeek(new Date(p.readAt)).year === producerWeek(now).year;
  const signals = current ? data?.facts?.signals : [];
  const byId = new Map<string, { value: string | number; label?: string; confidence?: number }>();
  if (!Array.isArray(signals)) return byId;
  for (const signal of signals) {
    if (typeof signal?.id !== "string" || signal.epistemicType !== "curated" || signal.provider !== "hand-authored") continue;
    if (signal.value === undefined || signal.value === null) continue;
    byId.set(signal.id, { value: signal.value, label: signal.label, confidence: signal.confidence });
  }
  return byId;
}

function asText(value: string | number | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Read the live phenology-condition signals out of a Pointmoon payload.
 *
 * Returns null when Pointmoon sent none of the four signals this reads — the
 * same "answered vs empty" rule `readPlace` follows, so a surface can tell "we
 * asked and got nothing" from "we never asked".
 */
export function readPhenologyCondition(data: FieldTruth | null): PhenologyCondition | null {
  const byId = signalMap(data);
  if (byId.size === 0) return null;

  const dominantPhase = asText(byId.get("nature.phenology.dominant_phase")?.value);
  const seasonProgress = asText(byId.get("nature.phenology.season_progress")?.value);
  const agddAnomaly = asNumber(byId.get("nature.phenology.agdd_anomaly")?.value);

  const primaryEntry = byId.get("nature.phenology.primary");
  const primarySpecies = primaryEntry?.label?.trim();
  const primaryNote = asText(primaryEntry?.value);
  const primaryConfidence =
    typeof primaryEntry?.confidence === "number" && Number.isFinite(primaryEntry.confidence)
      ? primaryEntry.confidence
      : null;
  const primary: PhenologyPrimary | null =
    primarySpecies && primaryNote
      ? { species: primarySpecies, note: primaryNote, confidence: primaryConfidence }
      : null;

  if (dominantPhase === null && seasonProgress === null && agddAnomaly === null && primary === null) {
    return null;
  }
  return { dominantPhase, seasonProgress, agddAnomaly, primary };
}

/** Sentences for the phases Pointmoon is known to send. An unrecognised
 * phase composes nothing rather than a guessed sentence. */
const PHASE_SENTENCE: Record<string, string> = {
  emerging: "The regional calendar describes seasonal signs as just emerging.",
  peak: "The regional calendar describes seasonal signs as at their peak.",
  fading: "The regional calendar describes seasonal signs as fading.",
  mixed: "The regional calendar describes seasonal signs as a mix of early and late arrivals.",
  declining: "The regional calendar describes seasonal signs as on the way out.",
};

/** Sentences for the progress words Pointmoon is known to send. */
const PROGRESS_SENTENCE: Record<string, string> = {
  ahead: "The regional calendar suggests a season ahead of average.",
  behind: "The regional calendar suggests a season behind average.",
  "on-track": "The regional calendar suggests a season on track.",
  aligned: "The regional calendar suggests a season on track.",
  typical: "The regional calendar suggests a season on track.",
};

/**
 * THE FLOOR UNDER THE WEEK'S HEADLINE (#1281), AND WHAT IT IS NOT.
 *
 * Measured from the six captured Pointmoon payloads in
 * `tests/fixtures/pointmoon/`, which is every real payload this repository
 * holds that carries a `nature.phenology.primary` at all:
 *
 *   porto 0.304 · london 0.304 · berkeley 0.3375
 *   london_uk 0.405 · london_uk_2026-08-17 0.405 · phoenix_az 0.405
 *
 * Three distinct values in a band of 0.304 to 0.405, and no payload below it.
 * So this number is the OBSERVED MINIMUM ITSELF, not a round number near it,
 * and it is honest about exactly one thing: it admits every primary Pointmoon
 * has ever been seen to send and refuses one weaker than any of them. It was
 * 0.3 on the first draft, which said that sentence while admitting 0.301 —
 * the rounding was taste, and taste is the one thing this constant is not
 * allowed to be (found in review, #1293). `phenology-condition-signals.spec`
 * asserts this equals the minimum it finds by reading the fixtures, so the
 * two cannot drift: move the band and the suite fails until it is re-measured.
 *
 * It is NOT a quality gate, and it must not be read as one — nothing inside
 * that band separates a headline worth a teacher's pixels from one that is
 * not. What it refuses is a payload unlike any we have seen, about which we
 * have no evidence at all.
 *
 * Note what it is not compared to: `lib/conditions.ts` holds the weather
 * temperature to 0.6. That is a MEASURED token from an instrument. This is a
 * CURATED regional headline, and the whole curated family sits low by
 * construction (the derived numerics arrive at 0.58 to 0.88, the primary at
 * 0.30 to 0.41). Holding one to the other's floor would silence the family
 * permanently and call the silence rigour.
 */
export const PRIMARY_CONFIDENCE_FLOOR = 0.304;

/** A relayed sentence longer than this is refused rather than trimmed: a
 * headline cut mid-claim is a worse thing to put in front of a class than no
 * headline. No observed payload comes close (the longest is 99 characters). */
const PRIMARY_NOTE_MAX_CHARS = 200;

/**
 * Pointmoon's own sentence about the week's headline, attributed, or null.
 *
 * WHY THIS IS NOT THE THING THE LOOKUP TABLES REFUSE TO DO. The tables above
 * refuse to TRANSLATE a token they do not recognise into a sentence, because
 * the sentence would then be this reader's claim about a word it was guessing
 * at. Relaying is a different act: `nature.phenology.primary`'s `value` is
 * already a finished sentence somebody at Pointmoon wrote, and saying whose
 * sentence it is costs this reader no claim of its own. The original decision
 * here (#284) dropped the primary because it "doesn't translate into a plain
 * sentence" — correct, and it never needed to, because it arrives as one.
 *
 * What is still checked, because the prose crosses a system boundary: it is a
 * real non-empty string, it is one line, it carries no markup, it is short
 * enough to be a headline, and it does not cross the field-safety boundary.
 * Anything else composes nothing.
 *
 * THE SAFETY CHECK IS NOT OPTIONAL HERE, and leaving it out was the first
 * draft's worst bug (found in review, #1293). Every other route that puts
 * non-authored prose in front of a class already runs it: curated look-for
 * notes go through `safeLookForNote`, model drafts through
 * `parseLessonSupportDraft`. The phenology corpus has itself carried "Fill
 * your pockets with pecans! Crack one open and eat the sweet nutty insides" —
 * that sentence is a fixture in `tests/unit/lesson-support.spec.ts` because it
 * was real — so a weekly headline is exactly the shape of thing that can
 * arrive carrying eating advice. Short and single-line said nothing about
 * that. `crossesSafetyBoundary`'s own doc is clear that it is a backstop and
 * narrower than English (#1171 holds the known bypasses); a backstop every
 * sibling path runs is still the wrong one to be missing.
 */
function primarySentence(primary: PhenologyPrimary | null): string | null {
  if (!primary) return null;
  // `Number.isFinite` first, because `NaN < floor` is false and a NaN would
  // otherwise walk straight through the comparison that is supposed to stop it.
  const confidence = primary.confidence;
  if (!Number.isFinite(confidence) || (confidence as number) < PRIMARY_CONFIDENCE_FLOOR) return null;

  const note = primary.note.trim();
  if (note.length === 0 || note.length > PRIMARY_NOTE_MAX_CHARS) return null;
  if (/[\r\n<>]/.test(note)) return null;
  if (crossesSafetyBoundary(note)) return null;

  // The note names its own subject in every payload observed ("Blackberries at
  // peak…", "Swifts gathering…"), so the `species` label is carried on the
  // type for a caller that wants it structured and is not repeated here.
  const ended = /[.!?]$/.test(note) ? note : `${note}.`;
  return `The regional calendar names one headline this week: ${ended}`;
}

/**
 * Up to three grounded sentences about how the season is running, or null.
 *
 * The first two are composed only from `dominantPhase` and `seasonProgress`,
 * and only from values this file recognises — see the two lookup tables
 * above. The third relays Pointmoon's own headline sentence under the floor
 * documented on `PRIMARY_CONFIDENCE_FLOOR` (#1281). The anomaly number is
 * still left for a caller that wants it directly, because it is the one field
 * here that does not translate into a plain sentence without a claim this
 * reader is not in a position to make.
 */
export function phenologyConditionNote(condition: PhenologyCondition | null): string | null {
  if (!condition) return null;
  const phase = condition.dominantPhase ? PHASE_SENTENCE[condition.dominantPhase.toLowerCase()] : undefined;
  const progress = condition.seasonProgress
    ? PROGRESS_SENTENCE[condition.seasonProgress.toLowerCase()]
    : undefined;
  const headline = primarySentence(condition.primary) ?? undefined;
  const sentences = [phase, progress, headline].filter((s): s is string => Boolean(s));
  return sentences.length > 0 ? sentences.join(" ") : null;
}
