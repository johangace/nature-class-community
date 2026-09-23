/**
 * The join link's one piece of reasoning (#529).
 *
 * A teacher is invited by her school lead, not by us. The invitation carries a
 * link, the link carries her school's name as free text, and the landing says
 * that name back to her so the first screen she sees is about her school
 * rather than about our product.
 *
 * The name is therefore attacker-controlled text on a public, unauthenticated
 * surface, and it is the only untrusted string on that page. Everything below
 * exists to make it boring: something short, on one line, made only of
 * characters a school name is actually written with, that React can render as
 * text and nothing else.
 *
 * There is no school record behind it. `Class.school` has always been free
 * text a teacher types, and this only saves her the typing — she still sees
 * the field, and she can still change it. That is deliberate: an invitation
 * that silently bound her to an entity would be the Schools-edition feature
 * this ticket explicitly is not.
 */

import { isInviteCohort } from "./analytics/events";

/**
 * Long enough for the longest real school names ("The Cathedral Church of St
 * Saviour and St Mary Overie Primary School" is 62), short enough that no
 * headline can be turned into a paragraph of someone else's copy.
 */
export const SCHOOL_NAME_MAX = 80;

/**
 * Control characters, the Unicode line/paragraph separators, the zero-width
 * family and the bidi overrides. None of them can appear in a school name, and
 * each of them can make rendered text lie about itself: a bidi override can
 * reverse what a reader sees, a zero-width joiner can hide a word inside
 * another, and a line separator can break one headline into two.
 */
const INVISIBLE =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Angle brackets are stripped rather than escaped. React escapes them already,
 * so this is not what stops a script tag running — it is what stops the page
 * printing `<script>` at a teacher as if it were her school's name. The markup
 * never becomes markup either way; this decides which of the two harmless
 * outcomes she reads.
 */
const MARKUP = /[<>]/g;

/**
 * Read the `school` query parameter as a name we are willing to say out loud.
 *
 * Returns null for anything that is not a usable name — absent, empty, only
 * punctuation we stripped, the wrong type, or a repeated parameter we did not
 * ask for. Null is the generic landing, which is a complete page in its own
 * right, so there is never a half-addressed state to design around.
 */
export function readSchoolName(raw: unknown): string | null {
  // Next hands a repeated `?school=a&school=b` back as an array. Take the
  // first and ignore the rest rather than joining them into a name nobody sent.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;

  const cleaned = value
    .replace(INVISIBLE, " ")
    .replace(MARKUP, " ")
    // Collapse last, so the characters we just removed leave no double spaces
    // and a name padded out to five thousand blanks measures as empty.
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return null;
  if (cleaned.length <= SCHOOL_NAME_MAX) return cleaned;

  // A truncated name is still hers, and still better than none: "Saint
  // Bartholomew's Church of England Primary…" is recognisable, and the field
  // on the next screen is editable.
  return `${cleaned.slice(0, SCHOOL_NAME_MAX).trimEnd()}…`;
}

/**
 * Read the `cohort` query parameter (#821): a neutral code saying which invite
 * link this was, never a name. Anything that is not exactly the allowed shape
 * (see INVITE_COHORT_PATTERN) is dropped, not repaired, so a school's name
 * pasted into the parameter reads as no cohort at all. Letters are lowercased
 * first, the one forgiveness, because link templates get retyped.
 */
export function readInviteCohort(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return isInviteCohort(code) ? code : null;
}

/**
 * What the landing says at the top. One sentence, sentence case, and the
 * school's name is the subject of it because the school is who invited her.
 */
export function joinHeadline(school: string | null): string {
  return school
    ? `${school} is bringing lessons outside with Nature Class.`
    : "Your school is bringing lessons outside with Nature Class.";
}
