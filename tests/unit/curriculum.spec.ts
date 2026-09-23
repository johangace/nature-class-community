import { describe, expect, it } from "vitest";
import {
  curriculumPosition,
  curriculumSequence,
  nextInSequence,
  nextUnled,
  shelfSequence,
} from "@/lib/curriculum";

/**
 * PROGRESS TODAY THROUGH THE OPEN SEASON (#55, then Johan on 2026-09-06).
 *
 * Today used to pick "the first unled session in `leadPack()`'s one pack" and
 * wrap straight back to that pack's own session one once its four were led.
 * #55 made one flat sequence across every shelf pack. Then the shelf started
 * opening one season at a time, so the sequence a class walks is the open
 * season's sessions, and the year's other seasons wait behind the month they
 * unlock. These tests pin that: what is next in September is autumn's, and
 * December brings winter's with nobody editing a file.
 *
 * Real shelf data throughout, not synthetic fixtures — the isolating case
 * this ticket names is "completing the season's last session", and a
 * synthetic pack could pass this file while the real `only` and `also`
 * narrowing or the real pack order still broke it in the app.
 */

const LONDON = 51.5;
const SEP = { date: new Date(2026, 8, 17), lat: LONDON };
const DEC = { date: new Date(2026, 11, 17), lat: LONDON };
const APR = { date: new Date(2026, 3, 17), lat: LONDON };

/** Autumn in London: Minibeast hunting borrowed from summer, then the four partner lessons on the shelf, in the partner's order. */
const AUTUMN_SEQUENCE = [
  "summer-w2-minibeast-hunting",
  "seed-searchers",
  "animal-leaf-masks",
  "nature-recycling-system",
  "conker-acorn-maths-trail",
];

/** The whole shelf, every season, in calendar order from September. */
/** Winter, built 2026-09-07 on the partner's four, in the partner's order. */
const WINTER_SEQUENCE = ["bird-watching", "making-bird-feeders", "bark-rubbings", "winter-survival-sort"];

// Spring and summer are title-only drawers for now (2026-09-07), so the year
// is autumn then winter until their lessons are built.
const YEAR_FROM_SEPTEMBER = [...AUTUMN_SEQUENCE, ...WINTER_SEQUENCE];

describe("the curriculum sequence", () => {
  it("is the open season's sessions, in shelf order", () => {
    expect(curriculumSequence(SEP).map((e) => e.session.id)).toEqual(AUTUMN_SEQUENCE);
    expect(curriculumSequence(DEC).map((e) => e.session.id)).toEqual(WINTER_SEQUENCE);
  });

  it("numbers every stop with its 0-based position in the sequence", () => {
    curriculumSequence(SEP).forEach((e, i) => expect(e.position).toBe(i));
  });

  it("offers none of spring-term's twelve while spring is a drawer of titles", () => {
    const spring = curriculumSequence(APR).filter((e) => e.pack.id === "spring-term");
    expect(spring).toEqual([]);
  });

  it("lays the whole year end to end for the questions that are not about today", () => {
    expect(shelfSequence(SEP).map((e) => e.session.id)).toEqual(YEAR_FROM_SEPTEMBER);
  });

  it("never includes a pack held back from the shelf, nor an archived session", () => {
    const packIds = new Set(shelfSequence(SEP).map((e) => e.pack.id));
    for (const held of [
      "autumn",
      "autumn-garden",
      "autumn-term",
      "winter-term",
      "summer-legacy",
    ]) {
      expect(packIds.has(held)).toBe(false);
    }
    expect(shelfSequence(SEP).map((e) => e.session.id)).not.toContain("meet-your-tree");
    expect(shelfSequence(SEP).map((e) => e.session.id)).not.toContain("leaves-and-their-trees");
  });
});

describe("first use", () => {
  it("gives a class that has led nothing the season's very first stop", () => {
    const { entry, allLed, total } = nextUnled(new Set(), curriculumSequence(SEP));
    expect(entry?.session.id).toBe("summer-w2-minibeast-hunting");
    expect(entry?.position).toBe(0);
    expect(allLed).toBe(false);
    expect(total).toBe(AUTUMN_SEQUENCE.length);
  });
});

describe("the season boundary", () => {
  it("finishing the season's last session leaves nothing unled until the month turns", () => {
    const led = new Set(AUTUMN_SEQUENCE);
    const { entry, allLed } = nextUnled(led, curriculumSequence(SEP));
    expect(entry).toBeNull();
    expect(allLed).toBe(true);
    // December: winter's first session is next, and autumn's are not in the way.
    const winter = nextUnled(led, curriculumSequence(DEC));
    expect(winter.entry?.session.id).toBe("bird-watching");
  });

  it("does not advance early — the last session in the season still gates the end", () => {
    const led = new Set(AUTUMN_SEQUENCE.slice(0, 4)); // stops short of the conker and acorn maths trail
    const { entry } = nextUnled(led, curriculumSequence(SEP));
    expect(entry?.session.id).toBe("conker-acorn-maths-trail");
  });
});

describe("repeats and out-of-order leading do not corrupt next-up", () => {
  it("an intentional repeat of an already-led session changes nothing", () => {
    const led = new Set([
      "summer-w2-minibeast-hunting",
      "animal-leaf-masks",
      "summer-w2-minibeast-hunting", // led again, on purpose
    ]);
    expect(nextUnled(led, curriculumSequence(SEP)).entry?.session.id).toBe("seed-searchers");
  });

  it("a manual Season jump ahead does not pull next-up forward with it", () => {
    const led = new Set(["nature-recycling-system"]);
    expect(nextUnled(led, curriculumSequence(SEP)).entry?.session.id).toBe(
      "summer-w2-minibeast-hunting"
    );
  });
});

describe("every session led", () => {
  it("is named honestly rather than silently wrapped to session one", () => {
    const led = new Set(AUTUMN_SEQUENCE);
    const { entry, allLed, total } = nextUnled(led, curriculumSequence(SEP));
    expect(allLed).toBe(true);
    expect(entry).toBeNull();
    expect(total).toBe(AUTUMN_SEQUENCE.length);
  });
});

describe("curriculumPosition", () => {
  it("finds a shelf session's stop in any season, so a saved lesson stays saved", () => {
    const found = curriculumPosition("bark-rubbings", SEP);
    expect(found?.position).toBe(7);
    expect(found?.pack.id).toBe("winter-starter");
  });

  it("is null for a session held back from the shelf, or archived", () => {
    expect(curriculumPosition("spring-w5-first-signs", SEP)).toBeNull();
    expect(curriculumPosition("meet-your-tree", SEP)).toBeNull();
  });
});

describe("nextInSequence — the finish page's honest tease", () => {
  it("teases within the season ordinarily", () => {
    expect(nextInSequence("summer-w2-minibeast-hunting", SEP)?.session.id).toBe(
      "seed-searchers"
    );
  });

  it("has nothing to tease after the season's last stop: what comes next is a month", () => {
    expect(nextInSequence("conker-acorn-maths-trail", SEP)).toBeNull();
  });

  it("has nothing to tease for a session the open season never carried", () => {
    expect(nextInSequence("spring-w1-seed-bombs", SEP)).toBeNull();
    expect(nextInSequence("spring-w5-first-signs", APR)).toBeNull();
  });
});
