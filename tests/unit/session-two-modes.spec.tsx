import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
/**
 * The conditions note streams behind its own Suspense boundary (2026-09-08),
 * so rendering this page reaches `getTodayRead`. It is mocked to an empty
 * read rather than given a fixture: this file is about the page's own shape,
 * and a unit test may not depend on a third party's response time (nc#808).
 * The note's own behaviour is tested in session-page-conditions-note.spec.tsx.
 */
vi.mock("@/lib/outside/today", () => ({
  getTodayRead: vi.fn(async () => ({ conditions: [], read: null })),
}));

import { SessionModes } from "@/app/session/SessionModes";
import { projectLessonJourney } from "@/lib/lesson/journey";
import type { LessonMediaItem } from "@/lib/lesson/media";
import { findSession } from "@/lib/pack";

const SESSION_ID = "summer-w1-counting-life";

function renderModes(
  previewSeconds: number | null = 92,
  offlineAvailable = false,
  media: LessonMediaItem[] = []
) {
  const found = findSession(SESSION_ID);
  if (!found) throw new Error(`Missing fixture ${SESSION_ID}`);

  return renderToStaticMarkup(
    <SessionModes
      activeClass={{ name: "Willow class", yearGroup: "Year 1" }}
      hazards={{
        source: "starter",
        entries: [{ id: "ground", name: "Ground", note: "Walk the route first." }],
      }}
      journey={projectLessonJourney(found.pack, found.session)}
      locale="uk"
      offlineAvailable={offlineAvailable}
      previewSeconds={previewSeconds}
      session={found.session}
      todayQuery={{}}
      weekOf="week 1 of 4"
    />
  );
}

describe("the lesson page and its one threshold (#832)", () => {
  it("prepares in the open and offers one lesson entry", () => {
    const markup = renderModes();

    // Before class is a state, not a mode to enter (#832's superseding ruling).
    expect(markup).toContain("Before class");
    expect(markup).toContain("Preview lesson");
    expect(markup).toContain("Pre-reading");
    expect(markup).not.toContain("Conditions");
    expect(markup).toContain("Print");
    expect(markup).toContain("With your class");
    expect(markup).toContain("Start lesson");
    expect(markup).not.toContain("Start indoors");
    expect(markup).not.toContain("Start outside");

    // The retired framings stay retired.
    expect(markup).not.toContain("Pre-Walk");
    expect(markup).not.toContain("Run Session Outside");
    expect(markup).not.toMatch(/Door\s*[12]/i);

    // Open destinations, not another checklist.
    expect(markup).not.toContain("<ol");
    expect(markup).not.toContain("<ul");

    expect(markup).not.toMatch(/scout|camp|family|parent/i);
  });

  it("keeps every preparation action on the lesson being prepared", () => {
    const markup = renderModes();

    expect(markup).toContain(
      `href="/session/preview?session=${SESSION_ID}&amp;locale=uk"`
    );
    expect(markup).toContain(
      `href="/session/primer?session=${SESSION_ID}&amp;locale=uk"`
    );
    expect(markup).not.toContain(
      `href="/outside?session=${SESSION_ID}&amp;locale=uk"`
    );
    expect(markup).toContain(
      `href="/session/safety?session=${SESSION_ID}&amp;locale=uk"`
    );
    expect(markup).toContain(
      `href="/print?session=${SESSION_ID}&amp;locale=uk"`
    );
    expect(markup).toContain(
      `href="/session/start?session=${SESSION_ID}&amp;locale=uk"`
    );
  });

  it("does not offer a dead preview control", () => {
    expect(renderModes(null)).not.toContain("Preview");
  });

  it("shows the lesson species as soon as the session card opens", () => {
    const media: LessonMediaItem[] = [
      {
        id: "horse-chestnut",
        name: "Horse chestnut",
        scientificName: "Aesculus hippocastanum",
        kind: "reference",
        radiusKm: null,
        observedAt: null,
        sourceUrl: "https://example.test/horse-chestnut",
        photo: {
          url: "https://example.test/horse-chestnut.jpg",
          role: "taxon-reference",
          attribution: "Example",
          license: "cc-by",
          sourceUrl: "https://example.test/horse-chestnut",
        },
      },
    ];

    const markup = renderModes(92, false, media);

    // The look-for row left this page on 2026-09-06 (Johan: "this is deeper
    // in introduce"): the pictures a class looks at live on the
    // introduction's day screen now.
    expect(markup).not.toContain("What to look for in this lesson");
    expect(markup).not.toContain("Horse chestnut");
  });
});

/**
 * THE SHAPE OF PREPARATION (#870).
 *
 * The four tools shipped as a horizontal strip and Johan turned the strip
 * down: "I do NOT like the horizontal presentation.. it looks like we went
 * backgward.. would rather have them horizontal. and clear with icons the
 * buttons on pre walk". The arrangement stops being horizontal; each button
 * starts being one.
 *
 * Two of the three claims made for the new shape are claims a machine can
 * hold, so they are held here rather than described in a comment: every tool
 * is led by a glyph, and the rows are the SAME SHAPE AT EVERY WIDTH. That
 * second one is the reason the strip was the wrong answer in the first place —
 * it collapsed to a stack under 760px, so its horizontal arrangement was a
 * desktop-only design a teacher on a phone never saw. A width branch creeping
 * back into this module would quietly restore exactly that, and nothing else
 * in the suite would notice.
 */
