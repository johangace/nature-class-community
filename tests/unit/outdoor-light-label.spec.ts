import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #357 · "Outdoor mode" reads as audio to someone who has not seen the code.
 *
 * Cohort feedback (Rebecca, Aug 18 demo, verbatim): *"This is kind of
 * random, but 'Outdoor Mode' makes me think of audio-based experiences."*
 * The control is a glare-legibility display preference — bigger type and
 * contrast for an iPad in sun (`app/globals.css`'s own comment: "a
 * legibility aid for an iPad in glare, not a magnifier"). Nothing about it
 * is audio, and "mode" alone does not say that.
 *
 * Label only, per the ticket's own scope: the toggle's behaviour and the
 * `.run.outdoor` / `run-outdoor-*` CSS names are untouched. What changes is
 * what a teacher reads and what a screen reader says: "mode" becomes
 * "light" everywhere the control is named, which is the word
 * `HybridJourney`'s own sun/moon toggle had already settled on (#378)
 * before this ticket was filed — Runner's legacy pill was the one surface
 * still carrying the old word.
 *
 * `code()` strips comments before matching, because the OLD word is
 * expected to survive in prose that explains the history (this file's own
 * doc comment above says it twice) — the guard is on what a teacher or a
 * screen reader is actually shown, not on every mention of the ticket.
 */

const runner = readFileSync(new URL("../../app/run/Runner.tsx", import.meta.url), "utf8");
const journey = readFileSync(new URL("../../app/run/HybridJourney.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("the outdoor toggle's copy, on every surface that renders it (#357)", () => {
  it("never shows or announces the word 'mode' for this control", () => {
    for (const [name, source] of [
      ["Runner", runner],
      ["HybridJourney", journey],
    ] as const) {
      const live = code(source);
      // Case-sensitive on purpose: "mode" appears in unrelated words and
      // identifiers (teachingMode, RunMode) that this ticket has no stake
      // in — only the capitalised, sentence-visible word is the complaint.
      expect(live, `${name} still renders "Outdoor mode" or "Outdoor Mode"`).not.toMatch(
        /Outdoor\s*(?:<[^>]*>)?\s*(?:&nbsp;)?\s*[Mm]ode\b/
      );
    }
  });

  it("Runner's pill reads 'Outdoor light', matching HybridJourney's own wording", () => {
    const live = code(runner);
    expect(live).toContain("Outdoor<span className=\"run-outdoor-word\">&nbsp;light</span>");
    expect(live).toMatch(/title=\{outdoor \? "Outdoor light\. Tap for indoor\." : "Indoor light\. Tap for outdoor\."\}/);
  });

  it("HybridJourney's accessible name and tooltip say 'light', not 'mode'", () => {
    const live = code(journey);
    expect(live).toContain('aria-label={outdoor ? "Switch to indoor light" : "Switch to outdoor light"}');
    expect(live).toContain('title={outdoor ? "Outdoor light. Tap for indoor." : "Indoor light. Tap for outdoor."}');
  });

  it("the behaviour this labels is unchanged: still the same display preference", () => {
    // Scope guard for the ticket itself: the fix is label-only. The CSS
    // class it names explicitly (app/globals.css:1696 in the ticket) is
    // untouched, and the block that steps up the type scale for glare is
    // still there, still reachable under the same selector.
    expect(css).toContain(".run.outdoor .say-aloud-text");
    expect(css).toContain("Outdoor mode is a legibility aid for an iPad in glare");
  });
});
