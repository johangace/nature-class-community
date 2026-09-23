import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasAttemptedChunkReload,
  isChunkLoadError,
  markChunkReloadAttempted,
} from "@/lib/chunk-reload";

/**
 * nc#75: the deploy-swap crash is a specific, recognisable failure shape, and
 * the guard that stops the recovery from looping is a specific, testable
 * piece of state. Neither needs a browser to verify — see
 * tests/unit/error-recovery-render.spec.tsx for what actually reaches the
 * screen.
 */

function fakeSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

describe("isChunkLoadError — recognising the stale-manifest crash", () => {
  it("matches webpack's own ChunkLoadError by name, whatever the message says", () => {
    const err = new Error("something opaque");
    err.name = "ChunkLoadError";
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("matches a JS chunk failure by message", () => {
    expect(
      isChunkLoadError(new Error("Loading chunk 447 failed. (missing: https://x/447.js)")),
    ).toBe(true);
  });

  it("matches a CSS chunk failure by message", () => {
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed."))).toBe(true);
  });

  it("matches a failed dynamic import by message", () => {
    expect(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/y.js")),
    ).toBe(true);
  });

  it("does not flag an ordinary application error", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  it("does not flag a non-Error thrown value", () => {
    expect(isChunkLoadError("Loading chunk 1 failed.")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({ message: "Loading chunk 1 failed." })).toBe(false);
  });
});

describe("the one-shot reload guard — what stops a broken deploy from looping", () => {
  const originalSessionStorage = globalThis.sessionStorage;

  beforeEach(() => {
    globalThis.sessionStorage = fakeSessionStorage();
  });

  afterEach(() => {
    globalThis.sessionStorage = originalSessionStorage;
  });

  it("reads unattempted on a fresh tab", () => {
    expect(hasAttemptedChunkReload()).toBe(false);
  });

  it("reads attempted the instant it's marked — before any reload actually fires", () => {
    markChunkReloadAttempted();
    expect(hasAttemptedChunkReload()).toBe(true);
  });

  it("stays attempted across repeated checks, which is the whole guard", () => {
    markChunkReloadAttempted();
    expect(hasAttemptedChunkReload()).toBe(true);
    expect(hasAttemptedChunkReload()).toBe(true);
    expect(hasAttemptedChunkReload()).toBe(true);
  });

  it("fails CLOSED (already attempted) when storage access throws", () => {
    globalThis.sessionStorage = {
      getItem() {
        throw new Error("storage denied");
      },
      setItem() {
        throw new Error("storage denied");
      },
    } as unknown as Storage;

    expect(hasAttemptedChunkReload()).toBe(true);
    // Recording the attempt must not itself throw even though the store rejects the write.
    expect(() => markChunkReloadAttempted()).not.toThrow();
  });
});
