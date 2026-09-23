import { describe, expect, it } from "vitest";
import { doorQuestions } from "@/lib/lesson/door";
import { phaseMoments } from "@/lib/run/phase-moments";
import { getSession, loadPack } from "@/lib/pack";
import type { Phase } from "@/schema/pack";

/**
 * The Introduction asks the door questions on the board (#1004). #1008 gave
 * the minibeast hunt a second one by copying the Engage phase's own spoken
 * line and, by repo practice, left the authored line in the phase. The class
 * was then asked "What is your favourite minibeast and why?" at the board and
 * again as the first thing outside. `phaseMoments` now takes what the board
 * already asked and drops a spoken line that says the same words.
 */

const phase = (blocks: Phase["blocks"]): Phase => ({ key: "engage", title: "Engage", blocks });

const spoken = (moments: ReturnType<typeof phaseMoments>) =>
  moments.flatMap((moment) =>
    moment.blocks.flatMap((block) => (block.type === "say-aloud" ? [block.text] : []))
  );

describe("a spoken line the board already asked", () => {
  it("is not asked again on the phase page", () => {
    const moments = phaseMoments(
      phase([
        { type: "say-aloud", text: "What minibeasts do you know? Can you name them?" },
        { type: "say-aloud", text: "What is your favourite minibeast and why?" },
      ]),
      ["What is your favourite minibeast and why?"]
    );
    expect(spoken(moments)).toEqual(["What minibeasts do you know? Can you name them?"]);
  });

  it("compares words, not bytes", () => {
    const moments = phaseMoments(
      phase([{ type: "say-aloud", text: "What is your favourite minibeast, and why?" }]),
      ["what is your favourite minibeast and why"]
    );
    expect(spoken(moments)).toEqual([]);
  });

  it("keeps a line that only shares an opening with the question", () => {
    const moments = phaseMoments(
      phase([{ type: "say-aloud", text: "What is your favourite minibeast and where does it live?" }]),
      ["What is your favourite minibeast and why?"]
    );
    expect(spoken(moments)).toHaveLength(1);
  });

  it("never touches a teacher note, and never blanks a phase that keeps other lines", () => {
    const moments = phaseMoments(
      phase([
        { type: "teacher-note", text: "What is your favourite minibeast and why?" },
        { type: "say-aloud", text: "What is your favourite minibeast and why?" },
      ]),
      ["What is your favourite minibeast and why?"]
    );
    expect(moments).toHaveLength(1);
    expect(moments[0]?.blocks.map((block) => block.type)).toEqual(["teacher-note"]);
  });

  it("changes nothing when the board asked nothing", () => {
    const p = phase([{ type: "say-aloud", text: "What is your favourite minibeast and why?" }]);
    expect(phaseMoments(p)).toEqual(phaseMoments(p, []));
    expect(spoken(phaseMoments(p))).toHaveLength(1);
  });
});

describe("the minibeast hunt, as shipped", () => {
  it("asks the favourite-minibeast question once, at the board", () => {
    const summer = loadPack("summer");
    const session = getSession(summer, "summer-w2-minibeast-hunting");
    const asked = doorQuestions(session).map((entry) => entry.question);
    expect(asked).toContain("What is your favourite minibeast and why?");

    const engage = session.phases.find((p) => p.key === "engage-1");
    if (!engage) throw new Error("the minibeast hunt lost its Engage phase");
    // Johan, 2026-09-13: the board asks what they know and their favourite;
    // outside opens with the woodlouse question, and only that.
    expect(asked).toContain("What minibeasts do you know? Can you name them?");
    const outside = spoken(phaseMoments(engage, asked));
    expect(outside).toEqual(["If you were the size of a woodlouse, where would you hide?"]);
    // The authored line is still in the pack, where the print and pre-reading read it.
    expect(engage.blocks.some((b) => b.type === "say-aloud" && b.text === "What is your favourite minibeast and why?")).toBe(true);
  });
});
