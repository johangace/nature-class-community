import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAloudLine } from "@/lib/cast/speak";
import {
  doorQuestion,
  markCaption,
  primaryTopicOf,
  resolveDoor,
  standsOutside,
} from "@/lib/lesson/door";
import { loadAllPacks } from "@/lib/pack";
import { SEEN_CAPTION, USUALLY_AROUND_CAPTION } from "@/lib/outside/captions";
import { tierLabel, type CastMember } from "@/lib/cast/member";

/**
 * INTRODUCE TODAY (#324). Johan, reading a lesson about trees:
 *
 *   "An Apple is usually around now. Let us look for one."
 *
 * Three of the complaints about that sentence are not defects, and pinning
 * that here is half the point of this file. The capital A is `commonName`
 * arriving title-cased from the source, and `speak.ts` deliberately refuses to
 * edit a species name. The "usually" is the REGIONAL tier describing itself
 * accurately, and removing it would make the line less honest, not better.
 *
 * The defect was that the door was fed a cast line at all. A cast line's job
 * is to describe a creature honestly; opening a lesson is a different job. So
 * the page now has its own evidence and its own question, and no cast line
 * reaches it.
 */

const source = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);
const slot = readFileSync(new URL("../../app/run/DoorSlot.tsx", import.meta.url), "utf8");

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Apple",
    scientificName: "Malus domestica",
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

function photographed(over: Partial<CastMember> = {}): CastMember {
  return member({
    honestyTier: "recorded",
    photoUrl: "https://inat.example/a.jpg",
    photoRole: "observation",
    ...over,
  });
}

describe("the line Johan read", () => {
  it("is still exactly what a regional member produces, and that is correct", () => {
    // If this ever changes, someone has started editing species names or
    // hedges, which is the fix this ticket explicitly rejected.
    expect(readAloudLine(member(), { locality: "recorded-nearby" })).toBe(
      "An Apple is usually around now. Let us look for one."
    );
  });

  it("no longer reaches the door at all", () => {
    // Comments are stripped: the paragraph explaining what was wrong names the
    // expression it removed, and that paragraph is worth keeping.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("cast.lines[0]");
    expect(code).not.toContain("cast?.lines[0]");
    expect(code).not.toContain("Today&rsquo;s guest");
  });
});

describe("the bar for standing outside", () => {
  it("is the shipped one and is not restated", () => {
    expect(standsOutside(photographed(), true)).toBe(true);
    // Not located: we may not say anything is near a school we cannot place.
    expect(standsOutside(photographed(), false)).toBe(false);
    // Regional is in season for the region, not observed here.
    expect(standsOutside(member(), true)).toBe(false);
    // An absence is a hope, and the one thing a picture cannot illustrate.
    expect(standsOutside(photographed({ absent: true }), true)).toBe(false);
  });

  it("borrows no second distance or recency rule", () => {
    // Sophia proposed "within 500 m, inside 30 days". Ruled out: neither
    // number is measured, and a second vocabulary for one idea is how this
    // repo ended up with two conditions vocabularies.
    const door = readFileSync(new URL("../../lib/lesson/door.ts", import.meta.url), "utf8");
    const code = door.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/500|lastSeenWindow|daysAgo|distance/);
  });
});

