import { describe, expect, it, vi } from "vitest";
import {
  AUTHORED_FIELD_OBSERVATION,
  BASIC_OFFLINE_ASSET_URLS,
  checkBasicOfflineAvailability,
  deriveOfflineReadiness,
} from "@/lib/offline/readiness";

describe("offline departure readiness", () => {
  it("keeps the proven basic lesson ready even when the device is offline and unprepared", () => {
    const readiness = deriveOfflineReadiness({
      isOnline: false,
      basicStatus: "ready",
      preparationStatus: "not-prepared",
    });

    expect(readiness.basic).toEqual({
      status: "ready",
      label: "Basic lesson ready",
      detail: "Lesson text, general safety and field steps are on this device.",
    });
    expect(readiness.field).toMatchObject({
      status: "needs-wifi",
      label: "Field version needs Wi-Fi",
      action: null,
    });
  });

  it("does not claim the basic lesson is ready before cache proof completes", () => {
    expect(
      deriveOfflineReadiness({
        isOnline: true,
        preparationStatus: "not-prepared",
      }).basic,
    ).toEqual({
      status: "checking",
      label: "Checking basic lesson",
      detail: "Nature Class is checking the saved lesson, safety and field pages on this device.",
    });
  });

  it("offers the right next action without overstating preparation", () => {
    expect(
      deriveOfflineReadiness({ isOnline: true, preparationStatus: "not-prepared" }).field
    ).toMatchObject({ status: "not-prepared", action: "prepare", actionLabel: "Prepare field version" });

    expect(
      deriveOfflineReadiness({ isOnline: true, preparationStatus: "failed" }).field
    ).toMatchObject({ status: "failed", action: "retry", actionLabel: "Try preparing again" });

    expect(
      deriveOfflineReadiness({ isOnline: true, preparationStatus: "stale" }).field
    ).toMatchObject({ status: "stale", action: "refresh", actionLabel: "Refresh field version" });
  });

  it("always leads with what the class can observe before a timestamped receipt", () => {
    const readiness = deriveOfflineReadiness({
      isOnline: false,
      preparationStatus: "ready",
      conditionsCapturedAt: "2026-08-29T08:12:00.000Z",
      conditionsSummary: "18 degrees, a light breeze",
      now: new Date("2026-08-29T12:00:00.000Z"),
      timeZone: "UTC",
      basicStatus: "ready",
    });

    expect(readiness.conditions.observation).toBe(AUTHORED_FIELD_OBSERVATION);
    expect(readiness.conditions.receipt).toEqual({
      label: "Checked at 08:12",
      summary: "18 degrees, a light breeze",
      stale: true,
    });
  });
});

describe("basic offline cache proof", () => {
  it("requires an activated service worker that controls this page", async () => {
    const cacheMatch = vi.fn().mockResolvedValue(new Response("saved"));

    await expect(
      checkBasicOfflineAvailability({
        getController: () => null,
        cacheMatch,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "no-controller",
      missing: [...BASIC_OFFLINE_ASSET_URLS],
    });
    expect(cacheMatch).not.toHaveBeenCalled();

    await expect(
      checkBasicOfflineAvailability({
        getController: () => ({ state: "installing" }),
        cacheMatch,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "controller-not-active",
      missing: [...BASIC_OFFLINE_ASSET_URLS],
    });
    expect(cacheMatch).not.toHaveBeenCalled();
  });

  it("reports every missing required offline asset from cache readback", async () => {
    const cacheMatch = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/field" ? new Response("saved") : undefined,
    );

    await expect(
      checkBasicOfflineAvailability({
        getController: () => ({ state: "activated" }),
        cacheMatch,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "missing-assets",
      missing: ["/field/print", "/offline/core-v1.json"],
    });
  });

  it("is ready only after all required offline assets read back successfully", async () => {
    const cacheMatch = vi.fn().mockResolvedValue(new Response("saved", { status: 200 }));

    await expect(
      checkBasicOfflineAvailability({
        getController: () => ({ state: "activated" }),
        cacheMatch,
      }),
    ).resolves.toEqual({ status: "ready", reason: null, missing: [] });
    expect(cacheMatch.mock.calls.map(([url]) => url)).toEqual(BASIC_OFFLINE_ASSET_URLS);
  });
});
