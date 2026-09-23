import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney } from "@/app/run/HybridJourney";
import { doorQuestions } from "@/lib/lesson/door";
import { loadAllPacks } from "@/lib/pack";
import { resolvePhases } from "@/lib/resolve";
import { phaseMoments } from "@/lib/run/phase-moments";
import {
  backLabel,
  isIndoorIntroduction,
  nextStep,
  previousStep,
  type JourneyShape,
  type Step,
} from "@/lib/run/journey-steps";
import type { Block, Phase, Session } from "@/schema/pack";

/**
 * NO PROMPT SEQUENCE IN THE RUNNER IS ONE-WAY (#752).
 *
 * A teacher who is an experienced outdoor educator, running the app with Johan on
 * 2026-08-31 — the first real teacher session this product has had
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`):
 *
 *   "She found the navigation back and forth between prompts clunky.. eg
 *    Circle time and other parts dont have a go back to previous prompt
 *    button."
 *
 * She is describing a regression. The legacy `Runner` has carried a `goBack()`
 * and a `← Back` on every teaching page since it shipped; `HybridJourney`,
 * which replaced it as the default `/run` surface, was built forward-only —
 * `setStep` was called from fourteen places and every one of them moved on.
 * Circle time was the worst of them: it renders without the part strip, so it
 * had no way backwards at all and leaving it a question early meant restarting
 * the lesson.
 *
 * THREE THINGS ARE PINNED HERE, AND THE FIRST IS THE ONE THAT MATTERS.
 *
 * 1. The WALK, over every session the packs actually ship: walk each lesson
 *    forward from the doorway to the celebration and assert that every screen
 *    in between can be reversed, and reversed to the exact screen the forward
 *    walk came from. A back that is not the inverse of forward strands a
 *    teacher somewhere the forward walk cannot reach.
 * 2. The CONTROL reaches the DOM — the settle deck is the one interior screen
 *    reachable in a static render (`startAt="settle"`, which is what the
 *    narrated preview's end card links to), so it is rendered through the real
 *    component and read for a real back control.
 * 3. Every branch of the runner that carries a forward action carries the way
 *    back beside it, so a screen cannot be quietly left out of the row.
 */

const journey = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);

/** Source with its comments removed: prose that MENTIONS a control is not the
 *  control. The same helper the other run-surface contracts use. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const code = stripComments(journey);

/** Every session the packs ship, which is what a teacher can actually open. */
function shippedSessions(): Session[] {
  return loadAllPacks().flatMap((pack) => pack.sessions);
}

const isCircle = (blocks: Block[]) =>
  blocks.some((block) => block.type === "circle-question");

/**
 * The lesson's shape as `HybridJourney` computes it.
 *
 * Mirrored here rather than imported because the settle deck is read out of
 * the pack inside the component (it depends on the class's ability band). The
 * mirror is held honest by the last test in this file, which reads the
 * component's own `shape` and asserts it is built from these five facts and
 * no others.
 */
function shapeOf(session: Session, opts: { logTo: boolean }): JourneyShape {
  const phases = resolvePhases(session, null);
  const authoredSettle = phases.find((phase) => phase.key === "settle");
  const bodyAll = phases.filter((phase) => phase !== authoredSettle);
  const circlePhase = bodyAll.find((phase) => isCircle(phase.blocks));
  const bodyPhases = bodyAll.filter((phase: Phase) => phase !== circlePhase);

  // Five default settle cards when the pack authors none — the component's
  // `DEFAULT_SETTLE`. An authored settle is one card per spoken line.
  const authoredCards = (authoredSettle?.blocks ?? []).filter(
    (block) => block.type === "say-aloud"
  ).length;

  return {
    settleCards: authoredCards > 0 ? authoredCards : 5,
    phaseMoments: bodyPhases.map(
      (phase) => phaseMoments(phase, doorQuestions(session).map((entry) => entry.question)).length
    ),
    // One question screen per authored question (#1004); every shipped
    // session authors one today.
    askCount: doorQuestions(session).length,
    // The day screen stands only when a note fired (2026-09-08); the pack
    // alone cannot say, so the mirror walks the plain day.
    day: false,
    // An authored introduction is said inside (#1187): the same key the
    // runner reads, so the mirror walks the hoisted order too.
    introduceFirst: isIndoorIntroduction(bodyPhases[0]),
    circle: Boolean(circlePhase),
    reflect: opts.logTo,
  };
}

