import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadAllPacks } from "@/lib/pack";
import { doorQuestions } from "@/lib/lesson/door";
import { resolvePhases } from "@/lib/resolve";
import { phaseMoments } from "@/lib/run/phase-moments";
import {
  isIndoorIntroduction,
  nextStep,
  previousStep,
  type JourneyShape,
  type Step,
} from "@/lib/run/journey-steps";
import type { Block, Session } from "@/schema/pack";

/**
 * AN AUTHORED INTRODUCTION IS SAID INSIDE (#1187).
 *
 * Johan, 2026-09-13: "then Settle, then after that is another intro? that
 * part right here, it usually asks questions that could be asked inside?"
 * Eight starter sessions author an `introduce` part first; the walk used to
 * run it after the grounding, outside. This spec pins the hoist on every
 * shipped session that authors one, and pins that nothing else moved.
 */

function shapeOf(session: Session): { shape: JourneyShape; keys: string[] } {
  const phases = resolvePhases(session, null);
  const authoredSettle = phases.find((phase) => phase.key === "settle");
  const bodyAll = phases.filter((phase) => phase !== authoredSettle);
  const isCircle = (blocks: Block[]) => blocks.some((block) => block.type === "circle-question");
  const circlePhase = bodyAll.find((phase) => isCircle(phase.blocks));
  const bodyPhases = bodyAll.filter((phase) => phase !== circlePhase);
  const asked = doorQuestions(session).map((entry) => entry.question);
  const authoredCards = (authoredSettle?.blocks ?? []).filter(
    (block) => block.type === "say-aloud"
  ).length;
  return {
    keys: bodyPhases.map((phase) => phase.key),
    shape: {
      settleCards: authoredCards > 0 ? authoredCards : 5,
      phaseMoments: bodyPhases.map((phase) => phaseMoments(phase, asked).length),
      askCount: asked.length,
      day: false,
      introduceFirst: isIndoorIntroduction(bodyPhases[0]),
      circle: Boolean(circlePhase),
      reflect: false,
    },
  };
}

/** Every step from the topic to the end, in order; the walk must terminate. */
function walk(shape: JourneyShape): Step[] {
  const steps: Step[] = [{ kind: "topic" }];
  for (let guard = 0; guard < 500; guard += 1) {
    const next = nextStep(steps[steps.length - 1]!, shape);
    if (!next) break;
    steps.push(next);
  }
  expect(steps.at(-1)).toEqual({ kind: "celebrate" });
  return steps;
}

/** Forward and back agree at every interior step. */
function mirrors(shape: JourneyShape): void {
  const steps = walk(shape);
  for (let index = 1; index < steps.length; index += 1) {
    const here = steps[index]!;
    if (here.kind === "celebrate") continue;
    expect(previousStep(here, shape)).toEqual(steps[index - 1]);
  }
}

const sessions = loadAllPacks().flatMap((pack) => pack.sessions);
const hoisting = sessions.filter((session) => shapeOf(session).shape.introduceFirst);
const plain = sessions.filter((session) => !shapeOf(session).shape.introduceFirst);

