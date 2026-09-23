import type { PrimerTerm } from "@/schema/pack";

/**
 * The pre-read's glossary, made live in the runner (#350).
 *
 * Johan, 2026-08-18: *"In pre read all should have glossary of new words..
 * these should be highlighted in the lesson runner if they exist.. there when
 * clicked they could have an explanation card or somehting."*
 *
 * The words were already authored — `primer.glossary` carries a term, a plain
 * definition and often a line for saying it to a child, and 48 of the 56
 * packed sessions have one. What they never had was reach: she read them at a
 * desk the night before, and outside they were plain text again, in the one
 * moment she needs them.
 *
 * This file is the matcher. It is pure, so the interesting part is testable
 * without a browser.
 *
 * ── TIMID ON PURPOSE, AND WHY ──────────────────────────────────────────────
 *
 * The same trap the cast note index fell into (lib/cast/read.ts): an exact
 * string match found almost nothing, and the greedy fix paired the wrong note
 * to the wrong animal. Here the cost lands on a teacher reading aloud to a
 * class — a word marked as teachable that is not the authored word is her
 * explaining the wrong thing, out loud, with thirty children watching.
 *
 * So:
 *
 *   BOTH EDGES MUST BE WORD BOUNDARIES. "bud" never marks inside "buddy".
 *   ONE TRAILING INFLECTION, and only s or es, so "seeds" finds "seed" while
 *     "seedling" does not. Nothing is stripped from the front, ever.
 *   LONGEST TERM WINS. "leaf litter" is marked whole rather than as "leaf"
 *     with a stray word after it.
 *   ONCE PER PASSAGE. The second "seed" in a paragraph is not a second thing
 *     to learn, it is noise around the first.
 *
 * When in doubt it marks nothing, and an unmarked word is exactly what she had
 * yesterday.
 */

export interface GlossaryMatch {
  /** The authored entry, not the words as they appeared in the text. */
  entry: PrimerTerm;
  /** The text as it actually reads, so "Seeds" is not redrawn as "seed". */
  matched: string;
}

export type GlossarySegment =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; entry: PrimerTerm };

/** Regex-safe, with runs of whitespace inside a term left flexible. */
function pattern(term: string): string {
  const escaped = term
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  // One trailing inflection, and only where the term does not already end in
  // an s. "grass" must not quietly match "grasses" through this rule; if a
  // session wants both it authors both.
  const inflection = /s$/i.test(term.trim()) ? "" : "(?:es|s)?";
  return `${escaped}${inflection}`;
}

/**
 * Terms longest-first, so a phrase is tried before any word inside it.
 * Duplicate terms collapse to the first authored entry.
 */
export function orderTerms(terms: readonly PrimerTerm[]): PrimerTerm[] {
  const seen = new Set<string>();
  const kept: PrimerTerm[] = [];
  for (const entry of terms) {
    const key = entry.term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }
  return kept.sort((a, b) => b.term.trim().length - a.term.trim().length);
}

/**
 * Split one passage into plain runs and marked terms.
 *
 * Returns a single text segment when nothing matched, which is the common case
 * and the one every caller must render identically to today.
 */
export function markTerms(
  text: string,
  terms: readonly PrimerTerm[]
): GlossarySegment[] {
  if (!text || terms.length === 0) return [{ kind: "text", text }];

  const taken: Array<{ start: number; end: number; entry: PrimerTerm }> = [];

  for (const entry of orderTerms(terms)) {
    const re = new RegExp(`\\b${pattern(entry.term)}\\b`, "gi");
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(text)) !== null) {
      const start = hit.index;
      const end = start + hit[0].length;
      // A longer term already claimed this ground, so this one is part of it.
      const clash = taken.some((t) => start < t.end && end > t.start);
      if (clash) continue;
      taken.push({ start, end, entry });
      break; // Once per passage.
    }
  }

  if (taken.length === 0) return [{ kind: "text", text }];

  taken.sort((a, b) => a.start - b.start);
  const segments: GlossarySegment[] = [];
  let at = 0;
  for (const t of taken) {
    if (t.start > at) segments.push({ kind: "text", text: text.slice(at, t.start) });
    segments.push({ kind: "term", text: text.slice(t.start, t.end), entry: t.entry });
    at = t.end;
  }
  if (at < text.length) segments.push({ kind: "text", text: text.slice(at) });
  return segments;
}

/** Does this passage carry anything to mark? Cheap enough to ask per block. */
export function hasTerms(text: string, terms: readonly PrimerTerm[]): boolean {
  return markTerms(text, terms).some((s) => s.kind === "term");
}
