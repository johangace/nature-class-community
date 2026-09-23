import { demoPlainText, resolveText } from "@/lib/text";
import type { AbilityBand, Phase } from "@/schema/pack";

function authoredTask(phase: Phase, ability: AbilityBand | undefined): string {
  if (phase.childTask) return phase.childTask;

  const spoken = phase.blocks.find((block) => block.type === "say-aloud");
  if (spoken?.type === "say-aloud") {
    return resolveText(spoken.text, spoken.abilityVariants, ability);
  }

  // The compatibility adapter may classify an old demonstration as work.
  // Keep that lesson runnable from its own words instead of inventing a task.
  const demonstration = phase.blocks.find((block) => block.type === "demo");
  if (demonstration?.type === "demo") return demoPlainText(demonstration);

  return phase.title;
}

/**
 * The quiet field posture. It holds one authored task, one optional cue for
 * the teacher, and then stops asking for attention while children do the work.
 */
export function WorkPhase({
  phase,
  ability,
}: {
  phase: Phase;
  ability: AbilityBand | undefined;
}) {
  const note = phase.blocks.find((block) => block.type === "teacher-note");

  return (
    <section className="run-work" aria-labelledby="run-work-task">
      <p className="work-eyebrow">Children are working</p>
      {note?.type === "teacher-note" && (
        <p className="work-note">
          <span>For you</span>
          {resolveText(note.text, note.abilityVariants, ability)}
        </p>
      )}
      <h2 id="run-work-task" className="work-task">
        {authoredTask(phase, ability)}
      </h2>
      <p className="work-quiet-cue">Let the screen go quiet. Move on when the group is ready.</p>
    </section>
  );
}