describe("the evidence degrades, and never pads", () => {
  it("leads with photographs of what was recorded near here", () => {
    const evidence = resolveDoor({
      members: [photographed({ commonName: "London plane", sortRank: 0 })],
      located: true,
    });
    expect(evidence.kind).toBe("photographed");
    expect(evidence.kind === "photographed" && evidence.heading).toBe(SEEN_CAPTION.school);
    expect(evidence.kind === "photographed" && evidence.specimens).toHaveLength(1);
  });

  it("shows one large rather than one plus two stand-ins", () => {
    // Size beats count: the page's job is matching a picture to a trunk, and a
    // drawn mark beside a photograph reads as a photograph that failed to load.
    const evidence = resolveDoor({
      members: [
        photographed({ commonName: "London plane", sortRank: 0 }),
        member({ commonName: "Pedunculate oak", sortRank: 1 }),
        member({ commonName: "Silver birch", sortRank: 2 }),
      ],
      located: true,
    });
    expect(evidence.kind).toBe("photographed");
    expect(evidence.kind === "photographed" && evidence.specimens).toHaveLength(1);
  });

  it("caps the set at three and gives every count the same compact list treatment", () => {
    // The resolver still carries a small spread across kinds. Presentation no
    // longer scales one or two images up into specimens, though: #233 requires
    // labeled, tappable, list-scale entities at every count.
    const evidence = resolveDoor({
      members: [0, 1, 2, 3, 4].map((sortRank) =>
        photographed({ commonName: `Species ${sortRank}`, sortRank })
      ),
      located: true,
    });
    expect(evidence.kind === "photographed" && evidence.specimens).toHaveLength(3);

    const css = readFileSync(
      new URL("../../app/run/journey.module.css", import.meta.url),
      "utf8"
    );
    expect(css).not.toContain(".slotRow[data-count");

    const plateStart = css.indexOf(".slotPlate {");
    const plate = css.slice(plateStart, css.indexOf("}", plateStart) + 1);
    expect(plate).toMatch(/width:\s*4\.75rem/);
    expect(plate).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    expect(plate).not.toContain("min-height");
  });

  it("spreads across kinds before it takes a second of any kind", () => {
    // Johan: "having a couple of samples eg bird tree, insect or somehting".
    // Findability is the right order and the wrong filter — its top three here
    // are three birds, and a lesson called Counting life would open on a
    // picture of life that is all one thing.
    const evidence = resolveDoor({
      members: [
        photographed({ commonName: "Rock Pigeon", iconicTaxon: "Aves", sortRank: 0 }),
        photographed({ commonName: "Wood Pigeon", iconicTaxon: "Aves", sortRank: 1 }),
        photographed({ commonName: "Carrion Crow", iconicTaxon: "Aves", sortRank: 2 }),
        photographed({ commonName: "Bramble", iconicTaxon: "Plantae", sortRank: 3 }),
        photographed({ commonName: "Marmalade Hoverfly", iconicTaxon: "Insecta", sortRank: 4 }),
      ],
      located: true,
    });
    const names =
      evidence.kind === "photographed" ? evidence.specimens.map((s) => s.member.commonName) : [];
    expect(names).toEqual(["Rock Pigeon", "Bramble", "Marmalade Hoverfly"]);
  });

  it("merges a recorded specimen with regional fill, recorded first and capped (#1028)", () => {
    // nc#1012: one recorded moth used to push out seven honest regional
    // candidates on record. The row now merges instead of returning at the
    // first recorded hit — but the two sibling tests above only ever cover
    // an all-recorded row or an all-regional one. This is the case neither
    // exercises: BOTH tiers landing in the SAME row, past the point where the
    // fill has more candidates than there is room.
    const evidence = resolveDoor({
      members: [
        photographed({ commonName: "Elephant Hawk-moth", iconicTaxon: "Insecta", sortRank: 0 }),
        member({
          commonName: "Bramble",
          iconicTaxon: "Plantae",
          sortRank: 1,
          photoUrl: "https://inat.example/bramble.jpg",
        }),
        member({
          commonName: "Song Thrush",
          iconicTaxon: "Aves",
          sortRank: 2,
          photoUrl: "https://inat.example/thrush.jpg",
        }),
        member({
          commonName: "Common Wasp",
          iconicTaxon: "Insecta",
          sortRank: 3,
          photoUrl: "https://inat.example/wasp.jpg",
        }),
      ],
      located: true,
    });

    expect(evidence.kind).toBe("photographed");
    if (evidence.kind !== "photographed") throw new Error("expected photographed");

    // Capped at MAX_SPECIMENS (3), not the four candidates on offer.
    expect(evidence.specimens).toHaveLength(3);

    // Recorded stays first — unchanged order, unchanged spreadByKind.
    expect(evidence.specimens.map((s) => s.member.commonName)).toEqual([
      "Elephant Hawk-moth",
      "Bramble",
      "Song Thrush",
    ]);
    // The fourth regional candidate lost to the cap, not swapped in for one
    // of the first three.
    expect(evidence.specimens.map((s) => s.member.commonName)).not.toContain("Common Wasp");

    // Every specimen keeps its own tier and its own picture: nothing regional
    // is silently promoted to recorded, and no picture that cleared the bar
    // is dropped.
    expect(evidence.specimens.map((s) => s.member.honestyTier)).toEqual([
      "recorded",
      "regional",
      "regional",
    ]);
    expect(evidence.specimens.every((s) => s.asset !== null)).toBe(true);

    // The caption on each card is per-item and never lies upward: the
    // regional fill reads "around the region", never "recorded nearby".
    expect(evidence.specimens.map((s) => tierLabel(s.member))).toEqual([
      "recorded nearby",
      "around the region",
      "around the region",
    ]);

    // The row heading is still the school's claim, which is correct at the
    // row level — the per-card check above is what guards against a
    // regional specimen reading as "seen near your school".
    expect(evidence.heading).toBe(SEEN_CAPTION.school);
  });

  it("still yields birds when birds are all there is, and drops nobody to look balanced", () => {
    const evidence = resolveDoor({
      members: [0, 1, 2].map((sortRank) =>
        photographed({ commonName: `Bird ${sortRank}`, iconicTaxon: "Aves", sortRank })
      ),
      located: true,
    });
    expect(evidence.kind === "photographed" && evidence.specimens).toHaveLength(3);
  });

  it("names the zoom when the geocoder named the point, and does not invent one", () => {
    // Not a second bar. `door.ts` records that a tighter distance-and-recency
    // test was ruled out on purpose. This is the same read at the same radius,
    // with the name we already asked the geocoder for: "here" and "Canonbury"
    // are the same coordinate, so the named form is strictly more specific and
    // exactly as true.
    const named = resolveDoor({
      members: [member({ commonName: "Pedunculate oak" })],
      located: false,
      placeName: "Canonbury",
    });
    expect(named.kind === "named" && named.heading).toBe("Usually around Canonbury now");

    const unnamed = resolveDoor({
      members: [member({ commonName: "Pedunculate oak" })],
      located: false,
    });
    expect(unnamed.kind === "named" && unnamed.heading).toBe(USUALLY_AROUND_CAPTION);
  });

  it("never lets the place name reach the school's own claim", () => {
    // The strong tier says "seen near your school", which is a claim about
    // WHOSE ground it is. A place name would read as a second, weaker locality
    // on top of it.
    const evidence = resolveDoor({
      members: [photographed({ commonName: "Rock Pigeon" })],
      located: true,
      placeName: "Canonbury",
    });
    expect(evidence.kind === "photographed" && evidence.heading).toBe(SEEN_CAPTION.school);
  });

  it("falls to drawn marks and drops the school's claim with them", () => {
    const evidence = resolveDoor({
      members: [member({ commonName: "Pedunculate oak" })],
      located: true,
    });
    expect(evidence.kind).toBe("named");
    expect(evidence.kind === "named" && evidence.heading).toBe(USUALLY_AROUND_CAPTION);
    expect(evidence.kind === "named" && evidence.specimens[0]?.asset).toBeNull();
  });

  it("says which gap it is holding, and never blends the two", () => {
    // Recorded here, but no photograph travelled.
    const noPhoto = resolveDoor({
      members: [member({ honestyTier: "recorded", commonName: "Eurasian coot" })],
      located: true,
    });
    expect(noPhoto.kind === "named" && noPhoto.gap).toMatch(/credit attached/);
    expect(noPhoto.kind === "named" && noPhoto.gap).not.toMatch(/Nobody has recorded/);

    // Never recorded here at all.
    const regional = resolveDoor({ members: [member()], located: true });
    expect(regional.kind === "named" && regional.gap).toMatch(/Nobody has recorded these/);
    expect(regional.kind === "named" && regional.gap).not.toMatch(/credit attached/);
  });

  it("never names an absence", () => {
    const evidence = resolveDoor({
      members: [member({ absent: true })],
      located: true,
    });
    expect(evidence.kind).toBe("none");
  });

  it("shows nothing rather than a placeholder when nothing clears", () => {
    expect(resolveDoor({ members: [], located: true }).kind).toBe("none");
    expect(resolveDoor({ members: [], located: false }).kind).toBe("none");
  });

  it("says a sample patch is a sample patch", () => {
    const evidence = resolveDoor({
      members: [photographed()],
      located: true,
      scope: "sample",
    });
    expect(evidence.kind === "photographed" && evidence.heading).toBe(SEEN_CAPTION.sample);
  });

  it("does not describe regional sample evidence as the school's grounds", () => {
    const evidence = resolveDoor({
      members: [member()],
      located: false,
      scope: "sample",
    });

    expect(evidence.kind === "named" && evidence.gap).toContain("sample patch");
    expect(evidence.kind === "named" && evidence.gap).not.toContain("your grounds");
  });
});

