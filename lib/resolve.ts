import type { ConditionKind, Phase, Session } from "@/schema/pack";

/**
 * Condition resolution: a phase may carry whole alternate phases keyed by
 * condition. Pick the variant if one matches, otherwise the phase as planned.
 * Pure data-in, data-out — every surface resolves the same way.
 */
export function resolvePhase(phase: Phase, condition: ConditionKind | null): Phase {
  if (!condition) return phase;
  const variant = phase.conditionVariants?.find((v) => v.when === condition);
  return variant ? variant.phase : phase;
}

export function resolvePhases(session: Session, condition: ConditionKind | null): Phase[] {
  return session.phases.map((p) => resolvePhase(p, condition));
}

/**
 * Every phase a surface can be looking at, base and variant alike (#791).
 *
 * `resolvePhases` hands the runner the RESOLVED phases, so what comes back out
 * of a surface is a variant key like `explore-windy` — a key that appears
 * nowhere in `session.phases`. Anything validating or looking up a phase key
 * has to search this, not the base array, or the wet, dry and windy versions of
 * a lesson are invisible to it. `app/api/lesson-support/route.ts` was rejecting
 * exactly those keys with `phase-not-found`, which is a teacher getting an
 * error on the day the weather turns.
 *
 * Recursive, because the schema is: a variant is a whole phase and may carry
 * variants of its own.
 */
export function allPhases(session: Session): Phase[] {
  const walk = (phases: Phase[]): Phase[] =>
    phases.flatMap((phase) => [
      phase,
      ...walk((phase.conditionVariants ?? []).map((variant) => variant.phase)),
    ]);
  return walk(session.phases);
}

/** Conditions this session actually has variants for (drives the run-screen toggle). */
export function availableConditions(session: Session): ConditionKind[] {
  const found = new Set<ConditionKind>();
  for (const phase of session.phases) {
    for (const v of phase.conditionVariants ?? []) found.add(v.when);
  }
  return [...found];
}
