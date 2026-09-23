/**
 * THE SEASONAL LIST IS ORDERED BY WHO FOUND IT, NOT BY HOW MANY WERE CAUGHT (#312).
 *
 * `lib/outside/gbif.ts` used to end on
 * `.sort((a, b) => b.occurrencesInMonth - a.occurrencesInMonth)`. The #312
 * audit measured what that produces across 50 real cells: Porto, August —
 * Barn Swallow, then ten light-trap moths; Jotunheimen — nine nocturnal
 * noctuids before a single bird or plant. Every name true, every count true,
 * and no child will find one.
 *
 * The counts are not the fault. The SORT is: a light trap logs hundreds of
 * moths a night for one recorder, and a child watching a hedge logs one bird,
 * so abundance reads how a thing was collected rather than how findable it is.
 *
 * These specs pin the correction on the three cases the audit and the ticket
 * both name, using the real numbers measured at the failing cells rather than
 * invented ones. They are pure — no network, per tests/support/no-live-network.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classPrior,
  clockSampleOffsets,
  findabilityCeiling,
  findabilityScore,
  hourOfRecord,
  isThinCell,
  observerBreadth,
  observerReading,
  rankByFindability,
  recorderIdentities,
  seasonalSpecies,
  SEASONAL_COVERAGE_FLOOR,
  type Findability,
  type SeasonalSpecies,
} from "@/lib/outside/gbif";

/* ── A FAKE GBIF, so the retrieval itself can be pinned without a network ──
 *
 * The pure specs below pin the score. The review findings on #1211 were about
 * what reaches the score — which records, which pages, which failures — and
 * those only exist in `seasonalSpecies`. This answers the four request shapes
 * that function makes, from a declared world, honouring GBIF's paging
 * parameters (`limit`/`offset`, and `facetLimit`/`facetOffset` both global and
 * per-field) so a request that asks for one page gets one page.
 */
const AUGUST = new Date("2026-08-10T10:00:00Z");
const INSECTS = 216;
const BIRDS = 212;

interface FakeSpecies {
  key: number;
  stratum: number;
  inMonth: number;
  taxonClass?: string;
  recordedBy?: Array<[string, number]>;
  protocols?: Array<[string, number]>;
  /** Clock hour per record, in GBIF's result order. Missing = untimed. */
  hours?: Array<number | null>;
}

function fakeGbif(
  world: FakeSpecies[],
  fail: (url: URL) => number | null = () => null,
) {
  const calls: URL[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const page = (p: URLSearchParams, field: string, fallback: number) => ({
    limit: Number(p.get(`${field}.facetLimit`) ?? p.get("facetLimit") ?? fallback),
    offset: Number(p.get(`${field}.facetOffset`) ?? p.get("facetOffset") ?? 0),
  });
  const facet = (p: URLSearchParams, field: string, rows: Array<[string, number]>) => {
    const { limit, offset } = page(p, field, 10);
    const sorted = [...rows].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      field: field.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase(),
      counts: sorted.slice(offset, offset + limit).map(([name, count]) => ({ name, count })),
    };
  };

  const handler = vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    calls.push(url);
    const status = fail(url);
    if (status !== null) return new Response("rate limited", { status });
    const p = url.searchParams;
    const path = url.pathname.replace(/^\/v1/, "");

    const vernacular = /^\/species\/(\d+)\/vernacularNames$/.exec(path);
    if (vernacular) {
      // Names carry no digits: the real name filter drops any that do.
      const letters = (vernacular[1] ?? "").replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)));
      return json({ results: [{ vernacularName: `Common ${letters}`, language: "eng" }] });
    }
    const taxon = /^\/species\/(\d+)$/.exec(path);
    if (taxon) {
      const s = world.find((w) => w.key === Number(taxon[1]));
      return json({ canonicalName: `Genus k${taxon[1]}`, class: s?.taxonClass ?? "Insecta" });
    }
    if (path !== "/occurrence/search") return new Response("?", { status: 404 });

    const facets = p.getAll("facet");
    if (p.has("taxonKey")) {
      const inStratum = world
        .filter((w) => w.stratum === Number(p.get("taxonKey")))
        .sort((a, b) => b.inMonth - a.inMonth || a.key - b.key);
      return json({
        count: inStratum.reduce((n, s) => n + s.inMonth, 0),
        facets: [facet(p, "speciesKey", inStratum.map((s) => [String(s.key), s.inMonth]))],
      });
    }
    const s = world.find((w) => w.key === Number(p.get("speciesKey")));
    if (!s) return json({ count: 0, results: [], facets: [] });
    if (facets.includes("month")) {
      // Half the local record falls in August, so the seasonality gate passes.
      return json({
        count: s.inMonth * 2,
        facets: [{ field: "MONTH", counts: [{ name: "8", count: s.inMonth }, { name: "3", count: s.inMonth }] }],
      });
    }
    const limit = Number(p.get("limit") ?? 20);
    const offset = Number(p.get("offset") ?? 0);
    const hours = Array.from({ length: s.inMonth }, (_, i) => s.hours?.[i] ?? null);
    return json({
      count: s.inMonth,
      results: hours
        .slice(offset, offset + limit)
        .map((h) => (h === null ? {} : { eventTime: `${String(h).padStart(2, "0")}:10:00` })),
      facets: [
        ...(facets.includes("recordedBy") ? [facet(p, "recordedBy", s.recordedBy ?? [])] : []),
        ...(facets.includes("samplingProtocol") ? [facet(p, "samplingProtocol", s.protocols ?? [])] : []),
      ],
    });
  });
  vi.stubGlobal("fetch", handler);
  return { calls };
}

