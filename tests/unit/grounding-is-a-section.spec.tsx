import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GROUNDING IS A SECTION OF THE LESSON, ON EVERY SURFACE THAT LISTS SECTIONS.
 *
 * Johan, from a screenshot of the grounding screen: *"ground the class is
 * missing from the Runner and also preview.. in runner it should be treated
 * like the other sections.. also havign the outdoor mode like the rest"*.
 *
 * Two absences, one cause. The runner's part strip is built from the pack's
 * phases, and grounding is not one: `HybridJourney` lifts an authored `settle`
 * out of `bodyPhases`, and on the forty-two sessions that author none it runs
 * `DEFAULT_SETTLE` as chrome. So the one section EVERY run passes through was
 * the one the strip never named — a teacher standing in it could not see where
 * she was, and a teacher two parts in had no way back to it short of
 * restarting the lesson.
 *
 * The same screen also dropped outdoor light, which is a mode of the RUN and
 * not of a page: she sets it for the playground on a teaching page, steps back
 * into grounding, and the screen she is holding up in front of thirty children
 * in the sun is white again.
 *
 * Read as source, in the idiom `circle-time-density.spec.tsx` and
 * `journey-back-navigation.spec.tsx` established for this component: the
 * interior of the runner is behind taps and this suite has no DOM. Comments
 * are stripped first — prose that MENTIONS a control is not the control. The
 * preview half of the same ticket is pinned in `lesson-preview.spec.tsx`.
 */

const source = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);

const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** One render branch of the journey, source only. */
function branch(kind: string): string {
  const starts = [...code.matchAll(/if \(step\.kind === "(\w+)"[^)]*\) \{/g)];
  const index = starts.findIndex((match) => match[1] === kind);
  expect(index, `no ${kind} render branch`).toBeGreaterThan(-1);
  const start = starts[index]!;
  const after = starts[index + 1];
  return code.slice(start.index, after ? after.index : code.length);
}

const settle = branch("settle");
const phase = branch("phase");

describe("grounding is on the part strip", () => {
  it("draws the strip from one place, so the two copies cannot disagree", () => {
    // The strip used to be written inline on the phase page. A hand-copied
    // second one is how the done/now/to-come rules stop agreeing about which
    // chip is current — the reason #325 made these chips real controls.
    expect((code.match(/aria-label="Parts of this lesson"/g) ?? []).length).toBe(1);
    expect(settle).toContain("{partStrip()}");
    expect(phase).toContain("{partStrip()}");
  });

  it("names grounding first, and taps back to the top of the ritual", () => {
    const strip = code.slice(code.indexOf("const partStrip"), code.indexOf("{partStrip()}"));
    // The chip's word follows the audience since #1214, so this reads the
    // source expression rather than one rendering of it.
    expect(strip).toContain("Ground the {groupNoun}");
    // `card: 0`, like the phase chips' `moment: 0`: a teacher who taps back to
    // grounding is asking for the ritual, not for the fourth line of it.
    expect(strip).toContain('setStep({ kind: "settle", card: 0 })');
    expect(strip.indexOf("Ground the {groupNoun}")).toBeLessThan(strip.indexOf("bodyPhases.map"));
  });

  it("gives the grounding chip the same three states as every other chip", () => {
    const strip = code.slice(code.indexOf("const partStrip"), code.indexOf("{partStrip()}"));
    // Current while she is in it, done once she is past it — a picture of
    // navigation is what these were before #325.
    expect(strip).toContain("styles.tabNow");
    expect(strip).toContain("styles.tabDone");
    expect((strip.match(/aria-current=/g) ?? []).length).toBe(3);
  });
});

describe("outdoor light is a mode of the run, not of one page", () => {
  for (const [name, rendered] of [
    ["grounding", settle],
    ["circle", branch("circle")],
    ["a teaching part", phase],
  ] as const) {
    it(`keeps the light she set on ${name}`, () => {
      expect(rendered).toContain("styles.outdoor");
      expect(rendered).toContain('data-outdoor={outdoor ? "true" : undefined}');
    });
  }

  it("puts the toggle on grounding, where she is still choosing", () => {
    // Grounding is the last screen before the class goes out, so the control
    // belongs there. The circle gets the PAINT and not the toggle: #753 counted
    // that screen's controls down on the teacher's "too much information", and
    // `circle-time-density.spec.tsx` holds the census.
    expect(settle).toMatch(/\{head\(true, true\)\}/);
  });
});
