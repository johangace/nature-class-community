import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney } from "@/app/run/HybridJourney";
import { loadAllPacks } from "@/lib/pack";
import { resolvePhases } from "@/lib/resolve";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { readCircle } from "@/app/run/CircleTime";
import type { Block } from "@/schema/pack";

/**
 * CIRCLE TIME CARRIES LESS (#753).
 *
 * A teacher who is an experienced outdoor educator, running the app with Johan on
 * 2026-08-31 — the first real teacher session this product has had
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`):
 *
 *   "Circle time is nice but too much information. please improve, remove the
 *    ask another way, simplify buttons"
 *
 * She is standing outdoors with children in a ring around her. Everything on
 * this screen is something she has to read past or decide about while they
 * wait, so the count of things IS the complaint, and the count is what this
 * file pins.
 *
 * WHAT CAME OFF, AND WHY EACH ONE IS A TEST HERE RATHER THAN A NOTE
 *
 *   1. The "Ask it another way" row (#390) — three chips, a lead line, and,
 *      once she took an offer, a "Use this" and a way back. Named by her.
 *   2. The third line of preamble, which explained the screen's interaction
 *      design to a teacher about to speak.
 *   3. The labelled "Teacher's assistant" button in the foot, a second door to
 *      the sheet the head's sparkle already opens.
 *
 * AND WHAT MUST NOT COME OFF WITH THEM. The teacher asked for a way back in the SAME
 * session (#752, shipped as #764), and the circle was the screen she named for
 * that too. "Simplify the buttons" is not licence to take the way back out
 * with the rest, so the last two tests here stand guard over it from this side
 * as well — a future density pass has to break this file to do it.
 *
 * Read as source, in the idiom `journey-back-navigation.spec.tsx` established
 * for this component: the interior of the runner is behind taps and this suite
 * has no DOM, so the branch that draws the screen is read directly. Comments
 * are stripped first — prose that MENTIONS a control is not the control.
 */

const journeySource = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const code = stripComments(journeySource);

/** The one render branch that draws Circle time, source only. */
function circleBranch(): string {
  const starts = [...code.matchAll(/if \(step\.kind === "(\w+)"[^)]*\) \{/g)];
  const index = starts.findIndex((match) => match[1] === "circle");
  expect(index, "no circle render branch").toBeGreaterThan(-1);
  const start = starts[index];
  const after = starts[index + 1];
  if (!start) return "";
  return code.slice(start.index, after ? after.index : code.length);
}

const circle = circleBranch();

/** How many questions a shipped circle actually holds, from the packs. */
function questionsPerShippedCircle(): number[] {
  const isCircle = (blocks: Block[]) =>
    blocks.some((block) => block.type === "circle-question");

  const counts: number[] = [];
  for (const pack of loadAllPacks()) {
    for (const session of pack.sessions) {
      const phases = resolvePhases(session, null);
      const settle = phases.find((phase) => phase.key === "settle");
      const body = phases.filter((phase) => phase !== settle);
      const phase = body.find((p) => isCircle(p.blocks));
      if (!phase) continue;
      counts.push(readCircle(phaseBlocks(phase)).items.length);
    }
  }
  return counts.sort((a, b) => a - b);
}

