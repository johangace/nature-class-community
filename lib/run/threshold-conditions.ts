import { resolvePhases } from "@/lib/resolve";
import type { Block, Session } from "@/schema/pack";

/**
 * THE DAY'S CONDITIONS, ONCE, ON THE WAY OUT (#672).
 *
 * `app/run/page.tsx` composes ONE grounded sentence per run — "Right now it
 * feels like 24 degrees out under a soft grey sky, with a light breeze.
 * Recently seen near here: …" — and freezes it into every groundable
 * `conditions-line` before the runner receives the session. That sentence is
 * the one piece of a lesson that is supposed to be true of THIS day and THIS
 * place; it is the entire reason the app reads the weather.
 *
 * It was composed at model cost on every session start and the DEFAULT runner
 * rendered none of it. `HybridJourney` filtered `conditions-line` out of every
 * moment and the settle deck dropped it, so the sentence reached only
 * `?run=legacy` and `?run=scroll`. Paid for and invisible, which is the one
 * state the product cannot defend: show it, or stop paying for it.
 *
 * THIS IS THE SELECTOR BOTH MODERN SURFACES SHARE. The scroll already hoisted
 * the session's first conditions-line to its arrival screen and filtered it out
 * of the body ("Ambience, read once on the way in", app/globals.css); the
 * hybrid journey now does the same at its threshold — the "Introduce today"
 * page, the last screen before the class goes outside. One rule, named once,
 * so a future surface cannot quietly disagree with the other two about which
 * line is the day's line.
 *
 * WHY THE FIRST ONE. "Right now" is true when the lesson starts, so the
 * earliest authored placement is the one worth saying — the same reasoning
 * `sayConditionsOnce` (#270/#671) already uses when it drops a repeat. In the
 * shipped packs the two agree by construction: of 56 sessions, 45 author
 * exactly one conditions-line at the head of the lesson, 7 author none, and the
 * four autumn-starter sessions that author two (`meet-your-tree`,
 * `leaves-and-their-trees`, `bark-rubbings`, `seed-searchers`) have the second
 * collapsed into a byte-identical repeat by grounding and removed before this
 * ever sees it.
 *
 * THE NAMED COST. When grounding is unavailable — no location, no key, a failed
 * read — those four sessions keep two genuinely DIFFERENT authored lines, and
 * the threshold shows the first only. That is the same trade the scroll has
 * shipped since #288, and it is strictly more than the default runner showed
 * before this file existed, which was nothing. The alternative (render the
 * survivor in its authored phase as well) would re-open the duplicate #270
 * closed the moment grounding came back, so the beat is one beat.
 *
 * THE WALK IS THE PLAN AS WRITTEN. `resolvePhases(session, null)` reads the base
 * phases, which is what both surfaces render; no shipped pack authors a
 * conditions-line inside a weather variant, and if one ever does, the honest
 * answer here is the same as everywhere else — the plan's line, not an
 * alternate the teacher is not looking at.
 */

/** A `conditions-line` block, narrowed off the block union. */
export type ConditionsLineBlock = Extract<Block, { type: "conditions-line" }>;

/**
 * The one conditions-line a run surface says at its threshold, or null when
 * the session authors none (a real state: the seven autumn-garden sessions,
 * and the screen is simply shorter).
 */
export function thresholdConditions(session: Session): ConditionsLineBlock | null {
  for (const phase of resolvePhases(session, null)) {
    for (const block of phase.blocks) {
      if (block.type === "conditions-line") return block;
    }
  }
  return null;
}
