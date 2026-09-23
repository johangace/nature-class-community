import { REACH_IDS, SITE_FEATURES, type ReachId, type SiteFeature } from "@/app/start/vocab";

/**
 * The output gate for the onboarding assistant chat (#280): free-form teacher
 * input in, a set of candidate place facts back, each traceable to the words
 * that produced it.
 *
 * Same posture as `lesson-support-contract.ts` (the model listens, it does
 * not know): the prompt asks for exactly this shape, and this parser is the
 * backstop that a stray or manipulated reply cannot cross. One guard lives
 * here that the lesson-support contract has no need of, because this is the
 * first AI path in the product that reads a teacher's own free-form sentence
 * rather than a closed set of authored facts:
 *
 *   1. EVERY CANDIDATE MUST QUOTE HER. `quote` must appear, near enough
 *      verbatim, inside the text she actually typed. A candidate whose quote
 *      cannot be found in her own words is not something she said — it is
 *      dropped, full stop, regardless of how the prompt was answered.
 * ── THERE WAS A SECOND GUARD HERE, AND IT WAS THEATRE (#386) ──────────────
 *
 * `mentionsPossiblePerson` tried to spot a child's name — a capitalised word
 * near a verb like "fell" — and drop the read. It is deleted, not tuned.
 *
 * It guarded ONE of three doors into the same field. The plain "Something
 * else out there?" box in WorldBuilder saves free text straight to
 * `siteNotes` with no name check at all, and the PHOTO intake sends an actual
 * photograph of the grounds to the same provider. A regex on the middle door
 * bought nothing while the widest one stood open.
 *
 * It could not work either. In a nature product the names collide: Ivy,
 * Holly, Heather, Rowan, Robin, Hazel, Willow are plants AND people, and
 * "fell", "ran", "climbed" and "jumped" are what trees and animals do.
 * Measured, it blocked six of ten ordinary descriptions of a school's own
 * patch and let every sentence STARTING with a child's name through.
 *
 * And it cost the teacher plainly. "The old Ash fell in the storm last
 * winter" came back as *"One part of what you wrote might have named someone,
 * so we left that bit out."* The product accusing her of naming a child when
 * she described a tree.
 *
 * Johan already ruled where the protection lives (2026-08-18, on the
 * reflection note): retention and teacher judgement, not schema shape. That
 * ruling is the one this file follows now.
 */

export const WORLD_FACT_KINDS = ["feature", "note", "reach"] as const;
export type WorldFactKind = (typeof WORLD_FACT_KINDS)[number];

export interface WorldFactCandidate {
  kind: WorldFactKind;
  /** A SITE_FEATURES value, a REACH_IDS value, or her own words (note). */
  value: string;
  /** The fragment of her input this was read from, verbatim. */
  quote: string;
  /** 0 to 1. Shown to her in plain words, never used to auto-confirm. */
  confidence: number;
}

export interface WorldExtractDraft {
  candidates: WorldFactCandidate[];
  /**
   * True when the raw input tripped the person-reference backstop, so the UI
   * can say plainly that a note-shaped fragment was left out rather than
   * silently returning fewer candidates than she might expect.
   */
}

const MAX_INPUT_LEN = 1000;
const MAX_CANDIDATES_PER_KIND = 6;
const MAX_NOTE_LEN = 120;
const MAX_QUOTE_LEN = 200;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?'"]/g, "");
}

/** `quote` must actually be in what she typed, near enough verbatim. */
function quotedIn(quote: string, source: string): boolean {
  const q = normalize(quote);
  if (!q) return false;
  return normalize(source).includes(q);
}