/**
 * Different recorders with the given record counts. Surnames are letters only
 * ("Given Aa", "Given Ab", ...) because recorder normalisation drops digits.
 */
function recorders(counts: number[]): Array<[string, number]> {
  const letters = (i: number) =>
    String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
  return counts.map((c, i) => [`Given ${letters(i)}`, c]);
}

const daytime = (n: number) => Array.from({ length: n }, () => 11);

afterEach(() => {
  vi.unstubAllGlobals();
});

function findability(over: Partial<Findability> = {}): Findability {
  const signals = {
    distinctObservers: 12,
    topObserverShare: 0.2,
    observerCoverage: 1,
    daylightShare: 1,
    lightTrapped: false,
    classPrior: 1,
    ...over,
  };
  return { ...signals, score: over.score ?? findabilityScore(signals) };
}

function species(
  name: string,
  over: Partial<SeasonalSpecies> = {},
): SeasonalSpecies {
  return {
    key: name.length * 1000 + name.charCodeAt(0),
    name,
    scientificName: `Genus ${name.toLowerCase()}`,
    taxonClass: "Insecta",
    stratum: "insects",
    occurrencesInMonth: 150,
    occurrencesAllYear: 600,
    monthShare: 0.25,
    monthHistogram: [0, 0, 0, 2, 10, 40, 120, 150, 40, 5, 0, 0],
    phase: "peak",
    findability: findability(),
    ...over,
  };
}

function names(list: readonly SeasonalSpecies[]): string[] {
  return list.map((s) => s.name);
}

describe("a taxon whose records cluster after dark ranks below a day-visible one", () => {
  it("separates them at identical abundance and identical observer breadth", () => {
    // Same count, same recorders. The ONLY difference is the clock.
    const day = species("Red Admiral", {
      findability: findability({ daylightShare: 1 }),
    });
    const night = species("Porter's Rustic", {
      findability: findability({ daylightShare: 0.35 }),
    });

    expect(names(rankByFindability([night, day]))).toEqual([
      "Red Admiral",
      "Porter's Rustic",
    ]);
  });

  it("abstains rather than guessing when too few records carry a time", () => {
    // Jotunheimen's worst species, Barred Chestnut, has 396 August records and
    // not one sampled record with a clock time. A missing time must not be
    // scored as daylight, and must not be scored as night either.
    const timed = findabilityScore({
      distinctObservers: 12,
      topObserverShare: 0.2,
      observerCoverage: 1,
      daylightShare: 1,
      lightTrapped: false,
      classPrior: 1,
    });
    const untimed = findabilityScore({
      distinctObservers: 12,
      topObserverShare: 0.2,
      observerCoverage: 1,
      daylightShare: null,
      lightTrapped: false,
      classPrior: 1,
    });
    const dark = findabilityScore({
      distinctObservers: 12,
      topObserverShare: 0.2,
      observerCoverage: 1,
      daylightShare: 0,
      lightTrapped: false,
      classPrior: 1,
    });

    expect(untimed).toBeLessThan(timed);
    expect(untimed).toBeGreaterThan(dark);
  });
});

