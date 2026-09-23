import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DoorSlot } from "@/app/run/DoorSlot";
import {
  checkDoorLine,
  doorLineFacts,
  draftDoorLine,
  type DoorLineFacts,
} from "@/lib/ai/door-line";
import { resolveDoor } from "@/lib/lesson/door";
import type { CastMember } from "@/lib/cast/member";

/**
 * THE JOINING SENTENCE AT THE DOOR (#342).
 *
 * The creatures are `resolveDoor`'s. The sentence is the model's. The caption
 * above the pictures owns the CLAIM, and that third boundary is the one this
 * file exists for, because it is the one the apple line crossed: a warm
 * sentence saying "these are around your school" under a caption that says the
 * region is what we know is the same defect in better prose.
 *
 * Every test is written so that removing the rule it covers turns it red. A
 * guard has to catch the bug, not describe it.
 */

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Bramble",
    scientificName: "Rubus fruticosus",
    photoUrl: null,
    iconicTaxon: "Plantae",
    honestyTier: "regional",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
    ...over,
  };
}

/**
 * The isolating fixture. Two creatures on the screen and a lexicon of names
 * that are NOT — the generated taxon vocabulary in its second life, standing
 * in for the 413 names `speciesLexicon()` supplies in production.
 */
function facts(over: Partial<DoorLineFacts> = {}): DoorLineFacts {
  return {
    specimens: [
      { name: "Bramble", kind: "plant", photographed: true, recorded: true, safetyNote: null },
      { name: "Marmalade Hoverfly", kind: "insect", photographed: false, recorded: true, safetyNote: null },
    ],
    claim: "usually-around",
    lessonTitle: "Counting life",
    lexicon: ["Blackberry", "Barn Swallow", "Swallow", "Common Nettle", "Red Fox"],
    ...over,
  };
}

const ok = (line: string, f = facts()) => checkDoorLine(line, f).ok;
const why = (line: string, f = facts()) => checkDoorLine(line, f).reason;

describe("checkDoorLine: a good joining sentence passes", () => {
  it("accepts a warm sentence that joins the two and gives them something to notice", () => {
    expect(
      ok("The bramble is taller than you and the marmalade hoverfly is smaller than your thumbnail.")
    ).toBe(true);
  });

  it("accepts a sentence that names only one of the two", () => {
    expect(ok("Look at the bramble first, low down where the stems tangle.")).toBe(true);
  });

  it("accepts a plural of a creature on the screen", () => {
    expect(ok("Count how many marmalade hoverflies can sit along one bramble leaf.")).toBe(true);
  });
});