/** The forward walk a teacher takes, from the doorway to the celebration. */
function forwardWalk(shape: JourneyShape): Step[] {
  const walk: Step[] = [{ kind: "topic" }];
  let at: Step | null = walk[0] ?? null;
  // The longest shipped lesson is nowhere near this; the bound only exists so
  // a cycle introduced by a future edit fails as a test rather than as a hang.
  for (let guard = 0; guard < 500 && at; guard += 1) {
    at = nextStep(at, shape);
    if (at) walk.push(at);
  }
  expect(walk.at(-1)).toEqual({ kind: "celebrate" });
  return walk;
}

describe("every prompt sequence in the runner can be walked backwards (#752)", () => {
  it("reverses to the exact screen the forward walk came from, on every shipped session", () => {
    const sessions = shippedSessions();
    expect(sessions.length).toBeGreaterThan(0);

    // Both runs a teacher can be in: signed in with a class (a reflection
    // screen stands before the celebration) and the signed-out demo (it does
    // not). The circle's onward tap differs between them, so the reversal has
    // to hold in both.
    for (const logTo of [true, false]) {
      for (const session of sessions) {
        const shape = shapeOf(session, { logTo });
        const walk = forwardWalk(shape);

        for (let i = 1; i < walk.length; i += 1) {
          const from = walk[i - 1];
          const to = walk[i];
          if (!from || !to) continue;
          // `celebrate` is deliberately terminal: past it the record is
          // written and the resumable run cleared, and #344's ruling is that
          // nothing gets around the record. Every other move is reversible.
          if (to.kind === "celebrate") continue;
          expect(
            previousStep(to, shape),
            `${session.id}: ${JSON.stringify(to)} does not step back to ${JSON.stringify(from)}`
          ).toEqual(from);
        }
      }
    }
  });

  it("leaves no interior screen without a way back — the audit, as a number", () => {
    let interior = 0;
    let reversible = 0;

    for (const session of shippedSessions()) {
      const shape = shapeOf(session, { logTo: true });
      for (const step of forwardWalk(shape)) {
        // The two ends: the topic is the first screen now (no doorstep).
        if (step.kind === "topic" || step.kind === "celebrate") continue;
        interior += 1;
        if (previousStep(step, shape)) reversible += 1;
      }
    }

    // Before #752 this was 0 of the same total: `HybridJourney` had no back
    // control on any screen. The assertion is the ticket's own done-condition.
    expect(interior).toBeGreaterThan(100);
    expect(reversible).toBe(interior);
  });

  it("steps back into a part at the moment she left it, not at its first prompt", () => {
    // The part strip already jumps to a part's moment 0, and a jump is not a
    // reversal: a teacher three prompts into Notice who taps back to Settle
    // and then forward again should not have lost her place. Stepping back out
    // of a part lands on the previous part's LAST moment, which is the screen
    // that was actually on the iPad a tap ago.
    const shape: JourneyShape = {
      settleCards: 5,
      phaseMoments: [3, 2, 4],
      askCount: 1,
      introduceFirst: false,
      day: true,
      circle: true,
      reflect: true,
    };

    expect(previousStep({ kind: "phase", phase: 1, moment: 0 }, shape)).toEqual({
      kind: "phase",
      phase: 0,
      moment: 2,
    });
    // Out of the first part lands on the grounding's last card, the screen
    // she left to begin teaching (2026-09-06: the introduction is said inside,
    // the grounding is the section before the parts). Out of the grounding's
    // first card lands on the spoken line she read to the class (#754), not
    // past it onto the page she read to herself.
    expect(previousStep({ kind: "phase", phase: 0, moment: 0 }, shape)).toEqual({
      kind: "settle",
      card: 4,
    });
    // The introduction's five beats (#1004, 2026-09-08) reverse one at a
    // time: outside → the last question → the day → the look → the topic,
    // which is the first screen.
    expect(previousStep({ kind: "settle", card: 0 }, shape)).toEqual({ kind: "outside" });
    expect(previousStep({ kind: "outside" }, shape)).toEqual({ kind: "ask", index: 0 });
    expect(previousStep({ kind: "ask", index: 0 }, shape)).toEqual({ kind: "day" });
    expect(previousStep({ kind: "day" }, shape)).toEqual({ kind: "look" });
    expect(previousStep({ kind: "look" }, shape)).toEqual({ kind: "topic" });
    // On a day with no note there is no day screen: the question reverses
    // onto the look, and the look walks straight to the question.
    const plainDay: JourneyShape = { ...shape, day: false };
    expect(nextStep({ kind: "look" }, plainDay)).toEqual({ kind: "ask", index: 0 });
    expect(previousStep({ kind: "ask", index: 0 }, plainDay)).toEqual({ kind: "look" });
    // The topic is the first screen: nothing before it (the doorstep is gone).
    expect(previousStep({ kind: "topic" }, shape)).toBeNull();
    // Two questions walk and reverse through their index.
    const twoQuestions: JourneyShape = { ...shape, askCount: 2 };
    expect(nextStep({ kind: "ask", index: 0 }, twoQuestions)).toEqual({ kind: "ask", index: 1 });
    expect(nextStep({ kind: "ask", index: 1 }, twoQuestions)).toEqual({ kind: "outside" });
    expect(previousStep({ kind: "outside" }, twoQuestions)).toEqual({ kind: "ask", index: 1 });
    expect(previousStep({ kind: "ask", index: 1 }, twoQuestions)).toEqual({ kind: "ask", index: 0 });
    // And with no question authored the day leads straight outside, both ways.
    const noLine: JourneyShape = { ...shape, askCount: 0 };
    expect(nextStep({ kind: "day" }, noLine)).toEqual({ kind: "outside" });
    expect(previousStep({ kind: "outside" }, noLine)).toEqual({ kind: "day" });
    expect(previousStep({ kind: "outside" }, { ...noLine, day: false })).toEqual({ kind: "look" });
    // With no grounding either, the outside screen and the first part touch.
    const noGrounding: JourneyShape = { ...noLine, settleCards: 0 };
    expect(nextStep({ kind: "outside" }, noGrounding)).toEqual({
      kind: "phase",
      phase: 0,
      moment: 0,
    });
    expect(previousStep({ kind: "phase", phase: 0, moment: 0 }, noGrounding)).toEqual({
      kind: "outside",
    });
    expect(previousStep({ kind: "phase", phase: 2, moment: 0 }, shape)).toEqual({
      kind: "phase",
      phase: 1,
      moment: 1,
    });
    // Circle time — the part the teacher named. Back out of it lands on the last
    // moment of the last teaching part, not at the top of the lesson.
    expect(previousStep({ kind: "circle" }, shape)).toEqual({
      kind: "phase",
      phase: 2,
      moment: 3,
    });
    // And the reflection reverses into the circle she just closed.
    expect(previousStep({ kind: "reflect" }, shape)).toEqual({ kind: "circle" });
  });

  it("keeps the two ends of the lesson terminal", () => {
    const shape: JourneyShape = {
      settleCards: 5,
      phaseMoments: [2],
      askCount: 1,
      introduceFirst: false,
      day: false,
      circle: false,
      reflect: true,
    };
    expect(previousStep({ kind: "topic" }, shape)).toBeNull();
    expect(previousStep({ kind: "celebrate" }, shape)).toBeNull();
    expect(nextStep({ kind: "celebrate" }, shape)).toBeNull();
  });

  it("holds a lesson with no body parts together in both directions", () => {
    // Defensive, and it is not hypothetical: `applyResume` already guards a
    // saved index that today's pack no longer has. A shape with nothing to
    // teach must still walk, and must still reverse.
    const shape: JourneyShape = {
      settleCards: 1,
      phaseMoments: [],
      askCount: 0,
      introduceFirst: false,
      day: false,
      circle: false,
      reflect: false,
    };
    expect(forwardWalk(shape)).toEqual([
      { kind: "topic" },
      { kind: "look" },
      { kind: "outside" },
      { kind: "settle", card: 0 },
      { kind: "celebrate" },
    ]);
    expect(previousStep({ kind: "settle", card: 0 }, shape)).toEqual({
      kind: "outside",
    });
    // The same lesson with a line to say keeps the line screen, and the close
    // still reverses into it rather than skipping the last thing she said.
    const withLine: JourneyShape = { ...shape, askCount: 1, reflect: true };
    expect(forwardWalk(withLine)).toEqual([
      { kind: "topic" },
      { kind: "look" },
      { kind: "ask", index: 0 },
      { kind: "outside" },
      { kind: "settle", card: 0 },
      { kind: "reflect" },
      { kind: "celebrate" },
    ]);
    expect(previousStep({ kind: "reflect" }, withLine)).toEqual({ kind: "settle", card: 0 });
  });

  it("names the screen it goes back to, never the bare word Back", () => {
    // "Back" is identical on all six screens and answers none of the question
    // a teacher reversing mid-lesson actually has. The label names the
    // destination, and an unauthored part title falls back to a true generic
    // rather than an invented one.
    const names = { partTitles: ["Notice", "Gather"], circleTitle: "Circle time" };
    expect(backLabel({ kind: "phase", phase: 1, moment: 0 }, names)).toBe(
      "Back to Gather"
    );
    expect(backLabel({ kind: "circle" }, names)).toBe("Back to Circle time");
    // The introduction's beats name themselves (#1004); a question is numbered
    // only when there is more than one to tell apart.
    expect(backLabel({ kind: "topic" }, names)).toBe("Back to the topic");
    expect(backLabel({ kind: "day" }, names)).toBe("Back to the day");
    expect(backLabel({ kind: "ask", index: 0 }, names)).toBe("Back to the question");
    expect(backLabel({ kind: "ask", index: 1 }, names, { askCount: 2 })).toBe("Back to question 2");
    expect(backLabel({ kind: "outside" }, names)).toBe("Back to the outdoor activity");
    expect(backLabel({ kind: "phase", phase: 9, moment: 0 }, names)).toBe(
      "Back to the previous part"
    );
  });
});