describe("an authored introduction is said inside (#1187)", () => {
  it("is the starter packs' Introduce part, and nothing else", () => {
    expect(hoisting.length).toBeGreaterThan(0);
    for (const session of hoisting) {
      expect(shapeOf(session).keys[0]).toBe("introduce");
    }
  });

  for (const session of hoisting) {
    it(`${session.id}: introduces before the door, grounds outside, then teaches part 1`, () => {
      const { shape } = shapeOf(session);
      const kinds = walk(shape).map((step) =>
        step.kind === "phase" ? `phase${step.phase}` : step.kind
      );
      const first = (kind: string) => kinds.indexOf(kind);
      const last = (kind: string) => kinds.lastIndexOf(kind);
      // ask → introduction → outside → settle → part 1: each strictly after the last.
      expect(first("phase0")).toBeGreaterThan(last("ask"));
      expect(first("outside")).toBeGreaterThan(last("phase0"));
      expect(first("settle")).toBeGreaterThan(first("outside"));
      expect(first("phase1")).toBeGreaterThan(last("settle"));
      // Every moment of the introduction is walked, and only once.
      expect(kinds.filter((kind) => kind === "phase0")).toHaveLength(shape.phaseMoments[0]!);
      // And the introduction never comes back after the door.
      expect(last("phase0")).toBeLessThan(first("outside"));
    });

    it(`${session.id}: back is the exact inverse across the hoisted stretch`, () => {
      const { shape } = shapeOf(session);
      const steps = walk(shape);
      for (let index = 1; index < steps.length; index += 1) {
        const here = steps[index]!;
        if (here.kind === "celebrate") continue;
        expect(previousStep(here, shape)).toEqual(steps[index - 1]);
      }
      // Reversing out of the first outdoor part lands on the grounding, never
      // on the introduction said inside.
      expect(previousStep({ kind: "phase", phase: 1, moment: 0 }, shape)).toEqual({
        kind: "settle",
        card: shape.settleCards - 1,
      });
      expect(previousStep({ kind: "phase", phase: 0, moment: 0 }, shape)).toEqual({
        kind: "ask",
        index: shape.askCount - 1,
      });
    });
  }

  it("leaves every other session's walk exactly as it was", () => {
    for (const session of plain) {
      const { shape } = shapeOf(session);
      const kinds = walk(shape).map((step) =>
        step.kind === "phase" ? `phase${step.phase}` : step.kind
      );
      expect(kinds.indexOf("outside")).toBeGreaterThan(kinds.lastIndexOf("ask"));
      expect(kinds.indexOf("settle")).toBeGreaterThan(kinds.indexOf("outside"));
      if (shape.phaseMoments.length > 0) {
        expect(kinds.indexOf("phase0")).toBeGreaterThan(kinds.lastIndexOf("settle"));
      }
    }
  });

  it("hoists with no question at all: the look hands straight to the introduction", () => {
    const shape: JourneyShape = {
      settleCards: 5,
      phaseMoments: [2, 3],
      askCount: 0,
      day: false,
      introduceFirst: true,
      circle: true,
      reflect: true,
    };
    expect(nextStep({ kind: "look" }, shape)).toEqual({ kind: "phase", phase: 0, moment: 0 });
    expect(previousStep({ kind: "phase", phase: 0, moment: 0 }, shape)).toEqual({ kind: "look" });
    mirrors(shape);
  });

  it("hoists with no grounding: the door hands straight to part 1, and back", () => {
    const shape: JourneyShape = {
      settleCards: 0,
      phaseMoments: [2, 3],
      askCount: 1,
      day: true,
      introduceFirst: true,
      circle: false,
      reflect: false,
    };
    expect(nextStep({ kind: "outside" }, shape)).toEqual({ kind: "phase", phase: 1, moment: 0 });
    expect(previousStep({ kind: "phase", phase: 1, moment: 0 }, shape)).toEqual({ kind: "outside" });
    mirrors(shape);
  });

  it("does not hoist an introduction with nothing left to say", () => {
    const shape: JourneyShape = {
      settleCards: 5,
      phaseMoments: [0, 3],
      askCount: 1,
      day: false,
      introduceFirst: true,
      circle: true,
      reflect: false,
    };
    // The board asked every line already; the walk goes out, and the empty
    // part is stepped over outside, as any empty part is, in both directions.
    expect(nextStep({ kind: "ask", index: 0 }, shape)).toEqual({ kind: "outside" });
    expect(nextStep({ kind: "settle", card: 4 }, shape)).toEqual({ kind: "phase", phase: 1, moment: 0 });
    expect(previousStep({ kind: "phase", phase: 1, moment: 0 }, shape)).toEqual({ kind: "settle", card: 4 });
    expect(walk(shape).some((step) => step.kind === "phase" && step.phase === 0)).toBe(false);
    mirrors(shape);
  });

  it("steps over an empty part anywhere outside, in both directions", () => {
    const shape: JourneyShape = {
      settleCards: 2,
      phaseMoments: [2, 0, 3, 0],
      askCount: 1,
      day: false,
      introduceFirst: false,
      circle: true,
      reflect: false,
    };
    expect(nextStep({ kind: "phase", phase: 0, moment: 1 }, shape)).toEqual({ kind: "phase", phase: 2, moment: 0 });
    expect(previousStep({ kind: "phase", phase: 2, moment: 0 }, shape)).toEqual({ kind: "phase", phase: 0, moment: 1 });
    expect(nextStep({ kind: "phase", phase: 2, moment: 2 }, shape)).toEqual({ kind: "circle" });
    expect(previousStep({ kind: "circle" }, shape)).toEqual({ kind: "phase", phase: 2, moment: 2 });
    const visited = walk(shape).filter((step) => step.kind === "phase").map((step) => (step as { phase: number }).phase);
    expect(new Set(visited)).toEqual(new Set([0, 2]));
    mirrors(shape);
  });

  it("holds a lesson whose only part is the introduction: door, grounding, then the close", () => {
    const shape: JourneyShape = {
      settleCards: 2,
      phaseMoments: [3],
      askCount: 1,
      day: false,
      introduceFirst: true,
      circle: true,
      reflect: false,
    };
    expect(nextStep({ kind: "settle", card: 1 }, shape)).toEqual({ kind: "circle" });
    expect(previousStep({ kind: "circle" }, shape)).toEqual({ kind: "settle", card: 1 });
  });
});

