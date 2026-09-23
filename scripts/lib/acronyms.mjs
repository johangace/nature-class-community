/**
 * The acronym allowance, keyed by who is reading (#599).
 *
 * WHAT IT IS FOR. "Never all-caps" is a rule about SHOUTING — a word set in
 * capitals so the reader leans on it. An acronym is not shouting; it is how
 * the thing is spelled, so the caps guards let a short list of them through.
 *
 * WHY IT IS NOT A FLAT LIST ANY MORE. A flat set of terms answers "is this
 * word really an acronym", which is the wrong question. `PNW` is a legitimate
 * acronym in a teacher's `description` and an illegible one in the line a
 * seven-year-old is read from the card: same string, two readers, one rule.
 * #556 fixed the two live instances that had reached a child's card and could
 * not close the hole, because the only two moves a flat set allows were both
 * wrong — leave `PNW` in and the next region file can put it back on a child's
 * card with CI green, take it out and eleven correctly spelled teacher-facing
 * `description`s go red.
 *
 * So the allowance is keyed by AUDIENCE rather than by term alone. A term
 * names the readers it may be spelled in front of, and each field names its
 * reader. The question a guard asks becomes "would this reader be stopped by
 * this word", which is the question that was actually being decided all along.
 *
 * WHY AUDIENCE AND NOT JUST FIELD NAME. `scripts/caps-lint.mjs` judges pack
 * copy, which has no `childFriendlyNote` and no `description` — it has session
 * blocks that get read aloud in a classroom. Field names do not travel there;
 * a reader does. Keying on the reader is what lets one table serve both guards
 * instead of each keeping its own and drifting.
 *
 * ONE SOURCE, NOT TWO THAT AGREE. `tests/unit/phenology-register.spec.ts` and
 * `scripts/caps-lint.mjs` both import this file. The previous arrangement was
 * two copies of the same list with a comment on each saying it was "kept in
 * step with" the other, which is a convention, and conventions drift. A
 * drifted pair is worse than either half, because both look authoritative.
 */

/** The two readers this repo writes for. */
export const CHILD = "child";
export const TEACHER = "teacher";

/**
 * Which reader each phenology field is written for.
 *
 * `childFriendlyNote` is the card's line since Johan's ruling of 2026-08-11 on
 * #172 ("give some info about the species in the childs language").
 *
 * `species` is child-facing too, which is easy to miss because it reads like
 * metadata. `lib/outside/index.ts` maps the same entries into two shapes, and
 * both reach a card's face with nothing translating them on the way:
 *
 *   `lookFors` — `species: e.species` at `lib/outside/index.ts:178` — prints
 *   at `app/outside/page.tsx:140` as `{lookFor.species}`, which is the only
 *   string in that block NOT wrapped in `localizeText`; the note beside it, at
 *   `:143`, is.
 *
 *   `usuallyAround` — `name: e.species` at `lib/outside/index.ts:172` — prints
 *   at `app/start/LiveOutside.tsx:119` as `{n.name}`, inside the list opened at
 *   `:114`. That file imports no localizer at all.
 *
 * NOT `app/outside/page.tsx:168`, which is what #599's body cited (#612). That
 * block renders `brief.around`, whose members are cast faces filtered by
 * `withoutLookFors` (`lib/outside/brief.ts:263`), not phenology `species` —
 * `usuallyAround` reaches that page only as a `scientificName` lookup
 * (`lib/outside/brief.ts:267-268`), and `:168` is that section's heading rather
 * than a species at all. An auditor sent there finds a path that says the
 * opposite and concludes this tightening was unfounded, which is exactly the
 * cost this paragraph exists to prevent. Line numbers drift; the expressions
 * named above are what to search for.
 *
 * A species name is a name, so no acronym in this list has ever appeared in one
 * — 0 hits, and 0 capitalised runs of any kind, measured across all fifteen
 * region files — but the field is judged by the child's reader, not the
 * teacher's, because that is who reads it.
 *
 * `description` is the teaching note behind the tap. It reaches a child only
 * through `safeLookForNote`'s fallback, which fires when an entry has no
 * child's line — and the "still has a line in the child's language for every
 * entry" assertion in the register spec is what keeps that path unreachable.
 * The two-audience split below is only sound while that assertion holds; if it
 * were ever relaxed, `description` would have two readers and this table would
 * have to say so.
 */
