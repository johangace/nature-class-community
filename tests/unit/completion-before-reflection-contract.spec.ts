import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const logSession = readFileSync(
  new URL("../../app/run/LogSession.tsx", import.meta.url),
  "utf8"
);
const runner = readFileSync(
  new URL("../../app/run/Runner.tsx", import.meta.url),
  "utf8"
);
const journey = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);
const lessonFinish = readFileSync(
  new URL("../../app/run/LessonFinish.tsx", import.meta.url),
  "utf8"
);

/**
 * Every surface that can end a lesson. The guard below reads all of them
 * because the bug it exists to catch appeared in the one that was added
 * last: banning a skip inside LogSession does nothing about a skip placed
 * one component up, and the hybrid journey is now the default run.
 */
const finishSurfaces = [
  ["LogSession", logSession],
  ["HybridJourney", journey],
  ["LessonFinish", lessonFinish],
  ["Runner", runner],
] as const;

/**
 * Source with its comments removed. The banned control has to be banned in
 * the CODE, not in the prose: the comment that records why a skip must never
 * come back names the string it is warning about, and a guard that cannot
 * tell a warning from the thing it warns against would forbid explaining
 * itself.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Completion is a reliable save boundary, not the far end of an optional
 * survey. The teacher can keep as much or as little as is useful, saves the
 * session record, and only then receives the safe exits from the run.
 */
describe("completion before reflection source contract", () => {
  it("keeps every reflection field optional, including headcount", () => {
    // The reflection is private and fully optional. An entered headcount must
    // be valid, but a blank one cannot gate the session record.
    const askingReturn = logSession.lastIndexOf("\n  return (");
    expect(askingReturn).toBeGreaterThan(-1);

    const askingBranch = logSession.slice(askingReturn);
    expect(askingBranch).toContain("Children outside");
    expect(askingBranch).toContain("Everything here is optional");
    expect(logSession).toContain('headcount === "" ? null');
    expect(askingBranch).toMatch(/disabled=\{state\.at === "sending" \|\| !countIsValid\}/);
    expect(logSession).not.toContain("Skip for now");
  });

  it("gives no run surface a way past the record into the ending (#344)", () => {
    // The regression this catches, exactly: a teacher taught a whole lesson,
    // tapped a foot button that read as "skip the reflection", was shown
    // "Class, beautifully done", and nothing was written. The reflection is
    // optional; the record is not. Reproduced on 2026-08-18 against a real
    // database: full journey plus one tap, zero rows.
    for (const [name, source] of finishSurfaces) {
      expect(code(source), `${name} offers a skip past the record`).not.toContain(
        "Skip for now"
      );
    }
  });

  it("lets the journey reach its celebration only through a saved completion", () => {
    // The celebration is what a logged lesson opens. Inside the reflect
    // branch the ONLY route onward is LogSession's own onCompleted, which
    // fires after the server accepted the record (or the iPad kept it to
    // send later) — never from a control the teacher can reach around it.
    const reflectBranch = journey.slice(
      journey.indexOf('if (step.kind === "reflect"'),
      journey.indexOf("// celebrate —")
    );
    expect(reflectBranch).toContain("<LogSession");
    expect(reflectBranch).toContain(
      'onCompleted={() => setStep({ kind: "celebrate" })}'
    );

    // One celebrate transition in that branch, and it is the one above.
    const toCelebrate = reflectBranch.match(/setStep\(\{ kind: "celebrate" \}\)/g);
    expect(toCelebrate).toHaveLength(1);
  });

  it("keeps Today and Start again inside a saved-or-kept receipt, without print", () => {
    const askingReturn = logSession.lastIndexOf("\n  return (");
    const receiptBranches = logSession.slice(0, askingReturn);
    const askingBranch = logSession.slice(askingReturn);

    expect(receiptBranches).toMatch(/state\.at === "logged"/);
    expect(receiptBranches).toMatch(/state\.at === "kept"/);

    for (const action of ["Back to today", "Start again"]) {
      expect(receiptBranches).toContain(action);
      expect(askingBranch).not.toContain(action);
    }
    // Founder ruling (2026-08-15): print belongs with reading the lesson,
    // never inside either finish surface.
    expect(logSession).not.toContain("Print the sheet");
  });

  it("does not leave signed-in finish navigation around LogSession in Runner", () => {
    const logSessionStart = runner.indexOf("<LogSession");
    expect(logSessionStart).toBeGreaterThan(-1);

    const immediateFinishArea = runner.slice(
      Math.max(0, logSessionStart - 1_000),
      logSessionStart + 1_000
    );
    expect(immediateFinishArea).not.toContain('className="done-print"');
    expect(immediateFinishArea).not.toContain('className="done-links"');
  });

  it("does not adopt one class's live Runner when the active class changes", () => {
    const page = readFileSync(
      new URL("../../app/run/page.tsx", import.meta.url),
      "utf8"
    );
    expect(page).toMatch(/key=\{`\$\{ownerScope[\s\S]*?\$\{session\.id\}`\}/);
  });

  it("preserves later queue writes and keeps queued finish progress resumable", () => {
    expect(logSession).toContain("removeCompletionKeys(readQueue(classId)");
    expect(logSession).toContain("onCompleted");
    const keptBranch = logSession.slice(
      logSession.indexOf("if (writeQueue(classId, queued))"),
      logSession.indexOf("if (state.at === \"logged\")")
    );
    expect(keptBranch).not.toContain("onCompleted()");
    expect(logSession).not.toMatch(
      /if \(writeQueue\(classId, queued\)\)[\s\S]*?draftRef\.current = null;[\s\S]*?setState\(\{ at: "failed" \}\)/
    );
  });

  it("separates the raw run identity from the pause-adjusted completion time", () => {
    expect(logSession).toContain("runStartedAt");
    expect(logSession).toContain(
      "completionClientKey(classId, sessionId, identityStartedAt)"
    );
    expect(logSession).toContain("draft.clientKey === expectedClientKey");
  });

  it("lets an adopted queued finish own its retry and clear progress on acceptance", () => {
    expect(logSession).toContain("void post(queuedAtMount).then");
    expect(logSession).toContain("completedRef.current()");
    expect(runner).not.toContain("void drainQueue");

    const todayDrain = readFileSync(
      new URL("../../app/run/CompletionQueueDrain.tsx", import.meta.url),
      "utf8"
    );
    expect(todayDrain).toContain("accepted");
    expect(todayDrain).toContain("parseRunProgress");
    expect(todayDrain).toContain("progress.startedAt");
    expect(todayDrain).toContain("window.localStorage.removeItem(progressKey)");
  });
});
