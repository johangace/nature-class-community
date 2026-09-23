import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceView } from "@/app/session/legacy/PlaceView";
import { ReadyView } from "@/app/session/legacy/ReadyView";
import { PrimerView } from "@/app/session/legacy/PrimerView";
import { RouteView } from "@/app/session/legacy/RouteView";
import { TakeView } from "@/app/session/legacy/TakeView";
import { projectLessonJourney } from "@/lib/lesson/journey";
import { loadPack } from "@/lib/pack";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const autumn = loadPack("autumn-starter");
const leaf = required(
  autumn.sessions.find((session) => session.id === "leaves-and-their-trees"),
  "Leaf collage fixture is missing"
);
const journey = projectLessonJourney(autumn, leaf);
const shared = {
  journey,
  weekOf: "week 1 of 4",
  session: leaf,
  activeClass: { name: "Willow class", yearGroup: "Year 1" },
  locale: undefined,
};

function render(View: typeof ReadyView) {
  return renderToStaticMarkup(createElement(View, shared));
}

function htmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("'", "&#x27;");
}

/**
 * The RETIRED five-page journey, kept as the `?plan=legacy` prototype mode so it
 * can be compared against the scroll in the live app (nc#232). These tests move
 * with it: they describe what that mode still does, not what the product does
 * by default. Delete this file when the mode goes.
 */
describe("the legacy prototype mode (?plan=legacy)", () => {
  it("uses the session-aware home route for the retained Today back link", () => {
    const teacherMarkup = renderToStaticMarkup(
      createElement(ReadyView, { ...shared, homeHref: "/today" as const }),
    );
    const publicMarkup = renderToStaticMarkup(
      createElement(ReadyView, {
        ...shared,
        activeClass: null,
        homeHref: "/" as const,
      }),
    );

    expect(teacherMarkup).toContain('href="/today"');
    expect(publicMarkup).toContain('href="/"');
    expect(publicMarkup).not.toContain('href="/today"');
  });

  it("keeps Ready focused on the promise and the children's work", () => {
    const markup = render(ReadyView);

    expect(markup).toContain(`<h1 class="plan-question">${leaf.prompt}</h1>`);
    expect(markup).toContain("What children will do");
    expect(markup).toContain("Read the primer →");
    expect(markup).not.toContain("The route");
    expect(markup).not.toContain("Carry outside");
    expect(markup).not.toContain("Teaching notes");
    expect(markup).not.toContain("Print lesson pack");
  });

  it("gives the primer its own page and no unrelated preparation inventory", () => {
    const markup = render(PrimerView);

    expect(markup).toContain("What should I understand first?");
    expect(markup).toContain(leaf.primer?.summary);
    expect(markup).toContain("Ways to say it");
    expect(markup).toContain("Prepare the place →");
    expect(markup).not.toContain("The route");
    expect(markup).not.toContain("Carry outside");
    expect(markup).not.toContain("Print lesson pack");
  });

  it("keeps place preparation honest and separate", () => {
    const markup = render(PlaceView);

    expect(markup).toContain("What do I need here?");
    expect(markup).toContain("Carry outside");
    expect(markup).toContain("Space");
    expect(markup).toContain("Set up");
    expect(markup).toContain("If materials are unavailable");
    expect(markup).toContain("See the lesson route →");
    expect(markup).not.toContain("Ways to say it");
    expect(markup).not.toContain("Print lesson pack");
  });

  it("shows the authored route and phase notes on one dedicated page", () => {
    const markup = render(RouteView);

    expect(markup).toContain("How will the lesson flow?");
    expect(markup).toContain("The route");
    for (const phase of leaf.phases) expect(markup).toContain(htmlText(phase.title));
    expect(markup).toContain("Notes by phase");
    expect(markup).toContain("Choose what to take →");
    expect(markup).not.toContain("Carry outside");
    expect(markup).not.toContain("Ways to say it");
  });

  it("makes printing a final optional preparation page", () => {
    const markup = render(TakeView);

    expect(markup).toContain("What should I take with me?");
    expect(markup).toContain("Teacher plan");
    expect(markup).toContain("Child sheet");
    expect(markup).toContain("Print lesson pack");
    expect(markup).toContain(`/print?session=${leaf.id}`);
    expect(markup).not.toContain("The route");
    expect(markup).not.toContain("Ways to say it");
  });

  it("offers exactly one Lead action on every page and uses real route links", () => {
    const pages = [
      render(ReadyView),
      render(PrimerView),
      render(PlaceView),
      render(RouteView),
      render(TakeView),
    ];

    for (const markup of pages) {
      expect(markup.match(/class="btn-start"/g)).toHaveLength(1);
      expect(markup).toContain("Lead now →");
      expect(markup).toContain(`/run?session=${leaf.id}`);
      expect(markup).not.toContain("plan-sidebar");
    }
    expect(pages[0]).toContain(`/session/primer?session=${leaf.id}`);
    expect(pages[1]).toContain(`/session/place?session=${leaf.id}`);
    expect(pages[2]).toContain(`/session/route?session=${leaf.id}`);
    expect(pages[3]).toContain(`/session/take?session=${leaf.id}`);
  });
});

describe("minimal page geometry and visual identity", () => {
  it("keeps one sticky lead action and uses the existing Meadow faces", () => {
    expect(css).toMatch(/\.plan-actions\s*\{[^}]*position:\s*sticky/s);
    expect(css).toMatch(/\.plan-actions\s*\{[^}]*background:\s*var\(--paper\)/s);
    expect(css).toMatch(/\.plan-question\s*\{[^}]*font-family:\s*var\(--display\)/s);
    expect(css).toMatch(/\.plan-page\s*\{[^}]*font-family:\s*var\(--text\)/s);
  });

  it("uses a quiet footer journey rather than a sidebar or dashboard", () => {
    expect(css).toMatch(/\.plan-page-nav\s*\{/s);
    expect(css).not.toMatch(/\.plan-sidebar\s*\{/s);
    expect(css).toMatch(/\.plan-page a:focus-visible[\s\S]*outline:/s);
  });
});
