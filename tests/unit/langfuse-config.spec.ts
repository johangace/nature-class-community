import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The host variable had two names — this file read LANGFUSE_HOST while the
 * sibling backend reads LANGFUSE_BASE_URL. Because tracing's failure mode is
 * silence, a copied env block would have pointed at the wrong host and nobody
 * would have seen anything. These tests are the reason the drift cannot
 * quietly come back.
 */

const ENV_KEYS = [
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_HOST",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  // vi.spyOn returns the SAME spy when a method is already spied, so without
  // this the console.error calls accumulate across tests and a "stayed quiet"
  // assertion sees the previous test's noise.
  vi.restoreAllMocks();
});

async function postedUrl(): Promise<string | null> {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response("{}", { status: 207 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { trace } = await import("@/lib/ai/langfuse");
  await trace({
    promptId: "t",
    promptName: "t",
    promptVersion: 1,
    model: "m",
    startedAt: 1_756_000_000_000,
    endedAt: 1_756_000_000_500,
    outcome: "ok",
  });
  const first = fetchMock.mock.calls[0];
  return first ? String(first[0]) : null;
}

describe("langfuse host configuration", () => {
  it("is a no-op with no keys, so a clone of this repo never calls out", async () => {
    expect(await postedUrl()).toBeNull();
  });

  it("prefers LANGFUSE_BASE_URL, the name the rest of the org uses", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    process.env.LANGFUSE_BASE_URL = "https://base.example.com";
    process.env.LANGFUSE_HOST = "https://host.example.com";
    expect(await postedUrl()).toBe("https://base.example.com/api/public/ingestion");
  });

  it("still honours LANGFUSE_HOST, so an env block already set keeps working", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    process.env.LANGFUSE_HOST = "https://host.example.com";
    expect(await postedUrl()).toBe("https://host.example.com/api/public/ingestion");
  });

  it("defaults to the US region the Wyld Way org lives in, not the EU one", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    expect(await postedUrl()).toBe("https://us.cloud.langfuse.com/api/public/ingestion");
  });

  it("carries no input or output, whatever else it carries", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response("{}", { status: 207 }),
  );
    vi.stubGlobal("fetch", fetchMock);
    const { trace } = await import("@/lib/ai/langfuse");
    await trace({
      promptId: "nature-grounding-line",
      promptName: "nature-grounding-line",
      promptVersion: 4,
      model: "claude-haiku-4-5",
      startedAt: 1_756_000_000_000,
      endedAt: 1_756_000_000_500,
      outcome: "ok",
    });
    const first = fetchMock.mock.calls[0];
    if (!first) throw new Error("trace() did not post");
    const body = JSON.parse(String(first[1]?.body));
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('"input"');
    expect(serialised).not.toContain('"output"');
    expect(body.batch).toHaveLength(2);
  });
});

describe("a rejected batch is not silence", () => {
  it("logs when the API refuses events inside a 207, because that used to look like success", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    const errs = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            successes: [],
            errors: [{ id: "e1", status: 400, message: "Invalid request data" }],
          }),
          { status: 207 },
        ),
      ),
    );
    const { trace } = await import("@/lib/ai/langfuse");
    await trace({
      promptId: "door-line",
      promptName: "door-line",
      promptVersion: 1,
      model: "m",
      startedAt: 1_756_000_000_000,
      endedAt: 1_756_000_000_500,
      outcome: "ok",
    });
    expect(errs).toHaveBeenCalledWith(expect.stringContaining("1 event(s) rejected"));
  });

  it("says nothing when every event is accepted", async () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    const errs = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ successes: [{ id: "e1", status: 201 }], errors: [] }), {
          status: 207,
        }),
      ),
    );
    const { trace } = await import("@/lib/ai/langfuse");
    await trace({
      promptId: "door-line",
      promptName: "door-line",
      promptVersion: 1,
      model: "m",
      startedAt: 1_756_000_000_000,
      endedAt: 1_756_000_000_500,
      outcome: "ok",
    });
    expect(errs).not.toHaveBeenCalled();
  });

  it("a bad outcome costs a tag, not the whole trace", async () => {
    // The API rejects the entire event if any tag is not a string, and the
    // first caller to get this wrong was this repo's own .mjs smoke script,
    // which TypeScript does not check.
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ successes: [], errors: [] }), { status: 207 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { trace } = await import("@/lib/ai/langfuse");
    await trace({
      promptId: "door-line",
      promptName: "door-line",
      promptVersion: 1,
      model: "m",
      startedAt: 1_756_000_000_000,
      endedAt: 1_756_000_000_500,
      outcome: undefined as unknown as string,
    });
    const first = fetchMock.mock.calls[0];
    if (!first) throw new Error("trace() did not post");
    const body = JSON.parse(String(first[1]?.body));
    expect(body.batch[0].body.tags).toEqual(["nature-class", "unknown"]);
  });
});
