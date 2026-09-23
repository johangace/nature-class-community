import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journey = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);
const page = readFileSync(new URL("../../app/run/page.tsx", import.meta.url), "utf8");

/**
 * #456: "a paused place is kept" was a line the paused card said with nothing
 * behind it — `HybridJourney` (the default `/run` surface) held its step,
 * clock and pause state in plain `useState` with no persistence at all, so a
 * reload or a tap on the ✕ always came back to `intro` regardless of what the
 * dialog had just promised. These guard the wiring `journey-progress.spec.ts`
 * (the schema) does not reach: that the component actually reads and writes
 * the saved place, names it before re-entering, and asks before an active run
 * is left.
 */
describe("hybrid journey resume source contract (#456)", () => {
  it("passes the journey its own ownerScope, the same scope Runner.tsx receives", () => {
    expect(page).toMatch(/<HybridJourney[\s\S]*?ownerScope=\{ownerScope\}[\s\S]*?\/>/);
  });

  it("persists the exact step, sub-step and clock — never the doorstep, and never silently", () => {
    expect(journey).toContain("journeyProgressKey");
    expect(journey).toContain("parseJourneyProgress");
    // Never saves the first screen: opening the lesson to look must stay free.
    expect(journey).toMatch(/if \(step\.kind === "topic"\) return;/);
    // Reaching the true end clears the saved run rather than leaving a stale
    // one behind for the next open.
    expect(journey).toMatch(/step\.kind === "celebrate"[\s\S]{0,80}clearSavedJourney\(\)/);
  });

  it("holds a saved run for the teacher's say-so instead of re-entering it silently", () => {
    expect(journey).toContain("pendingResume");
    expect(journey).toContain("function applyResume(");
    // The gate names the saved place, not a generic "you were mid-lesson".
    expect(journey).toContain("function stepLabel(");
    expect(journey).toMatch(/You were at \{label\}/);
    expect(journey).toContain("Start fresh");
  });

  it("restores elapsed and paused clock state, not just position", () => {
    const applyResume = journey.slice(
      journey.indexOf("function applyResume("),
      journey.indexOf("function applyResume(") + 600
    );
    expect(applyResume).toContain("setStartedAt(saved.startedAt)");
    expect(applyResume).toContain("setPausedAt(saved.pausedAt)");
    expect(applyResume).toContain("setPausedMs(saved.pausedMs)");
  });

  it("guards the ✕ while a run is active instead of leaving instantly", () => {
    // The exact bug reported alongside #456: the leave control was a bare
    // `<Link href="/">`, no matter what step the class was on.
    expect(journey).toContain("const activeRun =");
    expect(journey).toContain("setShowExitConfirm(true)");
    const exitDialog = journey.slice(
      journey.indexOf("const exitDialog ="),
      journey.indexOf("const exitDialog =") + 1200
    );
    // Both real intentions, explicit and named — never a single silent leave.
    expect(exitDialog).toContain("Keep for later");
    expect(exitDialog).toContain("End the lesson");
  });

  it("keeps the exit guard off `reflect`'s own deliberate, tested escape (#344)", () => {
    // `reflect`'s ✕ intentionally stays a plain leave. The whole reflection,
    // including headcount, can be saved blank; the resume guard must not
    // quietly add a confirmation to this private close.
    expect(journey).toMatch(
      /step\.kind !== "topic" && step\.kind !== "celebrate" && step\.kind !== "reflect"/
    );
  });
});
