import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CLARITY OVER POETRY, ACROSS THE WHOLE OF /start (#795, restored by #905).
 *
 * Provenance: Johan, 2026-09-01, rejecting the register on the
 * educator-branching sketch (`docs/concepts/nature-class-other-educators-2026-08-31.html`,
 * pin H): *"terrible copy again i want clarity over poetry."* The rule he
 * wrote down there is the one this file enforces: **state the function.**
 * Every string on these screens says what the screen does, or what the
 * product does with the answer. It does not perform.
 *
 * WHY A CENSUS AND NOT A WORD BAN. There is no vocabulary in this file and
 * there will not be one. `scripts/authorship.mjs` records what happened the
 * last three times a style rule was pointed at sentences rather than at a
 * decision. What this file does instead is COUNT: it extracts every static
 * copy string /start renders and asserts that each one is pinned here,
 * verbatim. Changing any of them then means changing this file, in a diff a
 * reviewer can see, with a reason. That is the whole mechanism.
 *
 * WHY IT IS BEING WRITTEN A SECOND TIME. #898 rebuilt /start as the lean
 * two-screen flow and replaced the census with five `toContain` calls. Five
 * strings held; the other twenty-five could be rewritten by anybody, in any
 * register, and no test would move. A census that a one-word change cannot
 * fail is not this mechanism, it is a spot check wearing its name (#905).
 *
 * THE METRIC ON THE PULL REQUEST, computed rather than asserted in prose.
 * Before this file was restored, 5 of the 30 copy strings in
 * `app/start/StartFlow.tsx` were pinned verbatim by this spec. After it,
 * 30 of 30. The census below is the query behind that claim and it re-runs on
 * every suite.
 *
 * WHAT THE CENSUS COVERS, precisely, so the number is not oversold: static
 * copy in `app/start/StartFlow.tsx` only, with comments stripped, being every
 * double-quoted string literal and every contiguous run of JSX text that is
 * at least twelve characters long, contains a space and opens with a capital.
 * Composed sentences (`app/start/location-state.ts`, `lib/outside/captions.ts`),
 * the ability labels (`lib/ability.ts`) and anything a template literal splices
 * are outside it. It is a floor, not a ceiling.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Source with comments stripped: a census of what the SCREEN says must not be
 *  satisfiable by a comment that merely quotes the sentence. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Entities and wrapping are typography, not wording. Compare the words. */
function plain(text: string): string {
  return text
    .replace(/&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every static copy string the flow renders.
 *
 * Two harvests, because the flow writes copy two ways. Quoted literals cover
 * the ternaries, the placeholders and the error strings; the text run covers
 * plain JSX. A run is bounded by `>` or `}` on the left and `<` or `{` on the
 * right, so an interpolation ends a run rather than swallowing the markup
 * after it.
 */
function startCopy(): string[] {
  const source = code(read("app/start/StartFlow.tsx"));
  const found = new Set<string>();
  for (const m of source.matchAll(/"([^"\\]*)"/g)) found.add(m[1] ?? "");
  for (const m of source.matchAll(/[>}]([^<>{}]+)[<{]/g)) found.add(m[1] ?? "");

  return [...found]
    .map(plain)
    .filter(
      (s) =>
        s.length >= 12 &&
        /\s/.test(s) &&
        /^[A-Z]/.test(s) &&
        // Class lists, import paths and anything carrying markup are not copy.
        !/[{}/\\]/.test(s)
    )
    .sort();
}

/* ─────────────────────────────────────────────── the copy of record ──── */

/**
 * The whole voice surface of /start, screen by screen. Sorted on comparison,
 * grouped here so a reader can see which screen owns which sentence.
 *
 * Two apostrophes live in this list. `&rsquo;` in JSX is normalised to an
 * ASCII quote above; a curly `’` written inside a string literal is not, and
 * is pinned as it is typed. Both are what the screen prints.
 */
// Johan approved these revised labels on 2026-09-12 (#1155).
const PINNED: readonly string[] = [
  "Address, postcode or place",
  "Change location",
  "Choose a location to continue.",
  "Enter the school, park or address above, or change your browser permission and try again.",
  "Finding places…",
  "Finding your location…",
  "Group name (optional)",
  "Location permission was declined.",
  "Location selected",
  "Location selected. Check the map below.",
  "Matching places",
  "No place came back for that. Try a town or postcode.",
  "See today’s session",
  "Select a location",
  "Select a suggestion to confirm your location.",
  "Show activities",
  // The unnamed skip became a named row of example places (#877, third
  // slice): the same door out of the question, saying where it leads.
  "Or see it running somewhere else, live:",
  "Start typing an address or place",
  "Use current location",
  "We couldn't get your location.",
  "We couldn't reach place search. Your details are still here, so try again.",
  "We couldn’t keep that place. Everything you entered is still here, so try again.",
  "We couldn’t save your setup. Everything you entered is still here, so try again.",
  "We use this for local weather, seasons and nearby nature. You can change it later.",
  "We use this for today's weather, the season and nearby nature. It stays in your browser. Nothing is saved until you sign in.",
  "What age range?",
  "Where will you use it?",
  "Who is this for?"
];

describe("every string on /start is copy of record", () => {
  it("pins the flow's whole static voice surface, and nothing it does not render", () => {
    expect(startCopy()).toEqual([...PINNED].sort());
  });

  it("prints no em dash, which this product does not print anywhere", () => {
    expect(startCopy().filter((line) => line.includes("\u2014"))).toEqual([]);
    expect(code(read("app/start/StartFlow.tsx"))).not.toContain("\u2014");
  });
});

/* ───────────────────────────── what the sweep replaced, and why ──── */

/**
 * THE DISCRIMINATING HALF.
 *
 * A rule that nothing ever failed is measuring nothing, so the lines this
 * flow used to print are quoted here in full. Each was really on screen, and
 * each performed, asked twice, or offered work first run has no business
 * asking for.
 */
describe("no /start line performs where it should inform, and none asks twice", () => {
  const flow = plain(code(read("app/start/StartFlow.tsx")));

  const retired = [
    // A metaphor for a data read, on a screen with nothing to tap.
    "Tap your class's location and this window opens onto your own patch.",
    // A riddle. The screen it led to was headed "Tell us about your grounds."
    "Next: what's out there?",
    // A second, softer question than the one the next screen actually asked.
    "Next: where do you go outside?",
    // The world walk and the passkey offer: optional work, moved out of first
    // run by #878 and kept out by #905.
    "Tell us about your grounds.",
    "Skip for now, I'll set this later",
    "Maybe later, take me to today",
    // The school, asked on screen 1 and then searched for on screen 2 (#905).
    "We need your school or organization name.",
  ];

  it("none of the retired lines is still rendered", () => {
    expect(retired.filter((line) => flow.includes(line))).toEqual([]);
  });

  it("names the school field once, on the screen that already knows the place", () => {
    // One label, one input, one screen. Two would be the bug this closed.
    expect(flow).not.toContain("School or organization");
    expect(flow).not.toContain('id="start-school"');
  });
});
