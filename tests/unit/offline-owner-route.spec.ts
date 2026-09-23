import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/teacher", () => ({ getActiveClass: vi.fn() }));
vi.mock("@/lib/offline/prepare", () => ({ createOfflineOwnerLease: vi.fn() }));

import { GET } from "@/app/api/offline/owner/route";
import { auth } from "@/lib/auth";
import { createOfflineOwnerLease } from "@/lib/offline/prepare";
import { getActiveClass } from "@/lib/teacher";

const request = new Request("http://localhost/api/offline/owner");
const signedIn = {
  user: { id: "teacher-a" },
  session: {
    id: "auth-a",
    expiresAt: new Date("2026-09-20T08:00:00.000Z"),
  },
};

describe("GET /api/offline/owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NATURE_CLASS_PREPARED_OFFLINE", "1");
  });

  it("stays dark with the rest of private offline preparation", async () => {
    vi.stubEnv("NATURE_CLASS_PREPARED_OFFLINE", "0");
    const response = await GET(request);
    expect(response.status).toBe(404);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it("clears the read path when no live account is signed in", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getActiveClass).not.toHaveBeenCalled();
  });

  it("refuses an account with no active class", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(signedIn as never);
    vi.mocked(getActiveClass).mockResolvedValue(null as never);
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(createOfflineOwnerLease).not.toHaveBeenCalled();
  });

  it("returns only a no-store opaque lease for the live account and class", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(signedIn as never);
    vi.mocked(getActiveClass).mockResolvedValue({ id: "class-a" } as never);
    vi.mocked(createOfflineOwnerLease).mockReturnValue({
      version: 1,
      ownerScope: `ofs_${"a".repeat(32)}`,
      leaseId: `ofl_${"b".repeat(32)}`,
      issuedAt: "2026-08-29T20:00:00.000Z",
      expiresAt: "2026-09-20T08:00:00.000Z",
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createOfflineOwnerLease).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-a",
        classId: "class-a",
        authSessionId: "auth-a",
        contentRevision: expect.stringMatching(/^english-.+:uk$/),
      }),
    );
    expect(await response.json()).toEqual({
      lease: expect.objectContaining({ ownerScope: `ofs_${"a".repeat(32)}` }),
    });
  });
});
