import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #244 · The read-aloud held-question answer has no parser guard.
 *
 * `groundingLine` is the drafter reachable through `/api/conditions` and read
 * ALOUD to a class before they go outside — its own prompt calls the result
 * "one warm sentence a teacher says aloud to her class". `UNSAFE_FIELD_ADVICE`
 * (via `crossesSafetyBoundary`) is supposed to backstop it, on top of the
 * prompt itself, exactly as it backstops `parseLessonSupportDraft`.
 *
 * Every other spec that touches `groundingLine` (`tests/unit/word-drift.spec.ts`,
 * `tests/unit/grounding-cache.spec.ts`) replaces the whole function with
 * `vi.mock("@/lib/ai/plate-draft", ...)`, so the guard clause actually
 * running inside its `parse` callback has never been exercised by a test —
 * only by the prompt, which #229 already documents as narrower than English.
 * This file calls the REAL `groundingLine`, with only the model call and the
 * trace sink mocked, so the parser guard itself is what is under test.
 *
 * It also caught a live gap while it was being written: the shipped guard
 * ran `crossesSafetyBoundary` but had never picked up the "same caps" #244
 * asked for alongside it — length, no markup, no URL, the ones
 * `parseLessonSupportDraft` already applies via `shortText`. A markup- or
 * URL-carrying line passed straight through until this file's markup/URL
 * tests failed against the real function and `groundingLine` was changed to
 * call the same `shortText` helper. Those tests now pin the fix.
 */

const callModel = vi.hoisted(() => vi.fn());
const traced = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/ai/model", () => ({
  callModel,
  isModelAvailable: () => true,
}));
vi.mock("@/lib/ai/langfuse", () => ({ trace: traced }));

const reply = (text: string) => ({ text, model: "test-model", usage: {} });

beforeEach(() => {
  callModel.mockReset();
  traced.mockReset();
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

async function realGroundingLine() {
  const { groundingLine } = await import("@/lib/ai/plate-draft");
  return groundingLine;
}

const FACTS = "Recently seen near here: Blackberry, Red Admiral.";

describe("groundingLine's parser guard (#244)", () => {
  it("lets an ordinary read-aloud sentence through", async () => {
    const groundingLine = await realGroundingLine();
    callModel.mockResolvedValue(
      reply('{"line":"Keep one eye up, a Red Admiral has been seen near here this week."}')
    );

    const line = await groundingLine(FACTS);

    expect(line).toBe("Keep one eye up, a Red Admiral has been seen near here this week.");
  });

  it("refuses a line that crosses the field-safety boundary rather than reading it aloud", async () => {
    const groundingLine = await realGroundingLine();
    callModel.mockResolvedValue(
      reply('{"line":"Go ahead, taste the berries you find, they are perfectly safe."}')
    );

    const line = await groundingLine(FACTS);

    expect(line).toBeNull();
  });

  it("refuses a line carrying markup", async () => {
    const groundingLine = await realGroundingLine();
    callModel.mockResolvedValue(
      reply('{"line":"Look for <b>Red Admirals</b> near the hedge today."}')
    );

    expect(await groundingLine(FACTS)).toBeNull();
  });

  it("refuses a line carrying a URL", async () => {
    const groundingLine = await realGroundingLine();
    callModel.mockResolvedValue(
      reply('{"line":"See more at https://example.com/red-admiral near the hedge."}')
    );

    expect(await groundingLine(FACTS)).toBeNull();
  });

  it("refuses a line past the length cap", async () => {
    const groundingLine = await realGroundingLine();
    const tooLong = "A Red Admiral has been seen near here this week. ".repeat(20);
    callModel.mockResolvedValue(reply(JSON.stringify({ line: tooLong })));

    expect(await groundingLine(FACTS)).toBeNull();
  });

  it("refuses the model's own honest null the same as everything else", async () => {
    const groundingLine = await realGroundingLine();
    callModel.mockResolvedValue(reply('{"line":null}'));

    expect(await groundingLine(FACTS)).toBeNull();
  });

  it("refuses an empty string the same as a missing field", async () => {
    const groundingLine = await realGroundingLine();
    callModel.mockResolvedValue(reply('{"line":"   "}'));

    expect(await groundingLine(FACTS)).toBeNull();
  });
});
