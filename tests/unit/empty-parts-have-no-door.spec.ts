import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  nextStep,
  outdoorNextLabel,
  previousStep,
  resumePhaseStep,
  type JourneyShape,
  type Step,
} from "@/lib/run/journey-steps";

const journey = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);

/**
 * A PART WITH NO MOMENTS HAS NO DOOR (#1194).
 *
 * `phaseMoments` empties a part whose every line the board already asked, and
 * the walk (#1187, PR #1193) steps over such a part in both directions. Two
 * doors around the walk did not, and both opened a page with chrome and
 * nothing to teach on it:
 *
 * 1. RESUME landed a saved position on the empty part, clamped to moment 0.
 * 2. The PART STRIP still offered that part a chip.
 *
 * A third read the wrong part without opening it: the outdoor Next label named
 * the ADJACENT part while `goNext` opened the next part with something in it,
 * so with parts `[2, 0, 3, 0]` the button promised part 1 and delivered part 2.
 *
 * The shapes below are synthetic on purpose. No shipped session has an empty
 * part today (the ticket says so), which is exactly why these need writing
 * down: the failure arrives with future content, and by then nobody is looking.
 */

/** A lesson shape with the given moments per part, and the usual ends. */
function shapeOf(
  phaseMoments: number[],
  overrides: Partial<JourneyShape> = {}
): JourneyShape {
  return {
    settleCards: 3,
    phaseMoments,
    askCount: 1,
    day: false,
    introduceFirst: false,
    circle: false,
    reflect: false,
    ...overrides,
  };
}

/** Every step from the topic to the end, in order. */
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

const same = (a: Step, b: Step) => JSON.stringify(a) === JSON.stringify(b);

