import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localizeDoorSentence } from "@/lib/ai/door-line";
import { PROMPT_FILES } from "@/lib/ai/prompt-registry";

/**
 * WORD DRIFT: the same class, two screens, two vocabularies.
 *
 * `unit-drift.spec.ts` is this file's older sibling. There, a Berkeley class
 * read "13 degrees" on one screen and "55°F" on the next, because the card had
 * learned about locale and the composers underneath it had not. This is the
 * same fault in WORDS (#393): the authored lesson has gone through
 * `localizeText` since #142, and the lines the MODEL writes never did. A
 * Berkeley teacher read an authored lesson about bugs in the fall and then,
 * out loud, in the block beneath it, a drafted sentence about minibeasts in
 * autumn.
 *
 * The fix is a post-transform at the point the draft is rendered, not a locale
 * layer over the prompts: a prompt layer multiplies (every prompt times every
 * locale, each needing its own eval) where the transform adds one function
 * that authored content already goes through.
 *
 * Two halves are pinned here, and the second half is the one that lasts:
 *
 *   1. each drafted line actually comes back localized, driven through the
 *      shipping code with only the model and Pointmoon stubbed. (The ticket
 *      named a third drafter, `plainWords`; #446 deleted it while this was
 *      being written, having measured it refuse 20 of 20 real drafts. It is
 *      not localized because it no longer exists.);
 *   2. every prompt in the registry is DECLARED — localized somewhere, or
 *      exempt for a written reason. A thirteenth prompt cannot be added
 *      without deciding which, so the drift cannot come back quietly.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * The two genuine outside edges of the grounding path, stubbed the way
 * grounding-cache.spec.ts stubs them: the model is never called for real in a
 * test, and Pointmoon is reached through the global fetch. Hoisted, because
 * `vi.mock` runs before the file does. Everything else below - the cache, the
 * fact block, the locale derivation and the transform - is shipping code.
 */
const draftGroundingLine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/plate-draft", () => ({
  groundingLine: (...args: unknown[]) => draftGroundingLine(...args),
}));
vi.mock("@/lib/ai/model", () => ({ isModelAvailable: () => true }));

/* ─────────────────────────────────────────────────────────────────────────
 * 1. THE DOOR'S JOINING SENTENCE
 * ───────────────────────────────────────────────────────────────────────── */

describe("the door's joining sentence reads in the teacher's own English", () => {
  it("swaps the words the authored lesson beside it already swapped", () => {
    expect(
      localizeDoorSentence("Look for minibeasts under the grey log this autumn.", [], "us")
    ).toBe("Look for bugs under the gray log this fall.");
  });

  it("leaves the native voice alone", () => {
    const line = "Look for minibeasts under the grey log this autumn.";
    expect(localizeDoorSentence(line, [], "uk")).toBe(line);
  });

  it("does NOT rename a creature it was handed", () => {
    // The false-friend rule from lib/localization: a bird named "Grey heron"
    // is a Grey heron in Berkeley too, and `localizeDeep` keeps `commonName`
    // out of its walk for exactly this reason. A free sentence has no keys to
    // skip, so the names it was written over are put back after the swap.
    expect(
      localizeDoorSentence(
        "The Grey heron stands still while the minibeasts move.",
        ["Grey heron"],
        "us"
      )
    ).toBe("The Grey heron stands still while the bugs move.");
  });
});

describe("the drafted door line is localized before it leaves the drafter", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  const facts = {
    specimens: [{ name: "Grey Heron", kind: "bird", photographed: true, recorded: true, safetyNote: null }],
    claim: "seen-here" as const,
    lessonTitle: "Minibeast hunting",
    lexicon: ["Grey Heron"],
  };

  async function drafted(line: string, locale: "uk" | "us") {
    vi.doMock("@/lib/ai/model", () => ({ isModelAvailable: () => true }));
    vi.doMock("@/lib/ai/draft", () => ({
      draft: async () => line,
      stringField: (name: string) => (json: Record<string, string>) => json?.[name] ?? null,
    }));
    const { draftDoorLine } = await import("@/lib/ai/door-line");
    return draftDoorLine(facts, locale);
  }

  it("hands the page a US sentence for a US class", async () => {
    const out = await drafted("Watch the Grey Heron stand still while the minibeasts move.", "us");
    expect(out?.line).toBe("Watch the Grey Heron stand still while the bugs move.");
  });

  it("keeps the names the line was written over, so the door can still check them", async () => {
    const out = await drafted("Watch the Grey Heron stand still while the minibeasts move.", "us");
    // `over` is what DoorSlot compares against the screen. A localized name
    // here would drop every line the model wrote about a grey-anything.
    expect(out?.over).toEqual(["Grey Heron"]);
  });

  it("is unchanged for the class the product is written for", async () => {
    const line = "Watch the Grey Heron stand still while the minibeasts move.";
    expect((await drafted(line, "uk"))?.line).toBe(line);
  });
});

