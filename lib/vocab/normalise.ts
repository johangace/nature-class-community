/**
 * FOLDING AND STEMMING FOR THE VOCABULARY JOIN (#563).
 *
 * A teacher's own key-vocabulary list is the join key between her planning
 * file and our shelf. She already has the list; it sits in the unit she is
 * planning, and the words in it are largely downstream of the statutory
 * programme of study every English primary teaches — which is why they are a
 * join key at all, and not one school's private vocabulary.
 *
 * This file is the only place her words are altered, and they are altered
 * ONLY to compare. Nothing here is ever stored, echoed back, or shown to her.
 * What she sees is her own string, byte for byte, next to whatever it matched.
 * Same rule as the verbatim-fidelity guard: her document is hers. We recognise
 * the words in it; we never rewrite them.
 *
 * ── WHAT FOLDING DOES, AND WHY EACH STEP ───────────────────────────────────
 *
 *   case          "Micro-habitat" and "micro-habitat" are one word on any
 *                 planning sheet in the country.
 *   accents       decomposed to their base letter, so a term pasted out of a
 *                 word processor with a combining acute still meets its
 *                 plainly-typed twin.
 *   hyphens       "micro-habitat" / "micro habitat" is a typography choice,
 *                 not a different word. Folded to a space on BOTH sides, so
 *                 the rule is symmetric and neither spelling is privileged.
 *   punctuation   list punctuation (bullets, trailing commas, quotes) is how
 *                 a pasted list arrives, not part of the word.
 *   whitespace    collapsed, because a pasted column carries tabs.
 *
 * Folding is deliberately shallow. It removes the ways the SAME word gets
 * typed differently. It does not try to decide that two different words mean
 * the same thing — there is no authority to cite for that, which is why
 * #622's unit-name synonym set was closed rather than merged, and why nothing
 * in this directory asserts an equivalence between two distinct words.
 *
 * ── WHAT STEMMING DOES, AND WHY IT IS A CANDIDATE SET ──────────────────────
 *
 * English inflection is ambiguous in the singularising direction: "leaves" is
 * the plural of "leaf", "lives" of "life", and "hives" of "hive". A single
 * canonical stem has to guess, and a wrong guess either misses a real hit or
 * — far worse — invents one.
 *
 * So a token yields a SET of candidate forms, and two words match when their
 * sets intersect. A plural always generates its own singular candidate, so
 * the relation is symmetric: it does not matter whether the plural is on her
 * side or ours. Nothing is stripped from the front of a word, ever, and no
 * suffix beyond simple number inflection is touched — "seedling" must never
 * fold into "seed". That timidity is inherited from lib/glossary.ts, which
 * learned it the expensive way: a word marked as teachable that is not the
 * authored word is a teacher explaining the wrong thing out loud.
 */

/** A folded term: lowercase, unaccented, unhyphenated, unpunctuated, single-spaced. */
export function fold(term: string): string {
  return term
    // A list marker is how a pasted row arrives, not part of the word: "- bud",
    // "• bud" and "3. bud" are all the word "bud". Only ever removed from the
    // FRONT, and only a marker followed by a space, so a term that genuinely
    // opens with a number keeps it.
    .replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, "")
    .normalize("NFKD")
    // Combining marks, once NFKD has separated them from their base letter.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Every dash family, plus the underscore and the slash a pasted list uses.
    .replace(/[-\u2010-\u2015\u2212_/\\]+/g, " ")
    // Apostrophes vanish rather than splitting: "bird's" folds to "birds",
    // which its own inflection rule then reaches "bird" from.
    .replace(/['\u2018\u2019\u02bc]/g, "")
    // Anything else that is not a letter, a digit or a space is list furniture.
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The folded tokens of a term. Empty for a term that folds to nothing. */
export function tokens(term: string): string[] {
  const folded = fold(term);
  return folded === "" ? [] : folded.split(" ");
}

/**
 * Candidate forms of one folded token, the token itself always first.
 *
 * Only number inflection, and only off the end:
 *
 *   ies  → y     berries → berry        (never for a 4-letter word: "ties")
 *   sses → ss    grasses → grass
 *   Xes  → X     bushes → bush, boxes → box, branches → branch  (s/x/z/ch/sh)
 *   ves  → f/fe  leaves → leaf, lives → life   (both, because English cannot
 *                decide; the wrong one is a candidate nothing will match)
 *   s    → —     habitats → habitat     (never after ss/us/is: grass, focus,
 *                                        analysis keep their s)
 *
 * A singular is left alone: it needs no candidates of its own, because every
 * plural generates the singular. That keeps the set small and keeps this
 * function from inventing words.
 */
export function stems(token: string): string[] {
  const out = [token];
  const add = (candidate: string) => {
    if (candidate.length >= 2 && !out.includes(candidate)) out.push(candidate);
  };

  if (token.length >= 5 && token.endsWith("ies")) add(`${token.slice(0, -3)}y`);
  if (token.length >= 5 && token.endsWith("ves")) {
    add(`${token.slice(0, -3)}f`);
    add(`${token.slice(0, -3)}fe`);
  }
  if (token.length >= 5 && /(?:ss|x|z|ch|sh)es$/.test(token)) add(token.slice(0, -2));
  if (
    token.length >= 4 &&
    token.endsWith("s") &&
    !/(?:ss|us|is)$/.test(token)
  ) {
    add(token.slice(0, -1));
  }

  return out;
}

/**
 * Every folded form of a whole term, the fold itself always first.
 *
 * The cartesian product across tokens, because a two-word term can inflect on
 * either word ("root hairs", "banded wedge shells"). Real terms are one to
 * four short tokens with at most three candidates each, so the product is
 * tiny; the cap below exists so that a teacher pasting a whole sentence into
 * the box gets a poor match rather than a hung process.
 */
export function variants(term: string): string[] {
  const parts = tokens(term);
  if (parts.length === 0) return [];

  let built: string[][] = [[]];
  for (const part of parts) {
    const candidates = stems(part);
    const next: string[][] = [];
    for (const prefix of built) {
      for (const candidate of candidates) {
        next.push([...prefix, candidate]);
        if (next.length >= 64) break;
      }
      if (next.length >= 64) break;
    }
    built = next;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const combination of built) {
    const key = combination.join(" ");
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Levenshtein distance, capped: returns `cap + 1` as soon as it is certain the
 * true distance exceeds `cap`. Used only to SHOW a near miss as a near miss —
 * never to promote one to a hit.
 */
export function editDistance(a: string, b: string, cap = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i, ...new Array<number>(b.length).fill(0)];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (row[j - 1] ?? 0) + 1;
      const cell = Math.min(substitution, deletion, insertion);
      row[j] = cell;
      if (cell < best) best = cell;
    }
    if (best > cap) return cap + 1;
    previous = row;
  }
  return previous[b.length] ?? cap + 1;
}
