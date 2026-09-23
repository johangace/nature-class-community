import type { LessonSupportContext } from "@/lib/ai/prompts";
import { projectRouteBeat, type LessonJourney } from "@/lib/lesson/journey";
import type { OutsideNow } from "@/lib/outside";
import type { AbilityBand, Session } from "@/schema/pack";
import { abilityLabels } from "@/lib/ability";
import { allPhases } from "@/lib/resolve";

/**
 * How many care lines the model is shown, and why the phase she is on does not
 * count against it (#791).
 *
 * This used to be a flat `.slice(0, 8)` over `preparation`, `materialFallback`
 * and then every phase's tips in phase order. The budget is real — the prompt
 * has a length to keep — but the ORDER made it systematically drop the wrong
 * lines: a teacher deep in a lesson got the first two phases' care and none of
 * her own. `autumn-w3-where-the-leaves-go` is the measured case. It authors 19
 * care lines. The eighth is `lift-2`'s magnifying-glass tip, so the cut landed
 * two lines above *"Look, never pick, wash hands after. Say why out loud: some
 * are food, some are not, and nobody can tell by looking"* — the mushroom
 * guidance, in a lesson about what lives under wet leaves. Every line from
 * `meet-3` and `crumble-4` was gone as well, including *"A child does not want
 * it on their hands"* and its answer.
 *
 * That was survivable while the prompt only ever asked the model to talk. It
 * stopped being survivable when `prompts/_shared/hands-in.md` began asking it
 * to reach for the version a child can pick up, because that fragment defers to
 * "the authored lesson's own call" on what may be handled — and a deferral to
 * something the model was never shown is not a deferral.
 *
 * The first fix kept the budget and exempted the phase named in `phaseKey`.
 * Review of PR #1212 showed that was still the wrong shape:
 * `app/session/LessonPreparationAssistant.tsx` asks for support with **no
 * phase at all** — it is the surface a teacher uses to plan the lesson before
 * she teaches it — so the one request most about materials and care got the
 * eight-line cut and the handling nudge together. A fix that protects only the
 * callers who happen to name a phase moves the hazard rather than removing it.
 *
 * So the truncation is gone, and the honest bound is the pack itself, measured
 * rather than assumed: 51 of the 61 sessions authored more than the old budget,
 * which is the real size of what was being dropped. A couple of pages of
 * authored care is not what makes this prompt expensive, and no amount of it is
 * safe to guess at. The phase she is on is ordered first because attention is
 * worth spending there, not because the rest is optional.
 *
 * WHAT COUNTS AS CARE, and why it is not just `tips` (#791, round 3).
 *
 * The list gathered `preparation`, `materialFallback` and tips, and stopped —
 * so the most explicit handling rules in the whole curriculum never reached the
 * model at all. They live in `demo` blocks, in the `look` field, and they read
 * like this:
 *
 *     garden-w3-elements  "Anyone alive gets watched, never picked up, and
 *                          their roof put carefully back."
 *     garden-w4-leaf-to-soil
 *                         "The creatures stay in their home. We are visitors,
 *                          not collectors."
 *
 * The `earth` phase of `garden-w3-elements` authors no tips at all, so that
 * demo line is its whole position on picking things up, and under the old rule
 * it was invisible. `teacher-note` carries
 * the same kind of thing ("Everything dug up goes back: the patch should look
 * undisturbed when you leave").
 *
 * The line drawn here is about WHO the text is for, which is a property of the
 * block type rather than a guess about its content: `say-aloud` and
 * `circle-question` are the words a teacher says TO children, and everything
 * else authored in a phase — `teacher-note`, and a demo's move, steps and
 * `look` — is guidance FOR her. Care lives in the second kind, so the second
 * kind is what the model is shown.
 *
 * The ceiling that follows is **35 lines and 2,690 characters**, in
 * `bark-rubbings`, and the number is worth one sentence of its own because the
 * first two attempts at it were wrong. Both were measured by a script standing
 * beside this function rather than by the function: one predated the
 * `conditionVariants` walk below, and neither joined the lines the way the
 * prompt does. `tests/unit/lesson-support.spec.ts` now measures through
 * `careLines` itself and asserts exactly these two bounds, so the documented
 * figure and the shipped behaviour cannot drift apart again.
 */
