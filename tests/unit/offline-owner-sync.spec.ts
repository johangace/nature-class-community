import { describe, expect, it, vi } from "vitest";
import { syncCurrentOfflineOwner } from "@/lib/offline/owner-sync";

const lease = {
  version: 1 as const,
  ownerScope: `ofs_${"a".repeat(32)}`,
  leaseId: `ofl_${"b".repeat(32)}`,
  issuedAt: "2026-08-29T20:00:00.000Z",
  expiresAt: "2026-09-20T08:00:00.000Z",
};

describe("live offline-owner sync", () => {
  it("stores the live server-verified opaque owner", async () => {
    const saveOwner = vi.fn().mockResolvedValue(undefined);
    const result = await syncCurrentOfflineOwner({
      fetcher: vi.fn().mockResolvedValue(Response.json({ lease })),
      saveOwner,
      clearData: vi.fn(),
    });
    expect(result).toEqual({ status: "verified", lease });
    expect(saveOwner).toHaveBeenCalledWith(lease);
  });

  it.each([401, 403, 404])("clears private state on definitive owner response %s", async (status) => {
    const clearData = vi.fn().mockResolvedValue(undefined);
    const result = await syncCurrentOfflineOwner({
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status })),
      saveOwner: vi.fn(),
      clearData,
    });
    expect(result).toEqual({ status: "cleared" });
    expect(clearData).toHaveBeenCalledOnce();
  });

  it("fails closed but preserves the last offline proof on network failure", async () => {
    const clearData = vi.fn();
    const result = await syncCurrentOfflineOwner({
      fetcher: vi.fn().mockRejectedValue(new Error("offline")),
      saveOwner: vi.fn(),
      clearData,
    });
    expect(result).toEqual({ status: "unavailable" });
    expect(clearData).not.toHaveBeenCalled();
  });

  it("clears an invalid successful owner payload", async () => {
    const clearData = vi.fn().mockResolvedValue(undefined);
    const result = await syncCurrentOfflineOwner({
      fetcher: vi.fn().mockResolvedValue(Response.json({ lease: { ownerScope: "school-name" } })),
      saveOwner: vi.fn(),
      clearData,
    });
    expect(result).toEqual({ status: "cleared" });
    expect(clearData).toHaveBeenCalledOnce();
  });
});
