import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

function payload(name: string, validUntil: string) {
  return {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        weather: { current: { skyCondition: name } },
        observations: {
          validUntil,
          nearby: [{ name }],
          birds: { notable: [] },
          absent: [],
        },
      },
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T09:00:00.000Z"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POINTMOON_FIXTURE_PATH", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Pointmoon observation-cache freshness", () => {
  it("revalidates when validUntil passes even while the 15-minute cache TTL is open", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => payload("first read", "2026-09-15T09:01:00.000Z"),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => payload("fresh read", "2026-09-15T09:20:00.000Z"),
      });

    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const first = await fetchFieldTruth({ lat: 51.5, lng: -0.1 });

    vi.setSystemTime(new Date("2026-09-15T09:02:00.000Z"));
    const second = await fetchFieldTruth({ lat: 51.5, lng: -0.1 });

    expect(first?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("first read");
    expect(second?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("fresh read");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still shares the cached projection before validUntil", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload("one read", "2026-09-15T09:10:00.000Z"),
    });

    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const first = await fetchFieldTruth({ lat: 51.5, lng: -0.1 });

    vi.setSystemTime(new Date("2026-09-15T09:05:00.000Z"));
    const second = await fetchFieldTruth({ lat: 51.5, lng: -0.1 });

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
