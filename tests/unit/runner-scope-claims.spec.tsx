import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntitySheet } from "@/app/run/HybridJourney";
import { RunScopeProvider } from "@/app/run/RunScope";
import {
  HAZARDS_UNCHECKED_CAPTION,
  NO_RECORD_CAPTION,
  outsideScope,
} from "@/lib/outside/captions";
import type { CastMember } from "@/lib/cast/member";

/**
 * THE RUNNER CLAIMED A SCHOOL IT DOES NOT HAVE (#370).
 *
 * Signed-out sample mode has no school and no grounds. #373 taught Today and
 * the door that — it scoped `app/TodayDay.tsx` and `lib/lesson/door.ts` through
 * `lib/outside/captions.ts` — and said in its own body that it merely
 * "advances #370". It touched nothing under `app/run`, so the runner, the
 * surface a lesson is actually delivered from, went on saying "near your
 * school" in the entity sheet and "for your grounds" in the assistant to a
 * visitor holding a phone in a field with neither.
 *
 * The pin is two-sided, like #1214's before it:
 *
 *   A VISITOR IS NOT TOLD SHE HAS A SCHOOL — sample mode says "the sample
 *   patch", and a chosen spot says "the place you chose".
 *
 *   A REAL LOCATED CLASS KEEPS ITS WORDS — the context default is "school",
 *   and that row of each caption is byte-identical to what shipped. That is
 *   not tidiness: `lib/localization.ts` swaps "grounds" for "schoolyard" by
 *   word-boundary rule, so editing the school row silently rewrites American
 *   copy that nobody reviewed.
 *
 * `EntitySheet` renders directly, so it is asserted by rendering. The
 * assistant's hazards line is behind a tap and this suite has no DOM (vitest
 * runs `environment: "node"`), so — in the idiom `runner-group-noun.spec.tsx`
 * established for exactly this reason — the source is read instead, with
 * comments stripped first: prose that MENTIONS a claim is not a claim on
 * screen.
 *
 * The source sweep is the half that holds over time, and the page-wiring test
 * is the half the caption assertions cannot see: the context default is the
 * school word, so a provider that is never mounted reinstates the entire bug
 * in silence with every other test still green.
 */

const RUN_DIR = new URL("../../app/run/", import.meta.url);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function runSources(): Array<{ file: string; code: string }> {
  return readdirSync(RUN_DIR)
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
    .map((file) => ({
      file,
      code: stripComments(readFileSync(new URL(file, RUN_DIR), "utf8")),
    }));
}

/**
 * The ONE rendered use of "your school" left in the runner, and why it is not
 * a claim: it is the signed-out offer on `page.tsx`, which says a chosen place
 * is "not a saved school yet" and that signing in would make it one. It
 * describes a future state rather than asserting a present school, which is
 * the distinction this whole ticket turns on.
 *
 * Held as an exact allowlist rather than a looser pattern so the list cannot
 * grow by accident: a second sentence that wants this exemption has to be
 * typed in here, where a reviewer reads it.
 */
const NOT_A_CLAIM = ["Sign in and it becomes your school's own."];

/**
 * A cast member the composer wrote no line for, which is the branch that
 * carries the claim. Fully typed rather than cast through `unknown`: if the
 * shape changes under this spec, the spec should say so.
 */
function memberWithNoLine(): CastMember {
  return {
    commonName: "Grey squirrel",
    scientificName: "Sciurus carolinensis",
    photoUrl: null,
    iconicTaxon: "Mammalia",
    honestyTier: "regional",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
  };
}

describe("whose patch the runner says it read", () => {
  it("tells a sample-mode visitor about the sample patch, not her school", () => {
    const markup = renderToStaticMarkup(
      <RunScopeProvider scope="sample">
        <EntitySheet member={memberWithNoLine()} onClose={() => {}} />
      </RunScopeProvider>
    );
    expect(markup).toContain("Nothing has been recorded near the sample patch this week");
    expect(markup).not.toContain("your school");
  });

  it("names the place a signed-out visitor chose, which is neither", () => {
    const markup = renderToStaticMarkup(
      <RunScopeProvider scope="chosen">
        <EntitySheet member={memberWithNoLine()} onClose={() => {}} />
      </RunScopeProvider>
    );
    expect(markup).toContain("Nothing has been recorded near the place you chose this week");
    expect(markup).not.toContain("the sample patch");
    expect(markup).not.toContain("your school");
  });

  it("still says 'your school' to a located class, with no provider at all", () => {
    const markup = renderToStaticMarkup(
      <EntitySheet member={memberWithNoLine()} onClose={() => {}} />
    );
    expect(markup).toContain("Nothing has been recorded near your school this week");
  });

  it("leaves no unscoped school or grounds claim anywhere in the runner", () => {
    const offenders = runSources().flatMap(({ file, code }) =>
      [...code.matchAll(/your (?:school|grounds)/g)]
        .map((match) => ({
          file,
          window: code.slice(Math.max(0, match.index - 90), match.index + 60),
        }))
        .filter(({ window }) => !NOT_A_CLAIM.some((allowed) => window.includes(allowed)))
        .map(({ file, window }) => `${file}: ${window.trim()}`)
    );
    expect(offenders, "every rendered claim goes through lib/outside/captions.ts").toEqual([]);
  });

  it("routes the assistant's unchecked-hazards line through the caption record", () => {
    const assistant = stripComments(readFileSync(new URL("AssistantSheet.tsx", RUN_DIR), "utf8"));
    expect(assistant).toMatch(/useRunScope\(\)/);
    expect(assistant).toMatch(/HAZARDS_UNCHECKED_CAPTION\[scope\]/);
  });

  it("wires the scope into all three runners from the read the page already did", () => {
    const page = stripComments(readFileSync(new URL("page.tsx", RUN_DIR), "utf8"));
    // The page already read the surface; it simply never asked whose it was.
    expect(page).toMatch(/outsideScope\(surfaceCast/);
    // Scroll, hybrid and legacy. The context default is the school word, so a
    // runner rendered outside the provider claims a school for everyone —
    // which is this bug, not a fallback.
    expect(page.match(/<RunScopeProvider /g) ?? []).toHaveLength(3);
  });

  it("keeps the three registers captions.ts already documents", () => {
    expect(outsideScope({ located: false, chosen: false })).toBe("sample");
    expect(outsideScope({ located: true, chosen: true })).toBe("chosen");
    expect(outsideScope({ located: true, chosen: false })).toBe("school");
    // An unreadable cast is unlocated, so it says sample rather than claiming
    // a school it could not read for.
    expect(NO_RECORD_CAPTION.sample).toContain("the sample patch");
    expect(HAZARDS_UNCHECKED_CAPTION.sample).toContain("the sample patch");
    // Byte-identical to what shipped, because the US rendering depends on it.
    expect(HAZARDS_UNCHECKED_CAPTION.school).toBe(
      "We have not checked hazards for your grounds yet. Your own risk assessment leads."
    );
  });
});
