import { loadPrompt } from "@/lib/ai/prompt-registry";
import { describe, expect, it } from "vitest";
import {
  checkNote,
  normaliseNote,
  TEACHER_LIMITS,
  WHAT_LIMITS,
  CHILD_LIMITS,
  type SpeciesNoteInput,
} from "@/lib/ai/species-note";
import { namesTheTaxon, trimArticle } from "@/lib/outside/species-source";

/**
 * The guard on what a species profile tells a teacher (#218).
 *
 * Two failures cost differently. An invented fact gets repeated to a class as
 * though we had checked it. A note explaining why the species is on her list
 * is the thing Johan struck twice, most recently on 2026-08-18 against "This
 * is on the list because the season and the region say it should be about" —
 * the app talking about itself on the one surface built to talk about the
 * animal.
 */

const ARTICLE = [
  "The short-toed snake eagle (Circaetus gallicus) is a medium-sized bird of prey in the family Accipitridae.",
  "Description:",
  "Adults are 59 to 70 cm long with a 162 to 195 cm wingspan. They can be recognised by their predominantly white underside and an owl-like rounded head with bright yellow eyes.",
  "Behaviour:",
  "It spends more time on the wing than most of its genus, soaring over hill slopes and hunting from heights of up to 500 m. When quartering open country it frequently hovers like a kestrel.",
  "Diet:",
  "It feeds almost entirely on reptiles, mostly snakes, which it swallows whole after killing them on the ground.",
].join("\n");

const INPUT: SpeciesNoteInput = {
  commonName: "Short-toed Snake-Eagle",
  scientificName: "Circaetus gallicus",
  source: { title: "Short-toed snake eagle", url: "https://example.org", text: ARTICLE },
};

const ok = (d: string, l = WHAT_LIMITS) => checkNote(d, INPUT, l).ok;
const why = (d: string, l = WHAT_LIMITS) => checkNote(d, INPUT, l).reason;

describe("what it lets through", () => {
  it("accepts a note built only from the article", () => {
    expect(
      ok(
        "A medium-sized bird of prey that hunts on the wing. It is pale underneath, with a rounded, owl-like head and bright yellow eyes. It eats almost nothing but reptiles."
      )
    ).toBe(true);
  });

  it("accepts the habit note Johan asked for in place of the method paragraph", () => {
    expect(
      ok(
        "It hovers in one spot like a kestrel while it searches the ground, then swallows a snake whole. Worth watching for that pause in the air.",
        TEACHER_LIMITS
      )
    ).toBe(true);
  });

  it("keeps a number the article actually carries", () => {
    expect(ok("Its wings span up to 195 cm, wider than most children are tall.")).toBe(true);
  });
});

describe("what it stops", () => {
  it("stops the paragraph that explains our own method", () => {
    // Verbatim, the line Johan struck.
    expect(
      ok(
        "This is on the list because the season and the region say it should be about, not because it has a nearby record.",
        TEACHER_LIMITS
      )
    ).toBe(false);
    expect(why("It has no sightings this year.", TEACHER_LIMITS)).toMatch(/our own method/);
    expect(why("Recorded near the school in past years.", TEACHER_LIMITS)).toMatch(
      /our own method|about her place/
    );
  });

  it("stops a claim about her place or her day", () => {
    expect(ok("Your school sits inside its summer range.")).toBe(false);
    expect(why("It may be hunting near here today.")).toMatch(/about her place/);
  });

  it("stops a number the article does not carry", () => {
    // The expensive shape: plausible, well-formed, and repeated to a class.
    expect(ok("It can live for 17 years and lays 4 eggs.")).toBe(false);
    expect(why("It weighs about 9 kg.")).toMatch(/number the article does not/);
  });

  it("stops register slips and empties", () => {
    expect(ok("A bird of prey — it eats snakes.")).toBe(false);
    expect(ok("It eats snakes!")).toBe(false);
    expect(ok("")).toBe(false);
    expect(why(`It eats snakes. ${"Very long indeed. ".repeat(60)}`)).toMatch(
      /too (long|many words)/
    );
  });
});