describe("a single-observer taxon ranks below a many-observer one", () => {
  it("puts Porto's Barn Swallow above Porto's moths on the real readings", () => {
    // Measured live at 41.1579,-8.6291, August, 0.15 degree box.
    const swallow = species("Barn Swallow", {
      occurrencesInMonth: 750,
      taxonClass: "Aves",
      stratum: "birds",
      findability: findability({
        distinctObservers: 152,
        topObserverShare: 0.08,
        daylightShare: 1,
      }),
    });
    const scarceMerveille = species("Scarce Merveille Du Jour", {
      occurrencesInMonth: 191,
      findability: findability({
        distinctObservers: 15,
        topObserverShare: 0.62,
        daylightShare: 0.89,
        lightTrapped: true,
      }),
    });
    const portersRustic = species("Porter's Rustic", {
      occurrencesInMonth: 175,
      findability: findability({
        distinctObservers: 7,
        topObserverShare: 0.59,
        daylightShare: 0.57,
      }),
    });

    // The bird is first, which is the whole ask. Both moths are below it.
    //
    // Their order AMONG THEMSELVES is worth writing down because it is not the
    // one abundance gave and not the one a reader would guess: Scarce
    // Merveille Du Jour has more than twice Porter's Rustic's recorders, and
    // still sits last, because its records declare "skinner trap with mixed
    // light of 160 w" where Porter's Rustic declares no protocol at all. The
    // protocol field is sparse — about one record in twelve carries one — so
    // it orders moths unevenly among themselves. That is acceptable here and
    // would not be if it were deciding which moth outranks a bird.
    expect(names(rankByFindability([scarceMerveille, portersRustic, swallow]))).toEqual([
      "Barn Swallow",
      "Porter's Rustic",
      "Scarce Merveille Du Jour",
    ]);
  });

  it("sinks a 396-record single-recorder taxon under a 10-record shared one", () => {
    // Jotunheimen's Barred Chestnut: 396 records, ONE recorder. Përmet's
    // Woodchat Shrike: 10 records, three recorders. Abundance ranked the first
    // thirty-nine times higher; findability does not.
    const trapRun = species("Barred Chestnut", {
      occurrencesInMonth: 396,
      findability: findability({
        distinctObservers: 1,
        topObserverShare: 1,
        daylightShare: null,
      }),
    });
    const seenByPeople = species("Woodchat Shrike", {
      occurrencesInMonth: 10,
      taxonClass: "Aves",
      stratum: "birds",
      findability: findability({
        distinctObservers: 3,
        topObserverShare: 0.6,
        daylightShare: null,
      }),
    });

    expect(names(rankByFindability([trapRun, seenByPeople]))).toEqual([
      "Woodchat Shrike",
      "Barred Chestnut",
    ]);
  });

  it("scores one recorder at zero breadth, because one person is no evidence", () => {
    expect(observerBreadth(1)).toBe(0);
    expect(observerBreadth(0)).toBe(0);
    expect(observerBreadth(3)).toBeGreaterThan(0);
    expect(observerBreadth(40)).toBe(1);
    expect(observerBreadth(4000)).toBe(1);
  });

  it("catches the wrong-access failure with the same reading", () => {
    // Connemara's top four were submerged lake plants — real records at a real
    // conservation site, and underwater. Shoreweed: 157 records, one recorder.
    // The signal that catches a trap catches a survey, which is correct.
    const submerged = species("Shoreweed", {
      occurrencesInMonth: 157,
      taxonClass: "Magnoliopsida",
      stratum: "plants",
      findability: findability({
        distinctObservers: 1,
        topObserverShare: 1,
        daylightShare: null,
      }),
    });
    const hedgerow = species("European Robin", {
      occurrencesInMonth: 114,
      taxonClass: "Aves",
      stratum: "birds",
      findability: findability({ distinctObservers: 40, topObserverShare: 0.1 }),
    });

    expect(names(rankByFindability([submerged, hedgerow]))).toEqual([
      "European Robin",
      "Shoreweed",
    ]);
  });
});

