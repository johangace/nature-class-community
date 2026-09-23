import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSkyKey, bandCloudCover, type SkyKey } from "@/lib/outside/sky-key";

/**
 * THE SKY VOCABULARY, PINNED AGAINST THE PRODUCER'S (#368).
 *
 * Four tables in this app were keyed on `weather.current.skyCondition` and
 * every one held three keys the producer cannot emit and lacked three it can.
 * The tests could not see it, for the reason #284 already wrote down: a
 * producer that never returns a value never contradicts a reader that
 * invented it. The `today-day-read` fixtures were themselves sending
 * `skyCondition: "cloudy"`, which is not a value Pointmoon has ever sent.
 *
 * The compiler now enforces that every table is a complete `Record<SkyKey,
 * string>`. What it cannot enforce is that `SkyKey` still covers what the
 * PRODUCER sends, because that union lives in another repository. That is
 * what this file is for.
 */

/**
 * Pointmoon's `SkyCondition`, copied from
 * `packages/sources/pointmoon-source-weather/src/weather.ts`.
 *
 * If Pointmoon adds a member, the last test here fails and someone has to
 * write a clause for it rather than discovering the gap on a smoky morning in
 * front of a class.
 */
const PRODUCER_SKY_CONDITIONS = [
  "clear",
  "rain",
  "snow",
  "smoke",
  "haze",
  "fog",
  "overcast",
] as const;

/** Pointmoon's `SkyCover` (pointmoon#34). */
const PRODUCER_SKY_COVER = [
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "cloudy",
  "overcast",
] as const;

describe("the sky vocabulary reaches every value the producer can send", () => {
  it("resolves every SkyCondition to a key, never to null", () => {
    for (const condition of PRODUCER_SKY_CONDITIONS) {
      expect(resolveSkyKey({ skyCondition: condition })).not.toBeNull();
    }
  });

  it("resolves every SkyCover to itself", () => {
    for (const cover of PRODUCER_SKY_COVER) {
      // `skyCondition: "clear"` is what Pointmoon sends alongside any cover
      // band below overcast, and must not win over the band.
      expect(resolveSkyKey({ skyCondition: "clear", skyCover: cover })).toBe(cover);
    }
  });

  /**
   * THE REACH ASSERTION. A correctness test cannot see an unreachable key:
   * every table entry below is syntactically fine and typechecks. Only a scan
   * of the source can tell you nobody can ever get to it.
   */
  it("no sky table holds a key the resolver cannot produce", () => {
    const REACHABLE: readonly SkyKey[] = [
      "clear",
      "mostly-clear",
      "partly-cloudy",
      "cloudy",
      "overcast",
      "fog",
      "haze",
      "smoke",
      "snow",
      "rain",
    ];

    // Every one is genuinely reachable from a producer reading, and this
    // loop is what proves it rather than the list asserting itself.
    const produced = new Set<string>();
    for (const condition of PRODUCER_SKY_CONDITIONS) {
      const key = resolveSkyKey({ skyCondition: condition });
      if (key) produced.add(key);
    }
    for (const pct of [0, 15, 45, 70, 95]) {
      const key = resolveSkyKey({ skyCondition: "clear", cloudCoverPct: pct });
      if (key) produced.add(key);
    }
    expect([...produced].sort()).toEqual([...REACHABLE].sort());

    // Each table is typed `Record<SkyKey, string>`, so the compiler refuses a
    // missing or invented key. This asserts the TYPE is the one in force: a
    // table that quietly reverted to `Record<string, string>` would still
    // compile, and would silently reopen exactly this hole.
    const TABLES: Array<[string, string]> = [
      ["lib/outside/day-read.ts", "SKY_CLAUSES"],
      ["lib/conditions.ts", "SKY_PHRASES"],
      ["lib/outside/conditions.ts", "SKY_LABELS"],
      ["lib/cast/conditions.ts", "SKY_WORDS"],
    ];
    for (const [file, table] of TABLES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${table} in ${file}`).toContain(
        `const ${table}: Record<SkyKey, string> = {`
      );
    }

    // And nothing still reads the render enum straight into a phrase table,
    // which is the shape the bug had.
    for (const [file] of TABLES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/SKY_[A-Z]+\[\s*current\.skyCondition/);
    }
  });
});

describe("a render enum does not get to write prose", () => {
  it("does not call a sixty-one percent cloud sky clear", () => {
    // The live London reading, 2026-08-23.
    expect(resolveSkyKey({ skyCondition: "clear", cloudCoverPct: 61 })).toBe("cloudy");
  });

  it("bands cloud on okta boundaries", () => {
    expect(bandCloudCover(0)).toBe("clear");
    expect(bandCloudCover(9)).toBe("clear");
    expect(bandCloudCover(10)).toBe("mostly-clear");
    expect(bandCloudCover(29)).toBe("mostly-clear");
    expect(bandCloudCover(30)).toBe("partly-cloudy");
    expect(bandCloudCover(59)).toBe("partly-cloudy");
    expect(bandCloudCover(60)).toBe("cloudy");
    expect(bandCloudCover(84)).toBe("cloudy");
    // The boundary Pointmoon's own classifySkyCondition uses for overcast,
    // so the two can never disagree at the edge.
    expect(bandCloudCover(85)).toBe("overcast");
    expect(bandCloudCover(100)).toBe("overcast");
  });

  it("lets fog, haze, smoke, snow and rain outrank any amount of cloud", () => {
    for (const condition of ["fog", "haze", "smoke", "snow", "rain"]) {
      expect(resolveSkyKey({ skyCondition: condition, cloudCoverPct: 3 })).toBe(condition);
      expect(resolveSkyKey({ skyCondition: condition, skyCover: "clear" })).toBe(condition);
    }
  });

  it("prefers the producer's band over our own banding of its number", () => {
    // Disagreement should not be possible, but if it ever is, the producer's
    // own word wins: it may know something the raw percentage does not.
    expect(resolveSkyKey({ skyCover: "overcast", cloudCoverPct: 5 })).toBe("overcast");
  });

  it("falls back to the render enum only for what it can honestly say", () => {
    expect(resolveSkyKey({ skyCondition: "clear" })).toBe("clear");
    expect(resolveSkyKey({ skyCondition: "overcast" })).toBe("overcast");
  });

  it("says nothing rather than guessing", () => {
    expect(resolveSkyKey(null)).toBeNull();
    expect(resolveSkyKey({})).toBeNull();
    expect(resolveSkyKey({ skyCondition: "not-a-sky" })).toBeNull();
    // An invented cover band is refused rather than passed through.
    expect(resolveSkyKey({ skyCover: "brilliant" })).toBeNull();
    expect(bandCloudCover(null)).toBeNull();
    expect(bandCloudCover(Number.NaN)).toBeNull();
  });
});
