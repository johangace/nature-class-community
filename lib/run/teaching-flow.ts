import type { Session, TeachingMode } from "@/schema/pack";

export { teachingModes } from "@/schema/pack";
export type { TeachingMode } from "@/schema/pack";

/** One authored phase, annotated for the runner without rewriting the pack. */
export interface TeachingFlowPhase {
  phaseIndex: number;
  phaseKey: string;
  mode: TeachingMode;
}

/**
 * The shared settling ritual is composed into loaded sessions before their
 * authored phases. It has its own runner chrome and is not one of the lesson's
 * Present / Work / Gather beats. Keep this compatibility check narrow: an
 * ordinary phase merely named "settle" is not hidden unless the session also
 * opted into the shared ritual and it occupies the composed first position.
 */
function isSharedPreamble(session: Session, phaseIndex: number): boolean {
  return session.settle === true && phaseIndex === 0 && session.phases[0]?.key === "settle";
}

/** A legacy closing phase declares itself through its block kind, not its title. */
function gathersClass(phase: Session["phases"][number]): boolean {
  return phase.blocks.some((block) => block.type === "circle-question");
}

/**
 * Resolve neutral teaching modes without mutating, deleting or reordering a
 * phase. Authored metadata always wins. Legacy lessons use a deliberately
 * small adapter: the first instructional phase presents, question-led phases
 * gather, and the phases between them are children's work.
 */
export function resolveTeachingFlow(session: Session): TeachingFlowPhase[] {
  const firstInstructionalIndex = session.phases.findIndex(
    (_phase, phaseIndex) => !isSharedPreamble(session, phaseIndex)
  );

  return session.phases.flatMap((phase, phaseIndex) => {
    if (isSharedPreamble(session, phaseIndex)) return [];

    const mode =
      phase.mode ??
      (gathersClass(phase)
        ? "gather"
        : phaseIndex === firstInstructionalIndex
          ? "present"
          : "work");

    return [{ phaseIndex, phaseKey: phase.key, mode }];
  });
}

/** The mode at one saved phase index, or null for preamble/out-of-range state. */
export function teachingModeAt(session: Session, phaseIndex: number): TeachingMode | null {
  return resolveTeachingFlow(session).find((phase) => phase.phaseIndex === phaseIndex)?.mode ?? null;
}
