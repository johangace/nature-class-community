import { describe, expect, it } from "vitest";
import { MIN_ANSWERS, hasSignal, termSignal } from "@/lib/journal";
import type { ReflectionRecord } from "@/lib/journal";

/**
 * The journal reads a term of close taps back to the teacher who gave them
 * (#327). Everything worth testing here is a refusal: the page must not print
 * a finding it does not have, because it prints in the product's own voice and
 * a teacher has no way to check it except by counting the entries herself.
 */

const empty: ReflectionRecord = {
  mood: null,
  happenings: [],
  timing: null,
  moreOf: null,
};

const record = (over: Partial<ReflectionRecord>): ReflectionRecord => ({
  ...empty,
  ...over,
});

describe("termSignal", () => {
  it("says nothing at all about a term with no reflections", () => {
    const signal = termSignal([empty, empty, empty, empty]);
    expect(signal.reflected).toBe(0);
    expect(hasSignal(signal)).toBe(false);
  });

  it("stays silent under three answers, however lopsided", () => {
    const two = [record({ moreOf: "arts" }), record({ moreOf: "arts" })];
    expect(MIN_ANSWERS).toBe(3);
    expect(termSignal(two).moreOf).toBeNull();

    const three = [...two, record({ moreOf: "arts" })];
    expect(termSignal(three).moreOf).toEqual({
      words: "arts",
      count: 3,
      of: 3,
    });
  });

  it("says nothing when the top two are level", () => {
    const tied = [
      record({ moreOf: "arts" }),
      record({ moreOf: "arts" }),
      record({ moreOf: "making" }),
      record({ moreOf: "making" }),
    ];
    expect(termSignal(tied).moreOf).toBeNull();

    // One more tips it, and then it may speak.
    const broken = [...tied, record({ moreOf: "making" })];
    expect(termSignal(broken).moreOf).toEqual({
      words: "making",
      count: 3,
      of: 5,
    });
  });

  it("counts each happening as its own answer, since a session reports several", () => {
    const rows = [
      record({ happenings: ["kids-engaged", "good-weather"] }),
      record({ happenings: ["kids-engaged", "too-cold"] }),
      record({ happenings: ["kids-engaged"] }),
    ];
    // Five answers across three sessions; the denominator is answers, not rows.
    expect(termSignal(rows).happening).toEqual({
      words: "kids engaged",
      count: 3,
      of: 5,
    });
  });

  it("never counts a skipped question as a vote", () => {
    const rows = [
      record({ timing: "just-right" }),
      record({ timing: "just-right" }),
      empty,
      empty,
      empty,
    ];
    // Three answered would be needed; only two exist, and the blanks are not
    // evidence of anything.
    expect(termSignal(rows).timing).toBeNull();
    expect(termSignal(rows).reflected).toBe(2);
  });

  it("counts a session as reflected on any single tap", () => {
    const rows = [
      record({ mood: "calm" }),
      record({ happenings: ["quiet-group"] }),
      record({ timing: "shorter" }),
      record({ moreOf: "gardening" }),
      empty,
    ];
    expect(termSignal(rows).reflected).toBe(4);
  });

  it("reads a retired mood token rather than dropping the row", () => {
    // Rows written before the five-word vocabulary hold "landed-well". The
    // journal is a record; a record does not hide what it holds.
    const rows = [
      record({ mood: "landed-well" }),
      record({ mood: "landed-well" }),
      record({ mood: "landed-well" }),
    ];
    expect(termSignal(rows).mood?.words).toBe("landed well");
  });

  it("reports each line with its own denominator", () => {
    const rows = [
      record({ mood: "calm", timing: "just-right" }),
      record({ mood: "calm", timing: "just-right" }),
      record({ mood: "calm" }),
      record({ mood: "difficult", timing: "just-right" }),
    ];
    const signal = termSignal(rows);
    expect(signal.mood).toEqual({ words: "calm", count: 3, of: 4 });
    // Timing was answered three times, not four: its total is its own.
    expect(signal.timing).toEqual({ words: "just right", count: 3, of: 3 });
  });
});