describe("abundance is a tiebreak, not the sort", () => {
  it("orders by findability first and only then by count", () => {
    const common = species("Common Thing", {
      key: 1,
      occurrencesInMonth: 900,
      findability: findability({ distinctObservers: 4, topObserverShare: 0.5 }),
    });
    const findable = species("Findable Thing", {
      key: 2,
      occurrencesInMonth: 12,
      findability: findability({ distinctObservers: 30, topObserverShare: 0.1 }),
    });
    expect(names(rankByFindability([common, findable]))).toEqual([
      "Findable Thing",
      "Common Thing",
    ]);

    // Equal findability: the commoner thing wins, which is the old intuition
    // kept in the only place it is actually true.
    const twinA = species("Twin A", { key: 1, occurrencesInMonth: 40 });
    const twinB = species("Twin B", { key: 2, occurrencesInMonth: 900 });
    expect(names(rankByFindability([twinA, twinB]))).toEqual(["Twin B", "Twin A"]);
  });

  it("is stable: the same cell returns the same order twice", () => {
    const tied = [3, 1, 2].map((key) =>
      species(`Tied ${key}`, { key, occurrencesInMonth: 100 }),
    );
    expect(names(rankByFindability(tied))).toEqual(names(rankByFindability(tied)));
    expect(names(rankByFindability(tied))).toEqual(["Tied 1", "Tied 2", "Tied 3"]);
  });
});

describe("a declared light trap costs a species its place, and does not delete it", () => {
  it("demotes without excluding", () => {
    const trapped = species("Rosy Footman", {
      findability: findability({ lightTrapped: true }),
    });
    const noticed = species("Meadow Brown", {
      findability: findability({ lightTrapped: false }),
    });

    const ranked = rankByFindability([trapped, noticed]);
    expect(names(ranked)).toEqual(["Meadow Brown", "Rosy Footman"]);
    // Still on the list. A real record of a real moth is not a lie.
    expect(ranked).toHaveLength(2);
  });
});

describe("the open class prior is open, and small", () => {
  it("down-weights what a child can touch but cannot name", () => {
    expect(classPrior("Bryopsida")).toBeLessThan(1);
    expect(classPrior("Jungermanniopsida")).toBeLessThan(1);
    expect(classPrior("Lecanoromycetes")).toBeLessThan(1);
    // A lichen on a wall is easier to show than a moss species. Ordered, not equal.
    expect(classPrior("Lecanoromycetes")).toBeGreaterThan(classPrior("Bryopsida"));
  });

  it("says nothing about the classes the audit found no class-level fault in", () => {
    // Insecta carries both Dublin's twelve day-flying butterflies and Porto's
    // moths; Arachnida carries both a garden spider and a skin mite; Aves
    // carries both a robin and a pelagic gannet. None of those splits is a
    // class, and pretending otherwise is the fudge this table exists to avoid.
    expect(classPrior("Insecta")).toBe(1);
    expect(classPrior("Arachnida")).toBe(1);
    expect(classPrior("Aves")).toBe(1);
    expect(classPrior("Magnoliopsida")).toBe(1);
    expect(classPrior("Agaricomycetes")).toBe(1);
    expect(classPrior(null)).toBe(1);
  });
});

describe("the coverage floor shows fewer, it does not cut", () => {
  it("reports a thin cell without removing anything from it", () => {
    // Oslo, February: seven species, and the audit's worst cell.
    const oslo = ["Eurasian Bullfinch", "Yellow Mealworm", "smaller green leafhopper",
      "Bronzed Blackclock", "Feather-legged Lace Weaver", "Longbodied Cellar Spider",
      "Follicle Mite"].map((n, i) => species(n, { key: i + 1 }));

    expect(oslo).toHaveLength(7);
    expect(isThinCell(oslo)).toBe(true);
    // Every one of the seven survives the ranking. The floor is a reading for
    // the caller, not a filter — a thin place is allowed to be thin.
    expect(rankByFindability(oslo)).toHaveLength(7);
  });

  it("is quiet about a cell that clears it", () => {
    // Përmet, August: 34 species. The case the whole layer exists for.
    const permet = Array.from({ length: 34 }, (_, i) =>
      species(`Permet ${i}`, { key: i + 1 }),
    );
    expect(isThinCell(permet)).toBe(false);
    expect(SEASONAL_COVERAGE_FLOOR).toBe(10);
  });

  it("sits exactly at ten, the number the audit sized", () => {
    const nine = Array.from({ length: 9 }, (_, i) => species(`S${i}`, { key: i + 1 }));
    expect(isThinCell(nine)).toBe(true);
    expect(isThinCell([...nine, species("S9", { key: 10 })])).toBe(false);
  });
});

