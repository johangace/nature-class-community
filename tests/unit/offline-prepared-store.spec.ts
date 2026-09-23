import { describe, expect, it } from "vitest";
import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import {
  classifyPreparedFieldState,
  parsePreparedOwnerContext,
  parsePreparedFieldEnvelope,
} from "@/lib/offline/prepared-store";

const core = buildCoreLessonRelease({
  generatedAt: new Date("2026-08-29T08:00:00.000Z"),
});
const session = core.sessions["animal-leaf-masks"]!;

function envelope() {
  return {
    version: 1 as const,
    lease: {
      version: 1 as const,
      ownerScope: "ofs_1234567890abcdef1234567890abcdef",
      leaseId: "ofl_1234567890abcdef1234567890abcdef",
      issuedAt: "2026-08-29T08:00:00.000Z",
      expiresAt: "2026-09-28T08:00:00.000Z",
    },
    overlay: {
      version: 1 as const,
      ownerScope: "ofs_1234567890abcdef1234567890abcdef",
      ownerLeaseId: "ofl_1234567890abcdef1234567890abcdef",
      sessionId: session.id,
      coreFingerprint: "a".repeat(64),
      preparedAt: "2026-08-29T08:00:00.000Z",
      staleAfter: "2026-09-05T08:00:00.000Z",
      session,
      hazards: null,
      spokenAudio: {},
      conditions: null,
      resources: [],
    },
  };
}

function ownerContext() {
  const value = envelope();
  return { ...value.lease };
}

describe("prepared field storage boundary", () => {
  it("accepts one internally consistent, unexpired overlay", () => {
    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: ownerContext(),
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toMatchObject({ status: "ready" });
  });

  it("refuses a mixed owner or lease instead of exposing the overlay", () => {
    const mixed = envelope();
    mixed.overlay.ownerLeaseId = "ofl_ffffffffffffffffffffffffffffffff";
    expect(
      classifyPreparedFieldState(mixed, {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: ownerContext(),
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toEqual({ status: "unavailable", reason: "owner-mismatch" });
  });

  it("refuses expired leases and a different requested lesson", () => {
    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: ownerContext(),
        now: new Date("2026-09-28T08:00:00.000Z"),
      }),
    ).toEqual({ status: "unavailable", reason: "lease-expired" });

    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: "bark-rubbings",
        coreFingerprint: "a".repeat(64),
        expectedOwner: ownerContext(),
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toEqual({ status: "unavailable", reason: "session-mismatch" });
  });

  it("keeps an older overlay usable but labels core or time drift stale", () => {
    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "b".repeat(64),
        expectedOwner: ownerContext(),
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toMatchObject({ status: "stale", reason: "core-mismatch" });

    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: ownerContext(),
        now: new Date("2026-09-05T08:00:00.000Z"),
      }),
    ).toMatchObject({ status: "stale", reason: "age" });
  });

  it("strictly rejects undeclared private fields", () => {
    const unsafe = envelope() as ReturnType<typeof envelope> & {
      teacherName?: string;
    };
    unsafe.teacherName = "must never persist";
    expect(() => parsePreparedFieldEnvelope(unsafe)).toThrow();
  });

  it("never exposes an overlay without separately supplied owner proof", () => {
    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: undefined,
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toEqual({ status: "unavailable", reason: "owner-missing" });
  });

  it("never exposes an overlay to a different current owner", () => {
    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: {
          ...ownerContext(),
          ownerScope: "ofs_ffffffffffffffffffffffffffffffff",
        },
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toEqual({ status: "unavailable", reason: "owner-mismatch" });
  });

  it("refuses expired owner proof even when the downloaded lease is valid", () => {
    expect(
      classifyPreparedFieldState(envelope(), {
        sessionId: session.id,
        coreFingerprint: "a".repeat(64),
        expectedOwner: {
          ...ownerContext(),
          expiresAt: "2026-08-30T08:00:00.000Z",
        },
        now: new Date("2026-08-30T08:00:00.000Z"),
      }),
    ).toEqual({ status: "unavailable", reason: "owner-expired" });
  });

  it("strictly rejects undeclared or non-opaque owner context", () => {
    expect(() =>
      parsePreparedOwnerContext({
        ...ownerContext(),
        className: "Owls",
      }),
    ).toThrow();
    expect(() =>
      parsePreparedOwnerContext({
        ...ownerContext(),
        ownerScope: "Owls",
      }),
    ).toThrow();
  });
});

it("rejects an old language revision without returning its lesson content", () => {
  const value = envelope();
  const current = { ...ownerContext(), contentRevision: "english-2:us" };
  const input = { sessionId: session.id, coreFingerprint: "a".repeat(64), expectedOwner: current,
    now: new Date("2026-08-30T08:00:00.000Z") };
  expect(classifyPreparedFieldState(value, input)).toEqual({ status: "unavailable", reason: "content-mismatch" });
  const refreshed = { ...value, lease: { ...value.lease, contentRevision: current.contentRevision } };
  expect(classifyPreparedFieldState(refreshed, input).status).toBe("ready");
  expect(classifyPreparedFieldState(refreshed, { ...input,
    expectedOwner: { ...current, contentRevision: "english-2:uk" } })).toEqual({ status: "unavailable", reason: "content-mismatch" });
});