describe("checkDoorLine: the caption owns the claim", () => {
  /*
   * The apple line, rewritten fluently. The regional tier is showing and the
   * sentence quietly upgrades it to the school's own grounds.
   */
  it("rejects a sentence that puts the creatures at this school", () => {
    expect(why("The bramble in your grounds is where the marmalade hoverfly goes to feed")).toMatch(
      /restated the caption's claim/
    );
  });

  it("rejects nearness in any of its phrasings", () => {
    expect(ok("Bramble grows near here and the marmalade hoverfly follows it")).toBe(false);
    expect(ok("Bramble is around here and so is the marmalade hoverfly")).toBe(false);
    expect(ok("Bramble was spotted lately, and the marmalade hoverfly with it")).toBe(false);
  });

  it("rejects recency, which the caption also owns", () => {
    expect(why("Someone photographed the bramble today")).toMatch(/restated the caption's claim/);
    expect(why("The marmalade hoverfly has been recorded here recently")).toMatch(
      /restated the caption's claim/
    );
  });

  /*
   * The rule is about place and time, not about a word we dislike. A guard
   * that also banned the bare "here" would forbid a teacher saying "start
   * here", and the next person would loosen the whole regex to fix it.
   */
  /*
   * And bare "near" too, which took a live run to see. "The coot floats near"
   * places one creature against ANOTHER, which is the noticing this sentence
   * exists to do, not a claim about the reader's school.
   */
  it("leaves a creature positioned against another creature alone", () => {
    expect(ok("The bramble stands tall and the marmalade hoverfly hovers near it.")).toBe(true);
    expect(why("The bramble grows near your school")).toMatch(/restated the caption's claim/);
    expect(why("Marmalade hoverflies are nearby")).toMatch(/restated the caption's claim/);
  });

  it("leaves the bare word here alone", () => {
    expect(ok("Start with the bramble here, then look for the marmalade hoverfly on it.")).toBe(
      true
    );
  });

  it("rejects a promise that anything will be found", () => {
    expect(why("You will find a marmalade hoverfly on the bramble")).toMatch(/promised a sighting/);
    expect(why("A marmalade hoverfly is waiting on the bramble")).toMatch(/promised a sighting/);
  });
});

describe("checkDoorLine: names unchanged", () => {
  it("rejects a creature the door did not show", () => {
    expect(why("The bramble feeds the marmalade hoverfly and the red fox eats its fruit")).toMatch(
      /named a creature the door did not show: Red Fox/
    );
  });

  /*
   * The invention in correct English. "Blackberry" is a bramble's fruit and a
   * separate name in the vocabulary, and a guard anchored on the singular
   * waves the plural straight through.
   */
  it("rejects an invented creature in its plural", () => {
    expect(why("See whether the blackberries have come out on the bramble")).toMatch(
      /named a creature the door did not show: Blackberry/
    );
  });

  /*
   * The mask. A name we supplied may CONTAIN a name we did not, and without
   * taking the grounded names out of the line first the guard rejects a
   * perfectly good sentence.
   */
  it("does not trip on a shown name that contains a vocabulary name", () => {
    const f = facts({
      specimens: [{ name: "Barn Swallow", kind: "bird", photographed: true, recorded: true, safetyNote: null }],
    });
    expect(ok("Watch how the barn swallow turns without slowing down.", f)).toBe(true);
  });

  it("rejects a sentence that names none of them", () => {
    expect(why("Look up, then look down, then look up again")).toMatch(/names none/);
  });

  /*
   * THE SPOKEN FORM. Measured against the live model on 2026-08-18: seven of
   * eight drafts for the trees and minibeast doors were thrown away for
   * "naming none", and every one of them had named the creature the way a
   * five-year-old hears it. "Look at how the pedunculate oak's leaves are
   * rounder" is a sentence nobody says to a class.
   */
  it("accepts the name a teacher actually says out loud", () => {
    const f = facts({
      specimens: [
        { name: "Pedunculate Oak", kind: "plant", photographed: true, recorded: true, safetyNote: null },
        { name: "Silver Birch", kind: "plant", photographed: true, recorded: true, safetyNote: null },
      ],
    });
    expect(ok("The oak has wide leaves and the birch has leaves shaped like tiny coins.", f)).toBe(
      true
    );
  });

  /*
   * The hyphen counts as a space. Measured on a live three-creature door: three
   * of four rejections had written "the pigeon" for a "Common Wood-Pigeon", and
   * the guard threw away the only word a five-year-old would use.
   */
  it("accepts the bare word inside a hyphenated name", () => {
    const f = facts({
      specimens: [
        { name: "Common Wood-Pigeon", kind: "bird", photographed: true, recorded: true, safetyNote: null },
        { name: "Red Admiral", kind: "insect", photographed: true, recorded: true, safetyNote: null },
      ],
    });
    expect(ok("The pigeon is much rounder than the red admiral beside it.", f)).toBe(true);
  });

  /*
   * A category is not a name. "Look at the red wings on one insect and the grey
   * chest on the bird" names nothing, and the whole job of this sentence is to
   * join the creatures the class is looking at.
   */
  it("does not accept a kind word standing in for a name", () => {
    const f = facts({
      specimens: [
        { name: "Common Wood-Pigeon", kind: "bird", photographed: true, recorded: true, safetyNote: null },
        { name: "Red Admiral", kind: "insect", photographed: true, recorded: true, safetyNote: null },
      ],
    });
    expect(why("Look at the red wings on one insect and the grey chest on the bird", f)).toMatch(
      /names none/
    );
  });

  /* The head word only. "Garden" is not a spider and "Common" is not a woodlouse. */
  it("does not accept a middle word as the name", () => {
    const f = facts({
      specimens: [
        { name: "European Garden Spider", kind: "spider", photographed: false, recorded: true, safetyNote: null },
      ],
    });
    expect(why("Look along the garden wall and see what is strung across it", f)).toMatch(
      /names none/
    );
    expect(ok("Look at how the spider holds the middle of its web.", f)).toBe(true);
  });
});

describe("checkDoorLine: safety travels with the creature", () => {
  const stingy = facts({
    specimens: [
      { name: "Bramble", kind: "plant", photographed: true, recorded: true, safetyNote: "Thorns. Look, do not grab." },
      { name: "Marmalade Hoverfly", kind: "insect", photographed: false, recorded: true, safetyNote: null },
    ],
  });

  it("rejects a hand reaching for a creature we were warned about", () => {
    expect(why("Hold the bramble stem and count the marmalade hoverflies on it", stingy)).toMatch(
      /invited a hand/
    );
  });

  it("still allows looking at it", () => {
    expect(ok("Look closely at the bramble stem and the marmalade hoverfly above it.", stingy)).toBe(
      true
    );
  });

  /*
   * But a creature may act. Measured on 2026-08-18: every remaining rejection
   * in a live run was "the spider spins its web to catch its food", which is
   * the spider's own behaviour and one of the better things a class could be
   * told about it.
   */
  it("lets the creature do the catching", () => {
    const spider = facts({
      specimens: [
        {
          name: "European Garden Spider",
          kind: "spider",
          photographed: true,
          recorded: true,
          safetyNote: "Look, do not touch.",
        },
        { name: "Bramble", kind: "plant", photographed: true, recorded: true, safetyNote: null },
      ],
    });
    expect(ok("The spider spins its web by the bramble to catch its food.", spider)).toBe(true);
    // A verb that has agreed with a subject has already said the subject is
    // not the child, so the third person is not checked at all.
    expect(ok("The spider's web catches the light between the bramble's stems.", spider)).toBe(
      true
    );
    // And still stops a child being sent to do it.
    expect(why("See if you can catch one on the bramble", spider)).toMatch(/invited a hand/);
    expect(why("Hold the bramble stem and look at the spider", spider)).toMatch(/invited a hand/);
  });

  /* The same sentence is fine when nothing on the screen stings. */
  it("leaves the ordinary majority alone", () => {
    expect(ok("Hold the bramble leaf up and see the marmalade hoverfly land on it.")).toBe(true);
  });
});

describe("checkDoorLine: register", () => {
  it("rejects numbers, which are evidence for us and not copy for a class", () => {
    expect(why("Look for 2 marmalade hoverflies on the bramble")).toMatch(
      /numbers are not spoken/
    );
  });

  /*
   * The claim the digits ban misses. Nothing on this page measured how much
   * of anything is out there, so "several" is "usually around now" wearing a
   * different word.
   */
  it("rejects a claim about how much of it there is", () => {
    expect(why("Look for several marmalade hoverflies on the bramble")).toMatch(
      /claimed abundance: several/
    );
    expect(why("The bramble is covered in marmalade hoverflies")).toMatch(/claimed abundance/);
  });

  /*
   * And a woodlouse may still have lots of legs. Measured against the live
   * model on 2026-08-18: a bare quantity ban threw away "the woodlouse has a
   * long body with lots of legs", which is a shape, not a population. The
   * quantity has to be attached to a creature before it is a claim.
   */
  it("lets a creature have lots of legs", () => {
    const f = facts({
      specimens: [
        { name: "Common Woodlouse", kind: "insect", photographed: true, recorded: true, safetyNote: null },
      ],
    });
    expect(ok("The woodlouse has a long body with lots of legs underneath it.", f)).toBe(true);
  });

  /*
   * And leaves the visible count alone. At most two creatures are ever on this
   * screen, so counting THEM is counting what the class can see.
   */
  it("lets the sentence count the pictures it is holding", () => {
    expect(ok("Both of these are easy to walk past, so look at the bramble first.")).toBe(true);
  });

  /*
   * The exemption that keeps the guard from eating the lesson. "How many" is
   * the work of a counting lesson, and an abundance ban without this rejects
   * the best sentence the model can write for it.
   */
  it("lets the class be asked how many, which is the lesson", () => {
    expect(ok("Count how many marmalade hoverflies can sit along one bramble leaf.")).toBe(true);
    expect(why("Many marmalade hoverflies come to the bramble")).toMatch(/claimed abundance/);
  });

  it("rejects the marks the house voice does not use", () => {
    expect(why("The bramble — and the marmalade hoverfly on it")).toMatch(/em dash/);
    expect(why("Look at the bramble and the marmalade hoverfly!")).toMatch(/exclamation/);
    expect(why("LOOK at the bramble and the marmalade hoverfly")).toMatch(/all caps/);
  });

  it("rejects a paragraph", () => {
    expect(why(`The bramble ${"and the marmalade hoverfly ".repeat(8)}`)).toBeTruthy();
  });
});

describe("doorLineFacts: nothing on the door reaches no model", () => {
  it("returns null for the empty state rather than asking for a sentence", () => {
    const evidence = resolveDoor({ members: [], located: false });
    expect(evidence.kind).toBe("none");
    expect(doorLineFacts({ evidence, lessonTitle: "Counting life", lexicon: [] })).toBeNull();
  });

  it("returns null when only off-topic evidence survives a mapped lesson topic", () => {
    const evidence = resolveDoor({
      members: [
        member({
          commonName: "Mute Swan",
          iconicTaxon: "Aves",
          honestyTier: "recorded",
          photoUrl: "https://inat.example/swan.jpg",
          photoRole: "observation",
        }),
      ],
      located: true,
      topic: "plants",
    });

    expect(evidence.kind).toBe("none");
    expect(doorLineFacts({ evidence, lessonTitle: "Seed searchers", lexicon: [] })).toBeNull();
  });

  /*
   * nc#1012 residual. The merged door row is recorded-first, filled from the
   * region, so ONE row-level claim can no longer describe it: `claim` stays
   * the caption's ("seen-here", because that is what the heading says), and
   * the tier travels per card. Before this the regional member in a merged row
   * was handed over under a blanket "seen-here".
   */
  it("says which cards on a merged row were actually recorded here", () => {
    const evidence = resolveDoor({
      members: [
        member({
          commonName: "Common Woodlouse",
          scientificName: "Oniscus asellus",
          iconicTaxon: "Insecta",
          honestyTier: "recorded",
          photoUrl: "https://example.test/woodlouse.jpg",
        }),
        member({
          commonName: "Marmalade Hoverfly",
          scientificName: "Episyrphus balteatus",
          iconicTaxon: "Insecta",
          honestyTier: "regional",
          photoUrl: "https://example.test/hoverfly.jpg",
        }),
      ],
      located: true,
    });

    const built = doorLineFacts({ evidence, lessonTitle: "Minibeast hunting", lexicon: [] });
    expect(built).not.toBeNull();
    // The caption over the row is the seen-here one, and that is row-level.
    expect(built?.claim).toBe("seen-here");
    // The cards under it are not all the same tier, and now they say so.
    expect(built?.specimens.map((s) => [s.name, s.recorded])).toEqual([
      ["Common Woodlouse", true],
      ["Marmalade Hoverfly", false],
    ]);
  });

  /*
   * nc#1028: the sibling above only ever has one regional card to fill with,
   * so it cannot show the fill actually being CAPPED — the exact #1012 shape
   * of one recorded specimen against several regional candidates. This one
   * does, and checks the `recorded` flag per card once the row has three tiers
   * of candidate in it (one recorded, three regional, one over the cap).
   */
  it("keeps every card's own tier when regional fill reaches the cap", () => {
    const evidence = resolveDoor({
      members: [
        member({
          commonName: "Elephant Hawk-moth",
          scientificName: "Deilephila elpenor",
          iconicTaxon: "Insecta",
          honestyTier: "recorded",
          photoUrl: "https://example.test/moth.jpg",
          sortRank: 0,
        }),
        member({
          commonName: "Bramble",
          scientificName: "Rubus fruticosus",
          iconicTaxon: "Plantae",
          honestyTier: "regional",
          photoUrl: "https://example.test/bramble.jpg",
          sortRank: 1,
        }),
        member({
          commonName: "Song Thrush",
          scientificName: "Turdus philomelos",
          iconicTaxon: "Aves",
          honestyTier: "regional",
          photoUrl: "https://example.test/thrush.jpg",
          sortRank: 2,
        }),
        member({
          commonName: "Common Wasp",
          scientificName: "Vespula vulgaris",
          iconicTaxon: "Insecta",
          honestyTier: "regional",
          photoUrl: "https://example.test/wasp.jpg",
          sortRank: 3,
        }),
      ],
      located: true,
    });

    const built = doorLineFacts({ evidence, lessonTitle: "Minibeast hunting", lexicon: [] });
    expect(built).not.toBeNull();
    // Capped at three, recorded first, regional filling in its own order —
    // the fourth candidate (Common Wasp) loses to the cap.
    expect(built?.specimens.map((s) => s.name)).toEqual([
      "Elephant Hawk-moth",
      "Bramble",
      "Song Thrush",
    ]);
    // And per card, only the one that actually cleared the bar reads as
    // recorded. Neither regional fill card is ever "seen near your school".
    expect(built?.specimens.map((s) => s.recorded)).toEqual([true, false, false]);
    expect(built?.specimens.every((s) => s.photographed)).toBe(true);
  });

  it("never speaks an absence as recorded", () => {
    const evidence = resolveDoor({
      members: [
        member({
          commonName: "Common Woodlouse",
          iconicTaxon: "Insecta",
          honestyTier: "recorded",
          absent: true,
        }),
        member({ commonName: "Bramble", iconicTaxon: "Plantae" }),
      ],
      located: true,
    });
    const built = doorLineFacts({ evidence, lessonTitle: "Minibeast hunting", lexicon: [] });
    expect(built?.specimens.every((s) => s.name !== "Common Woodlouse" || !s.recorded)).toBe(true);
  });

  it("does not call a model when the resolved facts are null", async () => {
    const fetchMock = vi.fn();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(draftDoorLine(null)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("carries the kind word and the photograph flag off the resolved evidence", () => {
    const evidence = resolveDoor({
      members: [
        member({
          commonName: "Marmalade Hoverfly",
          iconicTaxon: "Insecta",
          safetyNote: "Look, do not touch.",
        }),
      ],
      located: false,
    });
    const built = doorLineFacts({ evidence, lessonTitle: "Counting life", lexicon: [] });
    expect(built?.claim).toBe("usually-around");
    expect(built?.specimens[0]).toEqual({
      name: "Marmalade Hoverfly",
      kind: "insect",
      photographed: false,
      // A regional member, and the facts say so per card (nc#1012).
      recorded: false,
      safetyNote: "Look, do not touch.",
    });
  });
});

/**
 * THE RENDER GUARD, which is the one that catches a class of bug the prompt
 * rules cannot: a sentence that passed every check, about creatures the screen
 * is no longer showing.
 */
describe("DoorSlot: the sentence must be about what is on the screen", () => {
  const evidence = resolveDoor({
    members: [member(), member({ commonName: "Marmalade Hoverfly", sortRank: 1 })],
    located: false,
  });
  const line = "The bramble is taller than you and the marmalade hoverfly is smaller than your thumbnail.";

  it("shows a line written over exactly these creatures, in this order", () => {
    const markup = renderToStaticMarkup(
      <DoorSlot evidence={evidence} line={{ line, over: ["Bramble", "Marmalade Hoverfly"] }} />
    );
    expect(markup).toContain("smaller than your thumbnail");
  });

  it("drops a line written over a different set", () => {
    const markup = renderToStaticMarkup(
      <DoorSlot evidence={evidence} line={{ line, over: ["Bramble", "Red Fox"] }} />
    );
    expect(markup).not.toContain("smaller than your thumbnail");
    // The evidence itself is unharmed: only the prose goes.
    expect(markup).toContain("Marmalade Hoverfly");
  });

  it("drops a line written over the same names in a different order", () => {
    const markup = renderToStaticMarkup(
      <DoorSlot evidence={evidence} line={{ line, over: ["Marmalade Hoverfly", "Bramble"] }} />
    );
    expect(markup).not.toContain("smaller than your thumbnail");
  });

  it("renders the door untouched when no line was drafted", () => {
    const markup = renderToStaticMarkup(<DoorSlot evidence={evidence} line={null} />);
    expect(markup).toContain("Bramble");
    expect(markup).not.toContain("thumbnail");
  });

  it("keeps the lesson's producer scope on its species links", () => {
    const markup = renderToStaticMarkup(
      <DoorSlot evidence={evidence} line={null} topic="plants" />
    );
    expect(markup).toContain('/species/rubus-fruticosus?topic=plants');
  });

  it("does not size the entity list from how many species happen to survive", () => {
    const markup = renderToStaticMarkup(<DoorSlot evidence={evidence} line={null} />);

    expect(markup).not.toContain("data-count");
    expect(markup.match(/href="\/species\//g)).toHaveLength(2);
  });
});

/**
 * REACH, by source scan.
 *
 * The defect class this repo keeps paying for is DECLARED AND UNREAD: a
 * capability that exists, is correct, is tested, and is wired to nothing.
 * `draftLookForLine` is in the tree right now with no caller. So the last
 * assertion is not about behaviour, it is about the wire: the drafter is
 * called on the page, the result is handed to the journey, and the journey
 * hands it to the door. Three edges, three greps, and a rename that breaks one
 * of them turns this red instead of silently shipping a dead file.
 */
describe("the joining sentence is wired to the page it is for", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("is drafted on the server, where the model boundary is", () => {
    const page = read("app/run/page.tsx");
    expect(page).toContain("draftDoorLine");
    expect(page).toContain("doorLineFacts");
    expect(page).toContain("speciesLexicon");
    expect(page).toContain("doorLine={doorLine}");
  });

  it("travels through the journey to the door", () => {
    const journey = read("app/run/HybridJourney.tsx");
    expect(journey).toContain("<DoorSlot");
    expect(journey).toContain("topic={primaryTopicOf(session)}");
  });
});

/**
 * A WARNING IS NOT AN INVITATION (#141 step 6).
 *
 * "The nettle has hairs that sting if you touch them" is the right thing for a
 * teacher to say about a nettle, and the guard used to refuse it: the hand
 * check fired on any appearance of "touch". Measured on the nettle fixture,
 * 3 of 30 real drafts were rejected and the rejected ones were all warnings.
 *
 * These cases are the line between the two, in both directions, because a
 * guard loosened without the reject half proved is a guard nobody can trust
 * again.
 */
describe("the hand check tells a warning from an instruction", () => {
  const nettle = {
    specimens: [
      { name: "Nettle", kind: "plant", photographed: true, recorded: true, safetyNote: "Nettle stings" },
    ],
    claim: "usually-around" as const,
    lessonTitle: "Plants that protect themselves",
    lexicon: ["Wood Pigeon", "Grey Squirrel", "Oak", "Bramble", "Nettle", "Hoverfly"],
  };

  it.each([
    "Touch the nettle's leaves and feel how rough they are.",
    "Reach out and touch the tiny hairs on the nettle.",
    "Pick up one of the nettle leaves and look closely.",
    "Stroke the nettle stem to feel the hairs.",
    "Grab the nettle and hold it up so everyone can see.",
    "Hold it near the light so the hairs show.",
    // An instruction wearing a conditional. The "if" governs an attempt, not a
    // consequence, and the first version of the warning exemption let this
    // through — the existing suite caught it before it shipped.
    "See if you can touch a leaf without being stung.",
    "Try to touch the nettle where the hairs are thinnest.",
  ])("refuses a hand on the nettle: %s", (line) => {
    expect(checkDoorLine(line, nettle).ok).toBe(false);
  });

  it.each([
    "The nettle has tiny hairs that sting if you touch them.",
    "See how the nettle's hairs prick your skin when you touch a leaf.",
    "Look at the tiny hairs all over the nettle leaf, covering it like armour.",
    "The nettle's hairs look soft, but they sting unless you leave them be.",
  ])("keeps a warning about the nettle: %s", (line) => {
    expect(checkDoorLine(line, nettle).ok).toBe(true);
  });
});
