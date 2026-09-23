vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * /cast puts its own shell on the wire before the reads come back (nc#845).
 *
 * WHAT THIS ACTUALLY BUYS, stated the way the ticket's own correction stated
 * it. There was never a blank screen: `app/loading.tsx` renders
 * `DandelionTransition message="Opening Nature Class."` and a root
 * `loading.tsx` covers every segment below it, so a hard load of `/cast`
 * already got a hold. The implementer of the September pass checked that and
 * retracted the premise on the issue — "what the ticket describes as twenty
 * seconds of blank is twenty seconds of *hold*". What changes is WHAT she is
 * held by: the product mark and no way out, for as long as
 * `activePlaceContext` plus two sequential Pointmoon reads take (each allowed
 * 10s against a measured ~8.3s cold response), versus the page she asked for,
 * with a working way back to the session she was in the middle of. The
 * duration is unchanged. What she can do during it is not.
 *
 * The assertions here are structural rather than a time budget. A budget only
 * ever says how patient we are on the machine that ran it, which is the rule
 * tests/unit/deterministic-suite-is-offline.spec.ts was written to hold after
 * this very render made Pointmoon's latency a CI pass rate (#808). So: the
 * shell is in the first flush while the board's promise is outstanding, the
 * shell hands the board everything it used to read for itself, and the shell's
 * source contains no read at all.
 */

const gate = vi.hoisted(() => {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release, settled: false };
});

/**
 * The board is a stand-in whose promise this test holds open, so the moment
 * being asserted is one the test controls rather than one a third party's
 * response time decides. It is a `vi.fn()` rather than a bare stub because a
 * stand-in that ignores its props would let the shell hand the board the wrong
 * session, or drop the `?locale=` it used to read three lines away in the same
 * file, and this spec would still be green.
 */
const board = vi.hoisted(() => vi.fn());

vi.mock("@/app/cast/CastBoard", () => ({
  async CastBoard(props: { session: { id: string }; localeParam?: string }) {
    board(props);
    await gate.opened;
    return <p className="cast-tile">the board</p>;
  },
}));

import CastPage from "@/app/cast/page";
import { leadPack } from "@/lib/pack";
import { placeContextFor, sessionForPlace } from "@/lib/place-context";
import { localizeDeep } from "@/lib/localization";

describe("the /cast shell does not wait on the cast", () => {
  it("flushes the heading and the way back while the board is still reading", async () => {
    const element = await CastPage({
      searchParams: Promise.resolve({ locale: "us" }),
    });
    const stream = await renderToReadableStream(element);

    // `renderToReadableStream` resolves when the SHELL is ready, which is the
    // whole claim. `allReady` is the other end of the render and is still
    // outstanding here because the board's promise has not been released.
    stream.allReady.then(() => {
      gate.settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gate.settled).toBe(false);

    const lead = leadPack().sessions[0];
    if (!lead) throw new Error("the lead pack has no sessions");

    // Everything the board used to read for itself is handed to it. Dropping
    // `localeParam` here would silently ignore `?locale=` on a route that has
    // honoured it since the parameter existed.
    expect(board).toHaveBeenCalledTimes(1);
    expect(board.mock.calls[0]?.[0]).toMatchObject({
      session: expect.objectContaining({ id: lead.id }),
      localeParam: "us",
    });

    // Read up to the end of the shell rather than assuming it arrives in
    // exactly one flush: React's byte view is 2048 and the shell is ~484
    // bytes today, but that is a buffering detail and not the claim.
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let shell = "";
    while (!shell.includes("</main>")) {
      const { value, done } = await reader.read();
      if (done) break;
      shell += decoder.decode(value);
    }

    expect(shell).toContain("Speak and show");
    expect(shell).toContain(`href="/run?session=${lead.id}"`);
    expect(shell).toContain("Back to the session");
    // The fallback says that something is loading and never says a value.
    expect(shell).toContain('class="cast-hold"');
    expect(shell).not.toContain("the board");

    gate.release();
    let rest = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    // And the board really does arrive on the same response, rather than the
    // page having quietly become a shell that never fills.
    expect(rest).toContain("the board");
    await stream.allReady;
  });

  it("keeps every read out of the shell's own source", () => {
    /**
     * The timing test above can only measure what happens AFTER
     * `CastPage(...)` has been awaited, so a read put back into the shell —
     * which is this ticket happening again — would sail through it. This is
     * the guard that actually bars it, and it is a source scan for the reason
     * tests/unit/place-wiring-coverage.spec.ts is one: reach is a property of
     * the source, and every behavioural test passed while the bug was live.
     */
    const source = readFileSync(join(process.cwd(), "app/cast/page.tsx"), "utf8");
    const reads = [
      "requestLocale",
      "activePlaceContext",
      "readSurfaceCast",
      "getActiveClassLocation",
      "getOutsideNow",
      "fetchFieldTruth",
      "getTeacher",
      "getActiveClass",
      "prisma",
    ].filter((name) => source.includes(`${name}(`));
    expect(reads).toEqual([]);
  });

  it("links back to the session off the shelf, which is the one the board resolves", () => {
    // The shell builds its link before the place seam and localization run
    // inside the board, so this is the invariant that keeps the two the same
    // link. Both are documented as id-preserving; this is where that is held.
    const lead = leadPack().sessions[0];
    if (!lead) throw new Error("the lead pack has no sessions");
    const placed = sessionForPlace(lead, placeContextFor({}));
    expect(placed.id).toBe(lead.id);
    // "us" rather than "uk": the localizer returns its input untouched for
    // "uk", so only the walking locale can prove `id` is held out of the walk.
    expect(localizeDeep(placed, "us").id).toBe(lead.id);
  });
});
