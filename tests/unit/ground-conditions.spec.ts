import { describe, expect, it } from "vitest";
import { groundSessionConditions } from "@/lib/run/ground-conditions";
import type { Block, Phase, Session } from "@/schema/pack";

/**
 * #246 · Grounding a session's conditions line must never cost a class its
 * authored reading level.
 *
 * `groundSessionConditions` substitutes today's composed sentence for a
 * `conditions-line` block's authored `fallbackText`. The regression this
 * pins: the first version of that substitution also cleared
 * `abilityVariants` unconditionally, so a Reception class and a Year 2 class
 * — for whom an author had deliberately written two different sentences —
 * were flattened onto the one generic line the grounding call composed.
 *
 * The fix is the smallest of the three options the ticket named: where a
 * block carries `abilityVariants`, it is left standing whole, untouched by
 * grounding; only a block with no authored bands gets today's line.
 */

const GROUNDED = "It feels crisp and clear out there this morning, with a light breeze.";

function session(phases: Phase[]): Session {
  return {
    id: "test-fixture",
    title: "Fixture session",
    topic: "test",
    objective: "Test the grounding substitution.",
    namedSkill: "testing",
    kit: [],
    durationMin: 10,
    phases,
    childSheet: [],
    standards: [],
  };
}

function conditionsBlock(overrides: Partial<Block & { type: "conditions-line" }> = {}): Block {
  return {
    type: "conditions-line",
    fallbackText: "It is a fine day for being outside, whatever the weather.",
    ...overrides,
  } as Block;
}

function phase(key: string, blocks: Block[]): Phase {
  return { key, title: key, blocks };
}

describe("groundSessionConditions — a block with no authored bands", () => {
  it("replaces the authored fallback with today's grounded line", () => {
    const before = conditionsBlock();
    const result = groundSessionConditions(session([phase("p1", [before])]), GROUNDED);

    const block = result.phases[0]!.blocks[0];
    expect(block).toMatchObject({ type: "conditions-line", fallbackText: GROUNDED });
  });

  it("leaves the session entirely untouched when there is no grounded line", () => {
    for (const line of [null, "", "   "]) {
      const before = session([phase("p1", [conditionsBlock()])]);
      const result = groundSessionConditions(before, line);
      expect(result).toEqual(before);
    }
  });
});

describe("groundSessionConditions — a block with authored ability bands (#246)", () => {
  it("stands whole: fallbackText AND abilityVariants both survive, unreplaced", () => {
    const before = conditionsBlock({
      fallbackText: "It is a fine day for being outside, whatever the weather.",
      abilityVariants: {
        reception: "Look up. What does the sky look like today?",
        y2: "Notice the sky, the wind, and how the air feels on your skin.",
      },
    });
    const result = groundSessionConditions(session([phase("p1", [before])]), GROUNDED);

    // The whole point: grounding did not touch this block at all, not even
    // to strip the field it once wiped. Equal to the AUTHORED block, not
    // merely "still has abilityVariants".
    expect(result.phases[0]!.blocks[0]).toEqual(before);
  });

  it("only the banded block stands whole — an unbanded sibling still grounds", () => {
    const banded = conditionsBlock({
      fallbackText: "Generic banded fallback.",
      abilityVariants: { y1: "A Year 1 line." },
    });
    const unbanded = conditionsBlock({ fallbackText: "Generic unbanded fallback." });
    const result = groundSessionConditions(
      session([phase("p1", [banded, unbanded])]),
      GROUNDED
    );

    expect(result.phases[0]!.blocks[0]).toEqual(banded);
    expect(result.phases[0]!.blocks[1]).toMatchObject({ fallbackText: GROUNDED });
  });

  it("also stands whole inside a phase's conditionVariants, not just its base blocks", () => {
    const banded = conditionsBlock({
      fallbackText: "Base fallback.",
      abilityVariants: { reception: "A Reception line." },
    });
    const wetPhase: Phase = { key: "p1", title: "p1", blocks: [conditionsBlock()] };
    const before = session([
      { ...wetPhase, conditionVariants: [{ when: "wet", phase: { ...wetPhase, blocks: [banded] } }] },
    ]);

    const result = groundSessionConditions(before, GROUNDED);

    expect(result.phases[0]!.conditionVariants?.[0]!.phase.blocks[0]).toEqual(banded);
    // The base phase's own (unbanded) block still grounds as normal.
    expect(result.phases[0]!.blocks[0]).toMatchObject({ fallbackText: GROUNDED });
  });
});

describe("groundSessionConditions — leaves everything else alone", () => {
  it("does not touch non-conditions-line blocks", () => {
    const sayAloud: Block = { type: "say-aloud", text: "Notice what is under your feet." };
    const before = session([phase("p1", [sayAloud])]);
    const result = groundSessionConditions(before, GROUNDED);

    expect(result.phases[0]!.blocks[0]).toEqual(sayAloud);
  });
});