describe("reading a clock off a GBIF record", () => {
  it("takes the recorder's own local hour", () => {
    expect(hourOfRecord({ eventTime: "14:32:50+01:00" })).toBe(14);
    // A UTC time is placed at a longitude; at Greenwich solar time is UTC.
    expect(hourOfRecord({ eventTime: "23:05:00Z" }, 0)).toBe(23);
    expect(hourOfRecord({ eventTime: "07:15" })).toBe(7);
    expect(hourOfRecord({ eventTime: "9:05:00" })).toBe(9);
  });

  it("falls back to a timestamped eventDate", () => {
    expect(hourOfRecord({ eventDate: "2026-08-04T22:10:00" })).toBe(22);
  });

  it("returns null rather than a plausible number", () => {
    expect(hourOfRecord({ eventDate: "2026-08-04" })).toBeNull();
    expect(hourOfRecord({})).toBeNull();
    expect(hourOfRecord({ eventTime: "" })).toBeNull();
    expect(hourOfRecord({ eventTime: "not a time" })).toBeNull();
    expect(hourOfRecord({ eventTime: "44:00:00" })).toBeNull();
    expect(hourOfRecord({ eventTime: 14 })).toBeNull();
  });
});

describe("a failed GBIF read is not evidence (review 4002123405)", () => {
  // X is seen by twenty people in daylight; Y is one recorder's run. The
  // only thing that may put Y above X is evidence, never which request 429'd.
  const world: FakeSpecies[] = [
    { key: 101, stratum: INSECTS, inMonth: 20, recordedBy: recorders(Array(20).fill(1)), hours: daytime(20) },
    { key: 102, stratum: INSECTS, inMonth: 30, recordedBy: [["Solo Runner", 30]], hours: daytime(30) },
  ];
  const isSignalReadFor = (key: number) => (url: URL) =>
    url.searchParams.get("speciesKey") === String(key) && url.searchParams.has("month");

  it("retries a transient 429 and ranks the species on what GBIF then says", async () => {
    let failed = false;
    fakeGbif(world, (url) => {
      if (!failed && isSignalReadFor(101)(url)) {
        failed = true;
        return 429;
      }
      return null;
    });
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    expect(list.map((s) => s.key)).toEqual([101, 102]);
  });

  it("returns nothing rather than an order decided by a failure", async () => {
    fakeGbif(world, (url) => (isSignalReadFor(101)(url) ? 429 : null));
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    // Not [102, 101 at score 0]. The documented answer to an unreachable GBIF
    // is to say less, and a list with a silently buried species says wrong.
    expect(list).toEqual([]);
  });
});

describe("records with no recorder are unknown, not independent observers (review 4002123403)", () => {
  it("does not credit 97 unattributed records as spread", async () => {
    // A: 100 records, three of which name a recorder. The other 97 could be
    // one trap operator's; nothing says they are 97 different people.
    // B: 30 records, every one attributed, six recorders, one holding half.
    fakeGbif([
      { key: 201, stratum: INSECTS, inMonth: 100, recordedBy: [["Ana", 1], ["Rui", 1], ["Eva", 1]], hours: daytime(100) },
      { key: 202, stratum: INSECTS, inMonth: 30, recordedBy: recorders([15, 3, 3, 3, 3, 3]), hours: daytime(30) },
    ]);
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });

    expect(list.map((s) => s.key)).toEqual([202, 201]);
    const sparse = list.find((s) => s.key === 201)!;
    expect(sparse.findability.observerCoverage).toBeCloseTo(0.03, 5);
    // Three named records by three people: the share is measured over what is
    // attributed, never over records nobody put a name to.
    expect(sparse.findability.topObserverShare).toBeCloseTo(1 / 3, 5);
  });
});

