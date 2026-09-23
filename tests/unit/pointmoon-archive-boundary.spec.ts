import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

const rawPayload = {
  schemaVersion: "field-truth@1.1.0",
  facts: {
    fieldSnapshot: {
      weather: { current: { skyCondition: "clear" } },
      observations: {
        nearby: [{ name: "Garden spider", privateProducerNote: "not for a renderer" }],
        birds: { notable: [] },
        absent: [],
      },
    },
  },
  somethingNobodyReadsYet: { deep: ["keep this for replay"] },
};

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => rawPayload });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POINTMOON_FIXTURE_PATH", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Pointmoon archival and renderer boundaries", () => {
  it("returns the versioned response verbatim only through the archive fetch", async () => {
    const pointmoon = await import("@/lib/outside/pointmoon");

    const archived = await pointmoon.fetchFieldTruthArchivePayload({ lat: 51.5, lng: -0.1 });

    expect(archived).toEqual(rawPayload);
    expect(archived).toHaveProperty("schemaVersion", "field-truth@1.1.0");
    expect(archived).toHaveProperty("somethingNobodyReadsYet.deep", ["keep this for replay"]);
  });

  it("continues to strip archive-only and producer-private fields from the renderer fetch", async () => {
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    const rendered = await fetchFieldTruth({ lat: 51.501, lng: -0.101 });

    expect(rendered?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe(
      "Garden spider"
    );
    expect(rendered).not.toHaveProperty("schemaVersion");
    expect(rendered).not.toHaveProperty("somethingNobodyReadsYet");
    expect(rendered?.facts?.fieldSnapshot?.observations?.nearby?.[0]).not.toHaveProperty(
      "privateProducerNote"
    );
  });

  it("gives archive and renderer reads the shared 10-second transport window", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const pointmoon = await import("@/lib/outside/pointmoon");

    await pointmoon.fetchFieldTruthArchivePayload({ lat: 51.5, lng: -0.1 });
    await pointmoon.fetchFieldTruth({ lat: 51.501, lng: -0.101 });

    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenNthCalledWith(1, 10_000);
    expect(timeout).toHaveBeenNthCalledWith(2, 10_000);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal, cache: "no-store" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ signal, cache: "no-store" });
  });
});
