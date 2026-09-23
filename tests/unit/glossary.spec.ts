import { describe, expect, it } from "vitest";
import { markTerms, orderTerms } from "@/lib/glossary";
import type { PrimerTerm } from "@/schema/pack";

/**
 * The matcher behind the runner's live glossary (#350).
 *
 * The cost of a wrong mark lands on a teacher reading to a class: a word
 * marked as teachable that is not the authored word is her explaining the
 * wrong thing out loud with thirty children watching. The same greedy-match
 * trap already cost a day on the cast note index (lib/cast/read.ts), where an
 * exact match found nothing and the loose fix paired the wrong note to the
 * wrong animal.
 */

const term = (t: string, definition = "a meaning"): PrimerTerm => ({
  term: t,
  definition,
});

const marked = (text: string, terms: PrimerTerm[]) =>
  markTerms(text, terms)
    .filter((s) => s.kind === "term")
    .map((s) => s.text);

describe("what it marks", () => {
  it("marks the authored word where it appears", () => {
    expect(marked("Look at the bud on that branch.", [term("bud")])).toEqual(["bud"]);
  });

  it("finds a plural of a singular term, and keeps the text as written", () => {
    // The reveal shows the authored "seed"; the sentence still reads "seeds".
    expect(marked("Count the seeds in your hand.", [term("seed")])).toEqual(["seeds"]);
    expect(marked("Watch the finches.", [term("finch")])).toEqual(["finches"]);
  });

  it("marks regardless of case, without redrawing the word", () => {
    expect(marked("Buds open in spring.", [term("bud")])).toEqual(["Buds"]);
  });

  it("marks a phrase whole rather than the word inside it", () => {
    const terms = [term("leaf"), term("leaf litter")];
    expect(marked("Sift the leaf litter carefully.", terms)).toEqual(["leaf litter"]);
  });

  it("marks several different terms in one passage", () => {
    expect(marked("A bud, a seed, and some moss.", [term("bud"), term("seed"), term("moss")]))
      .toEqual(["bud", "seed", "moss"]);
  });
});

describe("what it refuses to mark", () => {
  it("never marks inside a longer word", () => {
    // The failure that would put a footnote under "buddy".
    expect(marked("She sat with her buddy.", [term("bud")])).toEqual([]);
    expect(marked("A seedling in a pot.", [term("seed")])).toEqual([]);
    expect(marked("He was mossy from the rain.", [term("moss")])).toEqual([]);
  });

  it("strips nothing from the front of a word", () => {
    expect(marked("The sunbud is not a word.", [term("bud")])).toEqual([]);
  });

  it("does not turn a plural term into its own longer plural", () => {
    // "grass" ends in s already, so the inflection rule is off for it.
    expect(marked("The grasses were tall.", [term("grass")])).toEqual([]);
    expect(marked("The grass was tall.", [term("grass")])).toEqual(["grass"]);
  });

  it("marks a term once per passage, not every time it occurs", () => {
    // A second mark on the same word is noise around the first, not a second
    // thing to learn.
    expect(marked("A seed, then another seed, then a third seed.", [term("seed")]))
      .toEqual(["seed"]);
  });

  it("returns the passage untouched when there is no glossary", () => {
    const segments = markTerms("Nothing to mark here.", []);
    expect(segments).toEqual([{ kind: "text", text: "Nothing to mark here." }]);
  });

  it("returns one plain segment when nothing matched, so the render is unchanged", () => {
    const segments = markTerms("Nothing to mark here.", [term("bud")]);
    expect(segments).toEqual([{ kind: "text", text: "Nothing to mark here." }]);
  });
});

describe("the passage survives being split", () => {
  it("puts the text back together exactly, marks and all", () => {
    const text = "Sift the leaf litter, then count the seeds you find.";
    const rebuilt = markTerms(text, [term("leaf litter"), term("seed")])
      .map((s) => s.text)
      .join("");
    expect(rebuilt).toBe(text);
  });

  it("tries longer terms first and drops a duplicate entry", () => {
    const ordered = orderTerms([term("bud"), term("leaf litter"), term("BUD")]);
    expect(ordered.map((t) => t.term)).toEqual(["leaf litter", "bud"]);
  });
});