describe("preparation is icon-led field rows, not a strip (#870)", () => {
  const MODULE = readFileSync(
    new URL("../../app/session/session-modes.module.css", import.meta.url),
    "utf8"
  );

  it("leads every preparation tool with a glyph, and the door with one too", () => {
    const markup = renderModes();
    const glyphs = markup.split("<svg").length - 1;

    // Four preparation tools, the threshold, and the wordmark in the topbar.
    expect(glyphs).toBeGreaterThanOrEqual(5);

    // The door's glyph is inside the door, not floating beside it.
    expect(markup).toMatch(/<a[^>]*>\s*<svg[\s\S]*?Start lesson/);
  });

  it("draws a list, not a table: no vertical rules between tools", () => {
    expect(MODULE).not.toMatch(/border-left/);
  });

  it("does not draw a divider above Before class", () => {
    const start = MODULE.indexOf(".prepRows {");
    const prepRows = MODULE.slice(start, MODULE.indexOf("}", start));

    expect(start).toBeGreaterThan(-1);
    expect(prepRows).not.toContain("border-top");
  });

  /* THE WHOLE ROW IS THE TAP TARGET, AND A MACHINE HOLDS IT NOW.
     The stretched pseudo-element is `inset: 0` on .rowAction, so it only
     reaches the row's edges while .rowAction is statically positioned and the
     positioned .prepRow stays its containing block. The rule that raises the
     row's SECOND link above the stretched layer used to select
     `.rowText :is(a, button)`, which caught .rowAction itself — one selector,
     and the row-wide target silently shrank to the width of its own words.
     Nothing rendered differently, so nothing but a miss on a phone showed it. */
  it("keeps the stretched hit area covering the row, not the words", () => {
    expect(MODULE).toMatch(/\.rowAction::after\s*\{[^}]*inset:\s*0/);
    expect(MODULE).toMatch(/\.prepRow\s*\{[^}]*position:\s*relative/);

    // Whatever raises the secondary links must exclude the row's own action.
    const raised = MODULE.match(/^\.rowText[^{]*\{[^}]*position:\s*relative[^}]*\}/gm) ?? [];
    expect(raised.length).toBeGreaterThan(0);
    for (const rule of raised) {
      expect(rule).toContain(":not(.rowAction)");
    }
  });

  it("keeps one shape at every width", () => {
    const phone = MODULE.slice(MODULE.indexOf("@media (max-width: 760px)"));

    expect(phone).toContain("@media (max-width: 760px)");
    // The gutter may narrow and the door pair may stack. The preparation rows
    // may not be touched at all: a width branch on them is exactly how the
    // strip came to be a desktop-only design in the first place.
    expect(phone).not.toMatch(/\.prepRow\b/);
    expect(phone).not.toMatch(/\.glyph/);
    expect(phone).not.toMatch(/\.rowText/);
    expect(phone).not.toMatch(/grid-template-columns/);
  });

  it("hides conditions while keeping the safety destination", () => {
    const markup = renderModes();

    // Safety remains accessible while Conditions is hidden.
    expect(markup).not.toContain("Conditions and safety");
    expect(markup).toMatch(/class="[^"]*rowAction[^"]*" href="\/session\/safety\?[^"]*">Safety<\/a>/);
    expect(markup).not.toContain("Conditions");
    expect(markup).toContain(">Safety</a>");
    expect(markup).not.toMatch(/<a[^>]*>(?:(?!<\/a>)[\s\S])*<a /);
  });
});

/**
 * WHERE THINGS SIT, AFTER JOHAN'S SECOND PASS ON #870.
 *
 * Three placements he ruled on, each one a claim a machine can hold:
 *
 *   "NO other pages have streched this wide... usually we are centered not
 *   left" — the page ran at 1120px while the primer holds 38rem and the live
 *   guide and narrated preview hold 44rem. At 1120px the column fills a laptop
 *   viewport, so there is no visible gutter and it reads flush left. It now
 *   takes the RUNNER'S measure, because the door on this page opens into that
 *   surface and the column must not jump width across the threshold.
 *
 *   "Go offline should not be there should be closer to the Run the lesson
 *   outside" — saving to the device is something you do because you are about
 *   to walk out of signal, so it belongs beside the door, not beside Print.
 *
 *   "what to bring should be inside of key ideas" — the kit is what decides
 *   whether you tap the thing you read the night before, so it is that row's
 *   supporting line. Print keeps its name and no caption, because the caption
 *   it had only restated the name.
 */