describe("recorder labels are normalised into people before they are counted (review 4002123407)", () => {
  it("merges one person's spelling variants and splits a multi-person label", async () => {
    // M: one man, three spellings, as Porto's real facet reads
    // ("Jorge Pereira Gomes", "J P Gomes"). N: a group record naming four
    // people, plus a fifth recorder.
    fakeGbif([
      {
        key: 301, stratum: INSECTS, inMonth: 60, hours: daytime(60),
        recordedBy: [["Jorge Pereira Gomes", 20], ["J P Gomes", 20], ["Gomes, Jorge", 20]],
      },
      {
        key: 302, stratum: INSECTS, inMonth: 24, hours: daytime(24),
        recordedBy: [["Ana Silva | Rui Costa | Marta Reis | Luis Neves", 12], ["Sofia Dias", 12]],
      },
    ]);
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });

    expect(list.map((s) => s.key)).toEqual([302, 301]);
    expect(list.find((s) => s.key === 301)!.findability.distinctObservers).toBe(1);
    expect(list.find((s) => s.key === 302)!.findability.distinctObservers).toBe(5);
  });

  it("reads the label shapes GBIF actually carries", () => {
    const same = (a: string, b: string) => expect(recorderIdentities(a)).toEqual(recorderIdentities(b));
    same("Jorge Pereira Gomes", "J P Gomes");
    same("Gomes, Jorge", "Jorge Gomes");
    same("João Lima", "Joao LIMA");
    expect(recorderIdentities("Ana Silva; Rui Costa & Marta Reis")).toHaveLength(3);
    expect(recorderIdentities("Smith, J., Jones, K.")).toEqual(recorderIdentities("J Smith | K Jones"));
    // A username is a person, and stays one token.
    expect(recorderIdentities("mushi-freckles")).toHaveLength(1);
    // Placeholders name nobody.
    expect(recorderIdentities("Unknown")).toEqual([]);
    expect(recorderIdentities("anonymous")).toEqual([]);
  });

  it("never counts more independent observers than attributed records", () => {
    // One record naming twelve people is one finding, not twelve.
    const group = Array.from({ length: 12 }, (_, i) => `Person${String.fromCharCode(65 + i)} Name`).join(" | ");
    expect(observerReading([{ name: group, count: 1 }], 1).distinctObservers).toBe(1);
  });
});

describe("the trap decision reads every declared protocol, not the top labels (review 4002123410)", () => {
  it("sees a long tail of trap descriptions the first facet page leaves out", async () => {
    // 300 records say "unknown"; 400 more each describe their own trap run in
    // their own words. Of 700 declared, 400 are traps. The first page of the
    // facet holds "unknown" and a few trap strings, which reads as NOT trapped.
    const tail: Array<[string, number]> = Array.from({ length: 400 }, (_, i) => [
      `moth trap run ${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))} night`,
      1,
    ]);
    const sameObservers = recorders(Array(20).fill(35));
    fakeGbif([
      { key: 501, stratum: INSECTS, inMonth: 700, recordedBy: sameObservers, hours: daytime(700), protocols: [["unknown", 300], ...tail] },
      { key: 502, stratum: INSECTS, inMonth: 700, recordedBy: sameObservers, hours: daytime(700) },
    ]);
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });

    expect(list.find((s) => s.key === 501)!.findability.lightTrapped).toBe(true);
    expect(list.map((s) => s.key)).toEqual([502, 501]);
  });

  it("does not call a species trapped because a non-trap tail was left out", async () => {
    // The mirror case: 30 trap records on the first page, 250 distinct
    // non-trap protocols of one record each beyond it.
    const tail: Array<[string, number]> = Array.from({ length: 250 }, (_, i) => [
      `transect walk ${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`,
      1,
    ]);
    fakeGbif([
      {
        key: 503, stratum: INSECTS, inMonth: 300, recordedBy: recorders(Array(20).fill(15)), hours: daytime(300),
        protocols: [["light trap", 30], ...tail],
      },
    ]);
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    expect(list[0]!.findability.lightTrapped).toBe(false);
  });
});

describe("clock times are sampled across the result set, not off its first page (review 4002123408)", () => {
  it("does not read one night-run batch at the head of the results as the species' hours", async () => {
    // 300 August records. GBIF's order puts one recorder's thirty 23:00 trap
    // records first; the other 270 are daytime sightings.
    const hours = [...Array(30).fill(23), ...daytime(270)];
    fakeGbif([{ key: 701, stratum: INSECTS, inMonth: 300, recordedBy: recorders(Array(20).fill(15)), hours }]);
    const [only] = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    // First page alone: 0 daylight. Three pages across the set: 20 of 30.
    expect(only!.findability.daylightShare).toBeCloseTo(2 / 3, 5);
  });

  it("finds the timed records that sit behind an untimed first page", async () => {
    const hours = [...Array(30).fill(null), ...daytime(270)];
    fakeGbif([{ key: 702, stratum: INSECTS, inMonth: 300, recordedBy: recorders(Array(20).fill(15)), hours }]);
    const [only] = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    expect(only!.findability.daylightShare).toBe(1);
  });

  it("spreads the pages evenly, never overlaps them, and stays inside GBIF's paging ceiling", () => {
    expect(clockSampleOffsets(10)).toEqual([]);
    expect(clockSampleOffsets(25)).toEqual([16]);
    expect(clockSampleOffsets(300)).toEqual([100, 200]);
    expect(clockSampleOffsets(1_000_000)).toEqual([99_990]);
  });
});

