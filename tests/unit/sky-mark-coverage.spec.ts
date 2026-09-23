import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { skyMarkKind, SKY_MARK_LABEL, type SkyMarkKind } from "@/lib/outside/sky-mark";
import { resolveSkyKey, type SkyKey } from "@/lib/outside/sky-key";

/**
 * EVERY SKY THE RESOLVER CAN NAME HAS A MARK (#371).
 *
 * #368 gave the day's sentence a clause for haze, smoke and snow — three real
 * `SkyCondition` values it had never had words for. The MARK still returned
 * null for all three, so a school in snow got an empty sky block on the
 * morning the weather most decides the lesson.
 *
 * The gap was invisible to a correctness test for the same reason the dead
 * clause keys were: nothing asserted that the two vocabularies lined up.
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

describe("every sky the producer can report draws something", () => {
  it("has a mark for every SkyCondition, with no rate reported", () => {
    for (const condition of PRODUCER_SKY_CONDITIONS) {
      const mark = skyMarkKind({ skyCondition: condition });
      expect(mark, `no mark for ${condition}`).not.toBeNull();
      expect(SKY_MARK_LABEL[mark as SkyMarkKind]).toBeTruthy();
    }
  });

  it("has a mark for every cloud band", () => {
    for (const pct of [0, 15, 45, 70, 95]) {
      const mark = skyMarkKind({ skyCondition: "clear", cloudCoverPct: pct });
      expect(mark, `no mark at ${pct}% cloud`).not.toBeNull();
    }
  });

  /**
   * THE REACH ASSERTION, the mark half of the one in sky-key.spec.ts.
   *
   * Derived by running the producer's own values through, so it fails when a
   * new `SkyKey` arrives without a drawing rather than when someone remembers
   * to update a list.
   */
  it("no SkyKey resolves to a mark that does not exist", () => {
    const keys = new Set<SkyKey>();
    for (const condition of PRODUCER_SKY_CONDITIONS) {
      const key = resolveSkyKey({ skyCondition: condition });
      if (key) keys.add(key);
    }
    for (const pct of [0, 15, 45, 70, 95]) {
      const key = resolveSkyKey({ skyCondition: "clear", cloudCoverPct: pct });
      if (key) keys.add(key);
    }
    for (const key of keys) {
      expect(SKY_MARK_LABEL, `SkyKey "${key}" has no mark`).toHaveProperty(key);
    }
  });

  /**
   * THE INK OFFSET, which nothing else checks.
   *
   * `MARKS` and `INK_OFFSET` are both `Record<SkyMarkKind, ...>`, so the
   * compiler already refuses a missing drawing — and sky-mark-fill.spec.ts
   * renders every kind, so a broken one fails there. Neither can see a
   * MISSING OFFSET, because `INK_OFFSET` would simply be incomplete and the
   * type error lands on the record rather than on the mark that shipped
   * without its measurement.
   *
   * A mark with no offset does not throw. It renders a few units off the rail
   * that every other mark sits on, which is the fault the table exists to fix
   * and is invisible in any test that only asks "did a path appear".
   *
   * Source scan because `INK_OFFSET` is deliberately not exported.
   */
  it("every mark carries a measured ink offset", () => {
    const source = readFileSync("app/SkyMark.tsx", "utf8");
    const table = source.slice(
      source.indexOf("const INK_OFFSET:"),
      source.indexOf("export function SkyMark")
    );
    expect(table.length).toBeGreaterThan(0);
    for (const kind of Object.keys(SKY_MARK_LABEL)) {
      expect(table, `${kind} has no ink offset`).toMatch(
        new RegExp(`"${kind}":\\s*-?\\d`)
      );
    }
  });
});

describe("rain still outranks the sky, and knows light from heavy", () => {
  it("reads the rate first, on its own two thresholds", () => {
    expect(skyMarkKind({ skyCondition: "clear", precipitationRateMmPerHour: 0.6 })).toBe(
      "rain-light"
    );
    expect(skyMarkKind({ skyCondition: "clear", precipitationRateMmPerHour: 3 })).toBe("rain");
    // Under the threshold is not rain, and the sky answers instead.
    expect(skyMarkKind({ skyCondition: "clear", precipitationRateMmPerHour: 0.05 })).toBe(
      "clear"
    );
  });

  /**
   * The producer says it is raining and sends no rate. This used to draw
   * NOTHING — the one narrowing left in `skyMarkKind` excluded "rain"
   * because the rate branch was assumed to have handled it.
   *
   * We cannot tell light from heavy without a rate, so it draws the plain
   * rain mark. A morning we know is wet is not a morning to draw an empty sky.
   */
  it("draws plain rain when the producer says rain but sends no rate", () => {
    expect(skyMarkKind({ skyCondition: "rain" })).toBe("rain");
  });

  it("snow is not rain, and does not borrow the rain mark", () => {
    expect(skyMarkKind({ skyCondition: "snow" })).toBe("snow");
  });
});

describe("nothing reported draws nothing", () => {
  it("returns null rather than a default sky", () => {
    expect(skyMarkKind({})).toBeNull();
    expect(skyMarkKind({ skyCondition: "not-a-sky" })).toBeNull();
  });
});
