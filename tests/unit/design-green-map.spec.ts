import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const TODAY = readFileSync(new URL("../../app/today.module.css", import.meta.url), "utf8");
const JOURNEY = readFileSync(new URL("../../app/run/journey.module.css", import.meta.url), "utf8");
const RUN_HOLD = readFileSync(new URL("../../app/run/hold.module.css", import.meta.url), "utf8");
const LANDING = readFileSync(new URL("../../app/welcome/Landing.module.css", import.meta.url), "utf8");

function declaration(css: string, name: string): string {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`--${name} is not defined`);
  return match[1].trim().toLowerCase();
}

function rule(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${selector} is not defined`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("the green family has one source per job", () => {
  it("keeps semantic jobs distinct while their light values converge", () => {
    expect(declaration(GLOBALS, "umber")).toBe("#4c7d38");
    expect(declaration(GLOBALS, "living")).toBe("#4c7d38");
    expect(declaration(GLOBALS, "action")).toBe("#4c7d38");
    expect(declaration(GLOBALS, "seed")).toBe("var(--action)");
    expect(declaration(TODAY, "green")).toBe("var(--action)");
    expect(declaration(TODAY, "green-deep")).toBe("var(--living)");
    expect(declaration(JOURNEY, "tone-green")).toBe("var(--living)");
    expect(declaration(JOURNEY, "tone-green-soft")).toBe("var(--living)");
    expect(TODAY).not.toContain("--ink: #282d1d");
    expect(TODAY).not.toContain("rgba(40, 45, 29");
    expect(RUN_HOLD).not.toContain("rgba(40, 45, 29");
    expect(declaration(GLOBALS.slice(GLOBALS.indexOf(".run-scroll")), "tj-green")).toBe(
      "var(--action)"
    );
  });

  it("re-resolves the seed alias inside the outdoor register", () => {
    const outdoor = GLOBALS.slice(GLOBALS.indexOf(".run.outdoor,"));
    expect(declaration(outdoor, "seed")).toBe("var(--action)");
  });

  it("routes every product-mark seed through the seed role", () => {
    expect(rule(GLOBALS, ".app-shell-brand .wordmark-seed")).toContain("color: var(--seed)");
    expect(rule(GLOBALS, "\n.wordmark-seed {")).toContain("color: var(--seed)");
    expect(rule(GLOBALS, ".dandelion-seeds")).toContain("color: var(--seed)");
    expect(rule(LANDING, ".headerLogo :global(.wordmark-seed)")).toContain(
      "color: var(--seed)"
    );
  });

  it("keeps petrol off the landing entirely while green carries the outdoor promise (#914)", () => {
    expect(rule(GLOBALS, ".wordmark-first")).toContain("opacity: 1");

    // Measured on 2026-09-02: the logo blue rendered nowhere on the live
    // landing except the 20px eyebrow rules. The rebuilt page gives the rule to
    // the same green as the seed, so the page has one accent, not two.
    // The one petrol on the landing is the wordmark itself (Johan, 2026-09-07:
    // "logo should bring back the blue for text"). Nothing else takes it.
    expect(rule(LANDING, ".headerLogo {")).toContain("color: var(--brand)");
    expect(LANDING.split("var(--brand)").length - 1).toBe(1);
    expect(rule(LANDING, ".kicker {")).toContain("color: var(--ink)");
    expect(rule(LANDING, ".heroTitle span:last-child")).toContain("color: var(--living)");
    expect(rule(LANDING, ".teacherAvatar")).toContain("background: var(--action)");
  });

  it("keeps small landing labels readable when they leave the paper ground", () => {
    expect(rule(LANDING, ".kicker {")).toContain("color: var(--ink)");
    expect(rule(LANDING, ".chip {")).toContain("color: var(--ink)");
    // "What you get" moved off the moss onto the pale sky wash (2026-09-07:
    // blue for the teacher's kit, green for the living world), so its eyebrow
    // is ink again; the sky school card sets its own light text for the card.
    expect(rule(LANDING, ".offer .kicker {")).toContain("color: var(--ink)");
    expect(rule(LANDING, ".audienceSchools {")).toContain("color: var(--surface)");
  });

  it("gives landing eyebrows the shorter, heavier green rule", () => {
    const eyebrowRule = rule(LANDING, ".kicker::before {");

    expect(eyebrowRule).toContain("width: 20px");
    expect(eyebrowRule).toContain("height: 2px");
    expect(eyebrowRule).toContain("background: var(--living)");
  });

  it("returns the landing footer to the neutral page palette", () => {
    const footer = rule(LANDING, ".footer {");
    const footerMark = rule(LANDING, ".footerInner :global(.wordmark)");

    expect(footer).toContain("background: var(--paper)");
    expect(footer).toContain("color: var(--ink)");
    expect(footerMark).toContain("--wordmark-ink: var(--ink)");
    expect(footerMark).toContain("color: var(--ink)");
    expect(rule(LANDING, ".footerInner p")).toContain("color: var(--ink-soft)");
  });
});
