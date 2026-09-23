import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorldBuilder, type WorldSection } from "@/app/WorldBuilder";

/**
 * PLAIN, AND PHOTOS FIRST (#751).
 *
 * Provenance: the first real teacher session, 2026-08-31
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`). Her read of
 * this surface, in Johan's transcription: *"too clunky, the language is so
 * poetic un understandable"*. His directive: *"simplify make it more
 * straightforward.. more importance on photos etc."*
 *
 * WHAT #654 GOT WRONG, WHICH IS WHY THIS FILE EXISTS. #654 was an elevation
 * pass on this exact surface: one question per screen, a staggered read-back,
 * a little tutorial beat. It shipped, and the first real teacher to touch it
 * still bounced. It had changed the RHYTHM of the questions and left their
 * WORDS alone — and then dressed the old words in a bigger typeface, which
 * makes a riddle louder rather than clearer. A step titled "The things a map
 * cannot see", reached by a button reading "Next: the things a map cannot
 * see", is a metaphor twice over where a teacher standing in a field needs an
 * instruction.
 *
 * So this pins the thing #654 did not: the WORDS. Two rules, one countable.
 *
 *   1. SHAPE, computed. Every step heading opens with an instruction or a
 *      question word, so a teacher reading only the heading knows what she is
 *      being asked to do. Before this change 2 of the 6 headings in the world
 *      walk did; after it, 6 of 6. That count is the metric on the pull
 *      request and this test is the query behind it.
 *
 *   2. THE COPY ITSELF, pinned. The headings are quoted here verbatim. Copy
 *      that came out of a real user session is not free to drift back to
 *      poetry on someone's afternoon judgement; changing it means changing
 *      this file, in a diff a reviewer can see, with a reason.
 *
 * What the change looks like: `docs/evidence/751-world-builder/`, two renders
 * of this component with all four questions stacked, before and after.
 *
 * NOT A BAN LIST. There are no forbidden words here. The shape rule judges the
 * first word of a heading and nothing else, and the pins are the copy of
 * record rather than a vocabulary. What replaced the poetry is a decision;
 * what this file prevents is that decision being undone silently.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Source with comments stripped: a check on what the CODE does must not be
 *  satisfiable by a comment that merely mentions the thing. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function markup(only: WorldSection): string {
  return renderToStaticMarkup(
    <WorldBuilder features={[]} notes={[]} reach={null} only={only} />
  );
}

/** The text of the one <h2> a solo section renders. */
function heading(only: WorldSection): string {
  const html = markup(only);
  const match = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(html);
  expect(match, `section "${only}" renders no heading`).not.toBeNull();
  return (match?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of the one helper line a solo section renders under its heading. */
function said(only: WorldSection): string {
  const match = /<p class="[^"]*_said_[^"]*">([\s\S]*?)<\/p>/.exec(markup(only));
  expect(match, `section "${only}" has no helper line`).not.toBeNull();
  return (match?.[1] ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A heading states its job when it opens as an instruction or a question.
 *
 * Deliberately a first-word rule and nothing more: it is the one property that
 * separates "Tick what your grounds have" from "The things a map cannot see"
 * without anyone legislating vocabulary, and it is countable, which is what
 * makes the claim on the pull request checkable rather than a matter of taste.
 */
const OPENERS = ["Take", "Tick", "Name", "Pick", "Tell", "Which", "What", "How", "Where"];

function statesItsJob(head: string): boolean {
  const first = head.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  return OPENERS.includes(first);
}

/* ───────────────────────────────────────────────── the four questions ──── */

describe("every world-builder question says what it is for, in plain words", () => {
  const pinned: Record<WorldSection, string> = {
    chat: "Take a photo of your grounds",
    features: "Tick what your grounds have",
    species: "Name any plants or animals you know here",
    reach: "How far can you take a class?",
  };

  for (const [section, expected] of Object.entries(pinned) as [WorldSection, string][]) {
    it(`the "${section}" step is headed "${expected}"`, () => {
      expect(heading(section)).toBe(expected);
    });
  }

  it("all four headings open with an instruction or a question word", () => {
    const heads = (Object.keys(pinned) as WorldSection[]).map(heading);
    expect(heads.filter(statesItsJob)).toHaveLength(heads.length);
  });

  it("every step also says what we do with the answer, in one short line", () => {
    for (const section of Object.keys(pinned) as WorldSection[]) {
      const said = /<p class="[^"]*_said_[^"]*">([\s\S]*?)<\/p>/.exec(markup(section));
      expect(said, `section "${section}" has no helper line`).not.toBeNull();
      const text = (said?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      // Two sentences at most. The complaint was clunk; a paragraph under
      // every heading is clunk with better manners.
      expect(text.split(/[.?!]\s/).length).toBeLessThanOrEqual(2);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

/* ──────────────────────────────── what the answer actually changes (#777) ── */

/**
 * SHAPING IS NOT CHOOSING.
 *
 * #769 made these two lines plain. Plain is not the same as true, and both of
 * them then promised a selector: *"We use this to pick lessons your class can
 * actually do"* and *"It decides which lessons we put in front of you."* A
 * teacher reads either one and expects a DIFFERENT LESSON if she ticks
 * differently. She will not get one.
 *
 * The path, walked for #777 rather than taken from the ticket:
 *
 *   `siteFeatures` → `habitatsFromFeatures` (lib/look-for.ts:56)
 *   `grounds`      → `groundsToHabitats`    (lib/outside/grounds.ts:59)
 *        both → `reachableHabitatsFor` (lib/place-context.ts:204)
 *        → `place.lookFor.reachable`  (lib/place-context.ts:84)
 *        → `reachableTags`            (app/run/page.tsx:68,
 *                                      app/session/lesson-data.ts:59,
 *                                      lib/offline/prepare-server.ts:81)
 *        → narrows `getOutsideNow` look-fors, narrows `hazardsForClass`,
 *          and is the context `adaptSessionForPlace` drafts against.
 *   `grounds` also → `todayQuery.habitats` (app/page.tsx:213, 243).
 *
 * Every one of those changes what is INSIDE the lesson, or what the Outside-now
 * read shows. WHICH lesson she gets is `nextUnled(led, curriculumSequence())`
 * at app/page.tsx:194-201 — curriculum position, which no tick on either screen
 * reaches. (`shelfForPlace` does narrow a shelf, by bioregion pack, and its own
 * doc-comment records that it is a no-op today.)
 *
 * So this pins the corrected lines, and keeps the two replaced ones alive below
 * as the discriminating half: a rule about claims that nothing ever failed
 * would be measuring nothing.
 */
describe("the world walk promises shaping, which is what it does, not selection", () => {
  const flow = code(read("app/start/StartFlow.tsx")).replace(/\s+/g, " ");

  it("the features step says it fits the lesson, and names what moves", () => {
    expect(said("features")).toBe(
      "Tick anything you can walk a class to. We use it to fit each lesson to " +
        "your grounds: what we ask your class to look for, and what we warn you about."
    );
  });

  it("keeps the richer questions out of first run", () => {
    expect(flow).not.toContain("Tick everything within a short walk.");
    expect(flow).not.toContain("WorldBuilder");
  });

  /**
   * THE METRIC ON THE PULL REQUEST, computed rather than asserted in prose.
   *
   * Not a ban list — the same rule this file already writes down. This is a
   * two-item census of the specific claim the build cannot honour, quoted in
   * full so the check is over sentences that once shipped rather than over a
   * vocabulary anyone might trip on later.
   */
  it("no world-walk line still promises a lesson the ticks cannot deliver: 0 of 2, where 2 of 2 did", () => {
    const promisedSelection = [
      "We use this to pick lessons your class can actually do",
      "It decides which lessons we put in front of you.",
    ];

    // Discriminating: both of these really were on screen before #777.
    expect(promisedSelection).toHaveLength(2);

    const onScreenNow = [said("features"), flow];
    const stillPromising = promisedSelection.filter((claim) =>
      onScreenNow.some((line) => line.includes(claim))
    );
    expect(stillPromising).toHaveLength(0);
  });
});

/* ─────────────────────────────────────────────────── the camera leads ──── */

describe("the photograph leads the step it shares with typing", () => {
  const html = markup("chat");

  it("offers the camera before the text box, not under it", () => {
    const camera = html.indexOf("Take a photo</button>");
    const box = html.indexOf("<textarea");
    expect(camera).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(-1);
    expect(camera).toBeLessThan(box);
  });

  it("gives it button weight rather than the quiet underline every other control wears", () => {
    // CSS module class names arrive hashed (`_photoButton_ab12ef`), so match
    // the stem: the assertion is that the camera wears its OWN class rather
    // than `chatSend`, the quiet underline shared by "Add" and "Read this".
    expect(html).toMatch(/<button[^>]*class="[^"]*_photoButton_[^"]*"/);
    expect(html).not.toMatch(/<button[^>]*class="[^"]*_chatSend_[^"]*"[^>]*>Take a photo/);
    expect(html).toMatch(/class="[^"]*_orTypeLabel_[^"]*"/);
    expect(html).toContain("Or type it instead");
  });

  it("still says the photo is read once and never saved, under the button that takes it", () => {
    const promise = "The photo is read once and never saved.";
    expect(html).toContain(promise);
    expect(html.indexOf("Take a photo</button>")).toBeLessThan(html.indexOf(promise));
  });
});

/* ──────────────────────────────────────── outside first-run onboarding ──── */

describe("world building lives in Grounds, outside first-run onboarding", () => {
  const flow = code(read("app/start/StartFlow.tsx"));

  it("does not import, render or save the WorldBuilder during first run", () => {
    expect(flow).not.toContain("WorldBuilder");
    expect(flow).not.toContain("setWorld");
    expect(flow).not.toContain("setGrounds");
    expect(flow).not.toContain("Tell us about your grounds.");
  });
});

/* ────────────────────────────────────────── photos in the built world ──── */

describe("the world a teacher keeps leads with photographs", () => {
  const page = code(read("app/world/page.tsx"));

  it("puts the photographs above the sentences about the season and the map", () => {
    expect(page.indexOf("<PlacePhotos")).toBeGreaterThan(-1);
    expect(page.indexOf("<PlacePhotos")).toBeLessThan(page.indexOf("<WorldAround"));
  });

  it("gives them the lead treatment and enough of them to be worth a flick", () => {
    expect(page).toMatch(/<PlacePhotos[^>]*lead/);
    expect(page).toMatch(/readPlacePhotos\(\{[^}]*limit:\s*12/);
  });
});