describe("resume never lands on a part with nothing to say (#1194)", () => {
  it("resolves a saved position on an empty part forward to the next part that teaches", () => {
    const shape = shapeOf([2, 0, 3, 0]);
    expect(resumePhaseStep(shape, 1, 0)).toEqual({ kind: "phase", phase: 2, moment: 0 });
  });

  it("resolves past a run of empty parts, not into the first of them", () => {
    const shape = shapeOf([2, 0, 0, 0, 1]);
    expect(resumePhaseStep(shape, 1, 0)).toEqual({ kind: "phase", phase: 4, moment: 0 });
  });

  it("lands on the lesson's close when everything after the saved part is empty", () => {
    expect(resumePhaseStep(shapeOf([2, 0], { circle: true }), 1, 0)).toEqual({
      kind: "circle",
    });
    expect(resumePhaseStep(shapeOf([2, 0], { reflect: true }), 1, 0)).toEqual({
      kind: "reflect",
    });
  });

  /**
   * `celebrate` is one of the walk's two dead ends: no back control, and
   * `HybridJourney`'s persistence effect clears the saved run on arrival. A
   * resume that landed there would answer "this part is empty" by ending the
   * lesson and deleting her place — worse than the empty page this fixes,
   * which at least had a working Next and Back.
   */
  it("stops at the last thing taught rather than ending a lesson it was asked to resume", () => {
    expect(resumePhaseStep(shapeOf([2, 0]), 1, 0)).toEqual({
      kind: "phase",
      phase: 0,
      moment: 1,
    });
    // Nothing was taught outside at all: the grounding's last card, and the
    // outside screen when the lesson grounds nowhere.
    expect(resumePhaseStep(shapeOf([0, 0]), 0, 0)).toEqual({ kind: "settle", card: 2 });
    expect(resumePhaseStep(shapeOf([0, 0], { settleCards: 0 }), 0, 0)).toEqual({
      kind: "outside",
    });
  });

  it("still restores the exact saved moment when the part has one", () => {
    const shape = shapeOf([2, 0, 3, 0]);
    expect(resumePhaseStep(shape, 2, 1)).toEqual({ kind: "phase", phase: 2, moment: 1 });
  });

  it("clamps a saved moment past the end of a part that shrank but did not empty", () => {
    const shape = shapeOf([2, 0, 3, 0]);
    expect(resumePhaseStep(shape, 0, 9)).toEqual({ kind: "phase", phase: 0, moment: 1 });
  });

  it("restores inside the introduction said indoors, which the walk never empties", () => {
    const shape = shapeOf([3, 0, 2], { introduceFirst: true });
    expect(resumePhaseStep(shape, 0, 2)).toEqual({ kind: "phase", phase: 0, moment: 2 });
  });

  /**
   * The property the cases above are instances of, in two halves. Wherever a
   * run was saved, resume lands somewhere the forward walk actually visits —
   * she is never on a screen her Next button could not have reached — AND
   * somewhere she can still leave by going back, which `celebrate` is not.
   */
  it("only ever lands where the walk goes, and never on a screen with no way out", () => {
    for (const moments of [[2, 0, 3, 0], [0, 0], [1, 0, 0, 2], [2, 0], [3, 0, 2], [0]]) {
      for (const introduceFirst of [false, true]) {
        for (const circle of [false, true]) {
          for (const reflect of [false, true]) {
            for (const settleCards of [0, 3]) {
              const shape = shapeOf(moments, {
                introduceFirst,
                circle,
                reflect,
                settleCards,
              });
              const reachable = walk(shape);
              for (let phase = 0; phase < moments.length; phase += 1) {
                for (const moment of [0, 1, 5]) {
                  const landed = resumePhaseStep(shape, phase, moment);
                  const where = `${JSON.stringify(shape.phaseMoments)} circle=${circle} reflect=${reflect} settle=${settleCards} saved at ${phase}:${moment} landed on ${JSON.stringify(landed)}`;
                  expect(
                    reachable.some((step) => same(step, landed)),
                    `off the walk — ${where}`
                  ).toBe(true);
                  expect(previousStep(landed, shape), `no way back — ${where}`).not.toBeNull();
                }
              }
            }
          }
        }
      }
    }
  });

  it("is what the runner's resume actually calls, rather than a second copy of the rule", () => {
    // Whole file, not a window around `applyResume`: a slice measured in
    // characters passes a live regression as soon as a comment pushes it out
    // of view, which is the failure `phase-moments.ts` was written up for.
    expect(journey).toContain(
      "setStep(resumePhaseStep(shape, saved.step.phase, saved.step.moment))"
    );
    // The clamp that landed her on the empty part is gone, not merely wrapped,
    // anywhere in the file and across any line breaks.
    expect(journey).not.toMatch(/moment:\s*Math\.min\(\s*saved\.step\.moment/);
  });
});

describe("the outdoor Next label names where Next lands (#1194)", () => {
  const titles = ["Notice", "Wonder", "Gather", "Share"];

  it("names the part the walk actually opens when the adjacent one is empty", () => {
    const shape = shapeOf([2, 0, 3, 0]);
    const atLastMomentOfPartZero = { kind: "phase", phase: 0, moment: 1 } as const;
    // The old label read `bodyPhases[step.phase + 1]` and said "Wonder".
    expect(outdoorNextLabel(atLastMomentOfPartZero, shape, { partTitles: titles })).toBe(
      "Next: Gather →"
    );
    // And it is the same part the button opens.
    expect(nextStep(atLastMomentOfPartZero, shape)).toEqual({
      kind: "phase",
      phase: 2,
      moment: 0,
    });
  });

  it("finishes rather than naming a trailing empty part", () => {
    const shape = shapeOf([2, 0, 3, 0]);
    const end = { kind: "phase", phase: 2, moment: 2 } as const;
    expect(outdoorNextLabel(end, shape, { partTitles: titles })).toBe("Finish →");
    expect(
      outdoorNextLabel(end, shapeOf([2, 0, 3, 0], { circle: true }), { partTitles: titles })
    ).toBe("Finish · circle time →");
  });

  it("says plain Next while there are moments left in this part", () => {
    const shape = shapeOf([3, 2]);
    expect(outdoorNextLabel({ kind: "phase", phase: 0, moment: 0 }, shape, { partTitles: titles })).toBe("Next →");
    expect(outdoorNextLabel({ kind: "phase", phase: 0, moment: 1 }, shape, { partTitles: titles })).toBe("Next →");
  });

  it("is unchanged on a lesson whose parts all teach", () => {
    const shape = shapeOf([2, 3, 1]);
    expect(outdoorNextLabel({ kind: "phase", phase: 0, moment: 1 }, shape, { partTitles: titles })).toBe("Next: Wonder →");
    expect(outdoorNextLabel({ kind: "phase", phase: 1, moment: 2 }, shape, { partTitles: titles })).toBe("Next: Gather →");
    expect(outdoorNextLabel({ kind: "phase", phase: 2, moment: 0 }, shape, { partTitles: titles })).toBe("Finish →");
    expect(
      outdoorNextLabel({ kind: "phase", phase: 2, moment: 0 }, shapeOf([2, 3, 1], { circle: true }), { partTitles: titles })
    ).toBe("Finish · circle time →");
  });

  it("falls back to a true generic rather than throwing when a title is missing", () => {
    expect(outdoorNextLabel({ kind: "phase", phase: 0, moment: 1 }, shapeOf([2, 1]))).toBe(
      "Next: the next part →"
    );
  });

  it("is read from the walk by the surface, not computed beside the button", () => {
    expect(journey).toContain("outdoorNextLabel(step, shape, {");
    // The adjacent-part read is what produced the wrong promise.
    expect(journey).not.toContain("bodyPhases[step.phase + 1]");
  });
});
