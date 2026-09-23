vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { takeNetworkViolations } from "../support/no-live-network";
import CastPage from "@/app/cast/page";

/**
 * The suite is offline, and the /cast render is the reason it had to be
 * (nc#808).
 *
 * This is the regression test for a flake, so it is written to fail on the
 * tree that produced the flake. Before the fix, rendering `/cast` in a test
 * made two sequential HTTPS reads of `pointmoon.vercel.app`; the second test
 * below therefore recorded two refusals and went red. It is green only when
 * that render is served from the repo's own recorded payload.
 *
 * Nothing here asserts a timing bound, on purpose. A budget is what this
 * repo already tried (#810 raised the hook to 15s and the test still fails at
 * Pointmoon's documented cold latency), and a budget can only ever describe
 * how patient we are, never whether the test is a fact about this codebase.
 * "No packet left this machine" is that fact.
 */
describe("the deterministic suite does not read the live internet (nc#808)", () => {
  it("refuses a fetch to a host this machine does not own", async () => {
    await expect(fetch("https://pointmoon.ai/api/moon")).rejects.toThrow(
      /Live network refused/
    );

    // Drained so the guard's own afterEach does not report the refusal this
    // test went looking for. Everything else that trips it stays reported.
    const recorded = takeNetworkViolations();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toContain("pointmoon.ai");
  });

  it("still allows a loopback stub, which is how the suite fakes a service", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      expect(await response.text()).toBe("ok");
      expect(takeNetworkViolations()).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("renders the real /cast page without a single outbound request", async () => {
    vi.stubEnv("POINTMOON_FIXTURE_PATH", "tests/fixtures/pointmoon/london_uk.json");

    // Streamed rather than rendered to a string, because since nc#845 the
    // cast sits behind a Suspense boundary so the shell can go out first.
    // `renderToStaticMarkup` returns that shell and nothing else — it does
    // not throw, it simply never runs the board, so this test would have gone
    // RED on the cast-tile assertion below rather than passing vacuously.
    // Draining to `allReady` is what keeps it about the reads it was written
    // for instead: the board runs, and "no outbound request" is a claim about
    // a render that actually made the reads.
    const errors: unknown[] = [];
    const stream = await renderToReadableStream(
      await CastPage({ searchParams: Promise.resolve({}) }),
      {
        onError: (error) => {
          errors.push(error);
        },
      }
    );
    await stream.allReady;
    const markup = await new Response(stream).text();
    expect(errors).toEqual([]);

    // The render really happened — the cast is on the page, so this is not
    // passing by rendering nothing. `readSurfaceCast` swallows every failure
    // into an empty cast, which is exactly why "no violations" alone would be
    // a weak assertion here.
    expect(markup).toMatch(/aria-label="[^"]*to look for"/);
    expect(markup).toContain('class="cast-tile"');

    // The point of the test. Before nc#808 this list held two reads of
    // pointmoon.vercel.app, and their latency was this spec file's pass rate.
    expect(takeNetworkViolations()).toEqual([]);
  });
});
