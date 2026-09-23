vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SpeakAndShow } from "@/app/cast/SpeakAndShow";
import CastPage from "@/app/cast/page";
import type { CastMember } from "@/lib/cast/member";

function member(index: number): CastMember {
  return {
    commonName: `Species ${index + 1}`,
    scientificName: `Genus species-${index + 1}`,
    photoUrl: null,
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: index,
    absent: false,
    line: "",
  };
}

function renderShow(count: number, mode: "browse" | "run" = "browse") {
  const members = Array.from({ length: count }, (_, index) => member(index));
  const common = {
    members,
    lines: members.map((item) => `Look for ${item.commonName}.`),
    sessionTitle: "Minibeast hunt",
  };
  return renderToStaticMarkup(
    mode === "run"
      ? createElement(SpeakAndShow, {
          ...common,
          mode: "run",
          onBack: () => undefined,
          onContinue: () => undefined,
        })
      : createElement(SpeakAndShow, common)
  );
}

function expectEnabledButton(markup: string, label: string) {
  const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const button = buttons.find((candidate) => candidate.includes(`>${label}<`));
  expect(button).toBeDefined();
  expect(button).not.toContain("disabled");
}

describe("embedded SpeakAndShow runner contract", () => {
  it("keeps the lesson's producer scope on standalone species links", () => {
    const item = member(0);
    const markup = renderToStaticMarkup(
      createElement(SpeakAndShow, {
        members: [item],
        lines: ["Look for it."],
        sessionTitle: "Minibeast hunt",
        profileTopic: "minibeasts",
      })
    );

    expect(markup).toContain('/species/genus-species-1?topic=minibeasts');
  });

  it("shows the whole lesson cast together as labeled, linked entities rather than a carousel", () => {
    const markup = renderShow(4);

    for (let index = 1; index <= 4; index += 1) {
      expect(markup).toContain(`Species ${index}`);
      expect(markup).toContain(`Look for Species ${index}.`);
      expect(markup).toContain(`/species/genus-species-${index}`);
    }

    expect(markup.match(/class="cast-tile"/g)).toHaveLength(4);
    expect(markup).toContain('class="speak-list"');
    expect(markup).not.toContain('aria-roledescription="carousel"');
    expect(markup).not.toContain("1 of 4");
    expect(markup).not.toContain("cast-portrait-hero");
    expect(markup).not.toContain(">Next<");
  });

  it("lets a run return or continue with every tappable species still visible", () => {
    const markup = renderShow(4, "run");

    expectEnabledButton(markup, "Back");
    expectEnabledButton(markup, "Continue");
    expect(markup).not.toContain(">Next<");
    expect(markup.match(/href="\/species\//g)).toHaveLength(4);
    expect(markup.match(/class="cast-tile"/g)).toHaveLength(4);
  });

  it("threads the validated lesson topic into the legacy runner's profile links", () => {
    const runner = readFileSync(
      new URL("../../app/run/Runner.tsx", import.meta.url),
      "utf8"
    );
    const runPage = readFileSync(
      new URL("../../app/run/page.tsx", import.meta.url),
      "utf8"
    );
    const runnerCall = runPage.slice(runPage.lastIndexOf("<Runner"));
    const showCall = runner.slice(runner.indexOf("<SpeakAndShow"));

    expect(runnerCall).toContain("profileTopic={primaryTopic}");
    expect(showCall).toContain("profileTopic={profileTopic}");
  });

  it("keeps the show step when the teacher skips only the settling ritual", () => {
    const runner = readFileSync(
      new URL("../../app/run/Runner.tsx", import.meta.url),
      "utf8"
    );
    const skipBody = runner.slice(
      runner.indexOf("function skipSettling()"),
      runner.indexOf("function togglePause()")
    );

    expect(skipBody).toContain("if (hasCast)");
    expect(skipBody).toContain("setCastBeat(true)");
    expect(skipBody).toContain("setShowReturnPhaseIndex(1)");
  });
});

describe("the /cast page's own heading structure (nc#619)", () => {
  /**
   * Production had zero h1–h6 elements on this route: the cast region's own
   * `aria-label` ("{session title}, N to look for") stood in for a heading, and
   * screen-reader heading navigation had nothing to land on. `CastPage` is an
   * async server component, run here exactly as the App Router would — off
   * the real shelf, the way `lesson-preview.spec.tsx` renders `PreviewDeck`
   * against the real pack rather than a fixture.
   *
   * THE SHELF IS REAL; POINTMOON IS RECORDED (nc#808). Rendering this page
   * reads Pointmoon twice, and until now those were two live HTTPS calls to
   * someone else's production deploy from inside a unit test. That is what
   * made this the only intermittently failing test in a 2193-test suite: its
   * runtime was Pointmoon's response time (measured 1102–2976ms per read from
   * one machine, and ~8.3s cold by `lib/outside/pointmoon.ts`'s own note), and
   * two of those back to back overran vitest's budget on a CI runner whose
   * diff could not touch this page. `POINTMOON_FIXTURE_PATH` is the seam this
   * repo already ships for exactly that — the same one six other specs use —
   * and it serves a committed payload instead of the network. What is under
   * test here is the page's HEADING STRUCTURE, which no observation can
   * change; the fixture keeps the shelf, the pack, the topic filter and the
   * whole render real and removes only the third party's clock.
   */
  /**
   * STREAMED, NOT STRINGIFIED (nc#845). The cast now sits behind a Suspense
   * boundary so the route's shell reaches the teacher before the reads come
   * back. `renderToStaticMarkup` returns that shell alone and never runs the
   * board, which would leave every assertion below about a page that has no
   * cast on it. Draining to `allReady` renders the same whole page the App
   * Router serves, and the heading structure under test is unchanged by it.
   */
  const render = async () => {
    const stream = await renderToReadableStream(
      await CastPage({ searchParams: Promise.resolve({}) })
    );
    await stream.allReady;
    return new Response(stream).text();
  };

  let markup: string;

  beforeAll(async () => {
    vi.stubEnv("POINTMOON_FIXTURE_PATH", "tests/fixtures/pointmoon/london_uk.json");
    markup = await render();
  });

  it("exposes exactly one level-1 heading that does not repeat the cast region's own label", () => {
    const h1s = [...markup.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]);
    expect(h1s).toHaveLength(1);

    const [heading] = h1s;
    const [, regionLabel] = markup.match(/aria-label="([^"]*to look for)"/) ?? [];
    expect(regionLabel).toBeDefined();
    // The heading names the SURFACE ("speak and show"); the region names the
    // LESSON and its count. Neither string contains the other, so a
    // screen-reader user hears two different things, not the same one twice.
    expect(heading).not.toContain(regionLabel);
    expect(regionLabel!.toLowerCase()).not.toContain(heading!.toLowerCase());
  });

  it("keeps that heading off-screen rather than adding new visible copy", () => {
    // "sr-only" is the repo's existing visually-hidden utility (app/globals.css,
    // already used by the runner's own `#run-state-heading`). Reusing it here
    // means this fix adds no new CSS and no visible pixel.
    expect(markup).toMatch(/<h1 class="sr-only">/);
  });
});