function parseCandidate(
  value: unknown,
  source: string
): WorldFactCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  const rawValue = record.value;
  const quote = record.quote;
  const confidence = record.confidence;

  if (typeof kind !== "string" || !(WORLD_FACT_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  if (typeof rawValue !== "string" || typeof quote !== "string") return null;
  const trimmedQuote = quote.trim();
  if (!trimmedQuote || trimmedQuote.length > MAX_QUOTE_LEN) return null;
  if (!quotedIn(trimmedQuote, source)) return null;

  const conf =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0.5;

  const trimmedValue = rawValue.trim();
  if (kind === "feature") {
    if (!(SITE_FEATURES as readonly string[]).includes(trimmedValue)) return null;
    return { kind: "feature", value: trimmedValue as SiteFeature, quote: trimmedQuote, confidence: conf };
  }
  if (kind === "reach") {
    if (!(REACH_IDS as readonly string[]).includes(trimmedValue)) return null;
    return { kind: "reach", value: trimmedValue as ReachId, quote: trimmedQuote, confidence: conf };
  }
  // kind === "note": her own words, bounded exactly as the manual box bounds
  // them in setWorldSchema, so a chat-confirmed note can never be a note the
  // manual box would have refused.
  if (!trimmedValue || trimmedValue.length > MAX_NOTE_LEN) return null;
  if (/[<>]/.test(trimmedValue) || /https?:\/\//i.test(trimmedValue)) return null;
  return { kind: "note", value: trimmedValue, quote: trimmedQuote, confidence: conf };
}

/**
 * Parse a model reply against the raw input it was extracted from. Bounds
 * every field, drops any candidate that fails the quote-in-source check, and
 * drops every note candidate outright when the raw input trips the
 * person-reference backstop — regardless of what the model itself returned.
 */
export function parseWorldExtractDraft(value: unknown, sourceText: string): WorldExtractDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawCandidates = record.candidates;
  if (!Array.isArray(rawCandidates)) return null;


  const perKind: Record<WorldFactKind, WorldFactCandidate[]> = {
    feature: [],
    note: [],
    reach: [],
  };

  for (const raw of rawCandidates) {
    const candidate = parseCandidate(raw, sourceText);
    if (!candidate) continue;
    if (perKind[candidate.kind].length >= MAX_CANDIDATES_PER_KIND) continue;
    // No duplicate values within one kind.
    if (perKind[candidate.kind].some((c) => c.value === candidate.value)) continue;
    perKind[candidate.kind].push(candidate);
  }

  // "reach" is single-valued: keep only the highest-confidence candidate.
  if (perKind.reach.length > 1) {
    const best = perKind.reach.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    perKind.reach = [best];
  }

  return {
    candidates: [...perKind.feature, ...perKind.note, ...perKind.reach],
  };
}

/**
 * #377 · The photograph path's output gate. A photo has no quote, so the
 * quote-in-source guard cannot hold it honest; this parser enforces the
 * replacement invariant instead, so every candidate stays traceable to
 * something outside the model:
 *
 *   - "feature" must be a closed SITE_FEATURES value (cannot carry a name)
 *   - "species" must exactly match a name in the local seasonal record,
 *     passed in by the route — the record standing in for her words. The
 *     match is case-insensitive; the CANONICAL record spelling is what is
 *     kept, never the model's own casing.
 *   - free text from a photograph NEVER becomes a note, so the kind "note"
 *     does not exist on this path at all
 *
 * A species candidate is returned as kind "note" whose value is the record's
 * own name, because that is the column a confirmed species folds into — the
 * class row has no species column, and her notes are where "what lives here"
 * already lives. Its `quote` says plainly where it came from.
 *
 * PERSON IN FRAME: the model is instructed to report one, and this parser
 * honours the report by refusing the whole read. `personSeen` lets the UI say
 * so plainly; nothing else from such a reply survives.
 */
export interface WorldPhotoDraft {
  candidates: WorldFactCandidate[];
  personSeen: boolean;
}

/** The quote a photo candidate carries, since a photograph has no words. */
export const PHOTO_QUOTE = "from your photograph";

const MAX_PHOTO_CANDIDATES = 6;

export function parseWorldPhotoDraft(
  value: unknown,
  allowedSpecies: readonly string[]
): WorldPhotoDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  if (record.person === true) return { candidates: [], personSeen: true };

  const rawCandidates = record.candidates;
  if (!Array.isArray(rawCandidates)) return null;

  const speciesByFold = new Map(
    allowedSpecies.map((name) => [name.trim().toLowerCase(), name])
  );

  const candidates: WorldFactCandidate[] = [];
  for (const raw of rawCandidates) {
    if (candidates.length >= MAX_PHOTO_CANDIDATES) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.value !== "string") continue;
    const conf =
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5;
    const trimmed = item.value.trim();

    if (item.kind === "feature") {
      if (!(SITE_FEATURES as readonly string[]).includes(trimmed)) continue;
      if (candidates.some((c) => c.kind === "feature" && c.value === trimmed)) continue;
      candidates.push({
        kind: "feature",
        value: trimmed as SiteFeature,
        quote: PHOTO_QUOTE,
        confidence: conf,
      });
    } else if (item.kind === "species") {
      // Exact membership in the record, or the whole candidate is discarded.
      // The canonical record spelling survives, never the model's.
      const canonical = speciesByFold.get(trimmed.toLowerCase());
      if (!canonical) continue;
      if (candidates.some((c) => c.kind === "note" && c.value === canonical)) continue;
      candidates.push({
        kind: "note",
        value: canonical,
        quote: PHOTO_QUOTE,
        confidence: conf,
      });
    }
    // Any other kind — including "note" — does not exist on this path.
  }

  return { candidates, personSeen: false };
}

export function boundedInput(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_INPUT_LEN) return null;
  return trimmed;
}

export { MAX_INPUT_LEN };
