import { describe, expect, it } from "vitest";
import {
  parseRunProgress,
  runProgressKey,
  type RunProgress,
} from "@/lib/run/progress";
import { getSession, loadPack } from "@/lib/pack";
import { resolvePhases } from "@/lib/resolve";
import { teachingModeAt } from "@/lib/run/teaching-flow";

/**
 * A saved run is part of a class's teaching record, not a device-global
 * bookmark. These tests pin a small, closed persistence boundary before the
 * runner adopts it: owner and session identity travel in the value as well as
 * the key, and every transient runner room has an explicit location.
 */

const expected = {
  ownerScope: "class:oak-room",
  sessionId: "autumn-w2-leaf-collage",
};

const baseProgress = {
  version: 3 as const,
  ...expected,
  startedAt: 1_723_456_789_000,
  pausedAt: null,
  pausedMs: 12_000,
  ability: "y1" as const,
  condition: "wet" as const,
};

function stored(progress: RunProgress): string {
  return JSON.stringify(progress);
}

describe("runProgressKey", () => {
  it("scopes the key by both owner/class and session without separator collisions", () => {
    expect(runProgressKey("class:oak-room", "autumn/w2:leaf-collage")).toBe(
      "nature-class:run-progress:v3:class%3Aoak-room:autumn%2Fw2%3Aleaf-collage"
    );

    expect(runProgressKey("class:ash-room", expected.sessionId)).not.toBe(
      runProgressKey(expected.ownerScope, expected.sessionId)
    );
    expect(runProgressKey(expected.ownerScope, "autumn-w3-magnificent-trees")).not.toBe(
      runProgressKey(expected.ownerScope, expected.sessionId)
    );
  });
});

describe("parseRunProgress — exact runner locations", () => {
  it("preserves unknown ability as base wording on resume", () => {
    const progress: RunProgress = {
      ...baseProgress, ability: null,
      location: { kind: "phase", phaseIndex: 0, pageIndex: 0 },
    };
    expect(parseRunProgress(stored(progress), expected)).toEqual(progress);
  });

  it("restores an ordinary phase and page", () => {
    const progress: RunProgress = {
      ...baseProgress,
      location: { kind: "phase", phaseIndex: 2, pageIndex: 3 },
    };

    expect(parseRunProgress(stored(progress), expected)).toEqual(progress);
  });

  it("restores the settling checkpoint instead of falling back to its last page", () => {
    const progress: RunProgress = {
      ...baseProgress,
      location: { kind: "settle-checkpoint", phaseIndex: 0 },
    };

    expect(parseRunProgress(stored(progress), expected)).toEqual(progress);
  });

  it("keeps a legacy Show cursor readable with the phase it should continue into", () => {
    const progress: RunProgress = {
      ...baseProgress,
      location: { kind: "show", itemIndex: 3, returnPhaseIndex: 1 },
    };

    expect(parseRunProgress(stored(progress), expected)).toEqual(progress);
  });
});

describe("parseRunProgress — closed and class-safe", () => {
  const valid: RunProgress = {
    ...baseProgress,
    location: { kind: "phase", phaseIndex: 1, pageIndex: 2 },
  };

  it("rejects absent, malformed, and legacy unversioned saves", () => {
    expect(parseRunProgress(null, expected)).toBeNull();
    expect(parseRunProgress("not json", expected)).toBeNull();
    expect(
      parseRunProgress(
        JSON.stringify({
          phaseIndex: 1,
          momentIndex: 2,
          startedAt: baseProgress.startedAt,
        }),
        expected
      )
    ).toBeNull();
    expect(
      parseRunProgress(JSON.stringify({ ...valid, version: 2 }), expected)
    ).toBeNull();
  });

  it("rejects unknown fields and locations rather than guessing", () => {
    expect(
      parseRunProgress(JSON.stringify({ ...valid, unexpected: true }), expected)
    ).toBeNull();
    expect(
      parseRunProgress(
        JSON.stringify({
          ...valid,
          location: { kind: "cast", itemIndex: 2 },
        }),
        expected
      )
    ).toBeNull();
    expect(
      parseRunProgress(
        JSON.stringify({
          ...valid,
          location: { kind: "phase", phaseIndex: -1, pageIndex: 2 },
        }),
        expected
      )
    ).toBeNull();
  });

  it("rejects validly shaped state belonging to another owner or session", () => {
    expect(
      parseRunProgress(
        JSON.stringify({ ...valid, ownerScope: "class:ash-room" }),
        expected
      )
    ).toBeNull();
    expect(
      parseRunProgress(
        JSON.stringify({ ...valid, sessionId: "autumn-w3-magnificent-trees" }),
        expected
      )
    ).toBeNull();
  });
});

/**
 * #253 · A saved location can legitimately outlive the session it points at.
 *
 * `phaseIndex` is validated as "a non-negative integer", never as "a valid
 * index into THIS session's phases" — the schema has no session to check it
 * against. A pack that shrinks a phase out from under a save the teacher
 * made yesterday, or state saved against a since-edited session, both
 * produce an otherwise well-formed `RunProgress` whose `phaseIndex` is out of
 * range. `parseRunProgress` accepts it: it is not this boundary's job to
 * know how long any particular session is.
 *
 * That acceptance is only safe because Runner's own resume path
 * (`teachingModeAt`, `resolvePhases`) is written to degrade for an
 * out-of-range index rather than throw. `app/run/Runner.tsx`'s mount effect
 * — the one that flips `ready`, the flag the whole page renders behind —
 * calls exactly these two functions while restoring a saved run, so this
 * pins the contract the effect's `try`/`finally` guarantee assumes rather
 * than reproves: this stays a soft "nothing to resume" answer, never an
 * exception the effect would otherwise have to survive.
 */
describe("a saved location the current session has outgrown (#253)", () => {
  const session = getSession(loadPack("summer"), "summer-w1-counting-life");
  if (!session) throw new Error("fixture session is missing");
  const wayPastTheEnd = session.phases.length + 50;

  it("still parses — the schema does not know how long any session is", () => {
    const progress: RunProgress = {
      ...baseProgress,
      location: { kind: "phase", phaseIndex: wayPastTheEnd, pageIndex: 0 },
    };

    expect(parseRunProgress(stored(progress), expected)).toEqual(progress);
  });

  it("resolves to no phase rather than throwing", () => {
    expect(resolvePhases(session, null)[wayPastTheEnd]).toBeUndefined();
    expect(() => resolvePhases(session, null)[wayPastTheEnd]).not.toThrow();
  });

  it("reports no teaching mode for the same out-of-range index, rather than throwing", () => {
    expect(teachingModeAt(session, wayPastTheEnd)).toBeNull();
    expect(() => teachingModeAt(session, wayPastTheEnd)).not.toThrow();
  });
});