describe("circle time carries less than it did (#753)", () => {
  it("has no way to ask a question another way anywhere on the screen", () => {
    // The row itself, the state it fed, and the import that reached it. All
    // three, because any one left behind is the control growing back.
    expect(circle).not.toContain("AskAnotherWay");
    expect(circle).not.toContain("askedAnotherWay");
    expect(code).not.toContain('from "./AskAnotherWay"');
  });

  it("shows one thing per question, and it is the author's own words", () => {
    // The card used to render `askedAnotherWay[index] ?? authored` — the
    // model's sentence standing in the author's place. There is now nothing
    // between the pack and the plate.
    expect(circle).toContain("quoted(authored)");
    expect(circle).not.toMatch(/quoted\(asked\)/);
  });

  it("says what to do once, not three times, before the first question", () => {
    // Hero + one line. The third — "A guide, not a script. Every question
    // opens in place." — was the screen describing itself. Guide-not-script is
    // a stance the teacher named approvingly and it is protected in how the
    // questions BEHAVE, which this change does not touch.
    const preamble = circle.slice(0, circle.indexOf("styles.circleList"));
    expect((preamble.match(/styles\.tHero/g) ?? []).length).toBe(1);
    expect((preamble.match(/styles\.tBody/g) ?? []).length).toBe(1);
    expect(preamble).not.toContain("styles.tEyebrow");
  });

  it("puts two controls in the foot: the way back, and the way on", () => {
    const foot = circle.slice(circle.indexOf("styles.foot"));
    // The labelled assistant button stood here. The head's sparkle is the
    // door now, and it is the only one.
    expect(foot).not.toContain("styles.assistAsk");
    expect((foot.match(/<button\b/g) ?? []).length).toBe(1);
    expect(foot).toContain("actionRow(");
  });

  it("counts what a teacher meets, and the number came down", () => {
    // THE CENSUS. Head + cards + foot, for a signed-in teacher with the
    // assistant available — which is the run the teacher was actually given.
    //
    //   head(true, false, true, true) -> leave, pause, assistant       3
    //   one toggle per question                                        q
    //   the way back, and the CTA                                      2
    //
    // Before this change the same screen also carried three "ask it another
    // way" chips on the open card and a labelled assistant button in the
    // foot: 3 + q + 3 + 1 + 2, which is 12 at the median circle. It is 8 now.
    const head = circle.match(/\{head\(([^)]*)\)\}/);
    expect(head?.[1]).toBe("true, false, true, true");
    const headControls = 3; // leave, pause, assistant — no outdoor toggle here

    // Two `<button` in the branch: the card's toggle, drawn once per question,
    // and the CTA. A third would be a third thing in a teacher's way.
    expect((circle.match(/<button\b/g) ?? []).length).toBe(2);

    const questions = questionsPerShippedCircle();
    expect(questions.length).toBeGreaterThan(50);
    const median = questions[Math.floor(questions.length / 2)] ?? 0;
    expect(median).toBe(3);

    const controls = headControls + median + 1 /* back */ + 1 /* CTA */;
    expect(controls).toBe(8);
  });
});

describe("simplifying the circle did not take the way back with it (#752/#764)", () => {
  it("keeps the way back beside the way on, and the CTA on the shared walk", () => {
    // Duplicated from `journey-back-navigation.spec.tsx` on purpose. That file
    // guards the walk; this one guards it from the direction a "simplify the
    // buttons" ticket comes at it from.
    expect(circle).toContain("actionRow(");
    expect(circle).toContain("onClick={goNext}");
    expect(circle).not.toMatch(/setStep\(/);
  });

  it("still renders a real back control through the real component", () => {
    const session = loadAllPacks().flatMap((pack) => pack.sessions)[0];
    expect(session).toBeDefined();
    if (!session) return;

    const markup = renderToStaticMarkup(
      <HybridJourney session={session} startAt="settle" />
    );
    expect(markup).toMatch(
      /<button[^>]*aria-label="Back to the outdoor activity"[^>]*>/
    );
  });
});

describe("the control went, the prompt stayed (#753)", () => {
  it("leaves the ask-another-way prompt, route and row exactly where they were", () => {
    // Removing a control is not the same decision as retiring a prompt. The
    // registry entry is versioned and other work composes against it, so this
    // change unmounts the row and touches nothing underneath it. If the stack
    // is genuinely dead, that is its own ticket and its own reasoning.
    const root = process.cwd();
    expect(existsSync(resolve(root, "prompts/ask-another-way.md"))).toBe(true);
    expect(existsSync(resolve(root, "app/api/ask-another-way/route.ts"))).toBe(true);
    expect(existsSync(resolve(root, "app/run/AskAnotherWay.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "lib/ai/ask-another-way-contract.ts"))).toBe(true);
  });
});
