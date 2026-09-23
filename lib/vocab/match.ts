import type { IndexedTerm, SessionRef, VocabCoverage, VocabIndex } from "@/lib/vocab/term-index";
import { editDistance, fold, stems, tokens, variants } from "@/lib/vocab/normalise";

/**
 * THE MATCHER: her list of words in, our sessions out, with the overlap shown
 * word by word (#563).
 *
 * ── THE THREE RULES THIS FILE IS BUILT AROUND ─────────────────────────────
 *
 * 1. HER STRING COMES BACK VERBATIM. `TermResult.input` is exactly what she
 *    typed or pasted — same case, same hyphen, same trailing comma. Folding
 *    and stemming happen inside the comparison and are never written back
 *    over her word. Her vocabulary list is her document; this is a matcher,
 *    not a corrector, and "improve the teacher's words" is explicitly not
 *    what is being built.
 *
 * 2. A MISS STAYS A MISS. A word our glossaries do not carry comes back as a
 *    miss with nothing attached. An empty result is the honest answer and is
 *    never padded with a weak match to look useful — a fabricated hit costs a
 *    teacher a lesson that does not teach her unit, which is worse than a
 *    blank.
 *
 * 3. NEAR IS SHOWN AS NEAR. A word that is one letter off ours, or one word
 *    inside a phrase of ours, is reported under `near` with the reason. It is
 *    never counted as a hit, never included in a session's overlap, and never
 *    silently promoted. If the near list is the only thing a surface can show
 *    her, it must say what it is showing.
 *
 * ── WHAT A CALLER GETS ────────────────────────────────────────────────────
 *
 * Per word: hit / near / miss, with which of our terms and which sessions.
 * Per session: exactly which of HER words it covers and by which of ours.
 * Never a bare score — a number with no overlap under it is an assertion, and
 * the point of this ticket is a match a teacher can check herself.
 *
 * Coverage rides along on the report, because a result read without the gap it
 * was measured against overstates itself: sessions with no authored glossary
 * are invisible to every word she types.
 */

/** How a word met one of ours. Both are hits; the label says which kind. */
export type HitKind =
  /** The same word once case, hyphens and list punctuation are set aside. */
  | "exact"
  /** The same word in a different number: seeds/seed, berries/berry, leaves/leaf. */
  | "inflection";

export type NearKind =
  /** Her word is one word of a phrase of ours, or ours of hers. */
  | "part-of-phrase"
  /** One letter apart. Shown so she can see the typo; never treated as a hit. */
  | "spelling";

export interface TermHit {
  kind: HitKind;
  /** OUR authored word. Hers is on the result, untouched. */
  term: string;
  sessions: SessionRef[];
}

export interface TermNear {
  kind: NearKind;
  /** OUR authored word — the thing it is near TO. */
  term: string;
  sessions: SessionRef[];
  /** Why this is not a hit, in words a surface can print as-is. */
  because: string;
}

export interface TermResult {
  /**
   * HER STRING, EXACTLY AS GIVEN. Not trimmed, not lowercased, not corrected.
   * Anything displaying a matched word displays this one.
   */
  input: string;
  status: "hit" | "near" | "miss";
  hits: TermHit[];
  near: TermNear[];
}

/** One of her words, and the term of ours a session covers it with. */
export interface OverlapWord {
  /** Her string, verbatim. */
  input: string;
  /** Our authored term. */
  term: string;
  kind: HitKind;
}

export interface SessionOverlap {
  session: SessionRef;
  /** Every one of her words this session covers. Never a count on its own. */
  words: OverlapWord[];
}

export interface MatchReport {
  /** One entry per word she gave, in the order she gave them. */
  terms: TermResult[];
  /** Sessions covering at least one of her words, best overlap first. */
  sessions: SessionOverlap[];
  counts: {
    /** Distinct words asked, after folding: a list that repeats a word asks once. */
    asked: number;
    hit: number;
    near: number;
    miss: number;
  };
  /** The gap the answer was measured against. */
  coverage: VocabCoverage;
}

/** Do two folded tokens meet under number inflection alone? */
function tokensMeet(a: string, b: string): boolean {
  if (a === b) return true;
  const candidates = new Set(stems(a));
  return stems(b).some((candidate) => candidates.has(candidate));
}

/** Is every token of `small` present in `large`, allowing inflection? */
function containedIn(small: string[], large: string[]): boolean {
  const spare = [...large];
  for (const token of small) {
    const at = spare.findIndex((other) => tokensMeet(token, other));
    if (at === -1) return false;
    spare.splice(at, 1);
  }
  return true;
}

/** At most this many near misses per word, so a pasted paragraph cannot flood. */
const NEAR_LIMIT = 5;