export const FIELD_AUDIENCE = {
  childFriendlyNote: CHILD,
  species: CHILD,
  description: TEACHER,
};

/**
 * Real acronyms, and the readers each may be spelled in front of.
 *
 * Every term was measured against the corpus before it was decided (#599), not
 * assumed: where it actually occurs, in which field, and whether a seven-year-
 * old hearing it read aloud would be stopped by it.
 */
export const ACRONYMS = {
  /**
   * The United Kingdom. Grandfathered when the register guard was written and
   * still occurs nowhere in the phenology corpus. A letter-name a child says
   * without stumbling, and two of the fifteen region files are British, so a
   * child's line may well want it. No English word is spelled "UK", so unlike
   * "US" it cannot be a shouted word wearing an acronym's coat.
   */
  UK: [TEACHER, CHILD],

  /**
   * The United States. Teacher only, and this is a decision rather than an
   * inheritance. It is legible enough read aloud — but `US` is also how the
   * pronoun "us" looks when it is shouted, and the child's lines in this
   * corpus are conversational ("It's like a DJ mixing songs!"), which is
   * exactly where "come outside with US" would land. Allowing it for a child
   * buys one spelling of a country a card can write out in full, and pays for
   * it by blinding the guard to the commonest shout in the register. The one
   * live instance is teacher-facing ("other US regions"), so this costs
   * nothing on the corpus as it stands.
   */
  US: [TEACHER],

  /**
   * The Pacific Northwest, and the term this ticket is about. Correctly
   * spelled in eleven teacher-facing `description`s and unreadable to a child:
   * regional shorthand adults use in writing, with no pronunciation, in a line
   * that is meant to be read aloud. #556 spelled it out in the two child's
   * lines that had reached a card; this is what stops the next region file
   * putting it back.
   */
  PNW: [TEACHER],

  /**
   * British Columbia. The same illegibility as `PNW` by the same test — a
   * province abbreviation with no pronunciation, in a line read aloud to a
   * seven-year-old. Correctly spelled in seven teacher-facing `description`s in
   * `canada-west.json`, and it now occurs in no child's line: #611 rewrote the
   * one that did — "tough enough for BC winters" became "tough enough for
   * winters here", the same claim in the region's own voice, since a card is
   * already scoped to the region that "here" means.
   */
  BC: [TEACHER],

  /**
   * Ultraviolet light. An ordinary spoken acronym a child meets on a sunscreen
   * bottle; "U-V light" needs no translation. One live instance, teacher-side
   * (scorpions glowing under UV), and a child's line about the same scorpions
   * could reasonably use it.
   */
  UV: [TEACHER, CHILD],

  /**
   * A disc jockey. Live in two child's lines and working exactly as intended
   * there — the song thrush and the catbird are both "a bird DJ" — which is
   * the proof that this table is about legibility and not about capitals. A
   * child knows what a DJ is; that is the whole test.
   */
  DJ: [TEACHER, CHILD],
};

/** Is `term` spelled, rather than shouted, in front of this reader? */
export function allowedFor(term, audience) {
  const audiences = Object.prototype.hasOwnProperty.call(ACRONYMS, term)
    ? ACRONYMS[term]
    : null;
  return audiences !== null && audiences.includes(audience);
}

/**
 * Is `term` allowed in this phenology field? A field with no declared reader
 * is not a field this table can vouch for, so nothing is allowed in it — a new
 * field joining the register guard has to say who reads it before its
 * acronyms are waved through.
 */
export function allowedInField(term, field) {
  const audience = Object.prototype.hasOwnProperty.call(FIELD_AUDIENCE, field)
    ? FIELD_AUDIENCE[field]
    : null;
  return audience !== null && allowedFor(term, audience);
}

/** The terms this reader may see, for a guard that judges one audience only. */
export function termsFor(audience) {
  return new Set(
    Object.keys(ACRONYMS).filter((term) => allowedFor(term, audience))
  );
}
