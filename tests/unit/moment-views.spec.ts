import { describe, expect, it } from "vitest";
import { getSession, loadPack } from "@/lib/pack";
import { groupMoments, groupViews } from "@/lib/moments";
import type { Block } from "@/schema/pack";

const note = (text: string): Block => ({ type: "teacher-note", text }) as Block;
const say = (text: string): Block => ({ type: "say-aloud", text }) as Block;

/**
 * The isolating case for #326: a note written to set up a line must be read
 * WITH that line, not on the screen before it.
 */
describe("groupViews", () => {
  it("attaches a leading quiet block forward to the anchor it sets up", () => {
    const views = groupViews([note("Encourage children to look up."), say("What can you see?")]);

    expect(views).toHaveLength(1);
    expect(views[0]?.blocks.map((block) => block.type)).toEqual(["teacher-note", "say-aloud"]);
  });

  it("is the change: groupMoments still splits the same two blocks", () => {
    // The legacy runner is Johan's side-by-side control (#291) and reads
    // through groupMoments, so this is the mutation proof that the two
    // groupings differ rather than one silently having become the other.
    const blocks = [note("Encourage children to look up."), say("What can you see?")];

    expect(groupMoments(blocks)).toHaveLength(2);
    expect(groupViews(blocks)).toHaveLength(1);
  });

  it("keeps a note that follows a line on that line's view, not the next one", () => {
    const views = groupViews([
      say("What can you see?"),
      note("Give them a moment."),
      say("What can you hear?"),
    ]);

    expect(views).toHaveLength(2);
    expect(views[0]?.blocks.map((block) => block.type)).toEqual(["say-aloud", "teacher-note"]);
    expect(views[1]?.blocks.map((block) => block.type)).toEqual(["say-aloud"]);
  });

  it("gives trailing quiet blocks with no anchor to attach to their own view", () => {
    const views = groupViews([note("Pack the magnifiers away.")]);

    expect(views).toHaveLength(1);
    expect(views[0]?.blocks.map((block) => block.type)).toEqual(["teacher-note"]);
  });

  it("collapses the authored See phase to one screen", () => {
    // Real pack data, not a fixture: the phase Johan screenshotted.
    const session = getSession(loadPack("summer"), "summer-w1-counting-life");
    const see = session.phases.find((phase) => phase.title === "See");

    expect(see).toBeDefined();
    expect(groupMoments(see!.blocks)).toHaveLength(2);
    expect(groupViews(see!.blocks)).toHaveLength(1);
  });
});
