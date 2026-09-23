import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE CONSUMER SIDE OF THE RETIRED-ID MAP (#543).
 *
 * `tests/unit/retired-session-id.spec.ts` pins the map itself: that every
 * retired id resolves, and that `sessionMinutes()` answers for one. Those are
 * two of the five boundaries the alias was built to hold. The other three are
 * the CALL SITES — the places that actually have to call
 * `canonicalSessionId()` for any of it to reach a teacher — and mutation
 * testing during the #539 evaluation found all three could be deleted with the
 * whole suite still green:
 *
 *   1. `POST /api/completions` storing the CANONICAL id for a body that
 *      arrives holding an old one. This is the reason the alias exists at all:
 *      a completion queued offline on an iPad that has not reloaded since the
 *      rename drains carrying the old id, and used to come back 400 "unknown
 *      session".
 *   2. `/session` rewriting the id on its way to the current session view, so a link a teacher
 *      saved under the old slug lands her on the URL the lesson is called by
 *      now rather than merely resolving.
 *   3. `completedSessionIds()` collapsing old and new to ONE id, so a class
 *      that led a lesson under its old id is not offered it again as the next
 *      unled stop, and does not see it twice.
 *
 * These are the persistence and offline paths — the three with real teacher
 * data behind them, which is exactly why they were the three with no test.
 *
 * NOTHING HERE HARDCODES AN ID. Every case is driven off the first entry of
 * `RETIRED_SESSION_IDS`, so the day a second rename is made these tests cover
 * it too, and the day the map's ids change these tests follow rather than
 * needing to be "fixed" by pasting new ids in (which is the failure mode
 * #543 was written about).
 */

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    class: { findFirst: vi.fn() },
    sessionCompletion: {
      upsert: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      // The route asks whether this completion was already on record before
      // reporting it as a lesson taught: the write is idempotent by clientKey,
      // so an offline iPad replays it and each replay would otherwise count.
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("@/app/session/lesson-data", () => ({
  loadLessonPreparation: vi.fn(),
}));
vi.mock("@/app/session/PlanView", () => ({ PlanView: () => null }));
vi.mock("@/app/session/legacy/ReadyView", () => ({ ReadyView: () => null }));
vi.mock("@/app/session/SessionModes", () => ({ SessionModes: () => null }));
vi.mock("@/lib/curriculum", () => ({ curriculumPosition: vi.fn(() => null) }));
vi.mock("@/lib/lesson/preview-audio", () => ({ previewForSession: vi.fn(() => null) }));

import { POST as postCompletion } from "@/app/api/completions/route";
import SessionPage from "@/app/session/page";
import { loadLessonPreparation } from "@/app/session/lesson-data";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RETIRED_SESSION_IDS } from "@/lib/pack";
import { completedSessionIds } from "@/lib/teacher";

/** The oldest rename on the books, and what it became. Never a literal. */
const firstRename = Object.entries(RETIRED_SESSION_IDS)[0];
if (!firstRename) throw new Error("RETIRED_SESSION_IDS is empty: nothing to pin");
const [retiredId, currentId] = firstRename;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadLessonPreparation).mockResolvedValue({
    session: { id: currentId },
  } as never);
});

/** A completion body of the shape the runner's offline queue drains. */
function queuedCompletion(sessionId: string) {
  const endedAt = Date.now() - 60_000;
  return {
    sessionId,
    classId: "class-1",
    startedAt: endedAt - 30 * 60_000,
    endedAt,
    headcount: 24,
    clientKey: "queued-on-the-ipad-1",
  };
}

function post(body: unknown) {
  return postCompletion(
    new Request("http://localhost/api/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("a completion that arrives holding a retired session id", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "teacher-1" },
    } as never);
    vi.mocked(prisma.class.findFirst).mockResolvedValue({
      id: "class-1",
    } as never);
    vi.mocked(prisma.sessionCompletion.upsert).mockResolvedValue({} as never);
    // Not previously on record: this is a first arrival, not a replay.
    vi.mocked(prisma.sessionCompletion.findUnique).mockResolvedValue(null as never);
    // classMinutesOutside() re-reads the class's completions for the tally.
    vi.mocked(prisma.sessionCompletion.findMany).mockResolvedValue([] as never);
  });

  it("is stored under the id the session has NOW, not the id the iPad sent", async () => {
    const response = await post(queuedCompletion(retiredId));

    expect(response.status).toBe(200);
    expect(prisma.sessionCompletion.upsert).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.sessionCompletion.upsert).mock.calls[0]?.[0];
    // The whole point: one lesson, one id in the table. Storing the old id
    // would fork the journal and the led-marks into two lessons that are the
    // same lesson.
    expect(args?.create.sessionId).toBe(currentId);
    expect(args?.create.sessionId).not.toBe(retiredId);
  });

  it("is accepted rather than 400 'unknown session'", async () => {
    // The failure the alias was built for. Worth its own assertion because it
    // is the one a teacher would actually see: her lesson silently never
    // logged, minutes she led missing from the class total.
    const response = await post(queuedCompletion(retiredId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      minutesAdded: expect.any(Number),
    });
  });

  it("records the session when its optional headcount is omitted", async () => {
    const { headcount: _headcount, ...withoutHeadcount } = queuedCompletion(currentId);
    const response = await post(withoutHeadcount);

    expect(response.status).toBe(200);
    const args = vi.mocked(prisma.sessionCompletion.upsert).mock.calls[0]?.[0];
    expect(args?.create.headcount).toBeNull();
    expect(await response.json()).toMatchObject({ minutesAdded: 0 });
  });

  it("still refuses an id that never existed", async () => {
    // The canonicalisation must not have widened the door. An id from nowhere
    // is still unknown.
    const response = await post(queuedCompletion("no-such-session-ever"));
    expect(response.status).toBe(400);
    expect(prisma.sessionCompletion.upsert).not.toHaveBeenCalled();
  });
});

describe("a saved link that still holds a retired session id", () => {
  it("lands on /session under the id the lesson is called by now", async () => {
    await expect(
      SessionPage({ searchParams: Promise.resolve({ session: retiredId }) })
    ).rejects.toThrow(`redirect:/session?session=${currentId}`);
  });

  it("renders the two-mode view when the id is already current", async () => {
    await expect(
      SessionPage({ searchParams: Promise.resolve({ session: currentId }) })
    ).resolves.toBeTruthy();
  });
});

describe("a class that led a session under its old id", () => {
  it("has led it once, not twice", async () => {
    // Rows written before the rename carry the old id; rows written after
    // carry the new one. Both are the same lesson, and the shelf's led-marks
    // and the "next unled stop" both read this set.
    vi.mocked(prisma.sessionCompletion.findMany).mockResolvedValue([
      { sessionId: retiredId },
      { sessionId: currentId },
    ] as never);

    const led = await completedSessionIds("class-1");

    expect([...led]).toEqual([currentId]);
    expect(led.has(retiredId)).toBe(false);
  });

  it("has led it even when every row predates the rename", async () => {
    vi.mocked(prisma.sessionCompletion.findMany).mockResolvedValue([
      { sessionId: retiredId },
    ] as never);

    const led = await completedSessionIds("class-1");

    expect(led.has(currentId)).toBe(true);
  });
});
