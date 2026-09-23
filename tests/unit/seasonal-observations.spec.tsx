import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseSeasonalObservations, lessonSeasonalObservations } from "@/lib/outside/seasonal-observations";
import { SeasonalObservations } from "@/app/outside/SeasonalObservations";
import { seasonalFixture, seasonalLocation, seasonalNow } from "../support/seasonal-observations-fixture";
const expected = { ...seasonalLocation, now: seasonalNow.getTime() };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });

describe("dated USA-NPN teacher evidence", () => {
  it("renders present and absent reports with own dates, locality, dataset and source", () => {
    const report = parseSeasonalObservations(seasonalFixture(), expected);
    const html = renderToStaticMarkup(<SeasonalObservations report={report} plannedDay="Thursday" />);
    expect(html).toContain("Reported absent"); expect(html).toContain("Reported present");
    expect(html).toContain('dateTime="2025-05-01"'); expect(html).toContain("site 57027");
    expect(html).toContain("NEON plant phenology observations"); expect(html).toContain("0.0 km");
    expect(html).toContain("They do not predict what the class will find that day");
    expect(html).toContain("https://www.usanpn.org/about/terms");
    expect(html).toContain("Sources and attribution");
  });
  it("rejects wrong-place, stale, missing-center, malformed date, model and silent evidence", () => {
    const original = seasonalFixture();
    for (const value of [
      { ...original, center: { latitude: 51.5, longitude: -0.1 } },
      { ...original, retrievedAt: "2025-04-30T14:00:00.000Z" },
      { ...original, center: undefined }, { ...original, evidenceKind: "model" },
      { ...original, silent: true, records: [] },
      { ...original, window: { startDate: "2025-02-30", endDate: "2025-05-02" } },
      { ...original, records: [{ ...original.records[0], observedOn: "2024-05-01" }] },
      { ...original, records: [{ ...original.records[0], distanceKm: 6 }] },
    ]) expect(parseSeasonalObservations(value, expected)).toBeNull();
    expect(parseSeasonalObservations(original, { lat: 42.54, lng: -71, now: expected.now })).toBeNull();
    expect(renderToStaticMarkup(<SeasonalObservations report={null} />)).toBe("");
  });
  it("keeps only the lesson's existing scientific-name references, independent of photos", () => {
    const selected = lessonSeasonalObservations(seasonalFixture(), [{ scientificName: "Quercus rubra" }]);
    expect(selected?.records).toHaveLength(1); expect(selected?.records[0]?.status).toBe("absent");
    expect(lessonSeasonalObservations(seasonalFixture(), [{ scientificName: "Lumbricus terrestris" }])).toBeNull();
  });
  it("retains opposite reports from different individuals at the same site", () => {
    const report = seasonalFixture();
    report.records = [report.records[0]!, { ...report.records[0]!, observationId: 999, individualId: 998, status: "present" }];
    const selected = lessonSeasonalObservations(report, [{ scientificName: "Quercus rubra" }]);
    expect(selected?.records).toHaveLength(2);
    const html = renderToStaticMarkup(<SeasonalObservations report={selected} />);
    expect(html).toContain("monitored individual 352289"); expect(html).toContain("monitored individual 998");
    expect(html).toContain("Reported absent"); expect(html).toContain("Reported present");
  });
  it("does not lose successful USA-NPN reports when iNaturalist falls back to last good", async () => {
    vi.setSystemTime(seasonalNow); vi.stubEnv("POINTMOON_FIXTURE_PATH", ""); vi.stubEnv("POINTMOON_USANPN_ENABLED", "1");
    const complete = { schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { observations: { nearby: [{ name: "Oak", iconicTaxon: "Plantae" }], absent: [], birds: { notable: [] } } } } };
    const thinWithSeasonal = { schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { seasonalObservations: seasonalFixture(), observations: { nearby: [], absent: [], birds: { notable: [] } } } } };
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => complete }).mockResolvedValue({ ok: true, json: async () => thinWithSeasonal });
    vi.stubGlobal("fetch", fetch); const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const query = { ...seasonalLocation, seasonalObservations: true };
    await fetchFieldTruth(query); vi.setSystemTime(new Date(seasonalNow.getTime() + 16 * 60_000));
    for (let i = 0; i < 2; i++) {
      const result = await fetchFieldTruth(query);
      expect(result?.facts?.fieldSnapshot?.seasonalObservations?.records).toHaveLength(2);
      expect(result?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Oak");
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("separates opt-in cache keys and defaults to no source request", async () => {
    vi.setSystemTime(seasonalNow); vi.stubEnv("POINTMOON_FIXTURE_PATH", ""); vi.stubEnv("POINTMOON_USANPN_ENABLED", "0");
    const body = { schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { seasonalObservations: seasonalFixture(), weather: { current: { skyCondition: "clear" } } } } };
    const fetch = vi.fn(async (_input: string) => ({ ok: true, json: async () => body })); vi.stubGlobal("fetch", fetch);
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    expect((await fetchFieldTruth({ ...seasonalLocation, seasonalObservations: true }))?.facts?.fieldSnapshot?.seasonalObservations).toBeUndefined();
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain("evidenceSources");
    vi.stubEnv("POINTMOON_USANPN_ENABLED", "1");
    expect((await fetchFieldTruth({ ...seasonalLocation, seasonalObservations: true }))?.facts?.fieldSnapshot?.seasonalObservations?.records).toHaveLength(2);
    expect(String(fetch.mock.calls[1]?.[0])).toContain("evidenceSources=usanpn");
    await fetchFieldTruth({ ...seasonalLocation, seasonalObservations: true }); expect(fetch).toHaveBeenCalledTimes(2);
    await fetchFieldTruth({ lat: 51.5, lng: -0.1, seasonalObservations: true });
    expect(String(fetch.mock.calls[2]?.[0])).not.toContain("evidenceSources");
  });
  it("keeps a fresh complete source slice through a thin response without changing its date", async () => {
    vi.setSystemTime(seasonalNow); vi.stubEnv("POINTMOON_FIXTURE_PATH", ""); vi.stubEnv("POINTMOON_USANPN_ENABLED", "1");
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { seasonalObservations: seasonalFixture() } } }) }).mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { weather: { current: { skyCondition: "rain" } } } } }) });
    vi.stubGlobal("fetch", fetch); const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const query = { ...seasonalLocation, seasonalObservations: true };
    await fetchFieldTruth(query); vi.setSystemTime(new Date(seasonalNow.getTime() + 2 * 60_000));
    const result = await fetchFieldTruth(query);
    expect(result?.facts?.fieldSnapshot?.seasonalObservations?.retrievedAt).toBe("2025-05-02T13:00:00.000Z");
    expect(result?.facts?.fieldSnapshot?.weather?.current?.skyCondition).toBe("rain");
    fetch.mockResolvedValueOnce({ ok: false });
    vi.setSystemTime(new Date(seasonalNow.getTime() + 4 * 60_000));
    expect((await fetchFieldTruth(query))?.facts?.fieldSnapshot?.seasonalObservations?.retrievedAt).toBe("2025-05-02T13:00:00.000Z");
  });
});
