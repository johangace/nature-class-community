import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSession, loadPack } from "@/lib/pack";
import { phaseSchema } from "@/schema/pack";
import { resolveTeachingFlow } from "@/lib/run/teaching-flow";

describe("authored child-work posture", () => {
  it("permits one authored child task only on work phases", () => {
    const base = {
      key: "make",
      title: "Make",
      blocks: [{ type: "say-aloud" as const, text: "Begin making." }],
    };

    expect(
      phaseSchema.parse({
        ...base,
        mode: "work",
        childTask: "Arrange first. Glue when you are ready.",
      })
    ).toMatchObject({ mode: "work", childTask: "Arrange first. Glue when you are ready." });
    expect(() =>
      phaseSchema.parse({ ...base, mode: "present", childTask: "Do the work." })
    ).toThrow(/childTask is only valid on a work phase/);
  });

  it("authors Counting Life as collective observation without a settling preamble", () => {
    const session = getSession(loadPack("summer"), "summer-w1-counting-life");

    expect(session.settle).toBe(false);
    expect(resolveTeachingFlow(session).map(({ phaseKey, mode }) => ({ phaseKey, mode }))).toEqual([
      { phaseKey: "count-1", mode: "work" },
      { phaseKey: "see-2", mode: "work" },
      { phaseKey: "hear-3", mode: "work" },
      { phaseKey: "alive-4", mode: "gather" },
      { phaseKey: "living-5", mode: "gather" },
      { phaseKey: "circle", mode: "gather" },
    ]);
    expect(session.phases[0]?.childTask).toMatch(/count together/i);
    expect(session.phases[0]?.childTask).toMatch(/do not need to know its name/i);
    expect(session.childWorkSummary).toMatch(/count together/i);
  });

  it("authors Leaf Collage as present, sustained work and gather without a cast dependency", () => {
    const session = getSession(loadPack("summer"), "summer-w3-a5-leaf-collage");

    expect(session.settle).toBe(false);
    expect(resolveTeachingFlow(session).map(({ phaseKey, mode }) => ({ phaseKey, mode }))).toEqual([
      { phaseKey: "collect-1", mode: "present" },
      { phaseKey: "create-2", mode: "work" },
      { phaseKey: "glue-3", mode: "work" },
      { phaseKey: "present-4", mode: "gather" },
      { phaseKey: "circle", mode: "gather" },
    ]);
    expect(session.phases[1]?.childTask).toMatch(/fallen/i);
    expect(session.phases[1]?.childTask).toMatch(/materials you collected/i);
    expect(session.phases[1]?.childTask).not.toMatch(/^Collect one small handful/i);
    expect(session.phases[2]?.childTask).toMatch(/arrange/i);
    expect(session.childWorkSummary).toMatch(/arrange before gluing/i);
  });

  it("keeps Work navigation canonical and Start fresh on the authored route", () => {
    const runner = readFileSync(new URL("../../app/run/Runner.tsx", import.meta.url), "utf8");

    expect(runner).toMatch(/const safePageIndex = workPhase\s*\? 0/s);
    expect(runner).toMatch(/previousMode === "work"\s*\? 0/s);
    expect(runner).toMatch(/setStage\(hasAuthoredTeachingFlow \? "steps" : "introduce"\)/);
    // The clock never starts on mount or reset: it starts on the first
    // deliberate forward tap (ensureClock), and a saved run waits for the
    // teacher's explicit choice at the resume gate instead of silently
    // re-entering with a stale stopwatch.
    expect(runner).toMatch(/function ensureClock\(\)\s*\{\s*if \(startedAt === null\) setStartedAt\(Date\.now\(\)\);/);
    expect(runner).toMatch(/function advance\(\) \{\s*ensureClock\(\);/);
    expect(runner).toMatch(/setPendingResume\(saved\)/);
    expect(runner).not.toMatch(/setStartedAt\(hasAuthoredTeachingFlow \? Date\.now\(\) : null\)/);
    expect(runner).toMatch(/case "show":[\s\S]*if \(!hasCast\)/);
  });

  it("publishes the new authoring fields in the strict mirrored JSON Schema", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../schema/pack.schema.json", import.meta.url), "utf8")
    );

    expect(schema.$defs.session.properties).toHaveProperty("childWorkSummary");
    expect(schema.$defs.session.properties).toHaveProperty("materialFallback");
    expect(schema.$defs.phase.properties.mode.enum).toEqual(["present", "work", "gather"]);
    expect(schema.$defs.phase.properties).toHaveProperty("childTask");
  });

  /**
   * The assertion above is the one that let #662 happen, and it is kept rather
   * than replaced because it is not wrong — it is just the wrong SHAPE. It can
   * only ever protect the fields somebody thought to name, and the field that
   * goes missing is by definition the one nobody thought of: `materialPurpose`
   * was added to zod, this file was not touched, and five more fields had
   * already drifted the same way in three different objects without anyone
   * noticing.
   *
   * So the guard below names nothing. It compares the two key sets.
   */
  it("mirrors every field zod accepts, in both directions", async () => {
    const { findDrift } = await import("../../scripts/schema-mirror-lint.mjs");

    expect(findDrift()).toEqual([]);
  });
});