describe("a drawn mark says what kind of thing it is (#321)", () => {
  it("names the category rather than implying a likeness", () => {
    // The plate has always chosen its mark by iconic taxon rather than by
    // species, which is honest. It never said so, and on this page that
    // silence is the failure: two birds rendering identically reads as a
    // portrait that is wrong rather than as a category mark that is right.
    expect(markCaption(member({ iconicTaxon: "Aves" }))).toBe(
      "a drawn bird, not a photograph"
    );
    expect(markCaption(member({ iconicTaxon: "Arachnida" }))).toBe(
      "a drawn spider, not a photograph"
    );
    expect(markCaption(member({ iconicTaxon: "Amphibia" }))).toBe(
      "a drawn amphibian, not a photograph"
    );
  });

  it("claims no kingdom for a member that reported none", () => {
    expect(markCaption(member({ iconicTaxon: null }))).toBe("drawn, not photographed");
  });

  it("is rendered on the mark, not only in the data", () => {
    expect(slot).toContain("markCaption(member)");
  });
});

describe("the door question", () => {
  it("prefers the one authored with the lesson", () => {
    expect(
      doorQuestion({
        doorQuestion: "Of the trees you can see from here, which is doing the most for us?",
        prompt: "Why are trees so important for our existence?",
      })
    ).toBe("Of the trees you can see from here, which is doing the most for us?");
  });

  it("falls back to the driving question only when it is a question", () => {
    expect(doorQuestion({ prompt: "What's living in our grounds?" })).toBe(
      "What's living in our grounds?"
    );
    // Nine shipped sessions carry a statement here. Reading one out as a door
    // question is a smaller version of the sentence this ticket is about.
    expect(doorQuestion({ prompt: "Minibeast hunting." })).toBeNull();
    expect(doorQuestion({ prompt: "Create art with nature." })).toBeNull();
    expect(doorQuestion({})).toBeNull();
  });

  it("never turns a statement into a question", () => {
    const door = readFileSync(new URL("../../lib/lesson/door.ts", import.meta.url), "utf8");
    const code = door.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // An app that rewrites teaching content is the same move as an app that
    // edits a species name.
    expect(code).not.toMatch(/\+ "\?"|\+ '\?'|replace\(/);
  });

  it("is the same question whatever the evidence above it is", () => {
    // The good idea on Sophia's sheet: it can be unchanging because it points
    // at what is in front of the class rather than at what we know. Nothing in
    // the resolver may reach the question.
    const door = readFileSync(new URL("../../lib/lesson/door.ts", import.meta.url), "utf8");
    const from = door.indexOf("export function resolveDoor");
    const to = door.indexOf("export function doorQuestion");
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const body = door
      .slice(from, to)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(body).not.toContain("doorQuestion");
  });
});

describe("what the shipped packs actually give the door", () => {
  const sessions = loadAllPacks().flatMap((pack) => pack.sessions);

  it("covers every session, 39 through the driving question and 17 authored", () => {
    // The nine that carried a statement rather than a question ("Minibeast
    // hunting.", "Create art with nature.") now author their own door
    // question. The gap this test used to cap at nine is closed; it stays
    // here as the guard that it does not reopen. The autumn-garden eight
    // (#581) author a door question apiece, which is where nine became
    // seventeen.
    expect(sessions.filter((s) => doorQuestion(s) === null)).toEqual([]);
    const authored = sessions.filter((s) => s.doorQuestion).length;
    // Twenty-four since the four `living-things-spring` sessions (#564), each
    // of which authors its own door question rather than leaning on a prompt.
    expect(authored).toBe(24);
  });

  it("asks a real question wherever it asks one at all", () => {
    for (const session of sessions) {
      const question = doorQuestion(session);
      if (!question) continue;
      expect(question.endsWith("?"), session.id).toBe(true);
      expect(question, session.id).not.toMatch(/—|--/);
      expect(question, session.id).not.toMatch(/\b[A-Z]{3,}\b/);
    }
  });
});

describe("a lesson about trees shows trees (#339)", () => {
  const oak = () =>
    photographed({ commonName: "Pedunculate oak", iconicTaxon: "Plantae", sortRank: 1 });
  const bee = () =>
    photographed({ commonName: "Common carder bumble bee", iconicTaxon: "Insecta", sortRank: 0 });

  it("knows which tag a lesson is about", () => {
    // Authored where a session carries two and only the author knows.
    expect(primaryTopicOf({ primaryTopic: "trees", topicTags: ["minibeasts", "trees"] })).toBe(
      "trees"
    );
    // Derived where it carries one, because one tag is unambiguously primary.
    expect(primaryTopicOf({ topicTags: ["trees"] })).toBe("trees");
    // Null where several are carried and none is authored: today's behaviour.
    expect(primaryTopicOf({ topicTags: ["minibeasts", "trees"] })).toBeNull();
    expect(primaryTopicOf({})).toBeNull();
  });

  it("stands the door on the topic, not on whatever ranked first", () => {
    // The exact shape Johan hit: a trees lesson whose cast leads with insects
    // because `matchesTopic` is membership over ALL tags and scores them the
    // same. The bee ranks first and is still not a tree.
    const before = resolveDoor({ members: [bee(), oak()], located: true });
    expect(before.kind === "photographed" && before.specimens[0]?.member.commonName).toBe(
      "Common carder bumble bee"
    );

    const after = resolveDoor({ members: [bee(), oak()], located: true, topic: "trees" });
    expect(after.kind).toBe("photographed");
    expect(after.kind === "photographed" && after.specimens).toHaveLength(1);
    expect(after.kind === "photographed" && after.specimens[0]?.member.commonName).toBe(
      "Pedunculate oak"
    );
  });

  it("shows fewer and right while the right thing is there", () => {
    // #339 unchanged where it was written to apply: a tree is recorded, so the
    // bee that ranked above it does not reach the door.
    const evidence = resolveDoor({ members: [bee(), oak()], located: true, topic: "trees" });
    expect(evidence.kind === "photographed" && evidence.specimens).toHaveLength(1);
    expect(evidence.kind === "photographed" && evidence.specimens[0]?.member.commonName).toBe(
      "Pedunculate oak"
    );
  });

  it("shows no photographed strip when a mapped topic finds no match (#450)", () => {
    const evidence = resolveDoor({ members: [bee()], located: true, topic: "trees" });
    expect(evidence.kind).toBe("none");
  });

  it("shows no named strip when a mapped topic finds no match", () => {
    const evidence = resolveDoor({
      members: [member({ commonName: "Common blue", iconicTaxon: "Insecta" })],
      located: true,
      topic: "trees",
    });
    expect(evidence.kind).toBe("none");
  });

  it("still returns none when the read itself came back empty", () => {
    // The fallback shows what is there. It cannot conjure what is not, and a
    // school with nothing recorded still gets the short page.
    expect(resolveDoor({ members: [], located: true, topic: "trees" }).kind).toBe("none");
  });

  it("does nothing for a topic taxonomy cannot express", () => {
    // Roughly forty per cent of sessions are tagged seasons, senses, weather
    // or art. "Does this bee match `art`?" has no meaningful answer, and
    // filtering on it would empty the row for no reason.
    for (const topic of ["seasons", "senses", "weather", "art"] as const) {
      const evidence = resolveDoor({ members: [bee()], located: true, topic });
      expect(evidence.kind, topic).toBe("photographed");
    }
  });

  it("drops the phenology rows that are not species at all, fallback included", () => {
    // "Autumn Colour", "Dawn Chorus", "First Frost" carry no taxon because
    // they are not creatures. None of them is standing outside the gate, and
    // #350's fallback must not sweep them back in — "show life" would quietly
    // become "show a season".
    const evidence = resolveDoor({
      members: [member({ commonName: "Autumn Colour", iconicTaxon: null })],
      located: true,
      topic: "trees",
    });
    expect(evidence.kind).toBe("none");

    // And the season is still dropped when a real creature is beside it.
    const mixed = resolveDoor({
      members: [member({ commonName: "Autumn Colour", iconicTaxon: null }), bee()],
      located: true,
      topic: "trees",
    });
    const names = mixed.kind === "photographed" ? mixed.specimens.map((x) => x.member.commonName) : [];
    expect(names).not.toContain("Autumn Colour");
  });

  it("is read by the door and by nothing else", () => {
    // `matchesTopic` stays membership-over-all-tags for every other caller,
    // which is the reason this was preferred over turning it into a score.
    const observations = readFileSync(
      new URL("../../lib/outside/observations.ts", import.meta.url),
      "utf8"
    );
    expect(observations).not.toContain("primaryTopic");
  });
});

describe("what the packs now author", () => {
  const sessions = loadAllPacks().flatMap((pack) => pack.sessions);

  it("names a primary topic that the session actually carries", () => {
    let authored = 0;
    for (const session of sessions) {
      if (!session.primaryTopic) continue;
      authored += 1;
      expect(session.topicTags ?? [], session.id).toContain(session.primaryTopic);
    }
    expect(authored).toBeGreaterThanOrEqual(42);
  });

  it("resolves a primary topic for all but the genuinely ambiguous", () => {
    // Three sessions are deliberately silent, and each is a lesson that is
    // honestly about more than one of its tags: "who is building a home
    // here?" (birds and minibeasts), a rain lesson tagged for water creatures
    // it is not about, and "what's living in our grounds?", which counts
    // everything alive on purpose.
    const unresolved = sessions.filter((s) => primaryTopicOf(s) === null).map((s) => s.id);
    expect(unresolved.sort()).toEqual([
      "spring-w8-the-builders",
      "spring-w9-rain",
      "summer-w1-counting-life",
    ]);
  });

  it("asks a door question on every session", () => {
    const missing = sessions.filter((s) => doorQuestion(s) === null).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it("holds the house voice on every authored line", () => {
    const lines: Array<[string, string]> = [];
    for (const session of sessions) {
      if (session.doorQuestion) lines.push([session.id, session.doorQuestion]);
      for (const note of session.conditionNotes ?? []) {
        lines.push([session.id, note.teacher]);
        if (note.child) lines.push([session.id, note.child]);
      }
    }
    expect(lines.length).toBeGreaterThanOrEqual(14);
    for (const [id, line] of lines) {
      expect(line, id).toMatch(/^[A-Z]/);
      expect(line, id).not.toMatch(/—|--/);
      expect(line, id).not.toMatch(/\b[A-Z]{3,}\b/);
      expect(line.trim(), id).toBe(line);
      expect(line, id).toMatch(/[.?]$/);
    }
  });

  it("does not write one sentence fifteen times", () => {
    // A rotation you can hear is worse than silence. Guarded on the opening,
    // which is where a template shows first.
    const opening = (line: string) => line.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    for (const field of ["doorQuestion", "conditionNotes"] as const) {
      const lines = sessions
        .flatMap((s) =>
          field === "doorQuestion" ? [s.doorQuestion] : (s.conditionNotes ?? []).map((n) => n.teacher)
        )
        .filter((line): line is string => Boolean(line));
      const counts = new Map<string, number>();
      for (const line of lines) {
        const key = opening(line);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, count] of counts) {
        expect(count, `${field}: "${key}" opens ${count} lines`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("never edits the author's own prompt or preparation", () => {
    // Both are the founder's text and the fidelity guard holds them shut.
    // `doorQuestion` and `conditionNotes` are authored beside them.
    const trees = sessions.find((s) => s.id === "summer-w4-our-earths-magnificent-trees");
    expect(trees?.prompt).toBe("Why are trees so important for our existence?");
    // `prompt` is untouched and always will be. `preparation` here is the one
    // deliberate exception, recorded in scripts/verbatim-fidelity.mjs: its
    // second clause was MOVED into `conditionNote` and printed twice on one
    // screen, so the copy left behind is gone. Nothing was reworded.
    expect(trees?.preparation).toBe("Nothing to bring.");
    const wind = sessions.find((s) => s.id === "autumn-w2-wind");
    expect(wind?.preparation).toBe(
      "Best on a day with some breeze. If calm, look for any air movement, thermals near walls, drafts."
    );
    expect(wind?.conditionNotes?.[0]?.when).toEqual(["windy"]);
  });
});

/**
 * THE PHOTOGRAPH THE DOOR USED TO THROW AWAY (#341).
 *
 * Johan, reading the running app: "Comon swift mild majoram etc can we have
 * photos for them and maybe make them clickable about the news?"
 *
 * MEASURED CAUSE, not the plausible one. Three explanations were eliminated
 * against the live API and the real chain before anything changed:
 *
 *   NOT the licence gate. `seasonalNearby` fetched a cc-by photograph for both
 *   Apus apus (taxon 6638) and Origanum vulgare (61396) on 2026-08-18.
 *   NOT a swallowed failure. The species reached the screen — their NAMES were
 *   rendering, so the read and the `.catch(() => [])` around it were fine.
 *   NOT the first-members-lacked-assets ordering. Every member in the row had
 *   a releasable asset when the row rendered as marks.
 *
 * The asset survived all the way onto the member and `displayPhotoAsset` said
 * yes. `resolveDoor`'s named branch then mapped every member to
 * `{ member, asset: null }` — a hardcoded null on the last line before the
 * screen. The bar for the SEEN claim ("recorded") was doing double duty as the
 * bar for showing a picture at all, and no regional member can ever clear it.
 */
describe("a regional member that has a photograph shows the photograph", () => {
  const regional = (over: Partial<CastMember> = {}): CastMember =>
    member({
      honestyTier: "regional",
      photoUrl: "https://inat.example/swift.jpg",
      photoRole: "taxon-reference",
      photoLicense: "cc-by",
      photoAttribution: "(c) someone, some rights reserved (CC BY)",
      ...over,
    });

  it("renders it as a photograph rather than a drawn mark", () => {
    // The isolating fixture: located, regional, and carrying a picture. This
    // asserted `asset` was null before the fix, which is the defect exactly.
    const evidence = resolveDoor({
      members: [regional({ commonName: "Common Swift", sortRank: 0 })],
      located: true,
    });
    expect(evidence.kind).toBe("named");
    if (evidence.kind === "none") throw new Error("unreachable");
    expect(evidence.specimens[0]?.asset?.url).toBe("https://inat.example/swift.jpg");
  });

  it("does not upgrade the claim to say it was seen here", () => {
    // The whole reason the fix is safe. A picture is not a sighting: the
    // heading, the tier and the taxon-reference role all stay put.
    const evidence = resolveDoor({
      members: [regional({ commonName: "Wild Marjoram" })],
      located: true,
    });
    if (evidence.kind !== "named") throw new Error("expected named");
    expect(evidence.heading).toBe(USUALLY_AROUND_CAPTION);
    expect(evidence.heading).not.toBe(SEEN_CAPTION.school);
    expect(evidence.specimens[0]?.member.honestyTier).toBe("regional");
    expect(evidence.specimens[0]?.asset?.role).toBe("taxon-reference");
    // And it still says whose ground this is, rather than claiming the school's.
    expect(evidence.gap).toContain("Nobody has recorded these on your grounds");
  });

  it("never mixes a drawn mark into a row of photographs", () => {
    // A mark beside a photograph reads as a photograph that failed to load.
    // Two with pictures and one without must give two pictures, not a mix.
    const evidence = resolveDoor({
      members: [
        regional({ commonName: "Common Swift", sortRank: 0 }),
        member({ commonName: "Dawn Chorus", sortRank: 1 }),
        regional({ commonName: "Wild Marjoram", sortRank: 2 }),
      ],
      located: true,
    });
    if (evidence.kind === "none") throw new Error("expected specimens");
    const assets = evidence.specimens.map((s) => s.asset !== null);
    expect(new Set(assets).size).toBe(1);
    expect(assets.every(Boolean)).toBe(true);
  });

  it("still falls to marks, and says so, when nothing in the row has a picture", () => {
    // The old behaviour has to survive: this is the state the drawn plate and
    // its "we are showing the drawn marks" line were built for.
    const evidence = resolveDoor({
      members: [photographed({ photoUrl: null, commonName: "Oak" })],
      located: true,
    });
    if (evidence.kind !== "named") throw new Error("expected named");
    expect(evidence.specimens[0]?.asset).toBeNull();
    expect(evidence.gap).toContain("we are showing the drawn marks");
  });

  it("takes the specimen through to its species profile", () => {
    // Johan asked for the tap-through. The profile 404s outside today's cast,
    // so this must be a real destination and is asserted at the call site.
    expect(slot).toContain("/species/");
    // And carries the run it is part of, so the profile leads back in (#874).
    expect(slot).toContain("speciesHref(member, topic, fromRun)");
  });
});
