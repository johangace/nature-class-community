/**
 * The read-aloud line — what she actually says, outside, holding the phone up.
 *
 * The daily card reports to her in her own register. This is the other half:
 * verbatim words for the class, on the in-lesson surface, where #168's real
 * safety failure gets fixed. The live card surfaced an Oriental Hornet first
 * with no look-don't-touch framing anywhere; the thing that would actually
 * have protected a child is a sentence a teacher says out loud, so that is
 * where the safety note lives — IN the spoken line, not as a glyph on a
 * morning card she reads alone.
 *
 * ── EVERY NOUN TRACES TO A TOKEN ───────────────────────────────────────────
 *
 * These sentences are assembled from the tier, the name, and the safety note,
 * and from nothing else. There is no natural-history clause, no "they love
 * warm walls", no behaviour we did not read. That restraint is the whole
 * contract: the moment a read-aloud line contains a fact nobody returned, a
 * teacher has said an invented thing to thirty children in good faith.
 *
 * ── THE THREE TIERS SAY THREE DIFFERENT THINGS ─────────────────────────────
 *
 * recorded  a statement. It has been seen near here, so she may say so.
 * regional  an invitation. It should be about; go and look.
 * absent    a hope, explicitly. Nobody has found one, and that is interesting
 *           rather than disappointing.
 *
 * Register: sentence case, no em dashes, no exclamation marks. Spoken to
 * five-year-olds, so short clauses and plain words, and never a promise —
 * "let us see if we can find one", never "you will find one". A promise the
 * grounds cannot keep is how a lesson ends in thirty disappointed children.
 */

import type { CastMember } from "./member";

/**
 * The line to say about one member of the cast.
 *
 * Returns one string, ready to be read straight off the screen. The safety
 * clause is appended rather than interleaved so it always lands last, which is
 * the part a class remembers.
 */
export type ReadAloudContext = {
  /**
   * `recorded-nearby` is available only when this request belongs to a located
   * class and the member itself carries recorded evidence. A sample may name
   * the creature but must not borrow the teacher's school or surroundings.
   */
  locality: "sample" | "recorded-nearby";
};

export function readAloudLine(
  member: CastMember,
  context: ReadAloudContext = { locality: "sample" }
): string {
  const named = `${article(member.commonName)} ${member.commonName}`;
  const namedAtStart = named.charAt(0).toUpperCase() + named.slice(1);
  const parts: string[] = [];

  if (member.absent) {
    if (context.locality === "recorded-nearby") {
      parts.push(`Nobody has recorded ${named} nearby lately.`);
    }
    parts.push(`Let us keep looking for ${named}.`);
  } else if (member.honestyTier === "recorded") {
    if (context.locality === "recorded-nearby") {
      parts.push(`${namedAtStart} was recorded nearby.`);
    } else {
      parts.push(`We might meet ${named} today.`);
    }
  } else {
    parts.push(`${namedAtStart} is usually around now.`);
    parts.push("Let us look for one.");
  }

  // Trimmed FIRST, then tested. A whitespace-only note is not a note, and
  // `hasSafety` below already says so — testing the raw string here pushed an
  // empty clause and left a trailing space on a sentence a teacher reads out.
  const safety = member.safetyNote?.trim();
  if (safety) parts.push(safety);

  return parts.join(" ");
}

/**
 * "a" or "an", by how the name is SAID rather than how it is spelled.
 *
 * The species name itself is never touched — not its case, not its spelling.
 * That is the same rule the localization layer follows for `commonName`: a
 * name is a verified fact from iNaturalist, and a table that edits one is how
 * a "Grey heron" becomes a bird that does not exist. Only the article in front
 * of it is ours to choose.
 *
 * The exceptions are the ones that actually turn up in a cast: a leading "u"
 * that is said "yoo" takes "a" (a European hornet is fine, but a "unicorn
 * beetle" is not "an unicorn beetle"), and a silent "h" takes "an". Coarse on
 * purpose — the cost of a miss is one slightly wrong article read aloud, and
 * the cost of being clever is editing a species name.
 */
export function article(name: string): "a" | "an" {
  const word = name.trim().toLowerCase();
  if (word.length === 0) return "a";

  // Said with a consonant sound despite the vowel: "a European hornet".
  if (/^(eu|ewe|use|uni|uti|ubi|ura)/.test(word)) return "a";
  // Silent h: "an hour-glass spider".
  if (/^(hour|honest|heir)/.test(word)) return "an";

  return /^[aeiou]/.test(word) ? "an" : "a";
}

/**
 * Does this member need the safety clause shown as safety rather than as prose?
 * A separate question from whether the note exists, so a surface can style the
 * clause without re-deriving the rule.
 */
export function hasSafety(member: CastMember): boolean {
  return typeof member.safetyNote === "string" && member.safetyNote.trim().length > 0;
}
