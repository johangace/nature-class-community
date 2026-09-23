// @vitest-environment jsdom
// jsdom, because the last test reads the notice's ANCESTRY rather than the
// markup string. Everything else here is plain server rendering and does not
// care which environment it runs in.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/teacher", () => ({
  getActiveEnglishLocale: vi.fn().mockResolvedValue(null),
  getTeacher: vi.fn(),
  getActiveClass: vi.fn(),
  getActiveClassLocation: vi.fn(),
}));
vi.mock("@/lib/place-context", () => ({
  activePlaceContext: vi.fn(),
  sessionForPlace: vi.fn((session: unknown) => session),
}));
vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast: vi.fn() }));
vi.mock("@/lib/prepared-day/store", () => ({ preparationStore: { read: vi.fn() } }));
// `RETIRED_SESSION_IDS` is empty today, so a rename has to be simulated for the
// canonicalisation to be tested at all rather than merely called.
vi.mock("@/lib/pack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pack")>();
  return {
    ...actual,
    canonicalSessionId: (id: string) =>
      id === "leaves-and-their-trees-v0"
        ? "leaves-and-their-trees"
        : actual.canonicalSessionId(id),
  };
});

import PrintPage from "@/app/print/page";
import { activePlaceContext } from "@/lib/place-context";
import { readSurfaceCast } from "@/lib/cast/surface";
import { getActiveClass, getActiveClassLocation, getTeacher } from "@/lib/teacher";
import { preparationStore } from "@/lib/prepared-day/store";
import { contextRevisionSchema, type ContextRevision } from "@/schema/prepared-day";
import { findSession } from "@/lib/pack";

/**
 * A PRINTED DAY SAYS WHAT IT WAS PREPARED FOR (#1092).
 *
 * The library that writes the sentences is tested next door, in
 * `prepared-for.spec.ts`. What is under test HERE is the one thing that file
 * cannot see: whether the sheet a teacher actually holds carries them, and
 * whether it carries them only when they are true of that sheet.
 *
 * Three ways the wiring could be wrong, and one test each:
 *
 *   an authored sheet CLAIMING to be prepared for a day nobody prepared it for
 *   a prepared sheet SAYING NOTHING, which is the failure the ticket is about
 *   another lesson's preparation LABELLING this one, which would be worse than
 *   silence: a confident line naming the wrong morning
 *
 * The fourth is the tab row. Following a tab re-enters this page with new
 * search params, so a tab that dropped `prepared` would hand back a
 * same-looking sheet with the line quietly gone.
 */

const SESSION = "leaves-and-their-trees";
const PLANNED = "2026-09-10T13:30:00.000Z";

const PLACE_CONTEXT = { chain: [], keys: [], pack: {}, source: null } as never;

const EMPTY_SURFACE_CAST = {
  cast: { members: [], absences: [], source: "live" },
  located: false,
  school: null,
  className: null,
  place: { lat: null, lng: null, climate: null },
} as never;

const context = (over: Partial<ContextRevision> = {}): ContextRevision =>
  contextRevisionSchema.parse({
    revisionId: "ctx-1",
    placeKey: { resolution: "koppen", value: "Cfb", resolvedBy: "pack-key@1" },
    ability: { band: "y1", resolvedBy: "ability@1/class-row" },
    weather: {
      reach: "the-hour",
      conditionKind: "wet",
      reasonCode: null,
      observedAt: "2026-09-10T07:04:00.000Z",
      validUntil: null,
      source: "pointmoon@2026-09-10",
    },
    siteProfile: null,
    plannedAt: PLANNED,
    plannedTimeZone: "Europe/London",
    jurisdiction: "england",
    locale: "en-GB",
    teacherNotes: [],
    capturedAt: "2026-09-10T07:04:00.000Z",
    ...over,
  });

function mockClass() {
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(getActiveClass).mockResolvedValue({
    id: "class-1",
    name: "Willow class",
    school: "Willow Primary",
    yearGroup: "Year 1",
    abilityBand: null,
    learnerContext: { abilityBand: null },
    lat: null,
    lng: null,
  } as never);
  vi.mocked(getActiveClassLocation).mockResolvedValue(null);
  vi.mocked(activePlaceContext).mockResolvedValue(PLACE_CONTEXT);
  vi.mocked(readSurfaceCast).mockResolvedValue(EMPTY_SURFACE_CAST);
}

/**
 * What the store hands back for a saved preparation.
 *
 * `source` is the whole frozen `Session`, not a stub with an id on it, because
 * the page renders that snapshot rather than today's pack — so a test that
 * passed a stub would be testing a shape the store never returns.
 */
function mockPreparation(
  sessionId: string,
  saved: ContextRevision,
  source: Partial<{ title: string; objective: string }> = {},
  freshness: "fresh" | "stale" | "source-unavailable" = "fresh",
) {
  const authored = structuredClone(findSession(SESSION)!.session);
  vi.mocked(preparationStore.read).mockResolvedValue({
    source: { ...authored, id: sessionId, ...source },
    context: saved,
    sourceFreshness: { state: freshness, changes: [] },
  } as never);
}

