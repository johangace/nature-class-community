import { describe, expect, it } from "vitest";
import { completionMinutes } from "@/lib/teacher";

/**
 * completionMinutes is the north-star metric's own arithmetic (see the long
 * comment above classMinutesOutside in lib/teacher.ts): elapsed time,
 * capped at planned, times headcount, rounded to a whole minute. It is pure
 * (no DB, no clock), which makes it the right place to pin the documented
 * behaviors in tests rather than trust the prose comment alone.
 */

const minutes = (n: number) => n * 60_000;

describe("completionMinutes", () => {
  it("adds no invented child-minutes when headcount was left blank", () => {
    expect(
      completionMinutes(
        { startedAt: new Date(0), endedAt: new Date(minutes(35)), headcount: null },
        35
      )
    ).toBe(0);
  });

  it("credits elapsed time capped at the planned length", () => {
    const start = 0;
    const result = completionMinutes(
      { startedAt: new Date(start), endedAt: new Date(start + minutes(35)), headcount: 20 },
      20 // planned 20, ran 35 -> capped at 20
    );
    expect(result).toBe(20 * 20);
  });

  it("credits only what actually ran when a session ends early", () => {
    const start = 0;
    const result = completionMinutes(
      { startedAt: new Date(start), endedAt: new Date(start + 33_000), headcount: 24 }, // 33s
      35
    );
    // 33s = 0.55 min * 24 = 13.2 -> rounds to 13, NOT the 840 the old bug produced
    expect(result).toBe(13);
    expect(result).not.toBe(840);
  });

  it("is not punished for running long: caps above at planned, never rewards overrun", () => {
    const start = 0;
    const shortRun = completionMinutes(
      { startedAt: new Date(start), endedAt: new Date(start + minutes(20)), headcount: 10 },
      20
    );
    const longRun = completionMinutes(
      { startedAt: new Date(start), endedAt: new Date(start + minutes(60)), headcount: 10 },
      20
    );
    expect(longRun).toBe(shortRun);
  });

  it("falls back to planned minutes, never zero, when timestamps are unusable", () => {
    const missingEnd = completionMinutes(
      { startedAt: new Date(0), endedAt: null, headcount: 15 },
      20
    );
    expect(missingEnd).toBe(20 * 15);

    const zeroWindow = completionMinutes(
      { startedAt: new Date(1000), endedAt: new Date(1000), headcount: 15 },
      20
    );
    expect(zeroWindow).toBe(20 * 15);

    const negativeWindow = completionMinutes(
      { startedAt: new Date(2000), endedAt: new Date(1000), headcount: 15 },
      20
    );
    expect(negativeWindow).toBe(20 * 15);
  });

  it("falls back to plain elapsed time for a session no longer in the catalogue (no planned length)", () => {
    const result = completionMinutes(
      { startedAt: new Date(0), endedAt: new Date(minutes(12)), headcount: 8 },
      undefined
    );
    expect(result).toBe(12 * 8);
  });

  it("credits zero (not planned) when both timestamps are missing and there's no planned length either", () => {
    const result = completionMinutes({ startedAt: null, endedAt: null, headcount: 30 }, undefined);
    expect(result).toBe(0);
  });

  it("rounds to a whole minute", () => {
    const result = completionMinutes(
      { startedAt: new Date(0), endedAt: new Date(minutes(1) + 40_000), headcount: 3 }, // 1m40s
      undefined
    );
    // 1.6667 min * 3 = 5.0 -> Math.round(5.0) = 5
    expect(result).toBe(5);
  });
});
