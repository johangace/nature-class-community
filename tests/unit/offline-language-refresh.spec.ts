import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/offline/prepare-client", () => ({ prepareFieldSession: vi.fn() }));
import { prepareFieldSession } from "@/lib/offline/prepare-client";
import { refreshPreparedLanguage } from "@/lib/offline/refresh-language";
const input = { sessionId: "leaves-and-their-trees", coreFingerprint: "core", online: true,
  state: { status: "unavailable", reason: "content-mismatch" } as const };
beforeEach(() => vi.resetAllMocks());
it("refreshes the selected lesson through the atomic preparation pipeline", async () => {
  const prepared = { version: 1 } as never;
  vi.mocked(prepareFieldSession).mockResolvedValue(prepared);
  expect(await refreshPreparedLanguage(input)).toBe(prepared);
  expect(prepareFieldSession).toHaveBeenCalledWith({ sessionId: input.sessionId, coreFingerprint: "core" });
});
it.each(["owner-mismatch", "owner-expired", "missing"] as const)("never refreshes %s", async (reason) => {
  expect(await refreshPreparedLanguage({ ...input, state: { status: "unavailable", reason } })).toBeNull();
  expect(prepareFieldSession).not.toHaveBeenCalled();
});
it("requires a connection and propagates failed preparation for the retry UI", async () => {
  await expect(refreshPreparedLanguage({ ...input, online: false })).rejects.toThrow("Connect");
  expect(prepareFieldSession).not.toHaveBeenCalled();
  vi.mocked(prepareFieldSession).mockRejectedValue(new Error("download failed"));
  await expect(refreshPreparedLanguage(input)).rejects.toThrow("download failed");
});
