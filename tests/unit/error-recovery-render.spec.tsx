import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErrorRecovery } from "@/app/ErrorRecovery";

/**
 * nc#75: what actually reaches the screen, not just the matcher behind it
 * (the same reasoning tests/unit/glossary-render.spec.tsx spells out for
 * #350). The reload itself is a browser navigation `useEffect` never fires
 * under `renderToStaticMarkup`, so what these assert is the render-phase
 * decision: does the FIRST paint show the calm screen, or does it decide
 * "reloading" and show nothing at all — which is what stops a teacher ever
 * seeing the screen flash before the page turns over.
 */

function fakeSessionStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
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

function chunkError(): Error {
  const err = new Error("Loading chunk 9 failed.");
  err.name = "ChunkLoadError";
  return err;
}

describe("the crash screen a teacher would actually see", () => {
  const originalSessionStorage = globalThis.sessionStorage;

  afterEach(() => {
    globalThis.sessionStorage = originalSessionStorage;
  });

  it("paints nothing on a first-time chunk crash — the auto-reload owns this render", () => {
    globalThis.sessionStorage = fakeSessionStorage();
    const html = renderToStaticMarkup(<ErrorRecovery error={chunkError()} />);
    expect(html).toBe("");
  });

  it("falls through to the calm screen once the guard says the reload was already spent", () => {
    globalThis.sessionStorage = fakeSessionStorage({ "nc:chunk-reload-attempted": "1" });
    const html = renderToStaticMarkup(<ErrorRecovery error={chunkError()} />);
    expect(html).toContain("A new version just went out.");
    expect(html).toContain("Reload");
  });

  it("stays on the calm screen for an unrelated crash even on a fresh guard", () => {
    globalThis.sessionStorage = fakeSessionStorage();
    const html = renderToStaticMarkup(<ErrorRecovery error={new TypeError("boom")} />);
    expect(html).toContain("Something went sideways.");
    expect(html).not.toContain("A new version just went out.");
    expect(html).toContain("Reload");
  });

  it("never falls back to Next's default error text", () => {
    globalThis.sessionStorage = fakeSessionStorage();
    const html = renderToStaticMarkup(<ErrorRecovery error={new Error("nope")} />);
    expect(html.toLowerCase()).not.toContain("application error");
  });
});