describe("the one dash we rewrite instead of rejecting", () => {
  /**
   * Found live on Myathropa florea: the model copied the article's "7-12 mm"
   * range with its en dash, and the no-dash rule threw away a good draft. A
   * dash between two digits is a range, not a clause separator.
   */
  const FLY: SpeciesNoteInput = {
    commonName: "Yellow-haired Sun Fly",
    scientificName: "Myathropa florea",
    source: {
      title: "Myathropa florea",
      url: "https://example.org",
      text: "Myathropa florea is a common hoverfly. The species has a wing length of 7\u201312 mm and two light bands to the thorax.",
    },
  };

  it("rewrites a numeric range and lets the draft through", () => {
    const drafted = normaliseNote("A small hoverfly with a wing length of 7\u201312 mm.");
    expect(drafted).toBe("A small hoverfly with a wing length of 7 to 12 mm.");
    expect(checkNote(drafted, FLY, WHAT_LIMITS).ok).toBe(true);
  });

  it("still rejects a dash used to join clauses", () => {
    // The rule this exists to keep. Repairing these would end the rule.
    expect(normaliseNote("A hoverfly \u2014 yellow and black.")).toBe(
      "A hoverfly \u2014 yellow and black."
    );
    expect(ok("A hoverfly \u2014 yellow and black.")).toBe(false);
  });
});

describe("the article we hand the model", () => {
  it("drops the taxonomy and etymology a class cannot use", () => {
    const trimmed = trimArticle(
      [
        "The short-toed snake eagle is a bird of prey.",
        "== Taxonomy ==",
        "Formally described in 1788 by Johann Friedrich Gmelin.",
        "== Behaviour ==",
        "It hovers like a kestrel.",
        "== References ==",
        "Citations here.",
      ].join("\n")
    );
    expect(trimmed).toContain("hovers like a kestrel");
    expect(trimmed).not.toContain("Gmelin");
    expect(trimmed).not.toContain("Citations here");
  });

  it("refuses an article that does not name the taxon we asked about", () => {
    // The one failure nothing downstream could catch: a redirect landing on a
    // different animal produces a confident, well-sourced, wrong profile.
    expect(namesTheTaxon(ARTICLE, "Circaetus gallicus", "Short-toed Snake-Eagle")).toBe(true);
    expect(namesTheTaxon(ARTICLE, "Vespa crabro", "European Hornet")).toBe(false);
  });

  it("will not accept a common-name match in place of the scientific name", () => {
    const decoy =
      "The bald eagle (Haliaeetus leucocephalus) is a bird of prey. Snake-eagles are a separate group.";
    expect(namesTheTaxon(decoy, "Circaetus gallicus", "Short-toed Snake-Eagle")).toBe(false);
  });
});

/**
 * THE DEFECT CLASS THAT BROKE A LIVE PROFILE.
 *
 * Warming the teacher note's brief also dropped its word count out of the
 * prompt, while the guard kept capping at forty-five. The model had no target,
 * wrote fifty to sixty good words, and three drafts out of three were thrown
 * away on length — and because the pair is both-or-neither, production showed
 * "This is a plant."
 *
 * A cap the writer cannot see is not a cap. This watches the two agree.
 */
describe("the prompt states the limits the guard enforces", () => {
  // The prompt now lives in prompts/species-note.md, so this asserts the
  // COMPOSED text — the file with its variables filled from the very
  // constants checkNote enforces. Reading the file raw would pass while the
  // pair silently diverged, which is the bug this whole block exists for.
  const composed = async (): Promise<string> => {
    const p = loadPrompt("species-note", {
      whatWords: String(WHAT_LIMITS.words - 5),
      teacherWords: String(TEACHER_LIMITS.words - 5),
      childWords: String(CHILD_LIMITS.words - 5),
      childChars: String(CHILD_LIMITS.chars - 20),
    });
    if (!p) throw new Error("species-note prompt failed to load");
    return p.system;
  };

  it("names the child word and character budgets", async () => {
    expect(loadPrompt("species-learning", { childWords: String(CHILD_LIMITS.words - 5), childChars: String(CHILD_LIMITS.chars - 20) })?.system).toContain(`at most ${CHILD_LIMITS.words - 5} words and ${CHILD_LIMITS.chars - 20} characters`);
  });

  it("names a word count for each field", async () => {
    expect(await composed()).toMatch(/under \d+ words/i);
    expect((await composed()).match(/under (\d+) words/gi) ?? []).toHaveLength(2);
  });

  it("asks for less than it will accept, for both fields", async () => {
    const asked = [...(await composed()).matchAll(/under (\d+) words/gi)].map((m) => Number(m[1]));
    expect(asked).toHaveLength(2);
    const [what, teacher] = asked;
    // Asked-for under enforced, so an on-brief draft is never rejected on
    // length. Anything at or above the cap is the bug this test exists for.
    expect(what).toBeLessThan(WHAT_LIMITS.words);
    expect(teacher).toBeLessThan(TEACHER_LIMITS.words);
  });

  it("gives the teacher note room for the delightful thing it now asks for", () => {
    // Measured on real drafts: heather honey, a wood pigeon's display flight
    // and a hoverfly's fading colour all land between fifty and sixty words.
    expect(TEACHER_LIMITS.words).toBeGreaterThanOrEqual(65);
  });
});
