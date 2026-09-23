import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/worldMemoryActions", () => ({ retireRememberedFact: vi.fn() }));

import { POST } from "@/app/api/world-memory/retire/route";
import { retireRememberedFact } from "@/app/worldMemoryActions";
import type { NextRequest } from "next/server";

/**
 * THE RETIRE'S OWN DOOR (#509).
 *
 * The strip's control is a plain form post rather than a server action,
 * because every server-action version of it left the retired fact on screen
 * about half the time with the write already committed. This pins what the
 * replacement promises: the write goes through the one ownership-scoped
 * action, the answer is a 303 back to the lesson she was reading, and a write
 * that did not land comes back saying so instead of pretending.
 */

/** A lesson the shelf really holds — the handler drops one that is not. */
const REAL_SESSION = "summer-w2-minibeast-hunting";

const SITE = "https://natureclass.education";

function post(
  fields: Record<string, string>,
  origin: string | null = SITE
): NextRequest {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return {
    headers,
    url: `${SITE}/api/world-memory/retire`,
    formData: async () => form,
    nextUrl: { origin: SITE },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(retireRememberedFact).mockResolvedValue({ ok: true });
});

describe("POST /api/world-memory/retire", () => {
  it("hands the form straight to the one ownership-scoped action", async () => {
    await POST(post({ classId: "willow", kind: "note", value: "the old ash", sessionId: REAL_SESSION }));

    expect(retireRememberedFact).toHaveBeenCalledWith({
      classId: "willow",
      kind: "note",
      value: "the old ash",
    });
  });

  it("sends her back to the lesson she was reading", async () => {
    const response = await POST(
      post({ classId: "willow", kind: "note", value: "x", sessionId: REAL_SESSION, locale: "us" })
    );

    // 303 so the follow-up is a GET and a reload cannot re-post the retire.
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${SITE}/session/primer?session=${REAL_SESSION}&locale=us`
    );
  });

  it("marks a write that did not land, so the page can say so", async () => {
    vi.mocked(retireRememberedFact).mockResolvedValue({ ok: false, reason: "not-written" });

    const response = await POST(
      post({ classId: "willow", kind: "note", value: "x", sessionId: REAL_SESSION })
    );

    expect(response.headers.get("location")).toBe(
      `${SITE}/session/primer?session=${REAL_SESSION}&retire=failed`
    );
  });

  it("refuses a post from another origin, before it reads the form", async () => {
    // A route handler gets none of the origin checking a server action does,
    // and SameSite=Lax is SAME-SITE: a sibling subdomain still sends the
    // session cookie. Without this the page there could retire her facts.
    const response = await POST(
      post({ classId: "willow", kind: "note", value: "x" }, "https://evil.example.com")
    );

    expect(response.status).toBe(403);
    expect(retireRememberedFact).not.toHaveBeenCalled();
  });

  it("refuses a post with no origin at all", async () => {
    const response = await POST(post({ classId: "willow", kind: "note", value: "x" }, null));

    expect(response.status).toBe(403);
    expect(retireRememberedFact).not.toHaveBeenCalled();
  });

  it("sends a signed-out teacher to sign in, not back to a page with no strip", async () => {
    // The primer a signed-out visitor gets renders no strip and so no failure
    // line: the row would look retired while the fact stayed.
    vi.mocked(retireRememberedFact).mockResolvedValue({ ok: false, reason: "not-signed-in" });

    const response = await POST(
      post({ classId: "willow", kind: "note", value: "x", sessionId: REAL_SESSION })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${SITE}/sign-in`);
  });

  it("builds the destination itself rather than following a posted one", async () => {
    const response = await POST(
      post({
        classId: "willow",
        kind: "note",
        value: "x",
        // A posted destination is exactly what an open redirect looks like,
        // and neither of these is a lesson or an edition.
        sessionId: "https://example.com/phish",
        locale: "https://example.com/phish",
        returnTo: "https://example.com/phish",
      })
    );

    expect(response.headers.get("location")).toBe(
      `${SITE}/session/primer`
    );
  });
});
