import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teacher", () => ({ getActiveClass: vi.fn() }));
vi.mock("@/lib/place-context", () => ({
  activePlaceContext: vi.fn(),
  sessionForPlace: vi.fn(),
}));
vi.mock("@/lib/lesson/class-hazards", () => ({ hazardsForClass: vi.fn() }));
vi.mock("@/lib/outside", () => ({ getOutsideNow: vi.fn() }));

import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import { prepareFieldOverlayForSession } from "@/lib/offline/prepare-server";
import { getActiveClass } from "@/lib/teacher";

const authSession = {
  user: { id: "teacher-1" },
  session: {
    id: "auth-session-1",
    expiresAt: new Date("2026-09-28T08:12:00.000Z"),
  },
};

describe("prepared field server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a stale core before reading class or place data", async () => {
    await expect(
      prepareFieldOverlayForSession({
        authSession,
        sessionId: "leaves-and-their-trees",
        coreFingerprint: "old_core",
      }),
    ).rejects.toMatchObject({ code: "CORE_MISMATCH" });
    expect(getActiveClass).not.toHaveBeenCalled();
  });

  it("refuses collection-marked and held sessions outside the public core", async () => {
    const core = buildCoreLessonRelease();
    await expect(
      prepareFieldOverlayForSession({
        authSession,
        sessionId: "autumn-garden-w1-seed-saving",
        coreFingerprint: core.contentFingerprint,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_SESSION" });
    expect(getActiveClass).not.toHaveBeenCalled();
  });

  it("requires the server-owned active class for a released lesson", async () => {
    const core = buildCoreLessonRelease();
    vi.mocked(getActiveClass).mockResolvedValue(null);

    await expect(
      prepareFieldOverlayForSession({
        authSession,
        sessionId: core.shelf[0]?.sessionIds[0] ?? "missing",
        coreFingerprint: core.contentFingerprint,
      }),
    ).rejects.toMatchObject({ code: "NO_ACTIVE_CLASS" });
  });
});

it("uses the saved class language when preparing a lesson offline", async () => {
  const { activePlaceContext, sessionForPlace } = await import("@/lib/place-context");
  const { hazardsForClass } = await import("@/lib/lesson/class-hazards");
  const { getOutsideNow } = await import("@/lib/outside");
  const core = buildCoreLessonRelease();
  vi.mocked(getActiveClass).mockResolvedValue({ id: "class-1", lat: 51.5, lng: -0.1, englishLocale: "us" } as never);
  vi.mocked(activePlaceContext).mockResolvedValue({ pack: null, lookFor: null } as never);
  vi.mocked(sessionForPlace).mockImplementation((session) => session);
  vi.mocked(hazardsForClass).mockResolvedValue({ entries: [], source: "starter" });
  vi.mocked(getOutsideNow).mockResolvedValue(null as never);
  const result = await prepareFieldOverlayForSession({
    authSession, sessionId: core.shelf[0]?.sessionIds[0] ?? "missing", coreFingerprint: core.contentFingerprint,
  });
  expect(result.overlay).toBeDefined();
  expect(getOutsideNow).toHaveBeenCalledWith(expect.objectContaining({ locale: "us", lat: 51.5 }));
});

/**
 * WHAT AN OLD TAB GETS BACK (#1266, found reviewing PR #1268).
 *
 * A tab opened before a deploy keeps running its old JavaScript, its prepare
 * request is NetworkOnly, and it parses the response with the `.strict()`
 * schema it was built against. So a key it has never heard of does not degrade
 * for it — it fails its preparation. The server therefore sends an additive
 * field only to a caller that declared it.
 *
 * The key list below is the pre-#1266 overlay, written out rather than derived,
 * so the next additive field cannot reach a silent client without this test
 * being updated on purpose.
 */
const OVERLAY_KEYS_BEFORE_NEGOTIATION = [
  "version",
  "ownerScope",
  "ownerLeaseId",
  "sessionId",
  "coreFingerprint",
  "preparedAt",
  "staleAfter",
  "session",
  "hazards",
  "spokenAudio",
  "conditions",
  "resources",
];

async function prepareWith(overlayFeatures?: readonly "group-noun"[]) {
  const { activePlaceContext, sessionForPlace } = await import("@/lib/place-context");
  const { hazardsForClass } = await import("@/lib/lesson/class-hazards");
  const { getOutsideNow } = await import("@/lib/outside");
  const core = buildCoreLessonRelease();
  vi.mocked(getActiveClass).mockResolvedValue({
    id: "class-1",
    lat: 51.5,
    lng: -0.1,
    groupType: "family",
  } as never);
  vi.mocked(activePlaceContext).mockResolvedValue({ pack: null, lookFor: null } as never);
  vi.mocked(sessionForPlace).mockImplementation((session) => session);
  vi.mocked(hazardsForClass).mockResolvedValue({ entries: [], source: "starter" });
  vi.mocked(getOutsideNow).mockResolvedValue(null as never);
  return prepareFieldOverlayForSession({
    authSession,
    sessionId: core.shelf[0]?.sessionIds[0] ?? "missing",
    coreFingerprint: core.contentFingerprint,
    ...(overlayFeatures ? { overlayFeatures } : {}),
  });
}

describe("the prepared overlay only carries what the caller can parse", () => {
  it("sends the family's own noun to a client that declared the field", async () => {
    const { overlay } = await prepareWith(["group-noun"]);
    expect(overlay.groupNoun).toBe("family");
  });

  it("sends a client that declared nothing exactly what it got before", async () => {
    const { overlay } = await prepareWith();
    expect(overlay.groupNoun).toBeUndefined();
    expect(Object.keys(overlay).sort()).toEqual([...OVERLAY_KEYS_BEFORE_NEGOTIATION].sort());
  });

  it("sends nothing extra to a client that declared an empty list", async () => {
    const { overlay } = await prepareWith([]);
    expect(overlay.groupNoun).toBeUndefined();
  });
});
