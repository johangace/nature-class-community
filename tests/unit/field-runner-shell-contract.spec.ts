import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync(
  new URL("../../app/run/Runner.tsx", import.meta.url),
  "utf8"
);
const css = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8"
);

function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} not found`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("the field runner is one bounded classroom instrument", () => {
  it("owns the viewport with a fixed three-row shell", () => {
    const shell = rule(".run");

    expect(shell).toMatch(/(?:^|\n)\s*height:\s*100dvh/);
    expect(shell).toMatch(/overflow:\s*hidden/);
    expect(shell).toMatch(
      /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/
    );
  });

  it("gives the lesson body a real overflow boundary", () => {
    expect(runner).toContain('className="run-body"');
    expect(rule(".run-body")).toMatch(/min-height:\s*0/);
    expect(rule(".run-body")).toMatch(/overflow:\s*hidden/);
    expect(runner).not.toContain("stageRef");
  });

  it("does not turn the ordinary or settle stage into one giant button", () => {
    expect(runner).not.toContain(
      '<button type="button" className="run-stage"'
    );
    expect(runner).not.toMatch(
      /<button\s+type="button"\s+className="run-stage settle-check"/
    );
  });

  it("leaves transient show and settle rooms when the teacher jumps in the folio", () => {
    const jump = runner.slice(runner.indexOf("onJump={(i, p)"));
    expect(jump).toContain("setCastBeat(false)");
    expect(jump).toContain("setSettleCheck(false)");
  });
});

describe("the field runner keeps its header and visual language quiet", () => {
  /**
   * The head carried nothing but a timer and a "More details" disclosure until
   * #243. Johan, on the live runner: outdoor mode was effectively lost inside
   * that menu, the menu was named for information rather than for what it
   * does, and there was no way back to Today from a lesson. So the contract
   * inverts: three things in the head, each of which had to earn it.
   */
  it("puts the name, outdoor mode and one controls disclosure in the head", () => {
    expect(runner).toContain('className="run-outdoor-toggle"');
    expect(runner).toContain("<Wordmark");
    expect(runner).toContain('className="run-brand-home"');
    expect(runner).toContain("<summary>Lesson controls</summary>");
    expect(runner.match(/<summary>Lesson controls<\/summary>/g)).toHaveLength(1);
    expect(runner).not.toContain("More details");
  });

  it("asks nothing mid-lesson that belonged on the Ready page", () => {
    // The class-band picker and its switch handler are gone from the runner:
    // the band arrives resolved (lib/ability.ts) and is only read here.
    expect(runner).not.toContain("changeAbility");
    expect(runner).not.toContain('aria-label="Class band"');
    expect(runner).not.toContain('aria-label="Display"');
    // Weather stays: it is the one setting that genuinely changes outdoors.
    expect(runner).toContain('aria-label="Conditions"');
  });

  it("guards the way back to Today while a class is actually in front of her", () => {
    const head = runner.slice(
      runner.indexOf('<div className="run-top">'),
      runner.indexOf('className="run-top-right"')
    );
    // Mid-lesson the mark opens the leave card, which keeps her place; before
    // the clock starts, and after the finish, it is an ordinary link home.
    expect(head).toMatch(/liveLesson \?[\s\S]*setShowExit\(true\)/);
    expect(head).toMatch(/<Link href=\{homeHref\} className="run-brand-home">/);
    expect(runner).toContain(
      "const liveLesson = !done && startedAt !== null;"
    );
  });

  it("uses the existing Meadow type tokens and a visible runner focus ring", () => {
    expect(css).toMatch(/--display:\s*var\(--font-display/);
    expect(css).toMatch(/--text:\s*var\(--font-text/);
    expect(css).toMatch(/\.run[^,{]*:focus-visible\s*{[^}]*outline:/s);
  });

  it("tightens the shell on phones and stills runner transitions on request", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*480px\)/);
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?(?:\.moment|\.mode-toast)[\s\S]*?(?:animation|transition):\s*none/
    );
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[\s\S]*?\.folio-(?:fill|marker)[\s\S]*?transition:\s*none/
    );
  });
});
