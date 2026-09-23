/**
 * The closing absence line — THE SEAM, DELIBERATELY SILENT.
 *
 * The sketch's best idea and its least buildable one: at the end of a session,
 * a line about what today did NOT hold. "The grasshoppers that are usually
 * loud this week stayed quiet — maybe it was too hot even for them."
 *
 * It does not ship. This file exists so that it ships as SILENCE rather than
 * as an invention, and so that the day the evidence arrives, the wiring is a
 * body swap here and not a new surface.
 *
 * ── WHY IT IS GATED ────────────────────────────────────────────────────────
 *
 * A striking absence needs two things, and we have one of them:
 *
 *   HAVE:     a species with a multi-year record near this school that this
 *             read did not return. Workstream A resolves those and stores
 *             them, and `ClassCast.absences` carries them to this function.
 *   MISSING:  a resolver token that distinguishes "expected here now and not
 *             recorded" from "the read was thin", "it is the wrong week", and
 *             "nobody happened to be logging". Pointmoon does not emit it
 *             (flagged to the augur; sophia marked the beat pending on
 *             purpose).
 *
 * Without that token, every sentence this function could write is a guess
 * dressed as an observation. "The grasshoppers stayed quiet" is a beautiful
 * line and a lie when the truth is that nobody went outside with a phone. An
 * invented absence is worse than no absence: it teaches a class to notice
 * something that was never missing, and it is exactly the invented-nature
 * failure the whole cast contract exists to prevent.
 *
 * So: absences flow in, nothing flows out. The surfaces render nothing when
 * this returns null, which is the entire behaviour today.
 *
 * ── HOW TO OPEN IT ─────────────────────────────────────────────────────────
 *
 * When the resolver emits the token, this function's body is the only code
 * that changes. Its callers already handle null and already handle a string,
 * because they have been handling null since the day they were written.
 *
 * Two rules on the sentence when it is finally written:
 *
 *   1. It may only speak of a member whose absence carries the token. Not of
 *      one that is merely missing from a list.
 *   2. It stays a wondering, never a finding. "Maybe it was too hot even for
 *      them" is honest about a cause we do not know. "It was too hot for
 *      them" is a claim the payload cannot support.
 *
 * ── WHERE HALF THE TOKEN NOW COMES FROM (#208) ─────────────────────────────
 *
 * A pack's `expectedSilence` declaration is a written-down claim that this
 * place has nothing to say about a signal, and why. `isSpeakableSilence` in
 * lib/expected-silence.ts is true for exactly that case, and false for a gap
 * nobody explained. It is the distinction this gate has been missing.
 *
 * It is not yet enough on its own: the declarations are empty in wave 1 (the
 * data waves are #209-#215), and Pointmoon still emits nothing per-species. So
 * the gate stays shut and this function still returns null. What changed is
 * that the missing piece now has a name, a type, and somewhere to arrive.
 */

import type { CastMember, ClassCast } from "./member";

export interface ClosingAbsence {
  /** The member the line is about. */
  member: CastMember;
  /** The line, in the read-aloud register. */
  line: string;
}

/**
 * The closing line about what today did not hold, or null.
 *
 * Returns null. Always, today. Every caller must render nothing for null, and
 * must not fill the space with a substitute — the empty closing is the correct
 * closing, because the children's own noticing is the content of that beat.
 */
export function closingAbsence(cast: ClassCast): ClosingAbsence | null {
  // The absences are read, not ignored: touching them here is what keeps this
  // wired to the real data rather than being a stub someone deletes as dead.
  const candidates = cast.absences.filter((m) => m.absent);
  if (candidates.length === 0) return null;

  // ── THE GATE ──
  // Every candidate is an absence from a list. None of them carries evidence
  // that it was EXPECTED today and not found, because no field says so yet.
  // Until one does, there is nothing here we are entitled to say out loud.
  return null;
}

/**
 * Does this cast carry absences at all? For a teacher-only provenance note or
 * a test, never for a child-facing surface. Knowing an absence exists is not
 * permission to describe it.
 */
export function hasCarriedAbsences(cast: ClassCast): boolean {
  return cast.absences.length > 0;
}
