import { offersImaginativeChoice } from "@/lib/lesson/pictures";
import type { DoorQuestion, LessonPictures, Phase } from "@/schema/pack";

/**
 * The one deterministic material-visibility decision the runner makes,
 * fixing nc#403.
 *
 * `HybridJourney` resolves a session's candidate species/reference photos
 * ONCE, server-side, from topic and locality — it never knows which teaching
 * moment is on screen. Before this, it mounted that same photo strip under
 * every phase unconditionally, so Counting Life (an open counting/noticing
 * survey) showed three candidate species directly under "count everything
 * that's alive within ten steps". Naming likely answers before children look
 * changes the task from noticing what is present to confirming a supplied
 * list.
 *
 * This function is the boundary: given the phase currently on screen and the
 * media the session resolved, it decides whether that media may render HERE.
 * Deliberately narrow —
 *   - no model call, no network request: `phase.materialPurpose` is authored
 *     pack data (schema/pack.ts), read synchronously;
 *   - blind to anything but the phase and whether there is anything to show,
 *     so the same session's media can be visible on one phase and withheld on
 *     another as the teacher steps through — decided by lesson purpose and
 *     moment, never merely by whether `items` is non-empty.
 */
export function shouldShowFieldMedia(
  phase: Pick<Phase, "materialPurpose">,
  items: { length: number }
): boolean {
  if (items.length === 0) return false;
  return phase.materialPurpose !== "open-count";
}

/**
 * THE ONE PHASE THE STRIP EARNS (#1019).
 *
 * `shouldShowFieldMedia` is a veto, not a choice: it withholds the strip on an
 * open-count phase and lets it through everywhere else. So a session with no
 * `materialPurpose` authored anywhere — every session in the catalogue but the
 * two re-authored for nc#403 — mounted the same three thumbnails under every
 * screen it has. On 2026-09-06 the leaf-mask lesson showed one identical strip
 * on Collect, on Sort 1 of 3 and on Sort 2 of 3. By the third screen it is
 * wallpaper, and it has no relationship to the instruction above it.
 *
 * The strip's job is "here is what you might meet when you go and look", so it
 * belongs at the moment a class is about to go and look, and only there. That
 * is the FIRST body phase the veto lets through:
 *
 *   - `gather` is reflection on what already happened — a class telling the
 *     room what it found does not need candidate photographs, and on the
 *     leaf-mask lesson that is exactly Show and tell and Circle time;
 *   - `present` is the Introduce beat, indoors, before anyone has gone to
 *     look (the partner curriculum's three-part shape, 2026-09-07): the strip
 *     belongs on the Take outside step that follows it, not on the board;
 *   - the phases after the first are the class already at work with the
 *     material in their hands. Sorting a pile of leaves does not need pictures
 *     of blackberries.
 *
 * The threshold before all of them (`IntroduceToday`) keeps its own evidence
 * and its own gate — `shouldShowDoorEvidence` below — because the door is the
 * one place a class is told what it might meet, and it carries a per-card
 * claim this row does not.
 *
 * TAKES THE RUNNER'S BODY PHASES, not `session.phases`. An authored settle is
 * lifted into the settle ritual and the circle phase into Circle time before
 * the walk begins (`HybridJourney`, `bodyPhases`), so neither is a step this
 * indexes — and a settle is arriving and going quiet, which is not a moment
 * for candidate photographs either.
 *
 * Pure, synchronous, authored pack data only, same as everything else here.
 * Returns null when no phase qualifies.
 */
export function fieldMediaPhaseIndex(
  phases: readonly Pick<Phase, "materialPurpose" | "mode">[]
): number | null {
  const at = phases.findIndex(
    (phase) =>
      phase.materialPurpose !== "open-count" && phase.mode !== "gather" && phase.mode !== "present"
  );
  return at === -1 ? null : at;
}

/**
 * Both questions at once, for the runner: may this media render on the phase
 * currently on screen? Keeps `shouldShowFieldMedia`'s veto and adds #1019's
 * once-per-session rule on top of it.
 */
export function showsFieldMedia(
  phases: readonly Pick<Phase, "materialPurpose" | "mode">[],
  phaseIndex: number,
  items: { length: number }
): boolean {
  const phase = phases[phaseIndex];
  if (!phase) return false;
  if (!shouldShowFieldMedia(phase, items)) return false;
  return fieldMediaPhaseIndex(phases) === phaseIndex;
}

/**
 * The SAME decision, asked at the threshold rather than mid-phase (nc#403,
 * reopened 2026-08-31).
 *
 * `shouldShowFieldMedia` gates the body-phase photo strip and, on its own,
 * was not the whole fix: `IntroduceToday` — the door screen every session
 * opens on, before any phase is on the screen at all — resolves its OWN
 * evidence via `resolveDoor` and mounted it unconditionally too. A live
 * regression check on 25 Aug found Counting Life's door still showing three
 * candidate species (Common Starling, Eurasian Magpie, Great Crested Grebe)
 * directly above "What's living in our grounds?" and the button that starts
 * the count — the exact priming this ticket exists to remove, reached
 * through a second surface the first fix never touched.
 *
 * The door has no single phase to key off — it is BEFORE all of them — so
 * this asks the only question that makes sense there: does this session open
 * on ANY open-count phase? A session that counts everything alive must not
 * be primed with expected answers before the count starts, so one open-count
 * phase anywhere in the session is enough to withhold the door's evidence
 * for the whole session, not just for that later phase.
 *
 * Pure and synchronous, same as `shouldShowFieldMedia`: reads authored pack
 * data only, no model call, no new upstream request. Called both on the
 * server (`app/run/page.tsx`, to skip drafting a joining sentence nobody
 * will see — the door line is already null-for-no-evidence, this just adds
 * the reason) and on the client (`HybridJourney`'s `IntroduceToday`, which
 * resolves the same evidence again because `resolveDoor` is pure and
 * client-safe).
 *
 * A SECOND REASON TO WITHHOLD, ADDED IN #1078. A session that hands a child
 * an imaginative choice — "which animal will you be today?", four drawn
 * animals to pick between — is not asking a class to look for what is living
 * outside, and candidate local species beside that choice is a second lesson
 * competing with the one being taught. That judgement used to be spelled
 * `hasMaskAnimals(session.id)` at the call sites; it is the same judgement,
 * derived now from what a lesson AUTHORS rather than from what it is called,
 * so the next craft lesson does not have to be added to an `if`.
 */
export function shouldShowDoorEvidence(session: {
  phases: readonly Pick<Phase, "materialPurpose" | "pictures">[];
  openingPictures?: LessonPictures | undefined;
  doorQuestions?: readonly (string | DoorQuestion)[] | undefined;
}): boolean {
  if (session.phases.some((phase) => phase.materialPurpose === "open-count")) return false;
  return !offersImaginativeChoice(session);
}
