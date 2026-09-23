import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/offline/prepare-server", () => ({
  prepareFieldOverlayForSession: vi.fn(),
}));

import { POST } from "@/app/api/offline/prepare/route";
import { auth } from "@/lib/auth";
import { prepareFieldOverlayForSession } from "@/lib/offline/prepare-server";

const signedIn = {
  user: { id: "teacher-1" },
  session: {
    id: "auth-session-1",
    expiresAt: new Date("2026-09-28T08:12:00.000Z"),
  },
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/offline/prepare", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/offline/prepare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NATURE_CLASS_PREPARED_OFFLINE", "1");
  });

  it("stays dark until the private storage inventory is approved", async () => {
    vi.stubEnv("NATURE_CLASS_PREPARED_OFFLINE", "0");
    const response = await POST(
      request({ sessionId: "leaves-and-their-trees", coreFingerprint: "core_123" }),
    );
    expect(response.status).toBe(404);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it("requires a signed-in owner before resolving any field data", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const response = await POST(
      request({ sessionId: "leaves-and-their-trees", coreFingerprint: "core_123" }),
    );

    expect(response.status).toBe(401);
    expect(prepareFieldOverlayForSession).not.toHaveBeenCalled();
  });

  it("strictly validates the requested session and core fingerprint", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(signedIn as never);

    const response = await POST(
      request({
        sessionId: "leaves-and-their-trees",
        coreFingerprint: "core_123",
        classId: "a client may not choose ownership",
      }),
    );

    expect(response.status).toBe(400);
    expect(prepareFieldOverlayForSession).not.toHaveBeenCalled();
  });

  it("returns one no-store lease and overlay selected by the server-owned class", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(signedIn as never);
    vi.mocked(prepareFieldOverlayForSession).mockResolvedValue({
      lease: { version: 1, ownerScope: "ofs_1", leaseId: "ofl_1" },
      overlay: { version: 1, sessionId: "leaves-and-their-trees" },
    } as never);

    const response = await POST(
      request({ sessionId: "leaves-and-their-trees", coreFingerprint: "core_123" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(prepareFieldOverlayForSession).toHaveBeenCalledWith({
      authSession: signedIn,
      sessionId: "leaves-and-their-trees",
      coreFingerprint: "core_123",
      // This request sent no declaration header, which is what every client
      // built before #1266 sends. The empty list is the instruction to emit
      // nothing additive, not a missing argument.
      overlayFeatures: [],
    });
    expect(await response.json()).toMatchObject({
      lease: { ownerScope: "ofs_1" },
      overlay: { sessionId: "leaves-and-their-trees" },
    });
  });

  it("reads the capability declaration off the header, not the body", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(signedIn as never);
    vi.mocked(prepareFieldOverlayForSession).mockResolvedValue({
      lease: { ownerScope: "ofs_1" },
      overlay: { sessionId: "leaves-and-their-trees" },
    } as never);

    const response = await POST(
      request(
        { sessionId: "leaves-and-their-trees", coreFingerprint: "core_123" },
        { "x-prepared-overlay-features": "group-noun,unknown-later" },
      ),
    );

    expect(response.status).toBe(200);
    expect(prepareFieldOverlayForSession).toHaveBeenCalledWith(
      expect.objectContaining({ overlayFeatures: ["group-noun"] }),
    );
  });
});