describe("the way back reaches the teacher's screen (#752)", () => {
  it("renders a real back control on the settle deck, through the real component", () => {
    // `startAt="settle"` is the runner's own entry point from the narrated
    // preview's end card, and the one interior screen a static render can
    // reach — the rest of the journey lives behind taps and this suite has no
    // DOM. It is enough: the control is built once, in one place, and this
    // asserts that one thing is really in the markup a teacher receives.
    const session = shippedSessions()[0];
    expect(session).toBeDefined();
    if (!session) return;

    const markup = renderToStaticMarkup(
      <HybridJourney session={session} startAt="settle" />
    );

    // The grounding's first card goes back to the spoken line (2026-09-06:
    // the introduction is said inside, before the class goes out to ground).
    expect(markup).toContain("Back to the outdoor activity");
    // A button, not a picture of one — the part strip shipped as spans once
    // (#325) and that is exactly the failure this is guarding against.
    expect(markup).toMatch(
      /<button[^>]*aria-label="Back to the outdoor activity"[^>]*>/
    );
  });

  it("puts nothing on the doorway to go back to", () => {
    const session = shippedSessions()[0];
    expect(session).toBeDefined();
    if (!session) return;

    // The doorway is where a fresh open lands. There is no previous screen, so
    // there is no control — never a dead one that does nothing when pressed.
    const markup = renderToStaticMarkup(<HybridJourney session={session} />);
    expect(markup).not.toContain("aria-label=\"Back to");
  });
});