function nearMisses(input: string, index: VocabIndex): TermNear[] {
  const folded = fold(input);
  if (folded === "") return [];
  const hers = tokens(input);
  const found: TermNear[] = [];

  for (const term of index.terms) {
    const ours = tokens(term.term);
    if (ours.length === 0) continue;

    if (ours.length !== hers.length) {
      const [small, large] = ours.length < hers.length ? [ours, hers] : [hers, ours];
      if (containedIn(small, large)) {
        found.push({
          kind: "part-of-phrase",
          term: term.term,
          sessions: term.sources.map((source) => source.session),
          because:
            ours.length < hers.length
              ? `"${term.term}" is part of what you wrote, not the whole of it`
              : `what you wrote is one part of our term "${term.term}"`,
        });
        continue;
      }
    }

    // A typo is only legible as a typo in a word long enough for one letter to
    // be an accident. Below five letters, one letter apart is a different word.
    if (folded.length >= 5 && editDistance(folded, term.folded, 1) <= 1) {
      found.push({
        kind: "spelling",
        term: term.term,
        sessions: term.sources.map((source) => source.session),
        because: `one letter apart from our term "${term.term}" — not treated as a match`,
      });
    }
  }

  return found
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "part-of-phrase" ? -1 : 1;
      return a.term.localeCompare(b.term);
    })
    .slice(0, NEAR_LIMIT);
}

/** The terms of ours one of her words hits, and how. Empty is a legitimate answer. */
function hitsFor(input: string, index: VocabIndex): TermHit[] {
  const folded = fold(input);
  if (folded === "") return [];

  const seen = new Set<string>();
  const hits: TermHit[] = [];
  for (const key of variants(input)) {
    for (const term of index.byVariant.get(key) ?? []) {
      if (seen.has(term.folded)) continue;
      seen.add(term.folded);
      hits.push({
        kind: term.folded === folded ? "exact" : "inflection",
        term: term.term,
        sessions: term.sources.map((source) => source.session),
      });
    }
  }
  // Exact before inflection, then alphabetical: an order a surface can rely on.
  return hits.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "exact" ? -1 : 1;
    return a.term.localeCompare(b.term);
  });
}

/**
 * Match a teacher's own vocabulary list against the index.
 *
 * `inputs` are her words as she gave them — one per entry, already split by
 * whatever surface took them. Blank entries are kept and reported as misses
 * rather than dropped, so what comes back lines up entry for entry with what
 * went in.
 */
export function matchVocabulary(
  inputs: readonly string[],
  index: VocabIndex
): MatchReport {
  const results: TermResult[] = [];
  const overlaps = new Map<string, SessionOverlap>();
  const countedInputs = new Set<string>();
  const counts = { asked: 0, hit: 0, near: 0, miss: 0 };

  for (const input of inputs) {
    const hits = hitsFor(input, index);
    const near = hits.length > 0 ? [] : nearMisses(input, index);
    const status: TermResult["status"] =
      hits.length > 0 ? "hit" : near.length > 0 ? "near" : "miss";
    results.push({ input, status, hits, near });

    // A list that repeats a word asks once, so the counts do not inflate and
    // one session cannot claim the same word twice. A blank entry is reported
    // back in place — her list, her rows — but asks nothing.
    const folded = fold(input);
    if (folded === "" || countedInputs.has(folded)) continue;
    countedInputs.add(folded);
    counts.asked += 1;
    counts[status] += 1;
    if (hits.length === 0) continue;

    for (const hit of hits) {
      for (const session of hit.sessions) {
        const existing = overlaps.get(session.sessionId);
        const word: OverlapWord = { input, term: hit.term, kind: hit.kind };
        if (existing) {
          const already = existing.words.some(
            (w) => w.input === input && w.term === hit.term
          );
          if (!already) existing.words.push(word);
        } else {
          overlaps.set(session.sessionId, { session, words: [word] });
        }
      }
    }
  }

  const sessions = [...overlaps.values()].sort((a, b) => {
    const byWords = distinct(b.words) - distinct(a.words);
    if (byWords !== 0) return byWords;
    // A session a teacher can reach today comes first among equals; the rest
    // is alphabetical, so the same list always produces the same order.
    if (a.session.onShelf !== b.session.onShelf) return a.session.onShelf ? -1 : 1;
    return a.session.sessionId.localeCompare(b.session.sessionId);
  });

  return { terms: results, sessions, counts, coverage: index.coverage };
}

/** How many of HER distinct words a session covers. */
export function distinct(words: readonly OverlapWord[]): number {
  return new Set(words.map((word) => fold(word.input))).size;
}

/**
 * A pasted list, split into entries — and NOTHING else done to them.
 *
 * Newlines, commas, semicolons, tabs and pipes separate; a space never does,
 * because "leaf litter" and "root hairs" are one term each and splitting them
 * would silently ask a different question from the one she asked. Entries are
 * kept exactly as they arrive, bullets and capitals and trailing commas
 * included: the fold inside the match already ignores that furniture, so
 * there is no reason to touch her string on the way in.
 */
export function splitList(raw: string): string[] {
  return raw.split(/[\n\r,;\t|]+/).filter((entry) => entry.trim() !== "");
}
