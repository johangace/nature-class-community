import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #405. The ingest is deliberately off the request path, but "not awaited" and
 * "allowed to be killed" are different things: on Vercel an invocation can be
 * frozen as soon as its response is sent, and losing that race shows up as a
 * trace that silently never appears.
 *
 * Both branches are asserted here because the fallback is the one that runs in
 * every test, every script and the seasonal probe — an untested fallback is
 * not a fallback.
 */

const callModel = vi.hoisted(() => vi.fn());
const traced = vi.hoisted(() => vi.fn(async (_t: { outcome?: string }) => {}));
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/model", () => ({ callModel, isModelAvailable: () => true }));
vi.mock("@/lib/ai/langfuse", () => ({ trace: traced }));
vi.mock("next/server", () => ({ after }));

const PROMPT = { id: "p", version: 1, system: "s", user: "u" };

beforeEach(() => {
  callModel.mockReset();
  traced.mockReset();
  traced.mockImplementation(async () => {});
  after.mockReset();
  vi.resetModules();
});
afterEach(() => vi.restoreAllMocks());

async function run() {
  const { draft } = await import("@/lib/ai/draft");
  callModel.mockResolvedValue({ text: '{"line":"a line"}', model: "m", usage: {} });
  return draft({
    prompt: PROMPT,
    facts: null,
    maxTokens: 10,
    parse: (json: unknown) => (json as { line: string }).line,
  });
}

describe("the trace is handed to the platform, not left to chance", () => {
  it("gives the pending ingest to after(), so the function is not frozen first", async () => {
    await run();
    expect(traced).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    // What after() receives must be the ingest already in flight, not a
    // callback that would start it later or a value that keeps nothing alive.
    expect(after.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });

  it("still traces when after() throws, which is every test, script and probe", async () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });
    const value = await run();
    expect(traced).toHaveBeenCalledTimes(1);
    // And the caller is unaffected: observability failing is never the
    // teacher's problem.
    expect(value).toBe("a line");
  });

  it("a trace helper that returns nothing at all cannot break a draft", async () => {
    // Not hypothetical: keepAlive's first version called .catch() on whatever
    // trace() returned, so a helper returning undefined threw inside draft()
    // — after the model had answered — and turned a good draft into an
    // exception on the request path.
    traced.mockImplementation((() => undefined) as unknown as () => Promise<void>);
    await expect(run()).resolves.toBe("a line");
  });

  it("a draft still returns when the ingest itself rejects", async () => {
    traced.mockRejectedValue(new Error("langfuse unreachable"));
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });
    await expect(run()).resolves.toBe("a line");
  });
});
