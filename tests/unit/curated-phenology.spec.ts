import { producerWeek } from "@/lib/outside/producer-week";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyCuratedEntries, curatedEntries, parseCuratedPhenology } from "@/lib/outside/curated-phenology";
import { resolveCast } from "@/lib/cast/resolve";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import type { PhenologyEntry } from "@/lib/outside/types";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/pointmoon/nc621/${name}.json`, import.meta.url), "utf8"));
const london = read("london");
const date = new Date(london.facts.fieldSnapshot.time.date);
const projection = (raw = london) => parseCuratedPhenology(raw.facts.fieldSnapshot.phenology, raw.facts.fieldSnapshot.time.date);
const data = (raw = london): FieldTruth => ({ facts: { fieldSnapshot: { phenology: projection(raw) } } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#621 replayed producer calendar boundary", () => {
  for (const name of ["london", "porto", "permet", "thin"]) {
    it(`replays retained ${name} bytes against its acquisition receipt`, async () => {
      const bytes = readFileSync(new URL(`../fixtures/pointmoon/nc621/${name}.json`, import.meta.url));
      const receipt = read(`${name}.receipt`);
      expect(receipt.status).toBe(200);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(receipt.sha256);
      expect(bytes.length).toBe(receipt.bytes);
      const entries = await curatedEntries(data(read(name)), date);
      expect(entries.length > 0).toBe(name === "london" || name === "porto");
    });
  }
  it("does not borrow the local calendar for Permet, silence, another week or another year", async () => {
    expect(await curatedEntries(data(read("permet")), date)).toEqual([]);
    expect(await curatedEntries(null, date)).toEqual([]);
    expect(await curatedEntries(data(), new Date("2026-09-21"))).toEqual([]);
    expect(await curatedEntries(data(), new Date("2027-09-13"))).toEqual([]);
  });
  it("requires explicit lineage and a structured matching producer date/week", () => {
    const raw = london.facts.fieldSnapshot.phenology;
    expect(parseCuratedPhenology({ ...raw, epistemicType: undefined }, date.toISOString())).toBeUndefined();
    expect(parseCuratedPhenology({ ...raw, provider: "model" }, date.toISOString())).toBeUndefined();
    expect(parseCuratedPhenology(raw, undefined)).toBeUndefined();
    expect(parseCuratedPhenology({ ...raw, week: 8 }, date.toISOString())).toBeUndefined();
    expect(parseCuratedPhenology({ ...raw, entries: [{ ...raw.entries[0], epistemicType: undefined }] }, date.toISOString())?.entries).toEqual([]);
  });
  it("preserves the recorded gathering as an event without borrowing the swallow portrait", async () => {
    const entries = await curatedEntries(data(), date);
    const gathering = entries.find(e => e.species === "Swallow Gathering")!;
    expect(gathering.kind).toBe("event");
    const cast = resolveCast({ data: null, phenology: [gathering], now: date });
    expect(cast.members[0]).toMatchObject({ commonName: "Swallow Gathering", scientificName: null, photoUrl: null, honestyTier: "regional" });
  });
  it("never defaults an unknown or conflicting identity to specimen", () => {
    const p = projection()!;
    const e = p.entries[0]!;
    expect(classifyCuratedEntries({ ...p, entries: [e] }, [], date)).toEqual([]);
    const metadata = [{ ...e, scientificName: "Something else", kind: "species" }] as PhenologyEntry[];
    expect(classifyCuratedEntries({ ...p, entries: [e] }, metadata, date)).toEqual([]);
    expect(classifyCuratedEntries({ ...p, entries: [{ ...e, kind: "species" }] }, [{ ...e, kind: "event" }], date)).toEqual([]);
  });
  it("uses the producer ISO week including week 53 across New Year", async () => {
    expect(producerWeek(new Date("2027-01-01"))).toEqual({ week: 53, year: 2026 });
    const p = projection()!;
    const endOfYear = parseCuratedPhenology({ ...p, week: 53 }, "2026-12-31T23:59:00Z")!;
    expect(endOfYear).toBeDefined();
    const explicit = { ...endOfYear, entries: endOfYear.entries.map(e => ({ ...e, kind: "species" as const })) };
    expect(classifyCuratedEntries(explicit, [], new Date("2027-01-01"))).not.toEqual([]);
    expect(classifyCuratedEntries(explicit, [], new Date("2027-01-04"))).toEqual([]);
    expect(classifyCuratedEntries(explicit, [], new Date("2032-01-01"))).toEqual([]);
  });
  it("retains the event's youngest-learner safety exclusion before clearing identity", () => {
    const event: PhenologyEntry = { ...projection()!.entries[0]!, kind: "event", scientificName: "Vespa orientalis" };
    expect(resolveCast({ data: null, phenology: [event], yearGroup: "Reception", now: date }).members).toEqual([]);
  });
  it.each(["empty", "malformed"])("observation last-good does not revive curated data after current producer %s", async (mode) => {
    vi.resetModules();
    vi.useFakeTimers(); vi.setSystemTime(date);
    const complete = structuredClone(london);
    complete.facts.fieldSnapshot.observations = { nearby: [{ name: "Blackberry", scientificName: "Rubus fruticosus", iconicTaxon: "Plantae" }], birds: { notable: [] }, absent: [], historical: { resolutionStatus: "resolved", nearby: [] } };
    const empty = structuredClone(complete);
    if (mode === "empty") delete empty.facts.fieldSnapshot.phenology;
    else empty.facts.fieldSnapshot.phenology.provider = "unknown";
    empty.facts.fieldSnapshot.observations.nearby = [];
    empty.facts.fieldSnapshot.observations.historical.resolutionStatus = "unresolved";
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => complete }).mockResolvedValueOnce({ ok: true, json: async () => empty });
    vi.stubGlobal("fetch", fetch);
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const query = { lat: 51.546, lng: -0.105 };
    expect((await fetchFieldTruth(query))?.facts?.fieldSnapshot?.phenology).toBeDefined();
    vi.setSystemTime(new Date(date.getTime() + 16 * 60_000));
    const answer = await fetchFieldTruth(query);
    expect(answer?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Blackberry");
    expect(answer?.facts?.fieldSnapshot?.phenology).toBeUndefined();
    expect((await fetchFieldTruth(query))?.facts?.fieldSnapshot?.phenology).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
