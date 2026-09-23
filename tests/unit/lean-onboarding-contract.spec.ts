import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the first-run boundary", () => {
  const flow = read("app/start/StartFlow.tsx");

  it("asks for only a class profile and a required location", () => {
    expect(flow).toContain("1 of 2 · your group");
    expect(flow).toContain("2 of 2 · your location");
    expect(flow).not.toContain("GroundsStep");
    expect(flow).not.toContain("SuccessStep");
    expect(flow).not.toContain("WorldBuilder");
  });

  it("asks for the school once, on the screen that already found it", () => {
    // #905. Screen 1 asked for the school by name and screen 2 asked her to
    // search for the same school to place it, so a two-screen flow made a
    // teacher give one answer twice. The name is now defaulted from the place
    // she confirms, and edited there if her school is called something else.
    const classStep = flow.slice(
      flow.indexOf("function ClassStep"),
      flow.indexOf("function LocationStep")
    );
    expect(classStep).not.toContain("start-school");
    expect(classStep).not.toContain("draft.school");

    const locationStep = flow.slice(flow.indexOf("function LocationStep"));
    expect(locationStep).not.toContain('htmlFor="start-school"');
    expect(locationStep).toContain(
      "schoolOfRecord(draft.school, draft.schoolEdited, located?.label ?? located?.headline ?? null)"
    );
  });

  it("finishes from the location step only after a location and a name are held", () => {
    // `ready` is `grounded` plus the school name the class row cannot be
    // written without. Try mode carries no row, so it needs no name.
    expect(flow).toContain("const ready = grounded && (trying || school.trim().length > 0);");
    expect(flow).toContain("disabled={saving || !ready}");
    expect(flow).toContain("Show activities");
    expect(flow).toContain("await finishStartFlow()");
  });

  it("does not offer passkey enrolment during first run or on Today", () => {
    expect(flow).not.toContain("PASSKEY_COPY");
    expect(flow).not.toContain("authClient.passkey");
    expect(read("app/today/page.tsx")).not.toContain("PasskeyStrip");
  });
});

describe("the optional setup work after first run", () => {
  const tasks = read("app/SetupTasks.tsx");
  const today = read("app/today/page.tsx");

  it("reads truthful completion from the shared setup model", () => {
    expect(tasks).toContain('from "@/lib/setup-progress"');
    expect(tasks).toContain("setupProgress(input)");
    expect(tasks).toContain("progress.complete");
    expect(tasks).toContain("progress.tasks.filter");
  });

  it("keeps the tasks off Today and out of onboarding", () => {
    // Johan, 2026-09-02: the list does not belong on Today. Today is the
    // lesson; open details go on the class's own card. Nor does the work go
    // back into first run.
    expect(today).not.toContain("<SetupTasks");
    expect(read("app/start/StartFlow.tsx")).not.toContain("Map the grounds");
  });

  it("lists open work only", () => {
    expect(tasks).toContain('task.state === "open"');
    expect(tasks).not.toContain("Review");
  });
});
