import { describe, expect, it } from "vitest";
import {
  journeyProgressKey,
  parseJourneyProgress,
  type JourneyProgress,
} from "@/lib/run/journey-progress";

/**
 * The hybrid journey's own resume boundary (#456), mirroring
 * `tests/unit/run-progress.spec.ts` for `Runner.tsx`'s equivalent — the same
 * closed, owner/session-scoped persistence, over the journey's own step
 * shape rather than the legacy runner's phase/page location.
 */

const expected = {
  ownerScope: "class:oak-room",
  sessionId: "summer-w1-counting-life",
};

const baseProgress = {
  version: 1 as const,
  ...expected,
  startedAt: 1_723_456_789_000,
  pausedAt: null,
  pausedMs: 12_000,
};

function stored(progress: JourneyProgress): string {
  return JSON.stringify(progress);
}

describe("journeyProgressKey", () => {
  it("scopes the key by both owner/class and session, in its own version namespace", () => {
    expect(journeyProgressKey("class:oak-room", "autumn/w2:leaf-collage")).toBe(
      "nature-class:journey-progress:v1:class%3Aoak-room:autumn%2Fw2%3Aleaf-collage"
    );

    expect(journeyProgressKey("class:ash-room", expected.sessionId)).not.toBe(
      journeyProgressKey(expected.ownerScope, expected.sessionId)
    );
    expect(journeyProgressKey(expected.ownerScope, "autumn-w3-magnificent-trees")).not.toBe(
      journeyProgressKey(expected.ownerScope, expected.sessionId)
    );
    // Never the same key a Runner.tsx save would use for the same owner and
    // session — the two runners' saved shapes must never collide or be
    // misread as each other.
    expect(journeyProgressKey(expected.ownerScope, expected.sessionId)).not.toContain(
      "run-progress"
    );
  });
});

describe("parseJourneyProgress — exact journey steps", () => {
  it("restores the settling ritual's card", () => {
    const progress: JourneyProgress = {
      ...baseProgress,
      step: { kind: "settle", card: 2 },
    };
    expect(parseJourneyProgress(stored(progress), expected)).toEqual(progress);
  });

  it("restores an in-progress phase and its sub-step, not just the phase (#456)", () => {
    // The exact regression #456 reports: a class paused mid-phase must come
    // back to that phase's moment, not the folio's start.
    const progress: JourneyProgress = {
      ...baseProgress,
      step: { kind: "phase", phase: 1, moment: 3 },
    };
    expect(parseJourneyProgress(stored(progress), expected)).toEqual(progress);
  });

  it("restores circle time and reflection", () => {
    const circle: JourneyProgress = { ...baseProgress, step: { kind: "circle" } };
    expect(parseJourneyProgress(stored(circle), expected)).toEqual(circle);

    const reflect: JourneyProgress = { ...baseProgress, step: { kind: "reflect" } };
    expect(parseJourneyProgress(stored(reflect), expected)).toEqual(reflect);
  });

  it("restores the paused clock exactly: a live pause span and its own start", () => {
    const progress: JourneyProgress = {
      ...baseProgress,
      pausedAt: 1_723_456_812_000,
      step: { kind: "phase", phase: 0, moment: 0 },
    };
    expect(parseJourneyProgress(stored(progress), expected)).toEqual(progress);
  });
});

describe("parseJourneyProgress — closed and class-safe", () => {
  const valid: JourneyProgress = {
    ...baseProgress,
    step: { kind: "phase", phase: 1, moment: 2 },
  };

  it("rejects absent, malformed, and cross-version saves", () => {
    expect(parseJourneyProgress(null, expected)).toBeNull();
    expect(parseJourneyProgress("not json", expected)).toBeNull();
    expect(
      parseJourneyProgress(
        JSON.stringify({ phase: 1, moment: 2, startedAt: baseProgress.startedAt }),
        expected
      )
    ).toBeNull();
    expect(
      parseJourneyProgress(JSON.stringify({ ...valid, version: 2 }), expected)
    ).toBeNull();
    // A legacy run-progress (v3, Runner.tsx's own shape) must never be misread
    // as a journey save even if it somehow ended up under this key.
    expect(
      parseJourneyProgress(
        JSON.stringify({
          version: 3,
          ...expected,
          location: { kind: "phase", phaseIndex: 1, pageIndex: 2 },
          startedAt: baseProgress.startedAt,
          pausedAt: null,
          pausedMs: 0,
          ability: "y1",
          condition: null,
        }),
        expected
      )
    ).toBeNull();
  });

  it("rejects unknown fields and step kinds rather than guessing", () => {
    expect(
      parseJourneyProgress(JSON.stringify({ ...valid, unexpected: true }), expected)
    ).toBeNull();
    expect(
      parseJourneyProgress(
        JSON.stringify({ ...valid, step: { kind: "intro" } }),
        expected
      )
    ).toBeNull();
    expect(
      parseJourneyProgress(
        JSON.stringify({ ...valid, step: { kind: "celebrate" } }),
        expected
      )
    ).toBeNull();
    expect(
      parseJourneyProgress(
        JSON.stringify({ ...valid, step: { kind: "phase", phase: -1, moment: 0 } }),
        expected
      )
    ).toBeNull();
  });

  it("rejects validly shaped state belonging to another owner or session", () => {
    expect(
      parseJourneyProgress(
        JSON.stringify({ ...valid, ownerScope: "class:ash-room" }),
        expected
      )
    ).toBeNull();
    expect(
      parseJourneyProgress(
        JSON.stringify({ ...valid, sessionId: "autumn-w3-magnificent-trees" }),
        expected
      )
    ).toBeNull();
  });
});


describe("introduction starting place survives resume", () => {
  it.each(["indoors", "outside"] as const)("retains %s without changing the saved step", (introductionSetting) => {
    const progress: JourneyProgress = { ...baseProgress, step: { kind: "day" }, introductionSetting };
    expect(parseJourneyProgress(stored(progress), expected)).toEqual(progress);
  });
  it("still accepts a saved introduction from before starting places existed", () => {
    const progress: JourneyProgress = { ...baseProgress, step: { kind: "day" } };
    expect(parseJourneyProgress(stored(progress), expected)).toEqual(progress);
  });
});
