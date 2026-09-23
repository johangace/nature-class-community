import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shelfRangeLine } from "@/lib/ability";

/**
 * THE PICKER SAYS WHAT THE SHELF IS WRITTEN FOR (#873).
 *
 * "Have more grade options beyond Grade 1." The ladder stops where the
 * authored sessions stop. Until the shelf grows, the honest answer is to
 * say so where the ladder is picked, in the reader's own grade names and
 * never as an age (the 08-31 teacher ruling), so a teacher of older
 * children learns it in a second rather than in a lesson that reads too
 * young.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the range line", () => {
  it("names the shelf's ends in the reader's grade names", () => {
    expect(shelfRangeLine("uk")).toBe("Lessons are written for Reception to Year 2.");
    expect(shelfRangeLine("us")).toBe("Lessons are written for Pre-K to Grade 1.");
  });

  it("never states an age", () => {
    expect(shelfRangeLine("uk")).not.toMatch(/\bages?\s*\d/i);
    expect(shelfRangeLine("us")).not.toMatch(/\bages?\s*\d/i);
  });

  it("keeps new group age independent of the authored grade range", () => {
    expect(read("app/start/StartFlow.tsx")).toContain("What age range?");
    expect(read("app/start/StartFlow.tsx")).not.toContain("abilityOptions(locale)");
    expect(read("app/classes/GroupFields.tsx")).toContain("What age range?");
    expect(read("app/classes/page.tsx")).toContain("abilityLabel(band, locale)");
  });
});