const authored = (line: string | null | undefined): line is string => Boolean(line?.trim());

function careLines(session: Session, phaseKey: string | null): string[] {
  const careOf = (phase: Session["phases"][number]) => [
    ...(phase.tips ?? []).flatMap((tip) => [tip.when, tip.then]),
    ...(phase.blocks ?? []).flatMap((block) => {
      if (block.type === "teacher-note") return [block.text];
      if (block.type === "demo") {
        return [block.move, ...block.steps.map((step) => step.text), block.look];
      }
      return [];
    }),
  ].filter(authored);
  const isCurrent = (phase: Session["phases"][number]) =>
    phaseKey !== null && phase.key === phaseKey;

  const phases = allPhases(session);
  return [
    ...[session.preparation, session.materialFallback].filter(authored),
    ...phases.filter(isCurrent).flatMap(careOf),
    ...phases.filter((phase) => !isCurrent(phase)).flatMap(careOf),
  ];
}

/**
 * Close the model's world around the reviewed lesson and bounded evidence.
 * School coordinates, teacher identity and raw provider data never cross it.
 */
export function lessonSupportContext(input: {
  journey: LessonJourney;
  session: Session;
  outside: OutsideNow | null;
  phaseKey?: string | null;
  ability?: AbilityBand | null;
  classBand?: string | null;
}): LessonSupportContext {
  const { journey, session } = input;
  /**
   * The beat she is on, base or variant (#791).
   *
   * `journey.route` is the lesson's SPINE and holds base phases only, which is
   * right — a teacher is not shown a beat per weather variant. But a surface
   * asking about the phase on screen names the RESOLVED phase, so on a windy
   * day it sends `explore-windy` and this lookup found nothing. Before the
   * route accepted those keys they were a 404; after it, they would have been
   * a request reaching the model with no current phase and no authored words
   * at all, while the task rules ask it to adapt the current authored moment.
   * So the variant is projected on demand, through the same projection the
   * route itself uses.
   */
  const routeBeat = input.phaseKey
    ? journey.route.find((beat) => beat.key === input.phaseKey) ??
      (() => {
        const phase = allPhases(session).find((p) => p.key === input.phaseKey);
        return phase ? projectRouteBeat(phase) : null;
      })()
    : null;
  const care = careLines(session, input.phaseKey ?? null);

  const localFacts: string[] = [];
  if (input.outside?.conditions.line) {
    localFacts.push(`Current conditions: ${input.outside.conditions.line}`);
  }
  for (const sighting of input.outside?.sightings ?? []) {
    const presence = sighting.presence;
    if (!presence || presence.radiusKm > 5) continue;
    localFacts.push(
      `${sighting.name} was recorded within ${presence.radiusKm} km between ${presence.windowStart} and ${presence.windowEnd}.`
    );
  }

  return {
    sessionTitle: journey.title,
    objective: journey.objective,
    ageBand:
      (input.ability ? abilityLabels[input.ability] : null) ??
      input.classBand?.trim() ??
      journey.ageBand,
    childWork: journey.childWork.summary,
    phaseTitles: journey.route.map((beat) => beat.title),
    currentPhase: routeBeat?.title ?? null,
    authoredWords: routeBeat?.lead ?? null,
    safetyAndCare: care,
    localFacts,
    /**
     * THE REGION'S CALENDAR, AND WHY IT IS NOT A LOCAL FACT (#1281, #1293).
     *
     * `seasonalNote` describes what the region's week usually brings. It is
     * not a reading taken at this school, and `prompts/lesson-support.md`
     * licenses the model to claim a species or condition is PRESENT exactly
     * when it appears in verified local facts. Putting this sentence in
     * `localFacts`, as the first draft did, therefore let "Blackberries at
     * peak, ripe fruits everywhere" license a hyperlocal answer saying there
     * are blackberries in the playground — which only the separately filtered
     * `sightings` can ever establish. Codex found it in review before it
     * shipped.
     *
     * So it travels in a field of its own and is rendered under its own
     * heading, which states in the prompt itself what it cannot do. This is
     * the same rule #172 wrote for the two species lists: two claims, two
     * channels, never merged because a merged one can only be read as the
     * stronger of the two.
     */
    regionalExpectation: input.outside?.conditions.seasonalNote ?? null,
    materialFallback: journey.preparation.materialFallback,
  };
}
