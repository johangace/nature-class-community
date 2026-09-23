import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney } from "@/app/run/HybridJourney";
import { findSession } from "@/lib/pack";

const found = findSession("summer-w1-counting-life");
if (!found) throw new Error("Counting life fixture is missing");

describe("a direct entry to the live runner", () => {
  it("opens on the introduction's topic screen, with no doorstep before it", () => {
    // Johan, 2026-09-06, on the "Run Session Outside" page with its 1-4 list:
    // "who told you to add this session?" The lesson screen is the
    // preparation surface (#832); the run opens on the introduction.
    const markup = renderToStaticMarkup(<HybridJourney session={found.session} />);

    expect(markup).toContain("Introduce today");
    expect(markup).toContain(found.session.title);
    expect(markup).toContain(found.session.objective);
    expect(markup).toContain("Begin →");

    expect(markup).not.toContain("Run Session Outside");
    expect(markup).not.toContain("Start with the class");
    expect(markup).not.toContain("Pre-reading");
    expect(markup).not.toContain("Before you go out");
    expect(markup).not.toContain("Print");
    expect(markup).not.toMatch(/\bages?\b/i);
  });
});
