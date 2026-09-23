import type { Block, DoorQuestion, LessonPictures, Phase } from "@/schema/pack";

/**
 * WHICH PICTURES BELONG TO THE MOMENT ON SCREEN (#1078).
 *
 * The runner used to answer this with five components and four session ids.
 * `AnimalInspiration` asked whether the lesson was `animal-leaf-masks` at four
 * separate call sites; `WoodlouseExample` asked for a session id AND an exact
 * question string. There was no arbitration between them, so the coordination
 * was suppression — `!hasMaskAnimals(session.id) &&` appeared three times
 * purely to keep the species board off the mask art — and nothing could see
 * that a picture had already been shown. Walked on 2026-09-08, the same four
 * mask illustrations rendered on three consecutive screens.
 *
 * This file is the replacement, and it is deliberately small:
 *
 *   - PURE. Authored pack data in, a picture set or null out. No model call,
 *     no fetch, no session id anywhere in it.
 *   - THREE NAMED ANCHORS, each one screen: the lesson's opening
 *     (`openingPictures`), a phase (`phase.pictures`), and one door question
 *     (`doorQuestions[i].pictures`). "The whole session" is not an anchor,
 *     which is the entire point.
 *   - ONE SET PER ANCHOR, so "one slot" is structural rather than a rule
 *     somebody has to remember. The mask lesson's making steps are one
 *     `how-to` of two pictures, not two sets of one.
 *
 * WHAT DECIDES THE SLOT. Authored pictures hold it; species evidence fills it
 * only when nothing authored claims it and the moment earns it under the rules
 * that already existed (`shouldShowDoorEvidence`, `fieldMediaPhaseIndex`).
 * Nothing here touches what may be CLAIMED about a place — the honesty tiers,
 * the credits and the topic filter are untouched and sit underneath.
 */

/**
 * An authored door question, however it was written.
 *
 * A bare string is the shipped form and keeps its shipped meaning: ask this,
 * and let the species board fill the slot as a glance. Outside packs do not
 * break to gain a field they have not used.
 */
export function asDoorQuestion(entry: string | DoorQuestion): DoorQuestion {
  return typeof entry === "string" ? { question: entry } : entry;
}

/**
 * The three anchors, as a structural type rather than the whole `Session`.
 *
 * Narrow on purpose: this reads authored pictures and nothing else, so a
 * caller with a partial session — every unit test that builds one by hand —
 * can ask the question without constructing a lesson.
 */
export type PictureAnchors = {
  openingPictures?: LessonPictures | undefined;
  phases?: readonly Pick<Phase, "pictures">[] | undefined;
  doorQuestions?: readonly (string | DoorQuestion)[] | undefined;
};

/** Every picture set a session authors, across all three anchors. */
export function authoredPictures(session: PictureAnchors): LessonPictures[] {
  const sets: LessonPictures[] = [];
  if (session.openingPictures) sets.push(session.openingPictures);
  for (const phase of session.phases ?? []) if (phase.pictures) sets.push(phase.pictures);
  for (const entry of session.doorQuestions ?? []) {
    const authored = asDoorQuestion(entry).pictures;
    if (authored) sets.push(authored);
  }
  return sets;
}

/**
 * DOES THIS LESSON PUT LOCAL SPECIES IN FRONT OF A CLASS AT ALL? (#1078)
 *
 * A session that hands a child an imaginative choice — "which animal will you
 * be today?", four drawn animals to pick between — is not asking them to look
 * for what is living outside, and a row of candidate local species beside that
 * choice is a second, different lesson competing with the one being taught.
 *
 * That judgement was previously spelled `hasMaskAnimals(session.id)` at three
 * suppression sites. It is the same judgement; the difference is that it is
 * now derived from what a lesson AUTHORS rather than from what it is called,
 * so the second craft lesson does not have to be added to an `if`.
 *
 * Scoped to `choose-from` deliberately. An `example` names one thing and an
 * how-to shows a step; neither is a claim about what the lesson is for. Only
 * `choose-from` says "the creatures in this lesson are the ones on this
 * screen", which is the sentence that conflicts with the board.
 */
export function offersImaginativeChoice(session: PictureAnchors): boolean {
  return authoredPictures(session).some((set) => set.purpose === "choose-from");
}

/**
 * WHICH MOMENT OF A PHASE THE PHASE'S PICTURES LAND ON.
 *
 * A `how-to` goes with the DEMONSTRATION, because that is what it is: a
 * `demo` block is the lesson saying "show them how", and drawn steps are the
 * same instruction in another medium. Anchoring it anywhere else separates a
 * picture of cutting from the moment a teacher says to cut. Where a phase has
 * no demo — collecting leaves is a phase with none — it falls to the first
 * moment, which is where the instruction is given.
 *
 * Everything else goes on the first moment. Once, at the head of the phase.
 *
 * NOT PINNED ACROSS THE PHASE. A how-to could reasonably stay on screen while
 * hands are busy, and that is a real question Johan has not answered; pinning
 * is a different container rather than a different index, so it is left as a
 * follow-up rather than assumed here.
 */
export function pictureMomentOf(
  phase: Pick<Phase, "pictures">,
  moments: readonly { blocks: readonly Block[] }[]
): number | null {
  if (!phase.pictures || moments.length === 0) return null;
  if (phase.pictures.purpose !== "how-to") return 0;
  const demo = moments.findIndex((moment) =>
    moment.blocks.some((block) => block.type === "demo")
  );
  return demo === -1 ? 0 : demo;
}

/** The phase's pictures when this is their moment, else null. */
export function picturesForMoment(
  phase: Pick<Phase, "pictures">,
  momentIndex: number,
  moments: readonly { blocks: readonly Block[] }[]
): LessonPictures | null {
  return pictureMomentOf(phase, moments) === momentIndex ? phase.pictures ?? null : null;
}
