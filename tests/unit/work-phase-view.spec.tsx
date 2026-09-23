import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSession, loadPack } from "@/lib/pack";
import { WorkPhase } from "@/app/run/WorkPhase";

describe("quiet child-work runner posture", () => {
  it("renders one authored task with a subordinate teacher cue", () => {
    const session = getSession(loadPack("summer"), "summer-w3-a5-leaf-collage");
    const phase = session.phases.find((candidate) => candidate.key === "create-2");
    if (!phase) throw new Error("Leaf Collage create phase missing");

    const markup = renderToStaticMarkup(<WorkPhase phase={phase} ability="reception" />);

    expect(markup).toContain("Children are working");
    expect(markup).toContain("Bring the fallen materials you collected");
    expect(markup).toContain("For you");
    expect(markup).toContain("Gather the children back inside");
    expect(markup).toContain("Let the screen go quiet");
    expect(markup).not.toContain("Perhaps you want to make an insect");
  });

  it("uses an authored say-aloud as the honest fallback for an un-migrated work phase", () => {
    const session = getSession(loadPack("summer"), "summer-w2-minibeast-hunting");
    const phase = session.phases.find((candidate) => candidate.key === "explore-2");
    if (!phase) throw new Error("Minibeast explore phase missing");

    const markup = renderToStaticMarkup(<WorkPhase phase={phase} ability="y1" />);

    expect(markup).toMatch(/children|minutes|look|explore/i);
    expect(markup).not.toContain("undefined");
  });

  it("keeps the Meadow type roles and a bounded field layout", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.work-task\s*\{[^}]*font-family:\s*var\(--display\)/s);
    expect(css).toMatch(/\.work-note\s*\{[^}]*font-family:\s*var\(--text\)/s);
    expect(css).toMatch(/\.run-work\s*\{[^}]*overflow:\s*auto/s);
    expect(css).toMatch(/\.run-work\s*\{[^}]*flex:\s*1 1 auto/s);
    expect(css).toMatch(/\.run-work\s*\{[^}]*min-height:\s*0/s);
    expect(css).not.toMatch(/\.run-work\s*\{[^}]*min-height:\s*100%/s);
    expect(css).not.toMatch(/\.run-work\s*\{[^}]*(Georgia|serif|linear-gradient)/s);
  });
});