async function renderPrint(
  params: { session: string; part?: string; prepared?: string },
) {
  const page = await PrintPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(page as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the sheet says what it was prepared for", () => {
  it("states the day, the hour and the sky on a prepared sheet", async () => {
    mockClass();
    mockPreparation(SESSION, context());
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain("Prepared for Thursday 10 September 2026 at 14:30 (Europe/London).");
    expect(markup).toContain(
      "Prepared for wet. The reading is of the moment it was taken, not of the lesson hour",
    );
    expect(markup).toContain("from pointmoon@2026-09-10");
  });

  it("says the sky was not read, rather than dropping the line", async () => {
    mockClass();
    mockPreparation(
      SESSION,
      context({
        weather: {
          reach: "the-planned-hour",
          conditionKind: null,
          reasonCode: "out-of-reach",
          observedAt: null,
          validUntil: null,
          source: null,
        },
      }),
    );
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain("Prepared for Thursday 10 September 2026 at 14:30");
    expect(markup).toContain(
      "No weather was read for it: the reading we held did not reach that hour.",
    );
  });

  it("says nothing on a sheet printed straight from the pack", async () => {
    mockClass();
    const markup = await renderPrint({ session: SESSION, part: "script" });
    expect(markup).not.toContain("Prepared for");
    expect(markup).not.toContain("No weather was read");
    expect(preparationStore.read).not.toHaveBeenCalled();
  });

  it("refuses another lesson's preparation rather than labelling this one with it", async () => {
    mockClass();
    mockPreparation("a-different-session", context());
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).not.toContain("Prepared for Thursday");
  });

  it("reads the preparation as this teacher, never by id alone", async () => {
    mockClass();
    mockPreparation(SESSION, context());
    await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(preparationStore.read).toHaveBeenCalledWith("teacher-1", "prep-1");
  });

  it("prints the source the preparation froze, not today's pack", async () => {
    // "A day that renders from whatever the pack says TODAY is a day that
    // changes after it was approved" — schema/prepared-day.ts. A sheet that
    // stamped a preparation's date and sky over newly edited instructions would
    // carry two revisions with one notice vouching for both.
    mockClass();
    mockPreparation(SESSION, context(), { objective: "The objective as it was saved" });
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain("The objective as it was saved");
    expect(markup).not.toContain(findSession(SESSION)!.session.objective);
  });

  it("words the sheet at the band the preparation was made at", async () => {
    // `resolveAbility` gives a preparation's band precedence over the class
    // row for exactly this: a class regraded after saving must not reword a
    // prepared sheet underneath its own prepared-for line.
    mockClass();
    mockPreparation(
      SESSION,
      context({ ability: { band: "y2", resolvedBy: "ability@1/class-row" } }),
    );
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    // The y2 rewrite of the collect phase's say-aloud, authored in the pack.
    expect(markup).toContain("When a leaf catches your eye, pick it up and get to know it.");
  });

  it("matches a preparation saved under a since-retired session id", async () => {
    // `canonicalSessionId`'s own contract: call it on an id read back from a
    // database row. Without it a renamed session fails the equality above and
    // the notice disappears with no sign it had ever been there.
    mockClass();
    mockPreparation("leaves-and-their-trees-v0", context());
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain("Prepared for Thursday 10 September 2026 at 14:30");
  });

  it("says when the lesson has been edited since the day was prepared", async () => {
    // The store already computes this; before it was said on the sheet, a
    // corrected safety line simply never reached the paper and nothing on the
    // page admitted it.
    mockClass();
    mockPreparation(SESSION, context(), {}, "stale");
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain(
      "The lesson has been edited since this was prepared, though not necessarily anything on this sheet.",
    );
  });

  it("stays quiet about it when the lesson has not moved", async () => {
    mockClass();
    mockPreparation(SESSION, context(), {}, "fresh");
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain("Prepared for Thursday 10 September 2026 at 14:30");
    expect(markup).not.toContain("has been edited since this was prepared");
    expect(markup).not.toContain("could not be checked");
  });

  it("carries the preparation across the tab row", async () => {
    mockClass();
    mockPreparation(SESSION, context());
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });
    expect(markup).toContain("prepared=prep-1");
  });

  /**
   * REACHING PAPER IS NOT THE SAME AS REACHING THE MARKUP, and this suite
   * cannot tell the two apart on its own.
   *
   * `renderToStaticMarkup` applies no CSS, so every assertion above would go on
   * passing if a single `@media print { … display: none }` rule swallowed the
   * notice on the one surface it exists for. That is not hypothetical: review
   * of this change caught exactly it. The first draft put the notice inside the
   * flashcard deck's `.flash-head`, which `@media print` hides outright (#757
   * gives up the masthead on paper because A4's 273mm is exactly two 133mm
   * halves with nothing left over) — present in the HTML, invisible on the
   * sheet, and green in every test here.
   *
   * So the check is on the stylesheet and the ancestor chain rather than on the
   * string, in the manner of `print-on-screen.spec.ts`: whatever the notice is
   * nested in must still be painted when the page is printed.
   */
  it("is not nested in anything the print stylesheet hides", async () => {
    mockClass();
    mockPreparation(SESSION, context());
    const markup = await renderPrint({ session: SESSION, part: "script", prepared: "prep-1" });

    const sheet = document.createElement("div");
    sheet.innerHTML = markup;
    const notice = sheet.querySelector(".print-prepared-for");
    expect(notice).not.toBeNull();

    const hidden = hiddenInPrint();
    const ancestry: string[] = [];
    for (let node: Element | null = notice; node; node = node.parentElement) {
      ancestry.push(...Array.from(node.classList));
    }
    expect(ancestry).not.toHaveLength(0);
    for (const className of ancestry) {
      expect(
        hidden.has(className),
        `.${className} is hidden by @media print, so the notice never reaches paper`,
      ).toBe(false);
    }
  });
});

