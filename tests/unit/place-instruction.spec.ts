import { describe, expect, it } from "vitest";
import {
  checkInstruction,
  hasGroundToStandOn,
  type PlaceInstructionInput,
} from "@/lib/ai/place-instruction";
import { habitatsFromFeatures } from "@/lib/look-for";

/**
 * The guard between the model and a child's ear (#266).
 *
 * Johan, 2026-08-17: *"each context lesson place needs to pass by ai"*, *"no
 * deterministic machine!"*
 *
 * So the sentence is written by the model. That is the right call and it is
 * also the reason this file exists: once a model writes the words, the only
 * thing standing between it and a four-year-old is what we check afterwards.
 *
 * EVERY RULE IS CHECKED ON THE OUTPUT, NOT ASKED FOR IN THE PROMPT. A ban
 * stated in a prompt is an invisible regex — it is a request, and a request is
 * not a guarantee. These are assertions about what actually came back, and a
 * draft that fails any of them is discarded in favour of the authored line.
 *
 * The failing cases below are the ones that matter. A guard nobody has watched
 * reject anything is a guard nobody knows works.
 */

const CONTEXT: PlaceInstructionInput = {
  authored: "Take 10 minutes to explore. Look under logs, on leaves, in trees, and up in the sky.",
  aliveIn: ["grassland", "hedgerow"],
  reachable: ["grassland", "hedgerow", "playing_field"],
  objective: "Notice the small creatures living close to the ground.",
};

const ok = (draft: string) => checkInstruction(draft, CONTEXT).ok;
const why = (draft: string) => checkInstruction(draft, CONTEXT).reason;

describe("what the guard lets through", () => {
  it("accepts a plain instruction using only the places we supplied", () => {
    expect(ok("Take ten minutes. Look low in the grass and along the hedge, and up at the sky.")).toBe(true);
  });

  it("accepts a shorter one", () => {
    expect(ok("Look in the long grass and along the hedge.")).toBe(true);
  });
});

describe("what it stops, which is the whole point", () => {
  it("stops a species the model reached for", () => {
    // The invented-nature failure, arriving in the one place a model is most
    // tempted: a concrete creature makes a better sentence than a habitat.
    expect(ok("Look in the grass for beetles and along the hedge.")).toBe(false);
    expect(why("Look in the grass for beetles.")).toMatch(/species/);
    for (const draft of [
      "Look in the grass. You might see a ladybird.",
      "Look along the hedge for blackberries.",
      "Look low in the grass where the worms are.",
      "Look under the oak.",
    ]) {
      expect(ok(draft), draft).toBe(false);
    }
  });

  it("stops a place nobody gave it", () => {
    // The model has no way to know this school has no pond. We do, and this is
    // where that knowledge is enforced rather than hoped for.
    expect(ok("Look at the water's edge and in the long grass.")).toBe(false);
    expect(why("Look at the pond and in the grass.")).toMatch(/not supplied/);
    expect(ok("Look in the woodland and along the hedge.")).toBe(false);
  });

  it("stops the register slipping", () => {
    expect(ok("Look in the grass — and along the hedge.")).toBe(false);
    expect(ok("Look in the grass and along the hedge!")).toBe(false);
    expect(ok("LOOK in the grass and along the hedge.")).toBe(false);
    expect(why("Look in the grass — and along the hedge.")).toMatch(/em dash/);
  });

  it("stops it running long, because a teacher says this out loud", () => {
    const long =
      "Take a really good long slow careful ten minutes to explore every single part of your grounds today, looking low down in the grass and then along the hedge and then up above you at the wide open sky.";
    expect(ok(long)).toBe(false);
    expect(why(long)).toMatch(/long|words/);
  });

  it("stops markup, links and empties", () => {
    expect(ok("")).toBe(false);
    expect(ok("   ")).toBe(false);
    expect(ok("Look in the grass <b>now</b>.")).toBe(false);
    expect(ok("Look in the grass, see https://example.com")).toBe(false);
  });
});

describe("the boundary the guard assumes", () => {
  it("permits a place that is reachable even if the week did not name it", () => {
    // Reachable and alive are two different facts and either can license a
    // place. A school's own playing field does not stop existing because the
    // phenology file said nothing about it this week.
    expect(ok("Look out on the field and along the hedge.")).toBe(true);
  });

  it("reads a school's own features as places it may name", () => {
    // The teacher's half of the world (#277). A log pile is woodland even in a
    // tarmac yard, which no map and no climate could know.
    const withLogs: PlaceInstructionInput = {
      ...CONTEXT,
      reachable: habitatsFromFeatures(["a log pile", "a pond"]),
    };
    expect(checkInstruction("Look under the logs in the woodland corner.", withLogs).ok).toBe(true);
    expect(checkInstruction("Look at the water's edge.", withLogs).ok).toBe(true);
    // And still not a place they never mentioned.
    expect(checkInstruction("Look along the coast.", withLogs).ok).toBe(false);
  });
});

describe("when the model must not be asked at all", () => {
  it("refuses to draft with no grounded facts at all", () => {
    // Found by mutation: deleting this rule left every test green, because
    // with no API key the availability check returned null anyway and hid it.
    // A rule that cannot be observed failing is a comment, so it became its
    // own function and this is the test that actually watches it work.
    expect(hasGroundToStandOn({ ...CONTEXT, aliveIn: [], reachable: [] })).toBe(false);
    expect(hasGroundToStandOn({ ...CONTEXT, aliveIn: [], reachable: ["garden"] })).toBe(true);
    expect(hasGroundToStandOn({ ...CONTEXT, aliveIn: ["meadow"], reachable: [] })).toBe(true);
  });

  it("returns null when there is no model configured", async () => {
    // The ordinary case in CI and in any checkout without a key. The authored
    // line renders and nothing anywhere has to know why.
    const { draftPlaceInstruction } = await import("@/lib/ai/place-instruction");
    expect(await draftPlaceInstruction(CONTEXT)).toBeNull();
  });
});
