import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationSearch } from "@/app/classes/LocationSearch";

/**
 * A laptop with Location Services off returns POSITION_UNAVAILABLE and there
 * is nothing the page can do about the device. What it can do is take the
 * place typed (#181), through the same /api/geocode route /start uses and
 * the same setClassLocation action a tapped position takes.
 */
describe("the typed place search under the location control", () => {
  it("renders a labelled field and a find button, idle and quiet", () => {
    const html = renderToStaticMarkup(<LocationSearch classId="c1" returnTo="/today" />);
    expect(html).toContain("Or type the school, park or town");
    expect(html).toMatch(/<input[^>]*class="loc-search-input"[^>]*maxLength="160"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Find<\/button>/);
    expect(html).not.toContain("loc-search-match");
    expect(html).not.toContain("loc-search-error");
  });

  it("reads the same route and feeds the same action as a tapped position", () => {
    const source = readFileSync(
      new URL("../../app/classes/LocationSearch.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("/api/geocode?q=");
    expect(source).toContain('import { setClassLocation } from "./actions"');
    expect(source).toContain('form.set("returnTo", returnTo)');
  });
});