/**
 * THE DECK SAYS IT TOO, on every card she carries (#1245).
 *
 * The A4 is read at the printer with a screen beside it. The deck is clipped to
 * a lanyard and leaves the building, which makes it the artefact most likely to
 * be read alone, days later, when the sky no longer matches the plan — and it
 * was the one surface #1092 shipped without the notice, because the first draft
 * put it in `.flash-head`, which `@media print` hides outright.
 *
 * So the ancestry check below is not a repeat of the one above. It is the same
 * question asked of the surface that actually failed it.
 */
describe("the deck says what it was prepared for", () => {
  it("carries the short line on every card, not only on the cover", async () => {
    // The cover is the one card that is NOT in her hand when the sky disagrees
    // with the plan, so a count of one would be the same failure wearing a
    // passing test.
    mockClass();
    mockPreparation(SESSION, context());
    const markup = await renderPrint({
      session: SESSION,
      part: "flashcards",
      prepared: "prep-1",
    });

    const sheet = document.createElement("div");
    sheet.innerHTML = markup;
    const cards = sheet.querySelectorAll(".flash-card");
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards) {
      const line = card.querySelector(".flash-prepared");
      expect(line, "a card with no prepared-for line").not.toBeNull();
      expect(line!.textContent).toContain(
        "Prepared for Thu 10 September at 14:30 (Europe/London).",
      );
      expect(line!.textContent).toContain(
        "Conditions: wet when the reading was taken, not at that hour.",
      );
    }
  });

  it("says nothing on a deck printed straight from the pack", async () => {
    mockClass();
    const markup = await renderPrint({ session: SESSION, part: "flashcards" });
    expect(markup).toContain("flash-card");
    expect(markup).not.toContain("flash-prepared");
    expect(markup).not.toContain("Prepared for Thu");
  });

  it("is not nested in anything the print stylesheet hides", async () => {
    // The whole reason this ticket exists: the first attempt rendered inside
    // `.flash-head`, present in this markup and absent from the paper, and
    // green in a test that only read the string.
    mockClass();
    mockPreparation(SESSION, context());
    const markup = await renderPrint({
      session: SESSION,
      part: "flashcards",
      prepared: "prep-1",
    });

    const sheet = document.createElement("div");
    sheet.innerHTML = markup;
    const line = sheet.querySelector(".flash-prepared");
    expect(line).not.toBeNull();

    const hidden = hiddenInPrint();
    const ancestry: string[] = [];
    for (let node: Element | null = line; node; node = node.parentElement) {
      ancestry.push(...Array.from(node.classList));
    }
    expect(ancestry).not.toHaveLength(0);
    for (const className of ancestry) {
      expect(
        hidden.has(className),
        `.${className} is hidden by @media print, so the deck's notice never reaches paper`,
      ).toBe(false);
    }
  });
});

/**
 * Every class name `@media print` sets `display: none` on.
 *
 * Block extraction is `print-on-screen.spec.ts`'s, brace-counted rather than
 * regexed, so a nested at-rule cannot end the block early. Only single-class
 * selectors are collected: this is a guard against the plain case that was
 * actually written, not a CSS engine.
 */
function hiddenInPrint(): Set<string> {
  // Resolved from the vitest root rather than `import.meta.url`: this file runs
  // in the jsdom environment, where that is not a file: URL.
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const hidden = new Set<string>();
  const at = /@media print/g;
  let found: RegExpExecArray | null;
  while ((found = at.exec(css)) !== null) {
    const open = css.indexOf("{", found.index);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const block = css.slice(open, end);
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let declaration: RegExpExecArray | null;
    while ((declaration = rule.exec(block)) !== null) {
      const [, selectors = "", body = ""] = declaration;
      if (!/display\s*:\s*none/.test(body)) continue;
      for (const selector of selectors.split(",")) {
        const name = selector.trim().match(/^\.([A-Za-z0-9_-]+)$/)?.[1];
        if (name) hidden.add(name);
      }
    }
  }
  return hidden;
}