describe("the candidate pool is not chosen by abundance (review 4002123412)", () => {
  const scoredKeys = (calls: URL[]) =>
    calls.filter((u) => u.searchParams.getAll("facet").includes("month")).map((u) => Number(u.searchParams.get("speciesKey")));

  it("scores a widely seen butterfly that sits below twelve trap moths in the facet", async () => {
    const moths: FakeSpecies[] = Array.from({ length: 12 }, (_, i) => ({
      key: 801 + i, stratum: INSECTS, inMonth: 500 - i, hours: daytime(500 - i),
      recordedBy: [["Solo Trapper", 500 - i]], protocols: [["light trap", 50]],
    }));
    const butterfly: FakeSpecies = {
      key: 813, stratum: INSECTS, inMonth: 40, recordedBy: recorders(Array(20).fill(2)), hours: daytime(40),
    };
    fakeGbif([...moths, butterfly]);
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    expect(list[0]!.key).toBe(813);
  });

  it("stops paging once nothing further down could reach the stratum's top four", async () => {
    const strong: FakeSpecies[] = Array.from({ length: 4 }, (_, i) => ({
      key: 901 + i, stratum: BIRDS, inMonth: 300, recordedBy: recorders(Array(40).fill(7)), hours: daytime(300),
    }));
    const tail: FakeSpecies[] = Array.from({ length: 30 }, (_, i) => ({
      key: 911 + i, stratum: BIRDS, inMonth: 1, recordedBy: [["Lone Birder", 1]], hours: daytime(1),
    }));
    const { calls } = fakeGbif([...strong, ...tail]);
    await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    const birdPages = calls.filter((u) => u.searchParams.get("taxonKey") === String(BIRDS));
    expect(birdPages).toHaveLength(1);
    expect(scoredKeys(calls)).toHaveLength(12);
  });

  it("is bounded: a stratum that never settles scans sixty candidates and no more", async () => {
    const many: FakeSpecies[] = Array.from({ length: 100 }, (_, i) => ({
      key: 2000 + i, stratum: INSECTS, inMonth: 1000 - i, recordedBy: [["One Operator", 1000 - i]], hours: daytime(20),
    }));
    const { calls } = fakeGbif(many);
    await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    expect(scoredKeys(calls)).toHaveLength(60);
  });

  it("never sits below a score the readings could actually produce", () => {
    for (const records of [1, 2, 3, 5, 8, 13, 40, 41, 400]) {
      const ceiling = findabilityCeiling(records);
      for (let people = 1; people <= records; people = people * 2 + 1) {
        for (const daylightShare of [null, 0, 0.5, 1]) {
          const score = findabilityScore({
            distinctObservers: people,
            topObserverShare: 1 / people,
            observerCoverage: 1,
            daylightShare,
            lightTrapped: false,
            classPrior: 1,
          });
          expect(score).toBeLessThanOrEqual(ceiling + 1e-12);
        }
      }
    }
    expect(findabilityCeiling(0)).toBe(0);
  });
});

describe("a date normalised to midnight is not an observation at midnight (review 4004913506)", () => {
  it("abstains on an eventDate that carries only 00:00, or a date range", () => {
    expect(hourOfRecord({ eventDate: "2026-08-04T00:00:00" })).toBeNull();
    expect(hourOfRecord({ eventDate: "2026-08-04T00:00" })).toBeNull();
    expect(hourOfRecord({ eventDate: "2026-08-04T00:00:00Z" })).toBeNull();
    expect(hourOfRecord({ eventDate: "2026-08-04T00:00:00+01:00" })).toBeNull();
    expect(hourOfRecord({ eventDate: "2026-08-04T00:00:00.000" })).toBeNull();
    expect(hourOfRecord({ eventDate: "2026-08-04T00:00:00/2026-08-05T00:00:00" })).toBeNull();
  });

  it("still reads a real time, including a stated midnight", () => {
    expect(hourOfRecord({ eventTime: "00:10:00" })).toBe(0);
    expect(hourOfRecord({ eventTime: "00:00:00" })).toBe(0);
    expect(hourOfRecord({ eventDate: "2026-08-04T00:10:00" })).toBe(0);
    expect(hourOfRecord({ eventDate: "2026-08-04T21:30:00" })).toBe(21);
  });
});

