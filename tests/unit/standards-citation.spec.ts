import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localizeDeep, localizeText } from "@/lib/localization";
import { sessionSchema, standardsSystems } from "@/schema/pack";
import type { SessionStandard } from "@/schema/pack";

/**
 * A CITATION IS NOT DISPLAY TEXT (#464).
 *
 * `localizeDeep` walks every string in a session and swaps UK words for US
 * ones. That is right for a lesson and wrong for a curriculum reference, and
 * the difference is not cosmetic: `standards[].text` is published statutory
 * wording that we are QUOTING. Americanise a quoted objective and the product
 * prints a citation to something no government ever published — the same
 * defect family as asserting more than we observed, arriving through a
 * different door.
 *
 * These tests are written against the words that would actually break, taken
 * from the England programme of study and a real curriculum map: "Autumn 1"
 * (which the map would render "Fall 1", a term that does not exist in the
 * English school year), "Reception" (-> "pre-K", inside an English reference)
 * and "recognise" (-> "recognize", inside Crown wording).
 *
 * The first assertion proves the map really would eat them, so that this file
 * fails loudly if someone ever removes the exemption — rather than passing
 * because the map quietly stopped containing those words.
 */

/**
 * The `slot` values here are INVENTED, and must stay invented. A half-term
 * unit name is a particular school's own wording out of its own curriculum
 * map — someone's internal planning document — and this repository goes
 * public at the AGPL release, its issues and tests included. A fixture is
 * never a reason to publish a school's document. (No session authors a slot
 * anyway: #565 found no citable national placement.)
 *
 * The wording below, by contrast, is REAL and quoted from the England
 * science (Year 2, "Living things and their habitats"), and a real reference:
 * England publishes no per-objective codes, so the citable unit is the year
 * and the subheading. A fixture that invented a code would be testing a shape
 * the product must never ship.
 */
const ENGLAND_CITATION = {
  system: "england" as const,
  code: "Year 2 · Living things and their habitats",
  text: "identify and name a variety of plants and animals in their habitats, including microhabitats",
  slot: "Year 2 · Spring 2 · Habitats Near Us",
};

/** Also real, and chosen because it contains "recognise" — the spelling the
 * map would rewrite inside quoted Crown wording. */
const ENGLAND_CITATION_WITH_EATEN_WORD = {
  system: "england" as const,
  code: "Year 6 · Light",
  text: "recognise that light appears to travel in straight lines",
};

const NGSS_CITATION = {
  system: "ngss" as const,
  code: "K-LS1-1",
  text: "Use observations to describe patterns of what plants and animals need to survive",
};

/**
 * Built on a REAL shipped session rather than a hand-rolled literal, so this
 * file cannot drift into testing a shape the packs do not have. "Minibeast
 * hunting" is the right one to borrow: its title is the exact word the map was
 * built to swap (#139), which makes the "localizes around the citation"
 * assertion below a real check rather than a contrived one.
 */
const REAL_SESSION = JSON.parse(readFileSync("packs/summer.json", "utf8")).sessions.find(
  (s: { title: string }) => s.title === "Minibeast hunting"
);

function sessionWith(standards: unknown[]) {
  return sessionSchema.parse({ ...REAL_SESSION, standards });
}

/** The one citation under test. Throws rather than returning undefined so a
 * missing entry fails as a missing entry, not as a confusing null assertion. */
function only(session: { standards: SessionStandard[] }, at = 0): SessionStandard {
  const found = session.standards[at];
  if (!found) throw new Error(`no standard at ${at}`);
  return found;
}

describe("the word map would corrupt a citation if it were let near one", () => {
  it("really does rewrite every word a citation depends on", () => {
    // If this ever fails, the map changed and the rest of this file is
    // guarding nothing. Fix the map or delete the guard deliberately.
    expect(localizeText("Autumn 1", "us")).toBe("Fall 1");
    expect(localizeText("Reception", "us")).toBe("Pre-K");
    expect(localizeText("recognise", "us")).toBe("recognize");
  });
});

describe("localizeDeep holds the standards subtree out", () => {
  it("leaves an English citation byte-identical for a US class", () => {
    const session = sessionWith([ENGLAND_CITATION, ENGLAND_CITATION_WITH_EATEN_WORD]);
    const localized = localizeDeep(session, "us");

    expect(only(localized)).toEqual(ENGLAND_CITATION);
    expect(only(localized).slot).toContain("Spring 2");
    // Crown wording, quoted: the "s" must survive.
    expect(only(localized, 1).text).toBe(ENGLAND_CITATION_WITH_EATEN_WORD.text);
    expect(only(localized, 1).text).toContain("recognise");
  });

  it("does not touch a slot that names an English term", () => {
    const session = sessionWith([
      { ...ENGLAND_CITATION, slot: "Reception · Autumn 1 · Autumn Walks" },
    ]);
    const localized = localizeDeep(session, "us");

    expect(only(localized).slot).toBe("Reception · Autumn 1 · Autumn Walks");
    expect(only(localized).slot).not.toContain("Fall");
    expect(only(localized).slot).not.toContain("Pre-K");
  });

  it("still localizes the lesson around the citation", () => {
    const session = sessionWith([ENGLAND_CITATION]);
    const localized = localizeDeep(session, "us");

    // The title goes through the map exactly as before; only the citation is held out.
    expect(localized.title).toBe("Bug hunting");
    expect(only(localized).text).toBe(ENGLAND_CITATION.text);
  });

  it("leaves a UK render untouched, as it always did", () => {
    const session = sessionWith([ENGLAND_CITATION, NGSS_CITATION]);
    expect(localizeDeep(session, "uk").standards).toEqual([ENGLAND_CITATION, NGSS_CITATION]);
  });
});

describe("the field's own shape", () => {
  it("defaults to empty, which means nobody has mapped this session yet", () => {
    const { standards: _omitted, ...noStandards } = { ...REAL_SESSION, standards: undefined };
    const session = sessionSchema.parse(noStandards);
    expect(session.standards).toEqual([]);
  });

  it("lets a session carry one system only, so the other side shows nothing rather than a guess", () => {
    const session = sessionWith([ENGLAND_CITATION]);
    expect(session.standards.map((s) => s.system)).toEqual(["england"]);
  });

  it("refuses a system it cannot cite", () => {
    expect(() => sessionWith([{ ...ENGLAND_CITATION, system: "eyfs" }])).toThrow();
  });

  it("refuses a citation with no code or no published text", () => {
    expect(() => sessionWith([{ system: "ngss", code: "", text: "something" }])).toThrow();
    expect(() => sessionWith([{ system: "ngss", code: "K-LS1-1", text: "" }])).toThrow();
  });

  it("keeps slot optional, because only England has a half-term grid", () => {
    const session = sessionWith([NGSS_CITATION]);
    expect(only(session).slot).toBeUndefined();
    expect(standardsSystems).toContain("ngss");
  });
});