describe("the page asks for the locale it localized the lesson into", () => {
  // Reach, by source scan, the idiom door-line-ai.spec.ts already uses for
  // this same wire: the transform is worthless if the page never passes a
  // locale, and a default parameter makes that failure silent.
  it("passes the run page's locale to the drafter", () => {
    const page = read("app/run/page.tsx");
    expect(page).toMatch(/draftDoorLine\([\s\S]*?\n\s*locale\n\s*\)/);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 2. THE CONDITIONS LINE
 * ───────────────────────────────────────────────────────────────────────── */

describe("the conditions line reads in the teacher's own English", () => {
  const payload = {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        weather: { current: { skyCondition: "overcast", windKph: 6.3, felt: { apparentC: 12.8 } } },
      },
    },
  };

  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function line(drafted: string | null, locale: "uk" | "us", at: [number, number]) {
    vi.doMock("@/lib/ai/conditions-line", () => ({ draftConditionsLine: async () => drafted }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    );
    const { getConditionsLine } = await import("@/lib/conditions");
    return getConditionsLine(at[0], at[1], locale);
  }

  it("localizes what the model wrote", async () => {
    // Fresh coordinates per case: the field-truth client caches by location.
    expect(await line("It feels like 55 degrees under a soft grey sky.", "us", [37.801, -122.201]))
      .toBe("It feels like 55 degrees under a soft gray sky.");
  });

  it("localizes the composed fallback too, because a teacher cannot tell which she got", async () => {
    expect(await line(null, "us", [37.802, -122.202])).toContain("gray");
  });

  it("leaves the native voice alone", async () => {
    const draftedLine = "It feels like 13 degrees under a soft grey sky.";
    expect(await line(draftedLine, "uk", [37.803, -122.203])).toBe(draftedLine);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 3. THE GROUNDED LINE FROZEN INTO THE LESSON
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * This is the one the issue's own audit missed, and it is the worst of them:
 * `groundSessionConditions` writes it into the session AFTER `localizeDeep`
 * has run over the pack (app/run/page.tsx localizes at line 58 and grounds at
 * line 153), so it is the single sentence on the run screen that the
 * localization layer could never see.
 */
describe("the grounded conditions line reads in the teacher's own English", () => {
  const payload = {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        weather: { current: { skyCondition: "overcast", windKph: 6.3, felt: { apparentC: 12.8 } } },
        observations: {
          nearby: [
            {
              name: "Monarch",
              scientificName: "Danaus plexippus",
              count: 9,
              iconicTaxon: "Insecta",
              photo: {
                url: "https://images.example.test/monarch.jpg", role: "observation",
                creator: "A. Observer", attribution: "Photo by A. Observer", license: "cc-by",
                sourceUrl: "https://source.example.test/observations/42", observationId: "42",
              },
            },
          ],
        },
      },
    },
  };

  let n = 0;

  beforeEach(() => {
    draftGroundingLine.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function grounded(locale: "uk" | "us", teacher: boolean) {
    const { getGroundedConditions } = await import("@/lib/grounding");
    // A place and session nobody else in the suite uses: both the field-truth
    // read and the composed line are cached.
    return getGroundedConditions({
      lat: 41.201 + ++n / 1000,
      lng: -73.201 - n / 1000,
      sessionId: `word-drift-${n}`,
      topic: "minibeasts",
      teacher,
      locale,
    });
  }

  it("localizes the model's line", async () => {
    draftGroundingLine.mockResolvedValue("Look for minibeasts under the grey log this autumn.");
    const { line } = await grounded("us", true);
    expect(line).toBe("Look for bugs under the gray log this fall.");
  });

  it("localizes the deterministic floor under it", async () => {
    // No teacher: the model is never reached and the composed sentence stands.
    // It says "a soft grey sky" in a US class's ear without this.
    const { line } = await grounded("us", false);
    expect(line).toContain("gray");
    expect(line).not.toContain("grey");
  });

  it("leaves the native voice alone", async () => {
    const composed = "Look for minibeasts under the grey log this autumn.";
    draftGroundingLine.mockResolvedValue(composed);
    expect((await grounded("uk", true)).line).toBe(composed);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 5. THE PROMPTS STOPPED PULLING THE OTHER WAY
 * ───────────────────────────────────────────────────────────────────────── */

describe("no prompt names a dialect", () => {
  it("leaves the dialect to the transform, in every prompt file", () => {
    // `house-rules.md` said "in British English" and `species-note.md` said
    // "British spelling" while the authored text beside their output had been
    // rewritten to US English. Steering the model against the transform is how
    // one screen ends up holding two vocabularies.
    const offenders: string[] = [];
    for (const file of [...Object.values(PROMPT_FILES), "_shared/house-rules.md", "_shared/lesson-support-tasks.md"]) {
      const text = read(`prompts/${file}`);
      const named = text.match(/\b(british|american|en-GB|en-US|UK English|US English)\b/i);
      if (named) offenders.push(`prompts/${file}: "${named[0]}"`);
    }
    expect(offenders).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 6. THE PART THAT KEEPS IT FIXED
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Every prompt in the registry, and what happens to the words it produces.
 *
 * The registry is the canonical list of things a model writes in this product
 * (`PROMPT_FILES` — a prompt file nobody names cannot be reached, and
 * validate-prompts fails on one that is not named). So a fourth, fifth or
 * thirteenth drafter cannot arrive without arriving here, and the author has
 * to say which column it belongs in.
 */
const LOCALIZED_IN: Record<string, string> = {
  "species-note": "app/species/[slug]/page.tsx",
  "species-learning": "app/api/species-learning/route.ts",
  "place-description": "app/WorldAround.tsx",
  "lesson-support": "app/api/lesson-support/route.ts",
  // The drafter itself, because it also has to protect the species names it
  // was handed (localizeDoorSentence).
  "door-line": "lib/ai/door-line.ts",
  "conditions-line": "lib/conditions.ts",
  "nature-grounding-line": "lib/grounding.ts",
  // Landed three minutes before #393 merged, carrying the same fault: the
  // route localizes the authored question it hands the model and returned the
  // model's rephrasing raw. The table below is what caught it.
  "ask-another-way": "app/api/ask-another-way/route.ts",
  // The drafted instruction is merged into the session and then localized with
  // the rest of the pack — habitat first, THEN localize (#207, #265).
  "place-instruction": "app/run/page.tsx",
};

const EXEMPT: Record<string, string> = {
  "species-id": "an identity, not display text: it names which species a photo is, and a name is never localized (the false-friend rule)",
  "world-extract": "the teacher's own words about her own grounds, extracted rather than written; localizing them would edit her",
  "world-photo-extract": "the same, from a photograph of her own site plan",
  "look-for-line": "no caller at all — declared and unread, as tests/unit/draft-seam.spec.ts notes. It must be localized on the way in if it is ever wired",
};

/** Named, dated and ticketed, so an exemption is a debt rather than a shrug. */
const TRACKED_ELSEWHERE: Record<string, string> = {};

describe("every prompt in the registry is accounted for", () => {
  it("declares what happens to the words each one produces", () => {
    const declared = [
      ...Object.keys(LOCALIZED_IN),
      ...Object.keys(EXEMPT),
      ...Object.keys(TRACKED_ELSEWHERE),
    ].sort();
    // The assertion that survives this ticket: a new prompt lands in the
    // registry and this goes red until somebody decides which column it is in.
    expect(declared).toEqual(Object.keys(PROMPT_FILES).sort());
  });

  it("puts every localized draft through the one seam, not a second copy of it", () => {
    for (const [id, file] of Object.entries(LOCALIZED_IN)) {
      const text = read(file);
      expect(text, `${id} is declared as localized in ${file}`).toMatch(
        /\blocaliz(eText|eDeep)\(/
      );
      expect(text, `${id}: ${file} must use lib/localization, not its own map`).toContain(
        '"@/lib/localization"'
      );
    }
  });

  it("has no prompt claiming two answers at once", () => {
    const seen = new Set<string>();
    for (const id of [
      ...Object.keys(LOCALIZED_IN),
      ...Object.keys(EXEMPT),
      ...Object.keys(TRACKED_ELSEWHERE),
    ]) {
      expect(seen.has(id), `${id} is declared twice`).toBe(false);
      seen.add(id);
    }
  });
});