describe("the recorder facet is read to its end before coverage is computed (review 4004913496)", () => {
  /** n different people, one record each, names letters only. */
  const crowd = (n: number): Array<[string, number]> =>
    Array.from({ length: n }, (_, i) => {
      const l = (k: number) => String.fromCharCode(97 + k);
      return [`Given Q${l(Math.floor(i / 676) % 26)}${l(Math.floor(i / 26) % 26)}${l(i % 26)}`, 1];
    });

  it("counts every attributed record when more than one page of recorders exists", async () => {
    fakeGbif([{ key: 1101, stratum: INSECTS, inMonth: 1500, recordedBy: crowd(1500), hours: daytime(1500) }]);
    const [only] = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    // A 200-label facet read this as 13% attributed.
    expect(only!.findability.observerCoverage).toBe(1);
  });

  it("abstains on coverage when the facet is still running at its bound", async () => {
    fakeGbif([{ key: 1102, stratum: INSECTS, inMonth: 5200, recordedBy: crowd(5200), hours: daytime(30) }]);
    const [only] = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    const f = only!.findability;
    expect(f.observerCoverage).toBeNull();
    const { score, ...signals } = f;
    expect(score).toBeCloseTo(findabilityScore(signals), 10);
    expect(findabilityScore({ ...signals, observerCoverage: null })).toBeLessThanOrEqual(findabilityCeiling(5200));
  });
});

describe("a UTC clock time is read at the cell's longitude, not as local (review 4005048440)", () => {
  it("places a California afternoon stored as 23:30Z in the afternoon", () => {
    // Los Angeles, -118.24: 23:30Z is about 15:37 local solar time.
    expect(hourOfRecord({ eventTime: "23:30:00Z" }, -118.24)).toBe(15);
    expect(hourOfRecord({ eventDate: "2026-08-04T23:30:00Z" }, -118.24)).toBe(15);
    expect(isDark(hourOfRecord({ eventTime: "23:30:00Z" }, -118.24)!)).toBe(false);
  });

  it("wraps across midnight in both directions", () => {
    expect(hourOfRecord({ eventTime: "02:00:00Z" }, 30)).toBe(4);
    expect(hourOfRecord({ eventTime: "01:00:00Z" }, -45)).toBe(22);
  });

  it("abstains on a UTC time when there is no longitude to place it at", () => {
    expect(hourOfRecord({ eventTime: "23:30:00Z" })).toBeNull();
    expect(hourOfRecord({ eventTime: "23Z" }, -118.24)).toBeNull();
  });

  it("leaves a time that states its own offset alone", () => {
    expect(hourOfRecord({ eventTime: "23:30:00-07:00" }, -118.24)).toBe(23);
    expect(hourOfRecord({ eventTime: "14:32:50+01:00" }, -8.63)).toBe(14);
  });
});

function isDark(hour: number): boolean {
  return hour >= 21 || hour < 5;
}

describe("perStratum below one reads nothing (review 4005048427)", () => {
  it("returns an empty list without a single GBIF request", async () => {
    // The review read the paging loop as unbounded at zero. It was not: its
    // ceiling is perStratum x 15, so the loop never entered. This pins the
    // explicit guard that now says so before any read, and stops the fake after
    // 50 reads so a regression fails instead of hanging.
    let n = 0;
    const { calls } = fakeGbif(
      [{ key: 1201, stratum: INSECTS, inMonth: 50, recordedBy: recorders(Array(10).fill(5)), hours: daytime(50) }],
      () => (++n > 50 ? 400 : null),
    );
    expect(await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST, perStratum: 0 })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("each stratum returns only the ranks its paging proved (review 4005048454)", () => {
  it("returns a stratum's top four, not every row on the page", async () => {
    // Twelve insects on one page, four of them clearly best. The eight below
    // are unproven: an unseen species further down could outrank them.
    const strong: FakeSpecies[] = Array.from({ length: 4 }, (_, i) => ({
      key: 1301 + i, stratum: INSECTS, inMonth: 300, recordedBy: recorders(Array(40).fill(7)), hours: daytime(300),
    }));
    const middling: FakeSpecies[] = Array.from({ length: 8 }, (_, i) => ({
      key: 1311 + i, stratum: INSECTS, inMonth: 200, recordedBy: recorders([100, 50, 50]), hours: daytime(200),
    }));
    fakeGbif([...strong, ...middling]);
    const list = await seasonalSpecies({ lat: 41.15, lng: -8.63, date: AUGUST });
    expect(list.map((s) => s.key).sort((a, b) => a - b)).toEqual([1301, 1302, 1303, 1304]);
  });
});
