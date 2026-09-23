import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DandelionTransition } from "@/app/DandelionTransition";
import TodayLoading from "@/app/loading";
import RunLoading from "@/app/run/loading";
import RunTemplate, {
  RUN_ENTRY_TRANSITION_MS,
} from "@/app/run/template";

const css = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8"
);

describe("the dandelion sign-in transition", () => {
  it("opens on the Nature Class mark instead of placeholder cards", () => {
    const markup = renderToStaticMarkup(<TodayLoading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Opening Nature Class.");
    expect(markup).toContain('data-logo="nature-class"');
    expect(markup.match(/class="dandelion-seed"/g)).toHaveLength(3);
    expect(markup.match(/class="dandelion-seed"><svg/g)).toHaveLength(3);
    expect(markup).not.toContain("today-frame");
  });

  it("uses composited drift motion and freezes to one seed when motion is reduced", () => {
    expect(css).toContain("@keyframes dandelion-blow");
    expect(css).toMatch(/\.dandelion-seed\s*\{[^}]*animation:\s*dandelion-blow/s);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(
      /prefers-reduced-motion:[^{]+\{[\s\S]*?\.dandelion-seed\s*\{[^}]*animation:\s*none/s
    );
    expect(css).toMatch(
      /\.dandelion-seed:first-child\s*\{[^}]*opacity:\s*1/s
    );
  });
});

describe("the dandelion lesson transition", () => {
  it("gives the run route its own truthful dandelion loading state", () => {
    const markup = renderToStaticMarkup(<RunLoading />);

    expect(markup).toContain('data-logo="nature-class"');
    expect(markup).toContain("Opening the lesson.");
    expect(markup.match(/class="dandelion-seed"/g)).toHaveLength(3);
    expect(markup).not.toContain("hold_");
  });

  it("starts every run entry on the dandelion even when the route is warm", () => {
    const markup = renderToStaticMarkup(
      <RunTemplate>
        <p>The lesson is ready.</p>
      </RunTemplate>
    );

    expect(markup).toContain("Opening the lesson.");
    expect(markup).not.toContain("The lesson is ready.");
    expect(RUN_ENTRY_TRANSITION_MS).toBeGreaterThanOrEqual(800);
    expect(RUN_ENTRY_TRANSITION_MS).toBeLessThanOrEqual(1_200);
  });

  it("lets each loading boundary reuse the same accessible transition", () => {
    const markup = renderToStaticMarkup(
      <DandelionTransition message="Preparing your lesson." />
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Preparing your lesson.");
  });
});
