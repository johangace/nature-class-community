import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asLocale, localizeText } from "@/lib/localization";

/**
 * "GROUNDS" IS THE WRONG NOUN FOR A US READER, AND THE FIX IS A LAYER (#872).
 *
 * Two testers on consecutive days read the product as British, and "grounds"
 * is load-bearing vocabulary rather than a stray label. Per #142 the word is
 * held in the locale layer and never edited at the source: UK stays the
 * native voice, and every surface that says it asks the layer first.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the noun, through the layer", () => {
  it("leaves the UK voice alone", () => {
    expect(localizeText("Tick what your grounds have", "uk")).toBe("Tick what your grounds have");
  });

  it.each([
    ["Tick what your grounds have", "Tick what your schoolyard has"],
    ["What's living in our grounds?", "What's living in our schoolyard?"],
    ["How many living things share our whole school grounds?", "How many living things share our whole schoolyard?"],
    ["A general list for grounds like yours, not a survey of your patch.", "A general list for a schoolyard like yours, not a survey of your patch."],
    ["Nothing has been checked for these grounds.", "Nothing has been checked for this schoolyard."],
    ["Grounds for Willow class", "Schoolyard for Willow class"],
    ["Change Grounds", "Change Schoolyard"],
    ["Map the grounds", "Map the schoolyard"],
  ])("%s -> %s", (uk, us) => {
    expect(localizeText(uk, "us")).toBe(us);
  });

  it("never turns the legal idiom into a place", () => {
    expect(localizeText("cut on the grounds that it repeats", "us")).toBe("cut because it repeats");
  });

  it("does not touch the singular, which is not the same word", () => {
    expect(localizeText("Sit on the ground and look up", "us")).toBe("Sit on the ground and look up");
    expect(localizeText("playground", "us")).toBe("playground");
  });

  it("reads a client prop's plain string as a locale", () => {
    expect(asLocale("us")).toBe("us");
    expect(asLocale("uk")).toBe("uk");
    expect(asLocale(undefined)).toBe("uk");
    expect(asLocale("en-US")).toBe("uk");
  });
});

describe("every surface that says the word asks the layer", () => {
  it.each([
    "app/classes/page.tsx",
    "app/world/page.tsx",
    "app/world/WorldForm.tsx",
    "app/WorldBuilder.tsx",
    "app/run/AssistantSheet.tsx",
    "app/session/safety/SafetyPage.tsx",
    "app/run/HybridJourney.tsx",
    "app/SetupTasks.tsx",
  ])("%s imports localizeText", (file) => {
    expect(read(file)).toMatch(/localizeText/);
  });

  it("leaves no bare grounds sentence outside the layer on the surfaces it covers", () => {
    // A rendered string that says the noun and is not inside a t(...) or
    // localizeText(...) call. Comments are stripped first; code identifiers
    // (groundsProfile, class-grounds) are not sentences.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["app/world/WorldForm.tsx", "app/WorldBuilder.tsx", "app/session/safety/SafetyPage.tsx"]) {
      const src = strip(read(file));
      // Code between a generic's `>` and the next `<` is not a sentence.
      const bare = [...src.matchAll(/>([^<>{}]*\bgrounds\b[^<>{}]*)</gi)]
        .map((m) => m[1]?.trim() ?? "")
        .filter((text) => !/[();=]/.test(text));
      expect(bare, file).toEqual([]);
    }
  });
});
