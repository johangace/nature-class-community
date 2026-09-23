import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskAnotherWay } from "@/app/run/AskAnotherWay";
import {
  askAnotherWayLabels,
  askAnotherWayOptions,
  checkAskAnotherWay,
  parseAskAnotherWayDraft,
  type AskAnotherWayFacts,
} from "@/lib/ai/ask-another-way-contract";
import { buildAskAnotherWay } from "@/lib/ai/prompts";
import { loadSections } from "@/lib/ai/prompt-registry";

const QUESTION = "What do you think the tree needs to grow so tall?";
const OBJECTIVE = "Notice that trees need light, water and time to grow.";

const facts = (over: Partial<AskAnotherWayFacts> = {}): AskAnotherWayFacts => ({
  question: QUESTION,
  objective: OBJECTIVE,
  option: "concrete",
  ...over,
});

describe("the option set is fixed, small, and the teacher's to pick", () => {
  it("is three ways in, not five: one row for cold thumbs outdoors", () => {
    expect(askAnotherWayOptions).toEqual(["simpler", "concrete", "easier-to-start"]);
  });

  it("gives every option a rule in the sections file, and no orphan rules", () => {
    const rules = loadSections("ask-another-way-options");
    expect(Object.keys(rules ?? {}).sort()).toEqual([...askAnotherWayOptions].sort());
  });

  it("keeps the folded-in doors visible in the rules rather than losing them", () => {
    const rules = loadSections("ask-another-way-options");
    // shorter folded into simpler (#378's ruling), sensory folded into concrete.
    expect(rules?.simpler?.toLowerCase()).toContain("shorter");
    expect(rules?.concrete?.toLowerCase()).toContain("smell");
  });

  it("labels every option in plain speech, never all caps", () => {
    for (const option of askAnotherWayOptions) {
      const label = askAnotherWayLabels[option];
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe("one prompt file, one option rule, the lesson-support shape", () => {
  it.each(askAnotherWayOptions)("builds %s from the committed prompt", (option) => {
    const prompt = buildAskAnotherWay({ option, question: QUESTION, objective: OBJECTIVE });
    if (!prompt) throw new Error("ask-another-way prompt failed to load");

    expect(prompt.system).toContain("THE QUESTION IS THE THING THAT STAYS");
    expect(prompt.system).toContain(loadSections("ask-another-way-options")?.[option] ?? "!!");
    expect(prompt.system).not.toContain("{{");
    expect(prompt.user).toContain(QUESTION);
    expect(prompt.user).toContain(OBJECTIVE);
  });

  it("traces the option in the id and the registry prompt in the name, so the link resolves", () => {
    const prompt = buildAskAnotherWay({
      option: "simpler",
      question: QUESTION,
      objective: OBJECTIVE,
    });
    expect(prompt?.id).toBe("ask-another-way-simpler");
    expect(prompt?.name).toBe("ask-another-way");
  });

  it("carries no question text of its own: the words come from the caller", () => {
    const file = readFileSync(new URL("../../prompts/ask-another-way.md", import.meta.url), "utf8");
    // Only ONE alternative per tap. #27 returned a pair to compare, which is a
    // choice to make in a silence she is trying to end.
    expect(file).toContain('{"question"');
    expect(file).not.toMatch(/\btwo\b/i);
  });
});

describe("the parser refuses anything that is not one question", () => {
  it("takes the question field", () => {
    expect(parseAskAnotherWayDraft({ question: "  What can you see up there?  " })).toBe(
      "What can you see up there?"
    );
  });

  it("reads the model's honest null as a miss", () => {
    expect(parseAskAnotherWayDraft({ question: null })).toBeNull();
    expect(parseAskAnotherWayDraft({ question: "   " })).toBeNull();
  });

  it("refuses a reply that smuggled in a second field", () => {
    expect(parseAskAnotherWayDraft({ question: "What is it?", note: "also" })).toBeNull();
  });

  it("swaps the em dash the product never prints", () => {
    expect(parseAskAnotherWayDraft({ question: "Look up — what do you see?" })).toBe(
      "Look up, what do you see?"
    );
  });
});

describe("the guard holds a rephrasing to the question it was given", () => {
  it("passes a plain alternative on the same question", () => {
    expect(checkAskAnotherWay("What helps this tree get so big?", facts())).toEqual({ ok: true });
  });

  it("refuses the question handed back unchanged, however it is punctuated", () => {
    const verdict = checkAskAnotherWay("what do you think the tree needs to grow so tall?", facts());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("gave the question back unchanged");
  });

  it("refuses something that is no longer a question", () => {
    expect(checkAskAnotherWay("Point at the tallest tree you can see.", facts()).ok).toBe(false);
  });

  it("refuses two questions where the plate holds one", () => {
    expect(
      checkAskAnotherWay("What is tall? What is small?", facts()).reason
    ).toBe("more than one question");
  });

  it("refuses a number the question never carried", () => {
    const verdict = checkAskAnotherWay("Can you find 3 things that helped it grow?", facts());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("carries a number the question does not: 3");
  });

  it("keeps a number the question did carry", () => {
    const counted = facts({ question: "Can you find 3 kinds of leaf?" });
    expect(checkAskAnotherWay("Which 3 leaves are not the same?", counted).ok).toBe(true);
  });

  it("refuses a creature or place the question did not name", () => {
    const verdict = checkAskAnotherWay("What does this Oak need to grow so tall?", facts());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("named something the question did not: Oak");
  });

  it("allows a name the question or the aim already used", () => {
    const named = facts({ question: "What does the Oak need to grow so tall?" });
    expect(checkAskAnotherWay("What helps the Oak get so big?", named).ok).toBe(true);
  });

  it("refuses a simpler rephrasing that is longer than what it simplifies", () => {
    const verdict = checkAskAnotherWay(
      "What do you think that very tall tree over there needed so it could grow up so high?",
      facts({ option: "simpler" })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/^longer than the question it simplifies:/);
  });

  it("lets the same wording through on an axis that is not about length", () => {
    expect(
      checkAskAnotherWay(
        "What do you think that very tall tree over there needed so it could grow up so high?",
        facts({ option: "concrete" })
      ).ok
    ).toBe(true);
  });

  it("runs the field safety backstop the other drafters run", () => {
    const verdict = checkAskAnotherWay("Which berries could you taste up there?", facts());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("crosses the field safety boundary");
  });

  it("keeps every reason safe to put in a trace: nothing quoted before a colon", () => {
    const source = readFileSync(
      new URL("../../lib/ai/ask-another-way-contract.ts", import.meta.url),
      "utf8"
    );
    for (const match of source.matchAll(/ok:\s*false\s*,\s*reason:\s*(`[^`]*`|"[^"]*")/g)) {
      const body = (match[1] ?? "").slice(1, -1);
      const interpolated = body.indexOf("${");
      if (interpolated === -1) continue;
      expect(body.indexOf(":")).toBeGreaterThan(-1);
      expect(body.indexOf(":")).toBeLessThan(interpolated);
    }
  });
});

/**
 * The drafter, through the one seam. Model and trace are mocked at the seam's
 * own boundary, exactly as `draft-seam.spec.ts` does, so this exercises the
 * real prompt, the real parser and the real guard.
 */
const callModel = vi.hoisted(() => vi.fn());

describe("the drafter returns one rephrasing, or nothing at all", () => {
  beforeEach(() => {
    vi.resetModules();
    callModel.mockReset();
    vi.doMock("@/lib/ai/model", () => ({ callModel, isModelAvailable: () => true }));
    vi.doMock("@/lib/ai/langfuse", () => ({ trace: vi.fn(async () => {}) }));
  });
  afterEach(() => {
    vi.doUnmock("@/lib/ai/model");
    vi.doUnmock("@/lib/ai/langfuse");
    vi.restoreAllMocks();
  });

  const ask = async (option: (typeof askAnotherWayOptions)[number] = "concrete") => {
    const { draftAskAnotherWay } = await import("@/lib/ai/plate-draft");
    return draftAskAnotherWay({ option, question: QUESTION, objective: OBJECTIVE });
  };

  it("hands back the one alternative", async () => {
    callModel.mockResolvedValue({
      text: '{"question":"What helps this tree get so big?"}',
      model: "test-model",
      usage: {},
    });
    await expect(ask()).resolves.toBe("What helps this tree get so big?");
  });

  it("is silent when the model is unavailable", async () => {
    callModel.mockResolvedValue(null);
    await expect(ask()).resolves.toBeNull();
  });

  it("is silent when the guard refuses, so the authored question stays on the plate", async () => {
    callModel.mockResolvedValue({
      text: '{"question":"What does this Oak need to grow so tall?"}',
      model: "test-model",
      usage: {},
    });
    await expect(ask()).resolves.toBeNull();
  });

  it("asks the model about the question it was given, never about a rephrasing", async () => {
    callModel.mockResolvedValue({
      text: '{"question":"What helps this tree get so big?"}',
      model: "test-model",
      usage: {},
    });
    await ask("simpler");
    const sent = callModel.mock.calls[0]?.[0] as { user: string; system: string };
    expect(sent.user).toContain(QUESTION);
    expect(sent.system).toContain("add no fact");
  });
});

/**
 * The row itself, rendered. One tap, cold thumbs: three chips and no keyboard.
 */
describe("the row the teacher taps", () => {
  it("renders the fixed options as a row, with no typing anywhere in it", () => {
    const markup = renderToStaticMarkup(
      <AskAnotherWay
        ability="y1"
        onRestore={() => {}}
        onUse={() => {}}
        phaseKey="gather-1"
        questionIndex={0}
        sessionId="summer-w3-a5-leaf-collage"
        swapped={false}
      />
    );

    expect(markup).toContain("Ask it another way");
    for (const option of askAnotherWayOptions) {
      expect(markup).toContain(askAnotherWayLabels[option]);
    }
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("<input");
    // Nothing is offered until she taps: the plate holds the authored question.
    expect(markup).not.toContain("Use this");
  });

  it("offers the way back only once a rephrasing is on the plate", () => {
    const props = {
      ability: "y1",
      onRestore: () => {},
      onUse: () => {},
      phaseKey: "gather-1",
      questionIndex: 0,
      sessionId: "summer-w3-a5-leaf-collage",
    } as const;

    expect(renderToStaticMarkup(<AskAnotherWay {...props} swapped={false} />)).not.toContain(
      "Back to the written question"
    );
    expect(renderToStaticMarkup(<AskAnotherWay {...props} swapped />)).toContain(
      "Back to the written question"
    );
  });
});
