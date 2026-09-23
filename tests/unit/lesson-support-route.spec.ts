import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #791 · The route must accept the key a surface actually sends.
 *
 * `lib/resolve.ts`'s `resolvePhases` hands the runner the RESOLVED phases, so
 * on a windy day `app/run/HybridJourney.tsx` sends `explore-windy` — a key that
 * appears nowhere in `session.phases`. The route validated against that array
 * alone and answered `phase-not-found`, which is a teacher getting a 404 from
 * the assistant on the day the weather turns.
 *
 * This suite exercises the ROUTE rather than the helper it calls. Review of PR
 * #1212 pointed out that asserting `allPhases` proves nothing about the route:
 * the validation could regress to `session.phases` and every helper-level
 * assertion would stay green.
 */
vi.mock("@/lib/ai/api-guard", () => ({
  guardAiRoute: vi.fn(async () => ({ ok: true, teacher: { id: "t1" } })),
  privateJson: (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "private, no-store" } }),
}));
vi.mock("@/lib/ai/plate-draft", () => ({
  isModelAvailable: () => true,
  draftLessonSupport: vi.fn(),
}));
vi.mock("@/lib/teacher", () => ({ getActiveClass: vi.fn() }));
vi.mock("@/lib/request-locale", () => ({
  requestLocale: vi.fn(async () => ({ locale: "en-GB", automatic: true })),
}));
vi.mock("@/lib/outside", () => ({
  getOutsideNow: vi.fn(async () => null),
  isClimateGroup: () => false,
}));

import { POST } from "@/app/api/lesson-support/route";
import { draftLessonSupport } from "@/lib/ai/plate-draft";
import { getActiveClass } from "@/lib/teacher";
import { allPhases } from "@/lib/resolve";
import { findSession } from "@/lib/pack";

const post = (phaseKey?: string) =>
  POST(
    new Request("http://localhost/api/lesson-support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "seed-searchers", task: "space", phaseKey }),
    })
  );

describe("lesson-support route · resolved variant keys", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getActiveClass).mockResolvedValue(null as never);
    vi.mocked(draftLessonSupport).mockResolvedValue({
      headline: "h",
      teacherNote: "n",
      sayAloud: null,
      change: null,
    } as never);
  });

  it("the fixture really is a variant key, so this suite cannot pass vacuously", () => {
    const found = findSession("seed-searchers");
    if (!found) throw new Error("seed-searchers is not on the shelf");
    expect(found.session.phases.map((phase) => phase.key)).not.toContain("explore-windy");
    expect(allPhases(found.session).map((phase) => phase.key)).toContain("explore-windy");
  });

  it("accepts a resolved variant key instead of answering phase-not-found", async () => {
    const response = await post("explore-windy");
    expect(await response.json()).not.toMatchObject({ error: "phase-not-found" });
    expect(response.status).not.toBe(404);
    expect(draftLessonSupport).toHaveBeenCalled();
  });

  it("accepts the base key, as it always did", async () => {
    const response = await post("explore");
    expect(response.status).not.toBe(404);
    expect(draftLessonSupport).toHaveBeenCalled();
  });

  it("still refuses a key that is on no phase at all", async () => {
    const response = await post("explore-on-the-moon");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "phase-not-found" });
    expect(draftLessonSupport).not.toHaveBeenCalled();
  });
});
