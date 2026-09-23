import type { Block, Phase } from "@/schema/pack";

/**
 * THE AGE-STRETCH LINE, AS THE NOTE IT ALREADY IS (#466).
 *
 * A stage may carry one optional `stretch`: a line for the older children in
 * a mixed-age group, for the facilitators the #454 panel found running 4-6
 * material at sevens, tens and Brownie units. This module is the whole of the
 * mechanism that puts it on a screen.
 *
 * IT IS A TEACHER NOTE. Not a new block kind, not a new plate, not a badge.
 * The teacher note is already the register this line belongs to — the half of
 * the page she reads to herself, in plain ink, inset from the spoken line so
 * the two never share a left edge (engine/renderers/teacher-note.tsx). So the
 * stretch is turned into a `teacher-note` block and handed to the renderers
 * that already exist, which is why it arrives on every surface at once: the
 * hybrid runner, the legacy runner, the scroll, the pre-read brief, the printed
 * plan and the legacy plan page's "Notes by phase" panel
 * (`app/session/TeachingNotes.tsx` → `PhaseNotesContent`, reached at
 * `?plan=legacy`) all read a phase's blocks through `phaseBlocks` below. That
 * last one was wired in #668: it `filter`s the phase's notes, so the stretch
 * joins them, and the panel is the same one `/read` builds — a stage showing
 * fewer notes in one page-mode than the other is the quiet kind of wrong.
 *
 * IT STANDS AT THE HEAD OF THE STAGE, because a decision about who a stage is
 * pitched at is one a facilitator makes on the way IN, not on the way out.
 * Under `groupViews` a leading quiet block attaches forward to the moment it
 * sets up (nc#326), so the line lands above the stage's first spoken words —
 * which is exactly what a note that sets up a stage is.
 *
 * ONE KNOWN EDGE, named rather than hidden: the LEGACY runner's quiet
 * child-work posture (`app/run/WorkPhase.tsx`, reached only at `?run=legacy`
 * on a `work` phase) shows one authored cue and then deliberately stops asking
 * for attention. It reads the phase directly and does not show a stretch line.
 * Giving it a second note would be inventing a treatment on the one screen
 * built to go quiet, so the default runner — which has no such posture and
 * pages every stage — carries the line, and this is a note for whoever next
 * touches that file rather than a silent difference.
 *
 * `find` VERSUS `filter` IS THE WHOLE TEST for whether a surface should be
 * wired, and it is why `WorkPhase` stays out while `PhaseNotesContent` came in
 * (#668). A surface that `find`s the first teacher note has exactly one slot,
 * so a leading stretch DISPLACES the authored cue; a surface that `filter`s
 * them has as many slots as there are notes, so the stretch ACCOMPANIES them.
 * Wire the second kind; leave the first kind alone and say so here.
 *
 * THE SETTLING RITUAL IS OUT, and the schema says so rather than this file
 * quietly dropping it: the settle renders as paired cards (a spoken line with
 * the note that follows it), so a leading note there would never reach a
 * screen. `phaseSchema` rejects a `stretch` on a phase keyed `settle`.
 *
 * ABSENT MEANS ABSENT. `phaseBlocks` returns the phase's own array, by
 * reference, when there is no stretch. Nothing renders, nothing is reserved,
 * and no surface says a line is missing — every shipped session has none
 * today, and that is the honest state until Johan writes them. The words are
 * his; the mechanism is what this file is.
 */

type TeacherNote = Extract<Block, { type: "teacher-note" }>;

/**
 * The stage's stretch line as the block it renders as, or null when the stage
 * has none. The text is passed through VERBATIM — not trimmed, not
 * capitalised, not punctuated — for the reason the whole pack is guarded
 * byte-for-byte: an authored line is nobody else's to tidy.
 */
export function stretchNote(phase: Pick<Phase, "stretch">): TeacherNote | null {
  if (!phase.stretch || phase.stretch.trim().length === 0) return null;
  return { type: "teacher-note", text: phase.stretch };
}

/**
 * A phase's blocks as a surface should read them: the stretch note first, when
 * there is one, and otherwise the phase's own array unchanged.
 *
 * Every consumer that groups, paginates or prints a phase goes through here,
 * including the two that compute positions rather than render them (the resume
 * clamp and the entity-position map in HybridJourney). If one of those used
 * `phase.blocks` while the page used this, a saved run would resume one moment
 * off and a species link would open the wrong screen.
 */
export function phaseBlocks(phase: Phase): Block[] {
  const note = stretchNote(phase);
  return note ? [note, ...phase.blocks] : phase.blocks;
}
