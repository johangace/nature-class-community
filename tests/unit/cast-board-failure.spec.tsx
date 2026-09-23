vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
import { renderToReadableStream } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

/**
 * A read that fails on /cast says so, and a reader without JavaScript is told
 * what is happening rather than left with `aria-busy` (nc#1273).
 *
 * WHY THIS ROUTE AND NOT THE ERROR PAGE. Since #845 the shell streams, so by
 * the time the board's reads run the response is already a 200 carrying the
 * hold. A throw from there cannot produce a server-rendered error page any
 * more; the recovery is `app/error.tsx`, mounted on the client. The reported
 * path is not hypothetical — `getActiveClass` (lib/teacher.ts:187) has no
 * try/catch around its Prisma calls, while `activePlaceContext` and
 * `readSurfaceCast` both swallow into an honest empty — so this spec fails the
 * real `getActiveClassLocation` and renders the real `CastBoard`.
 *
 * TWO CLAIMS, AND THE SECOND IS THE ONE THAT COSTS SOMETHING. Catching the
 * read answers a reader with JavaScript. It cannot answer one without, and
 * that is a property of streaming SSR rather than of this catch: React sends a
 * boundary that resolved after the shell inside `<div hidden>` with a `$RC`
 * script to move it, so the move is JavaScript's to make. The last test below
 * pins that mechanism, which is why the `<noscript>` in the fallback is
 * load-bearing and not decoration — delete it and the no-JS test goes red
 * while the catch's own test stays green.
 */

const teacher = vi.hoisted(() => ({ fails: true }));

vi.mock("@/lib/teacher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/teacher")>();
  return {
    ...actual,
    /**
     * Delayed on purpose. An immediate throw can be caught before the shell
     * flushes, which is the one case where React puts the result inline and
     * the no-JS half of this ticket does not arise. The reported failure is a
     * database call, so it lands after the shell, and that is the case worth
     * holding.
     */
    getActiveClassLocation: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (teacher.fails) throw new Error("the class read blipped");
      return actual.getActiveClassLocation();
    },
  };
});

import CastPage from "@/app/cast/page";
import { leadPack } from "@/lib/pack";

async function renderCast() {
  const element = await CastPage({ searchParams: Promise.resolve({}) });
  const stream = await renderToReadableStream(element);
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let shell = "";
  while (!shell.includes("</main>")) {
    const { value, done } = await reader.read();
    if (done) break;
    shell += decoder.decode(value);
  }

  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += decoder.decode(value);
  }
  await stream.allReady;
  return { shell, rest, all: shell + rest };
}

describe("a failed read on /cast", () => {
  /**
   * The catch reports the failure, so every render in this file writes one
   * line. The spy is installed here rather than inside the test that reads it,
   * so the other three do not print it and so it is in place before the render
   * rather than racing it.
   */
  let reported: MockInstance<typeof console.error>;

  beforeEach(() => {
    teacher.fails = true;
    reported = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    reported.mockRestore();
  });

  it("resolves to a sentence and a way back instead of throwing into the boundary", async () => {
    const lead = leadPack().sessions[0];
    if (!lead) throw new Error("the lead pack has no sessions");

    // The render completing at all is half the claim: before the catch this
    // rejected `allReady` and onError fired, which is what put the recovery on
    // the client.
    const { all } = await renderCast();

    expect(all).toContain("We could not read today’s cast");
    expect(all).toContain('class="cast-trouble"');
    expect(all).toContain(`href="/run?session=${lead.id}"`);

    // It replaces the fallback, whose own `role="status" aria-live="polite"`
    // goes with it, and focus is wherever the reader left it. Without a role
    // of its own the swap is silent and a screen reader's last word on this
    // route stays "Finding today's cast".
    expect(all).toMatch(/<section class="cast-trouble" role="alert"/);

    // Not the empty-cast sentence. "We have nothing to show you for today" is
    // true about a quiet day and false about a failed read, and a teacher told
    // the first when the second happened stops reloading a page that would
    // have worked.
    expect(all).not.toContain("We have nothing to show you for today");
  });

  it("reports the failure rather than letting the recovery hide it", async () => {
    // A catch that returns a 200 takes this failure out of Next's own
    // server-side error reporting, which is where a database outage was
    // visible before. The recovery is for the teacher; this is for us.
    await renderCast();

    const call = reported.mock.calls.find((c) => String(c[0]).startsWith("[cast]"));
    expect(call).toBeDefined();
    expect(call?.[1]).toBeInstanceOf(Error);
    expect((call?.[1] as Error).message).toBe("the class read blipped");
  });

  it("gives a reader without JavaScript a sentence, not an aria-busy that never clears", async () => {
    const lead = leadPack().sessions[0];
    if (!lead) throw new Error("the lead pack has no sessions");

    const { shell } = await renderCast();

    // The shell is the whole of what a no-JS reader ever sees on this route.
    expect(shell).toContain('class="cast-hold"');
    expect(shell).toContain("<noscript>");
    expect(shell).toContain("needs JavaScript to appear on this page");
    // And the way out is in the same flush, so the sentence is navigable
    // rather than merely honest.
    expect(shell).toContain(`href="/run?session=${lead.id}"`);
    expect(shell).toContain("Back to the session");
  });

  it("puts the caught result out of a no-JS reader's reach, which is why the noscript is there", async () => {
    // The mechanism the assertion above exists for, pinned rather than
    // asserted in prose: the boundary's resolved content arrives in a hidden
    // container, and only a script moves it into place.
    const { shell, rest } = await renderCast();

    expect(shell).not.toContain("cast-trouble");
    expect(rest).toContain("cast-trouble");
    expect(rest).toMatch(/<div hidden[^>]*>/);
    expect(rest).toContain("$RC(");
  });
});