describe("where the lesson page puts things (#870, second pass)", () => {
  const MODULE = readFileSync(
    new URL("../../app/session/session-modes.module.css", import.meta.url),
    "utf8"
  );
  const RUNNER = readFileSync(
    new URL("../../app/run/journey.module.css", import.meta.url),
    "utf8"
  );

  /** Rules only: the comments above them quote the width being retired. */
  function declarations(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function measure(css: string): string {
    const value = css.match(/--measure:\s*([^;]+);/)?.[1];
    if (!value) throw new Error("no --measure declared");
    return value.trim();
  }

  it("holds one centred measure, and it is the runner's", () => {
    expect(measure(MODULE)).toBe(measure(RUNNER));
    expect(declarations(MODULE)).not.toMatch(/1120px/);
    // Centred, not flush left.
    expect(declarations(MODULE)).toContain("margin: 0 auto");
  });

  it("puts what to bring with the reading, not with the printing", () => {
    const markup = renderModes();
    const bring = markup.indexOf("What to bring");
    const keyIdeas = markup.indexOf("Pre-reading");
    const safety = markup.indexOf(">Safety</a>");
    const print = markup.indexOf("Print");

    expect(keyIdeas).toBeGreaterThan(-1);
    expect(bring).toBeGreaterThan(keyIdeas);
    expect(bring).toBeLessThan(safety);
    // Print keeps its name and drops the caption that only restated it.
    expect(markup.indexOf("What to bring", print)).toBe(-1);
  });

  it("keeps the offline control beside the door", () => {
    const markup = renderModes(92, true);
    const before = markup.indexOf("Before class");
    const heading = markup.indexOf(">With your class</h2>");
    const door = markup.indexOf("Start lesson");
    const offline = markup.indexOf("Go offline");

    expect(offline).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(-1);
    expect(offline).toBeGreaterThan(heading);
    expect(offline).toBeLessThan(door);
    expect(door).toBeLessThan(before);
  });
});

/**
 * ONE DESTINATION, ONE NAME (#870).
 *
 * Johan: "Pre-read? or preparation material?". The row is called Pre-reading,
 * and the reason is not taste: the runner's own intro already opens a door by
 * that name onto the same primer, and /field labels the printed sheet the same
 * way. "Read key ideas" was a third name for one place, which is the product
 * spelling itself two ways depending on which screen you came from.
 *
 * The lesson page is held to the spelling the other two surfaces already use,
 * so a rename on one of them cannot silently leave the others behind.
 */
describe("the pre-reading is called the same thing everywhere", () => {
  const SURFACES = [
    "../../app/run/HybridJourney.tsx",
    "../../app/field/FieldShell.tsx",
  ];

  it("names the row what the runner and the field sheet name it", () => {
    expect(renderModes()).toContain("Pre-reading");

    for (const surface of SURFACES) {
      const source = readFileSync(new URL(surface, import.meta.url), "utf8");
      expect(source.toLowerCase()).toContain("pre-reading");
    }
  });

  it("does not leave the retired name behind on the lesson page", () => {
    expect(renderModes()).not.toContain("Read key ideas");
  });
});

/**
 * THE DOOR AND THE OFFLINE CONTROL ARE ONE PAIR (#870).
 *
 * Johan: "The button looks a bit clunky... with the offline mode.. Improve both
 * to fill the whole width and give them same border radiusess".
 *
 * The two were a 4px rectangle capped at 420px standing next to a full pill, in
 * a 44rem column, so they stopped short of the measure and looked borrowed from
 * two different products. Both are pills now and the pair fills the row.
 *
 * Held here because it is the kind of thing a later tidy-up silently undoes: a
 * max-width added back to the door, or one of the two radii nudged, reads as
 * harmless in a diff and puts the ragged edge straight back.
 */
describe("the door and the offline control are one pair (#870)", () => {
  const MODULE = readFileSync(
    new URL("../../app/session/session-modes.module.css", import.meta.url),
    "utf8"
  );

  function rule(selector: string): string {
    const start = MODULE.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`no rule for ${selector}`);
    return MODULE.slice(start, MODULE.indexOf("}", start));
  }

  it("fills the row rather than stopping short of the measure", () => {
    expect(rule(".doorRow")).toContain("width: 100%");
    expect(rule(".start")).not.toContain("max-width");
  });

  it("keeps the large start choices distinct from the small offline control", () => {
    expect(rule(".start")).toContain("border-radius: 999px");
    expect(rule(".doorOffline button")).toContain("border: 0");
    expect(rule(".doorOffline button")).toContain("text-decoration: underline");
  });

  it("keeps offline access compact with a comfortable tap target (Johan, 2026-09-08)", () => {
    expect(rule(".start")).toContain("min-height: 58px");
    expect(rule(".doorOffline button")).toContain("min-height: 44px");
  });
});

describe("conditions is hidden from lesson preparation", () => {
  it("omits the Conditions row", () => {
    const markup = renderModes();

    expect(markup).not.toContain("Conditions");
    expect(markup).not.toMatch(/\bGround and safety\b/);
    // The site's word belongs to /world and its rename, never to this row.
    expect(markup).not.toMatch(/\bGrounds\b/);
  });

  it("keeps the caption to the one thing the title does not already say", () => {
    const markup = renderModes();

    // "Conditions today" restated the title once the title carried it.
    expect(markup).not.toContain("Conditions today");
    // The second door keeps its count.
    expect(markup).toMatch(/\d+ safety check/);
  });
});
