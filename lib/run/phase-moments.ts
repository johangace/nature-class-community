import { phaseBlocks } from "@/lib/lesson/stretch";
import { groupViews, type Moment } from "@/lib/moments";
import type { Phase } from "@/schema/pack";
import { sameWords, words } from "@/lib/lesson/driving-question";

/**
 * THE MOMENTS A PHASE PAGE ACTUALLY SHOWS (#738).
 *
 * The journey's teaching body renders one moment per screen, and the day's
 * conditions-line is not one of them. It is said ONCE, at the threshold
 * (`lib/run/threshold-conditions.ts`, #672) — the screen every route through
 * the lesson passes — and the phase pages below it drop it, which is what
 * keeps a teacher from meeting "right now it feels like 24 degrees" a second
 * time, minutes later, in front of a class (#270/#671).
 *
 * WHY IT IS A FUNCTION AND NOT THREE FILTERS.
 *
 * That rule was written out three times inside `HybridJourney.tsx` — the
 * resume clamp, the first-sighting walk, and the phase render itself — and the
 * first-sighting walk's own comment said what the arrangement cost: "the same
 * filtered pipeline the phase pages render with, so a position key computed
 * here is the position key the page computes". Three copies that have to agree
 * about which blocks are on a screen, and one of them also computing the
 * `phase:moment:block` keys the other two are indexed by.
 *
 * It cost more than tidiness. #733 shipped a guard for the render copy that
 * asserted the SOURCE TEXT `block.type !== "conditions-line"` appeared in
 * `HybridJourney.tsx` — and because the string appeared four times, deleting
 * the phase render's filter outright left the whole 1,932-test suite green
 * (#738). A rule spread across a file is a rule a test can only grep for.
 * Named once, it is a rule a test can CALL: the phase-page spec now renders
 * what this returns, so deleting the filter below turns it red.
 *
 * WHAT IT RETURNS. The moments of a phase, in reading order, each carrying
 * only the blocks the page renders, and no moment that would render empty.
 * Byte-for-byte the arrangement the three copies produced between them: a
 * moment survives exactly when it holds something other than the day's line,
 * and the block indices are the indices of what is drawn — which is what the
 * first-sighting keys depend on.
 *
 * IT IS NOT A PLACE TO HIDE A SECOND RULE. Anything that decides what a
 * teacher reads on a phase page belongs here, where one test can see it, and
 * not back inside the JSX.
 *
 * THE SECOND RULE, NAMED HERE FOR THAT REASON (2026-09-13). The Introduction
 * asks the lesson's door questions on the board before anyone goes out
 * (#1004), and #1008 gave the minibeast hunt a second one by copying the
 * Engage phase's own spoken line ("What is your favourite minibeast and
 * why?") — deliberately leaving Johan's line in the phase, because authored
 * words are added beside, never moved. So the class was asked it at the
 * board and again as the first thing outside. `asked` is the list of
 * questions the board already put to the class; a spoken line that says the
 * same words is not a second screen. The comparison is the #150 one, words
 * not bytes, so a full stop or a capital cannot make it two questions. The
 * pack is untouched: the print and the pre-reading still carry the line where
 * he wrote it.
 */
export function phaseMoments(phase: Phase, asked: readonly string[] = []): Moment[] {
  const askedWords = asked.map(words);
  const alreadyAsked = (text: string) => {
    const said = words(text);
    return askedWords.some((question) => sameWords(question, said));
  };
  const shown: Moment[] = [];
  for (const moment of groupViews(phaseBlocks(phase))) {
    const blocks = moment.blocks.filter(
      (block) =>
        block.type !== "conditions-line" &&
        !(block.type === "say-aloud" && alreadyAsked(block.text))
    );
    // A moment that was nothing but the day's line is not a shorter screen,
    // it is a blank one. It does not become a screen at all.
    if (blocks.length > 0) shown.push({ ...moment, blocks });
  }
  return shown;
}
