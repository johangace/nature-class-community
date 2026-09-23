import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * nc#1012: a rate-limited minute must not blank the Day screen for a quarter
 * of an hour.
 *
 * Pointmoon's observation fetch aborts at 1500ms inside a 3800ms adapter
 * budget, so when iNaturalist throttles it the producer answers HTTP 200 with
 * an empty `nearby` and `resolutionStatus: "unresolved"` — a well-formed
 * answer with nothing in it. Nine of thirteen live London reads on 2026-09-06
 * were exactly that, and the consumer used to seat each one in the ordinary
 * fifteen-minute cache, on top of the complete answer it already had.
 *
 * These are the two promises that fixes it: an empty read is held briefly,
 * and it never displaces a complete one that is still standing.
 */

const fetchMock = vi.fn();

const SCHEMA = "field-truth@1.1.0";

function payload(nearby: Array<{ name: string; iconicTaxon: string }>, unresolved = false) {
  return {
    schemaVersion: SCHEMA,
    facts: {
      fieldSnapshot: {
        observations: {
          nearby,
          absent: [],
          birds: { notable: [] },
          historical: unresolved
            ? { resolutionStatus: "unresolved", resolutionReason: "inat-species-counts-rate-limited", nearby: [] }
            : { resolutionStatus: "resolved", resolutionReason: null, nearby: [] },
        },
      },
    },
  };
}

const COMPLETE = payload([{ name: "Common Woodlouse", iconicTaxon: "Insecta" }]);
/** What a throttled minute actually looks like on the wire. */
const THROTTLED = payload([], true);

function names(data: unknown): string[] {
  const facts = data as { facts?: { fieldSnapshot?: { observations?: { nearby?: Array<{ name?: string }> } } } } | null;
  return (facts?.facts?.fieldSnapshot?.observations?.nearby ?? []).map((e) => e.name ?? "");
}

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a throttled read never blanks a class (nc#1012)", () => {
  it("serves the last complete answer when the next read comes back empty", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => COMPLETE });
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const at = { lat: 51.546, lng: -0.105 };

    const good = await fetchFieldTruth(at);
    expect(names(good)).toEqual(["Common Woodlouse"]);

    // Sixteen minutes on the complete answer has aged out of the ordinary
    // cache, so this really does go back to the network — and the network is
    // throttled and answers with nothing.
    vi.setSystemTime(new Date(Date.now() + 16 * 60_000));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => THROTTLED });

    const duringThrottle = await fetchFieldTruth(at);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The class still sees the woodlouse that was here a quarter of an hour
    // ago, rather than an empty row. Bounded by LAST_GOOD_TTL_MS, which this
    // is comfortably inside.
    expect(names(duringThrottle)).toEqual(["Common Woodlouse"]);
  });

  it("holds an empty read for a minute, not for the full fifteen", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => THROTTLED });
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const at = { lat: 51.4, lng: -0.2 };

    await fetchFieldTruth(at);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Inside the minute the empty read is held: no second call.
    vi.setSystemTime(new Date(Date.now() + 30_000));
    await fetchFieldTruth(at);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past it, the next class through asks again. Under the old fifteen-minute
    // TTL this call never happened, and the row stayed blank all lesson.
    vi.setSystemTime(new Date(Date.now() + 61_000));
    await fetchFieldTruth(at);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a complete read on the ordinary fifteen-minute cache", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => COMPLETE });
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const at = { lat: 52.1, lng: 0.1 };

    await fetchFieldTruth(at);
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000));
    await fetchFieldTruth(at);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops standing in once the good answer is too old to be honest", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => COMPLETE });
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const at = { lat: 53.4, lng: -2.2 };

    await fetchFieldTruth(at);

    // An hour on, past LAST_GOOD_TTL_MS. The empty read is now the truth and
    // the row goes quiet rather than showing an hour-old list as current.
    vi.setSystemTime(new Date(Date.now() + 60 * 60_000));
    fetchMock.mockResolvedValue({ ok: true, json: async () => THROTTLED });

    const late = await fetchFieldTruth(at);
    expect(names(late)).toEqual([]);
  });

  it("does not lend one school's species to another school", async () => {
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => COMPLETE });
    await fetchFieldTruth({ lat: 51.5, lng: -0.1 });

    // A different school, throttled on its first ever read, has no last-good
    // of its own and must not inherit the first school's.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => THROTTLED });
    const other = await fetchFieldTruth({ lat: 40.7, lng: -74.0 });
    expect(names(other)).toEqual([]);
  });
});
