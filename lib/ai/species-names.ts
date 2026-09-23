/**
 * NAMES UNCHANGED: the shared half of every model guard that lets a species
 * name through.
 *
 * `conditions-line.ts` enforces NUMBERS UNCHANGED, and it is the whole rule
 * there. Two later drafters — `look-for-line.ts` and `door-line.ts` — enforce
 * NAMES UNCHANGED instead, and that check has a shape neither of them should
 * own privately: a model that writes "and see if the blackberries are ripe"
 * has invented a species in correct English, and the pattern that catches it
 * is subtle enough that the first run of look-for-line's own suite waved it
 * straight through.
 *
 * So it lives once. The two callers differ in what they ask of a line; they
 * must not differ in what counts as inventing a creature.
 */

/** Loose match: casing and inner whitespace vary, the words must not. */
export function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * A word-boundary pattern for a species name that also catches its plural.
 *
 * The plural branches are not tidiness. "Blackberry" in the vocabulary and
 * "blackberries" in the draft are the same invention, and a pattern anchored
 * only on the singular is a guard that reports success.
 */
export function nameToPattern(name: string): RegExp {
  return new RegExp(`\\b${nameStemSource(name)}\\b`, "i");
}

/**
 * The name as a regex fragment that also matches its plural, for a caller
 * building a bigger pattern around it — the door's abundance check needs
 * "several ... hoverflies" and cannot reach inside `nameToPattern` for the
 * stem. Exported so there is one answer to "what is the plural of this name?"
 */
export function nameStemSource(name: string): string {
  const escaped = name.replace(ESCAPE, "\\$&");
  // berry -> berries, bush -> bushes, swallow -> swallows.
  return escaped.endsWith("y")
    ? `${escaped.slice(0, -1)}(?:y|ies)`
    : `${escaped}(?:s|es)?`;
}

/**
 * The first species the line names that it was not given, or null.
 *
 * THE MASK IS THE WHOLE TRICK. The grounded names come OUT of the line first,
 * because a name we supplied can contain a name we did not: "Barn Swallow" is
 * a legitimate pick at Porto and the vocabulary also holds the bare word
 * "Swallow". Without the mask the guard rejects a perfectly grounded line
 * because a species it was given contains a species it was not. Observed on
 * the first live run; Porto declined for exactly this.
 */
export function namedOutsideSet(
  line: string,
  allowed: ReadonlyMap<string, string>,
  lexicon: readonly string[],
): string | null {
  let haystack = normaliseName(line);
  for (const allowedName of allowed.values()) {
    haystack = haystack.replaceAll(normaliseName(allowedName), " ");
  }

  for (const term of lexicon) {
    const needle = normaliseName(term);
    if (!needle) continue;
    if (allowed.has(needle)) continue;
    if (nameToPattern(needle).test(haystack)) return term;
  }
  return null;
}
