import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { londonReplay } from "../fixtures/pointmoon/nc621/replay";
import { parseCuratedPhenology } from "@/lib/outside/curated-phenology";
import {
  readPhenologyCondition,
  phenologyConditionNote,
  PRIMARY_CONFIDENCE_FLOOR,
  type PhenologyCondition,
} from "@/lib/outside/phenology-signals";
import { summarizeConditions } from "@/lib/outside/conditions";
import { crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";
import type { FieldTruth } from "@/lib/outside/pointmoon";
const raw = londonReplay();

/**
 * Every `nature.phenology.primary` the captured payloads actually carry, read
 * off disk at test time (#1281, #1293).
 *
 * One reader for both claims this suite makes about real payloads — the floor
 * IS their minimum confidence, and none of their headlines is suppressed by
 * the safety boundary. Sharing it is the point rather than tidiness: two
 * readers could disagree about which payloads count, and a hand-copied list
 * beside either one would keep passing after the fixture it was copied from
 * had moved.
 */
function capturedPrimaries(): Array<{ file: string; note: string; confidence: number }> {
  const root = "tests/fixtures/pointmoon";
  const found: Array<{ file: string; note: string; confidence: number }> = [];
  for (const entry of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!entry.endsWith(".json")) continue;
    const file = join(root, entry);
    const payload = JSON.parse(readFileSync(file, "utf8")) as {
      facts?: { signals?: Array<{ id?: string; value?: unknown; confidence?: number }> };
    };
    for (const signal of payload.facts?.signals ?? []) {
      if (signal?.id !== "nature.phenology.primary") continue;
      if (typeof signal.confidence !== "number" || typeof signal.value !== "string") continue;
      found.push({ file, note: signal.value.trim(), confidence: signal.confidence });
    }
  }
  return found;
}
const current: FieldTruth = { facts: { signals: raw.facts.signals, fieldSnapshot: {
  phenology: parseCuratedPhenology(raw.facts.fieldSnapshot.phenology, raw.facts.fieldSnapshot.time.date),
} } };
afterEach(() => vi.useRealTimers());
describe("curated condition provenance", () => {
  it("labels the recorded calendar as a regional expectation", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(raw.facts.fieldSnapshot.time.date));
    expect(readPhenologyCondition(current)?.dominantPhase).toBe("peak");
    expect(readPhenologyCondition(current)?.primary?.species).toBe("Blackberry");
    // #1281: the headline this payload has always carried now reaches the
    // sentence instead of being parsed and dropped, attributed to the
    // calendar rather than asserted as a reading taken here.
    expect(summarizeConditions(current).seasonalNote).toBe(
      "The regional calendar describes seasonal signs as at their peak. " +
        "The regional calendar names one headline this week: Blackberries at peak, ripe fruits everywhere."
    );
  });
  it("refuses scalar signals without the structured curated read", () => {
    expect(readPhenologyCondition({ facts: { signals: raw.facts.signals } })).toBeNull();
    expect(readPhenologyCondition(null)).toBeNull();
  });
  it("refuses a calendar from another week or year", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22"));
    expect(readPhenologyCondition(current)).toBeNull();
    vi.setSystemTime(new Date("2027-09-13"));
    expect(readPhenologyCondition(current)).toBeNull();
  });
  it("does not turn undeclared or unrelated scalar signals into seasonal claims", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(raw.facts.fieldSnapshot.time.date));
    expect(readPhenologyCondition({ facts: { ...current.facts, signals: [{ id: "nature.phenology.dominant_phase", value: "peak" }] } })).toBeNull();
  });
});
describe("phenologyConditionNote: composed only from recognised vocabulary", () => {
  it("writes both sentences when both signals are known", () => {
    const condition: PhenologyCondition = {
      dominantPhase: "fading",
      seasonProgress: "ahead",
      agddAnomaly: 610.2,
      primary: null,
    };
    expect(phenologyConditionNote(condition)).toBe(
      "The regional calendar describes seasonal signs as fading. The regional calendar suggests a season ahead of average."
    );
  });

  it("writes one sentence when only the phase is known", () => {
    expect(
      phenologyConditionNote({
        dominantPhase: "peak",
        seasonProgress: null,
        agddAnomaly: null,
        primary: null,
      })
    ).toBe("The regional calendar describes seasonal signs as at their peak.");
  });

  it("writes one sentence when only the progress is known", () => {
    expect(
      phenologyConditionNote({
        dominantPhase: null,
        seasonProgress: "behind",
        agddAnomaly: null,
        primary: null,
      })
    ).toBe("The regional calendar suggests a season behind average.");
  });

  it("goes silent rather than guess at a phase or progress word it does not recognise", () => {
    expect(
      phenologyConditionNote({
        dominantPhase: "phenomenal",
        seasonProgress: "wildly-unusual",
        agddAnomaly: 12,
        primary: null,
      })
    ).toBeNull();
  });

  it("is silent on a null read", () => {
    expect(phenologyConditionNote(null)).toBeNull();
  });

  it("never translates agddAnomaly into a warmer/cooler claim", () => {
    const note = phenologyConditionNote({
      dominantPhase: null,
      seasonProgress: null,
      agddAnomaly: 900,
      primary: null,
    });
    expect(note).toBeNull();
  });

  it("relays the week's headline at the observed floor, attributed", () => {
    expect(
      phenologyConditionNote({
        dominantPhase: null,
        seasonProgress: null,
        agddAnomaly: null,
        primary: {
          species: "Common Swift",
          note: "Swifts gathering and beginning to depart southward",
          confidence: PRIMARY_CONFIDENCE_FLOOR,
        },
      })
    ).toBe(
      "The regional calendar names one headline this week: Swifts gathering and beginning to depart southward."
    );
  });

  it("refuses a headline weaker than any payload Pointmoon has been seen to send", () => {
    expect(
      phenologyConditionNote({
        dominantPhase: null,
        seasonProgress: null,
        agddAnomaly: null,
        primary: {
          species: "Blackberry",
          note: "Blackberries at peak, ripe fruits everywhere",
          confidence: PRIMARY_CONFIDENCE_FLOOR - 0.001,
        },
      })
    ).toBeNull();
  });

  it("refuses a headline that carries no confidence at all", () => {
    expect(
      phenologyConditionNote({
        dominantPhase: null,
        seasonProgress: null,
        agddAnomaly: null,
        primary: { species: "Blackberry", note: "Blackberries at peak", confidence: null },
      })
    ).toBeNull();
  });

  it("refuses a confidence that is not a number, which a bare comparison would pass", () => {
    // `NaN < floor` is false, so a floor comparison on its own admits a NaN
    // rather than refusing it. Infinity is refused for the plainer reason
    // that it is not a number anything reports a confidence as.
    for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        phenologyConditionNote({
          dominantPhase: null,
          seasonProgress: null,
          agddAnomaly: null,
          primary: { species: "Blackberry", note: "Blackberries at peak", confidence },
        })
      ).toBeNull();
    }
  });

  it("refuses relayed prose that is not a single short line, rather than trimming it", () => {
    const base = { dominantPhase: null, seasonProgress: null, agddAnomaly: null } as const;
    const tooLong = "a".repeat(201);
    expect(
      phenologyConditionNote({ ...base, primary: { species: "X", note: tooLong, confidence: 0.4 } })
    ).toBeNull();
    expect(
      phenologyConditionNote({
        ...base,
        primary: { species: "X", note: "Two\nlines", confidence: 0.4 },
      })
    ).toBeNull();
    expect(
      phenologyConditionNote({
        ...base,
        primary: { species: "X", note: "<b>Conkers falling</b>", confidence: 0.4 },
      })
    ).toBeNull();
  });

  it("does not double the full stop on a headline that already has one", () => {
    const note = phenologyConditionNote({
      dominantPhase: null,
      seasonProgress: null,
      agddAnomaly: null,
      primary: { species: "Rabbitbrush", note: "Rabbitbrush at peak bloom.", confidence: 0.405 },
    });
    expect(note).toBe("The regional calendar names one headline this week: Rabbitbrush at peak bloom.");
  });

  it("puts the headline last, after the phase and progress sentences", () => {
    const note = phenologyConditionNote({
      dominantPhase: "peak",
      seasonProgress: "ahead",
      agddAnomaly: null,
      primary: { species: "Blackberry", note: "Blackberries at peak", confidence: 0.304 },
    })!;
    expect(note.indexOf("names one headline")).toBeGreaterThan(note.indexOf("ahead of average"));
  });

  it("IS the observed minimum, measured here rather than recited or rounded", () => {
    // The floor is a record of what Pointmoon actually sends (#1281), so this
    // reads the fixtures themselves. A recited list of numbers would agree
    // with the constant forever and notice nothing.
    //
    // Equality, not `>=`. The first draft used 0.3 and claimed in prose to
    // "refuse one weaker than any of them" while admitting 0.301, and a
    // `>=` assertion passed happily through that gap (#1293). If the band
    // moves, this fails until someone re-measures the constant — which is
    // the whole point of calling it measured.
    const observed = capturedPrimaries().map((p) => p.confidence);
    expect(observed.length).toBeGreaterThan(0);
    expect(PRIMARY_CONFIDENCE_FLOOR).toBe(Math.min(...observed));
  });

  it("refuses a headline whose prose crosses the field-safety boundary", () => {
    // The phenology corpus has really carried this sentence; it is a fixture
    // in tests/unit/lesson-support.spec.ts for that reason. Short and
    // single-line says nothing about whether it is safe to put in front of a
    // class, which is what the first draft got wrong (#1293).
    const unsafe = "Fill your pockets with pecans! Crack one open and eat the sweet nutty insides";
    expect(crossesSafetyBoundary(unsafe)).toBe(true);
    expect(
      phenologyConditionNote({
        dominantPhase: null,
        seasonProgress: null,
        agddAnomaly: null,
        primary: { species: "Pecan", note: unsafe, confidence: 0.405 },
      })
    ).toBeNull();
  });

  it("refuses the unsafe headline without taking the rest of the seasonal read down with it", () => {
    // The phase sentence is this reader's own composition from a recognised
    // token and is not implicated by a headline that had to be dropped.
    expect(
      phenologyConditionNote({
        dominantPhase: "peak",
        seasonProgress: null,
        agddAnomaly: null,
        primary: { species: "Blackberry", note: "Ripe for picking, taste one", confidence: 0.405 },
      })
    ).toBe("The regional calendar describes seasonal signs as at their peak.");
  });

  it("still relays every headline the captured payloads actually carry", () => {
    // The safety check is a backstop, not a filter on ordinary phenology. If
    // it starts suppressing real Pointmoon headlines, that is a fact worth
    // failing on rather than discovering as silence in production.
    //
    // READ, not recited. The first version of this test hard-coded five
    // strings copied out of the fixtures, which proves only that those five
    // copies survive: change a fixture's headline and the copy keeps passing
    // while the real sentence is suppressed, the exact regression the test
    // claims to catch. Found in review (#1293) — and it was the same mistake
    // the floor test above exists to avoid, made one function further down.
    const captured = capturedPrimaries();
    expect(captured.length).toBeGreaterThan(0);
    for (const { file, note, confidence } of captured) {
      const composed = phenologyConditionNote({
        dominantPhase: null,
        seasonProgress: null,
        agddAnomaly: null,
        primary: { species: "x", note, confidence },
      });
      // THE CLAIM IS "NOT SUPPRESSED", AND ONLY THAT (#1293 round three).
      //
      // The first derived version asserted the exact sentence, building it as
      // `${note}.` — which re-encodes the terminal-punctuation rule this test
      // does not own, and gets it wrong for a headline already ending in
      // `.`, `!` or `?`. Such a payload composes correctly in production and
      // would have failed here against a doubled terminator: a false red on
      // correct behaviour, waiting for the first fixture to end in a full
      // stop. The rule itself is pinned by "does not double the full stop"
      // above, on a fixed input, which is where a rule belongs.
      expect(composed, `${file}: a real captured headline was suppressed`).not.toBeNull();
      expect(composed).toContain("The regional calendar names one headline this week: ");
      expect(composed).toContain(note);
    }
  });

  it("keeps the house register: sentence case, no em dash, no all-caps", () => {
    const note = phenologyConditionNote({
      dominantPhase: "mixed",
      seasonProgress: "on-track",
      agddAnomaly: null,
      primary: null,
    })!;
    expect(note).not.toContain("—");
    expect(note).not.toMatch(/\b[A-Z]{3,}\b/);
  });
});
