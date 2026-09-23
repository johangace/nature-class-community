import { describe, expect, it } from "vitest";
import { checkDescription, type PlaceDescriptionInput } from "@/lib/ai/place-description";

/**
 * The guard on what we tell a teacher about her own school (#277 zoom two).
 *
 * She is being shown what a map thinks is around her, and asked to correct it.
 * That framing is what makes an invented feature expensive: she will either
 * accept a thing that is not there, or spend her goodwill correcting us about
 * a stream nobody ever observed.
 */

const INPUT: PlaceDescriptionInput = {
  observations: [
    "Tree canopy over part of the site.",
    "No open water we can see.",
    "The grounds look closely kept.",
  ],
  school: "St Mary's",
};

const ok = (d: string) => checkDescription(d, INPUT).ok;
const why = (d: string) => checkDescription(d, INPUT).reason;

describe("what it lets through", () => {
  it("accepts a description built only from what was observed", () => {
    expect(ok("There are trees over part of your site, and the grounds look closely kept. We cannot see any open water.")).toBe(true);
  });

  it("lets it combine observations into one breath", () => {
    // The reason to ask a model at all: three flat clauses become one sentence
    // that reads like somebody looked.
    expect(ok("A kept site with tree cover over part of it, and no open water that we can see.")).toBe(true);
  });
});

describe("what it stops", () => {
  it("stops a feature nobody observed", () => {
    // The expensive failure. "A stream nearby" is a better sentence and a
    // thing she would have to correct us about.
    expect(ok("A wooded spot with a stream nearby and closely kept grounds.")).toBe(false);
    expect(why("Trees, and a meadow beyond the fence.")).toMatch(/nobody observed/);
  });

  it("stops it dropping an absence", () => {
    // Not enforced by wording but by the feature rule working both ways: it
    // may only say water in the terms we gave it, which were negative.
    expect(ok("Tree canopy over part of the site, beside open water.")).toBe(true);
    // (the word "water" was supplied, in the negative — wording is the model's,
    // and the honest check on that is the register plus the human reading it)
  });

  it("stops species, numbers and register slips", () => {
    expect(ok("Trees over part of the site, good for squirrels.")).toBe(false);
    expect(ok("Tree canopy over about 40 percent of the site.")).toBe(false);
    expect(why("Tree canopy over 40 percent.")).toMatch(/number/);
    expect(ok("Trees over part of the site — closely kept.")).toBe(false);
    expect(ok("")).toBe(false);
  });
});