/**
 * The runner's steps live in client state and the unit runner has no DOM to
 * tap through, so the hoisted page is pinned at the source, the way
 * `grounding-is-a-section.spec.tsx` pins the strip.
 */
describe("the hoisted introduction presents like the other indoor beats (#1187)", () => {
  const code = readFileSync("app/run/HybridJourney.tsx", "utf8");
  const start = code.indexOf('if (step.kind === "phase" && onIndoorIntroduction(step))');
  const end = code.indexOf('if (step.kind === "phase") {', start);
  const page = code.slice(start, end);

  it("has its own render branch, before the outdoor phase page", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("wears the board head and the board display, with no strip, clock or assistant", () => {
    expect(page).toContain("{introHead()}");
    expect(page).toContain("data-display={boardAttr}");
    expect(page).not.toContain("partStrip()");
    expect(page).not.toContain("AssistantSheet");
    expect(page).not.toContain("styles.outdoor");
  });

  it("keeps the adult's notes off the presented screen, unless the moment is only a note", () => {
    expect(page).toContain('board ? blocks.filter((block) => block.type !== "teacher-note") : blocks');
    expect(page).toContain("shown.length > 0 ? shown : blocks");
  });

  it("does not call the door 'next' when the introduction comes first", () => {
    expect(code).toContain('const afterQuestionsLabel = hoisted ? "Next →" : "Outside time →"');
    expect(code).toContain(': hoisted\n                  ? "Next →"\n                  : "Outside time →"');
  });

  it("ends at the door, in the same words the last question uses", () => {
    expect(page).toContain('"Outside time →"');
  });

  it("stands first in the part strip, and the strip skips it among the outdoor parts", () => {
    const strip = code.slice(code.indexOf("const partStrip = ()"), code.indexOf("aria-label=\"Parts of this lesson\"") + 2000);
    // "Ground the {groupNoun}" since #1214: the grounding chip says class,
    // family or group, so the anchor here is the source expression.
    expect(strip.indexOf("hoisted && bodyPhases[0]")).toBeLessThan(
      strip.indexOf("Ground the {groupNoun}")
    );
    // The skip now carries a second reason beside it — a part with no moments
    // gets no chip either (#1194) — so this pins the hoist half of the
    // condition rather than the whole expression. Removing the skip, inverting
    // it, or dropping the `hoisted &&` guard each turn this red; a hand-wrap of
    // the line does not, which is why there is no same-line pattern here.
    expect(strip).toContain("(hoisted && index === 0) ||");
  });

  it("reads whether part 0 is inside from the walk, never from a private rule", () => {
    expect(code).toContain("const hoisted = isHoisted(shape);");
    expect(code).toContain('hoisted && at.kind === "phase" && at.phase === 0');
    expect(code).not.toContain('introduceFirst && at.kind === "phase"');
  });

  it("does not start the lesson clock indoors", () => {
    expect(code).toContain('step.kind === "phase" && !onIndoorIntroduction(step) && startedAt === null');
  });
});