describe("no run screen keeps its own private idea of where it is (#752)", () => {
  /**
   * One RENDER branch of the runner, source only.
   *
   * The opening brace is part of the match on purpose: `step.kind === "intro"`
   * also appears as an early `return` inside the history-guard effect, and a
   * looser read picks that one-line effect up and reports every screen as
   * missing its controls.
   */
  const branchStarts = [...code.matchAll(/if \(step\.kind === "(\w+)"[^)]*\) \{/g)];

  function branch(kind: string): string {
    const index = branchStarts.findIndex((match) => match[1] === kind);
    expect(index, `no ${kind} render branch`).toBeGreaterThan(-1);
    const start = branchStarts[index];
    const after = branchStarts[index + 1];
    if (!start) return "";
    return code.slice(start.index, after ? after.index : code.length);
  }

  it("moves every CTA through the shared walk instead of its own setStep", () => {
    for (const kind of ["topic", "day", "ask", "outside", "settle", "phase", "circle"]) {
      expect(branch(kind), `${kind} does not advance through goNext`).toContain(
        "onClick={goNext}"
      );
    }
  });

  it("stands the way back beside the way on, on every screen that has one", () => {
    for (const kind of ["topic", "day", "ask", "outside", "settle", "phase", "circle"]) {
      expect(branch(kind), `${kind} has no back beside its CTA`).toContain(
        "actionRow("
      );
    }
    // The reflection's foot carries the back on its own: its forward is
    // LogSession's saved completion, which #344 says nothing may reach around.
    expect(branch("reflect")).toContain("{backControl}");
  });

  it("still lets nothing but a saved completion reach the celebration (#344)", () => {
    // The back added to the reflection screen goes backwards, into the lesson.
    // If it ever became a way forward this count would move, and #344's own
    // contract would break with it.
    const reflect = branch("reflect");
    expect(reflect.match(/setStep\(\{ kind: "celebrate" \}\)/g)).toHaveLength(1);
    expect(reflect).not.toContain("goNext");
  });

  it("builds the lesson's shape from the five facts this file mirrors", () => {
    // The mirror in `shapeOf` above is only honest while the component builds
    // its shape the same way. Change one of these and this test says so.
    const at = code.indexOf("const shape: JourneyShape");
    expect(at).toBeGreaterThan(-1);
    const shape = code.slice(at, at + 500);
    expect(shape).toContain("settleCards: settleCards.length");
    expect(shape).toContain("phaseMoments(phase, askedAtTheDoor).length");
    expect(shape).toContain("askCount: doorQuestions(session).length");
    expect(shape).toContain("day: Boolean(hinge)");
    expect(shape).toContain("circle: Boolean(circlePhase)");
    expect(shape).toContain("reflect: Boolean(logTo)");
  });

  it("takes the iPad's back-swipe as one step back, not as nothing at all", () => {
    // The gesture used to be swallowed outright — re-push the guard entry and
    // return — so the one control every teacher already has for "go back" did
    // nothing. It now walks the lesson backwards, and still re-arms the guard,
    // so a swipe can never drop a running lesson.
    const at = code.indexOf("const onPop =");
    expect(at).toBeGreaterThan(-1);
    const onPop = code.slice(at, at + 200);
    expect(onPop).toContain("history.pushState");
    expect(onPop).toContain("goBack()");
  });
});
