import { describe, expect, it } from "vitest";
import { getSession, loadPack } from "@/lib/pack";
import { parseRunProgress } from "@/lib/run/progress";
import {
  phaseSchema,
  type Phase,
  type Session,
  type TeachingMode,
} from "@/schema/pack";

const summer = loadPack("summer");
const countingLife = getSession(summer, "summer-w1-counting-life");
const leafCollage = getSession(summer, "summer-w3-a5-leaf-collage");

type ProposedPhase = Phase & { mode?: TeachingMode };

function withLeafModes(session: Session): Session {
  const modes: Record<string, TeachingMode> = {
    "collect-1": "present",
    "create-2": "work",
    "glue-3": "work",
    "present-4": "gather",
    circle: "gather",
  };
  return {
    ...session,
    phases: session.phases.map((phase) => ({
      ...phase,
      mode: modes[phase.key],
    })) as ProposedPhase[],
  } as Session;
}

async function flowRuntime() {
  return import("@/lib/run/teaching-flow");
}

describe("Present → Work → Gather teaching-flow contract", () => {
  it("publishes one closed, neutral mode vocabulary from the runtime seam", async () => {
    const { teachingModes } = await flowRuntime();
    expect(teachingModes).toEqual(["present", "work", "gather"]);
  });

  it("adds one optional neutral phase mode while legacy phases still parse", () => {
    const base = {
      key: "make",
      title: "Make",
      blocks: [{ type: "say-aloud" as const, text: "Make something from this place." }],
    };

    expect(phaseSchema.parse(base)).not.toHaveProperty("mode");
    expect(phaseSchema.parse({ ...base, mode: "work" })).toMatchObject({ mode: "work" });
    expect(() => phaseSchema.parse({ ...base, mode: "detective" })).toThrow();
    expect(() => phaseSchema.parse({ ...base, mode: "contemplate" })).toThrow();
  });

  it("reads the explicitly re-authored Counting Life flow without injecting a preamble", async () => {
    const { resolveTeachingFlow } = await flowRuntime();

    expect(resolveTeachingFlow(countingLife)).toEqual([
      { phaseIndex: 0, phaseKey: "count-1", mode: "work" },
      { phaseIndex: 1, phaseKey: "see-2", mode: "work" },
      { phaseIndex: 2, phaseKey: "hear-3", mode: "work" },
      { phaseIndex: 3, phaseKey: "alive-4", mode: "gather" },
      { phaseIndex: 4, phaseKey: "living-5", mode: "gather" },
      { phaseIndex: 5, phaseKey: "circle", mode: "gather" },
    ]);
  });

  it("expresses the proposed Leaf Collage flow without deleting or reordering phases", async () => {
    const { resolveTeachingFlow } = await flowRuntime();
    const proposed = withLeafModes(leafCollage);

    expect(proposed.phases.map((phase) => phase.key)).toEqual(
      leafCollage.phases.map((phase) => phase.key)
    );
    expect(resolveTeachingFlow(proposed)).toEqual([
      { phaseIndex: 0, phaseKey: "collect-1", mode: "present" },
      { phaseIndex: 1, phaseKey: "create-2", mode: "work" },
      { phaseIndex: 2, phaseKey: "glue-3", mode: "work" },
      { phaseIndex: 3, phaseKey: "present-4", mode: "gather" },
      { phaseIndex: 4, phaseKey: "circle", mode: "gather" },
    ]);
  });

  it("invalidates v2 index saves when a migrated lesson removes its injected settle phase", () => {
    expect(
      parseRunProgress(
        JSON.stringify({
          version: 2,
          ownerScope: "class:willow",
          sessionId: leafCollage.id,
          location: { kind: "phase", phaseIndex: 2, pageIndex: 0 },
          startedAt: 1_755_000_000_000,
          pausedAt: null,
          pausedMs: 0,
          ability: "y1",
          condition: null,
        }),
        { ownerScope: "class:willow", sessionId: leafCollage.id }
      )
    ).toBeNull();
  });

  it("derives mode after restoring an existing phase-index resume", async () => {
    const { teachingModeAt } = await flowRuntime();
    const proposed = withLeafModes(leafCollage);
    const common = {
      version: 3,
      ownerScope: "class:willow",
      sessionId: proposed.id,
      startedAt: 1_755_000_000_000,
      pausedAt: null,
      pausedMs: 0,
      ability: "y1",
      condition: null,
    } as const;

    const work = parseRunProgress(
      JSON.stringify({ ...common, location: { kind: "phase", phaseIndex: 2, pageIndex: 0 } }),
      { ownerScope: common.ownerScope, sessionId: common.sessionId }
    );
    const gather = parseRunProgress(
      JSON.stringify({ ...common, location: { kind: "phase", phaseIndex: 4, pageIndex: 0 } }),
      { ownerScope: common.ownerScope, sessionId: common.sessionId }
    );

    expect(work?.location.kind).toBe("phase");
    expect(gather?.location.kind).toBe("phase");
    expect(teachingModeAt(proposed, 0)).toBe("present");
    expect(teachingModeAt(proposed, 2)).toBe("work");
    expect(teachingModeAt(proposed, 4)).toBe("gather");
  });

  it("uses authored data, position and block kind—not lesson-title framing", async () => {
    const { resolveTeachingFlow } = await flowRuntime();
    const neutral = {
      ...countingLife,
      settle: false,
      phases: [
        {
          key: "alpha",
          title: "Anything",
          blocks: [{ type: "say-aloud", text: "Here is what we are doing." }],
        },
        {
          key: "beta",
          title: "Also anything",
          blocks: [{ type: "say-aloud", text: "Try it together." }],
        },
        {
          key: "omega",
          title: "One more arbitrary title",
          blocks: [{ type: "circle-question", text: "What did your class make?" }],
        },
      ],
    } as Session;

    expect(resolveTeachingFlow(neutral)).toEqual([
      { phaseIndex: 0, phaseKey: "alpha", mode: "present" },
      { phaseIndex: 1, phaseKey: "beta", mode: "work" },
      { phaseIndex: 2, phaseKey: "omega", mode: "gather" },
    ]);
  });
});
