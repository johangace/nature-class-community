import { describe, expect, it, vi } from "vitest";
import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import {
  prepareFieldSession,
  recheckPreparedFieldResources,
} from "@/lib/offline/prepare-client";

const core = buildCoreLessonRelease({
  generatedAt: new Date("2026-08-29T08:00:00.000Z"),
});
const session = core.sessions["animal-leaf-masks"]!;

function payload() {
  const ownerScope = "ofs_1234567890abcdef1234567890abcdef";
  const leaseId = "ofl_1234567890abcdef1234567890abcdef";
  return {
    lease: {
      version: 1 as const,
      ownerScope,
      leaseId,
      issuedAt: "2026-08-29T08:00:00.000Z",
      expiresAt: "2026-09-28T08:00:00.000Z",
    },
    overlay: {
      version: 1 as const,
      ownerScope,
      ownerLeaseId: leaseId,
      sessionId: session.id,
      coreFingerprint: core.contentFingerprint,
      preparedAt: "2026-08-29T08:00:00.000Z",
      staleAfter: "2026-09-05T08:00:00.000Z",
      session,
      hazards: null,
      spokenAudio: {
        "Look closely.": { src: "/lesson-audio/available.mp3", seconds: 2 },
        "Listen closely.": { src: "/lesson-audio/missing.mp3", seconds: 3 },
      },
      conditions: null,
      resources: [
        { kind: "audio" as const, url: "/lesson-audio/available.mp3", required: false },
        { kind: "audio" as const, url: "/lesson-audio/missing.mp3", required: false },
      ],
    },
  };
}

function cachedAudio(input: RequestInfo | URL) {
  return String(input).includes("missing")
    ? undefined
    : new Response("cached audio", { status: 200 });
}

describe("client field preparation", () => {
  it("sends only the public lesson identity and core receipt", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/offline/prepare") {
        return new Response(JSON.stringify(payload()), { status: 200 });
      }
      return new Response("audio", { status: 200 });
    });

    await prepareFieldSession({
      sessionId: session.id,
      coreFingerprint: core.contentFingerprint,
      fetcher,
      cacheMatch: async (input) => cachedAudio(input),
      save: saved,
    });

    const [, request] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(request?.body))).toEqual({
      sessionId: session.id,
      coreFingerprint: core.contentFingerprint,
    });
    // The #1266 capability declaration is a HEADER, so the body a previous
    // deployment validates after a rollback is unchanged by that change.
    expect(
      new Headers(request?.headers).get("x-prepared-overlay-features"),
    ).toBe("group-noun");
    expect(String(request?.body)).not.toMatch(/class|teacher|school|latitude|longitude/i);
  });

  it("removes an unavailable optional resource before the single commit", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === "/api/offline/prepare") {
        return new Response(JSON.stringify(payload()), { status: 200 });
      }
      return new Response("audio", {
        status: String(input).includes("missing") ? 404 : 200,
      });
    });

    const result = await prepareFieldSession({
      sessionId: session.id,
      coreFingerprint: core.contentFingerprint,
      fetcher,
      cacheMatch: async (input) => cachedAudio(input),
      save: saved,
    });

    expect(result.overlay.resources).toEqual([
      { kind: "audio", url: "/lesson-audio/available.mp3", required: false },
    ]);
    expect(result.overlay.spokenAudio).toEqual({
      "Look closely.": { src: "/lesson-audio/available.mp3", seconds: 2 },
    });
    expect(saved).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledWith(result);
  });

  it("does not commit when the authenticated preparation request fails", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "NO_ACTIVE_CLASS" }), { status: 403 }),
    );

    await expect(
      prepareFieldSession({
        sessionId: session.id,
        coreFingerprint: core.contentFingerprint,
        fetcher,
        save: saved,
      }),
    ).rejects.toThrow(/NO_ACTIVE_CLASS/);
    expect(saved).not.toHaveBeenCalled();
  });

  it("does not count a successful network response unless it reads back from cache", async () => {
    const saved = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/offline/prepare") {
        return new Response(JSON.stringify(payload()), { status: 200 });
      }
      return new Response("network audio", { status: 200 });
    });

    const result = await prepareFieldSession({
      sessionId: session.id,
      coreFingerprint: core.contentFingerprint,
      fetcher,
      cacheMatch: async () => undefined,
      save: saved,
    });

    expect(result.overlay.resources).toEqual([]);
    expect(result.overlay.spokenAudio).toEqual({});
    expect(saved).toHaveBeenCalledWith(result);
  });

  it("refuses the atomic commit when a required resource is absent from cache", async () => {
    const requiredPayload = payload();
    requiredPayload.overlay.resources[0]!.required = true;
    const saved = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/offline/prepare"
        ? new Response(JSON.stringify(requiredPayload), { status: 200 })
        : new Response("network audio", { status: 200 }),
    );

    await expect(
      prepareFieldSession({
        sessionId: session.id,
        coreFingerprint: core.contentFingerprint,
        fetcher,
        cacheMatch: async () => undefined,
        save: saved,
      }),
    ).rejects.toThrow(/not available in the offline cache/i);
    expect(saved).not.toHaveBeenCalled();
  });

  it("can recheck a stored overlay against cache without fetching the network", async () => {
    const result = await recheckPreparedFieldResources({ version: 1, ...payload() }, {
      cacheMatch: async (input) => cachedAudio(input),
    });

    expect(result.overlay.resources).toEqual([
      { kind: "audio", url: "/lesson-audio/available.mp3", required: false },
    ]);
    expect(result.overlay.spokenAudio).toEqual({
      "Look closely.": { src: "/lesson-audio/available.mp3", seconds: 2 },
    });
  });

  it("aborts and rejects a preparation that exceeds its bounded timeout", async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    await expect(
      prepareFieldSession({
        sessionId: session.id,
        coreFingerprint: core.contentFingerprint,
        fetcher,
        cacheMatch: async () => undefined,
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/timed out/i);
    expect(signal?.aborted).toBe(true);
  });
});
