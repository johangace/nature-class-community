import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConditionKind, Session } from "@/schema/pack";
import type { TodayRead } from "@/lib/outside/today";

/**
 * THE LESSON PAGE CARRIES TODAY'S CONDITIONS (2026-09-08).
 *
 * Johan, on the "View session" screen: *"i said somewhere here i dont see the
 * line"*. The authored note reached only the run's day screen (#1037), which
 * is after she has already decided what to carry. It reads on the lesson page
 * now, in two places: as the labelled block between the facts and "Before
 * class", and as one line on the pre-reading row under "What to bring".
 *
 * The property this file exists to hold is the ABSENCE rule, at both
 * placements. A mild day matches no condition and most sessions author no
 * note, so nothing here is the ordinary case — and it must render as nothing
 * at all rather than as a placeholder, a heading with no note under it, or a
 * reserved gap.
 */

vi.mock("@/lib/outside/today", () => ({ getTodayRead: vi.fn() }));

const EMPTY: TodayRead = {
  scope: "sample",
  className: null,
  school: null,
  read: null,
  condition: null,
  conditionKind: null,
  conditions: [],
  temperature: null,
  sky: null,
  skyMark: null,
  ground: null,
  facts: [],
  doorFaces: [],
  outsideAvailable: false,
};

const TEACHER_LINE =
  "The soil creatures come up towards the surface after rain, so open the bug pots before you lift.";

const session = {
  conditionNotes: [
    {
      when: ["wet"] as ConditionKind[],
      teacher: TEACHER_LINE,
      child: "The ground is wet today. Something may be waiting under the first log we lift.",
    },
  ],
} as unknown as Session;

/** A session with no authored note at all, which is most of the shelf. */
const unwritten = {} as unknown as Session;

async function setRead(over: Partial<TodayRead>) {
  const { getTodayRead } = await import("@/lib/outside/today");
  vi.mocked(getTodayRead).mockResolvedValue({ ...EMPTY, ...over } as never);
}

async function renderBlock(s: Session) {
  const { SessionConditionsNote } = await import("@/app/session/SessionConditionsNote");
  const node = await SessionConditionsNote({ query: {}, session: s });
  return node === null ? "" : renderToStaticMarkup(node);
}


beforeEach(() => {
  vi.clearAllMocks();
});

describe("the conditions block on the lesson page", () => {
  it("says the authored line under its label when the day matches a note", async () => {
    await setRead({ conditions: ["wet"], read: "The ground is wet underfoot after rain overnight." });
    const markup = await renderBlock(session);

    expect(markup).toContain(TEACHER_LINE);
    expect(markup).toContain("Today’s conditions");
    // The mark is drawn for the kind that fired, in the sky marks' own pen,
    // and it is decorative: the label and the note are the words that license
    // it. See app/ConditionMark.tsx.
    expect(markup).toMatch(/viewBox="0 0 44 44"[^>]*stroke="currentColor"/);
    expect(markup).toContain('aria-hidden="true"');
  });

  it("renders nothing at all when the day matches no authored note", async () => {
    // A mild morning maps to no condition, which is the common case.
    await setRead({ conditions: [], read: "The sky is a soft grey and a light breeze is moving." });
    expect(await renderBlock(session)).toBe("");

    // And a day that DID have conditions, against a session nobody wrote one
    // for, which is most of the shelf.
    await setRead({ conditions: ["wet"] });
    expect(await renderBlock(unwritten)).toBe("");
  });

  it("renders nothing when the read itself failed", async () => {
    // `getTodayRead` returns its empty composition when the weather could not
    // be seen at all, and an unlocated class takes the same path. Silence is
    // the same silence: this screen never says we could not look.
    await setRead({});
    expect(await renderBlock(session)).toBe("");
  });

  it("says only the teacher line, never the child line", async () => {
    // The child line is said to the class on the board, in the runner. This
    // page is read by an adult on her own before class, so the spoken
    // register has no business here (#1007).
    await setRead({ conditions: ["wet"] });
    const markup = await renderBlock(session);
    expect(markup).not.toContain("Something may be waiting");
  });
});

describe("it says the day once", () => {
  /**
   * Johan, on the shipped page: *"also remove from Today."*
   *
   * The pre-reading row briefly carried the same sentence again as a
   * "Today: ..." line under "What to bring". The block forty pixels above had
   * already said it, and one fact printed twice on one screen is the fault
   * that has taken three elements off these surfaces already. This is the
   * guard that keeps it from being re-added by someone reading the old PR.
   */
  it("puts no second copy of the sentence on the pre-reading row", () => {
    const source = readFileSync(
      new URL("../../app/session/SessionModes.tsx", import.meta.url),
      "utf8"
    );
    const note = readFileSync(
      new URL("../../app/session/SessionConditionsNote.tsx", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain("PreReadingConditionsLine");
    expect(source).not.toContain("Today:");
    expect(note).not.toContain("PreReadingConditionsLine");
    // One boundary, one placement, one reach for the day.
    expect(source.match(/<Suspense fallback=\{null\}>/g)).toHaveLength(1);
    expect(source.match(/query=\{todayQuery\}/g)).toHaveLength(1);
  });
});

describe("how the page reaches the day", () => {
  const source = readFileSync(
    new URL("../../app/session/SessionModes.tsx", import.meta.url),
    "utf8"
  );
  const loader = readFileSync(
    new URL("../../app/session/lesson-data.ts", import.meta.url),
    "utf8"
  );

  it("never waits on Pointmoon to paint the lesson", () => {
    // The note streams. If it is ever awaited in the composition, a teacher
    // standing at a door waits ten seconds for a sentence that on most
    // mornings does not exist.
    expect(source).toContain("<Suspense fallback={null}>");
    expect(source).not.toContain("await getTodayRead");
    expect(loader).not.toContain("getTodayRead(");
  });

  it("holds no space for a note that usually is not there", () => {
    // The fallback is null rather than a shimmer, which is the opposite call
    // from Today's read and for a stated reason: this resolves to nothing on
    // most mornings, so a hold shaped like a note would be a promise the page
    // usually breaks, and its collapse would move "Before class" after she
    // had read it.
    expect(source).not.toMatch(/<Suspense fallback=\{<[A-Za-z]/);
  });

  it("hands the boundary the loader's own query object", () => {
    // `getTodayRead` is wrapped in React's cache, which keys on ARGUMENT
    // IDENTITY. The loader builds the object; a fresh literal at the call
    // site would run the whole composition a second time.
    expect(loader).toContain("const todayQuery: TodayReadQuery");
    expect(source).not.toMatch(/query=\{\{/);
  });

  it("puts the block between the facts and Before class", () => {
    const facts = source.indexOf("styles.facts");
    const block = source.indexOf("<SessionConditionsNote");
    // The rendered label, not the doc comment that also names it.
    const before = source.indexOf("{styles.stateLabel}>Before class");

    expect(facts).toBeGreaterThan(-1);
    expect(facts).toBeLessThan(block);
    expect(block).toBeLessThan(before);
  });
});

describe("one note, wherever it renders", () => {
  it("draws the runner's day screen and the lesson page from the same component", () => {
    // Two surfaces copying one block is how a block becomes two blocks. The
    // runner used to own these rules in journey.module.css; they moved whole.
    const runner = readFileSync(
      new URL("../../app/run/HybridJourney.tsx", import.meta.url),
      "utf8"
    );
    const journeyCss = readFileSync(
      new URL("../../app/run/journey.module.css", import.meta.url),
      "utf8"
    );
    expect(runner).toContain("<ConditionsNote className={styles.conditionNoteMeasure} hinge={hinge} />");
    expect(journeyCss).not.toMatch(/^\.conditionNote \{/m);
    expect(journeyCss).not.toMatch(/^\.conditionMark \{/m);
  });
});

/**
 * THE NOTE IS AS WIDE AS THE PAGE AND SET IN THE PAGE'S INK (2026-09-08).
 *
 * Johan, on the shipped lesson page: *"expand it broader. idk why u havent put
 * it full width like the rest."* and *"can u maybe fix the font and icon change
 * color?"*
 *
 * Both faults were in the SHARED module, and both were the same mistake: a
 * decision that belongs to a surface had been written into the block that
 * every surface uses. These hold the fix at the cause rather than at the
 * symptom, so a one-off width or a hard-coded colour cannot quietly come back.
 */
describe("the note's measure and ink", () => {
  const shared = readFileSync(
    new URL("../../app/conditions-note.module.css", import.meta.url),
    "utf8"
  );
  const page = readFileSync(
    new URL("../../app/session/session-modes.module.css", import.meta.url),
    "utf8"
  );
  const journey = readFileSync(
    new URL("../../app/run/journey.module.css", import.meta.url),
    "utf8"
  );
  const mark = readFileSync(
    new URL("../../app/ConditionMark.tsx", import.meta.url),
    "utf8"
  );

  function rule(css: string, selector: string) {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start) + 1);
  }

  it("sets no measure of its own, so the container decides", () => {
    // THE CAUSE. `max-width: 46ch` was the runner's prose measure, carried
    // into the shared type rule when the block moved out of
    // journey.module.css, and it then narrowed a page whose column is set by
    // something else. A shared component may own its identity; it may not own
    // the width of every column it is dropped into.
    expect(rule(shared, ".note")).not.toContain("max-width");
    expect(rule(shared, ".conditionNote")).not.toContain("max-width");
  });

  it("takes the same measure and left edge as the rest of the lesson page", () => {
    // Not a one-off width: the identical declaration the head, the rows and
    // the threshold all carry, so one change to the page's measure moves all
    // of them together.
    const measure = "width: min(var(--measure), calc(100% - 2 * var(--edge)));";
    expect(rule(page, ".conditions")).toContain(measure);
    expect(rule(page, ".lessonHead")).toContain(measure);
    expect(rule(page, ".prepRows")).toContain(measure);
    // `margin: 0 auto` on all three is what makes the left edges line up.
    expect(rule(page, ".conditions")).toContain("margin: 0 auto");
  });

  it("lets the runner keep its own measure and reading distance", () => {
    // The cap was not wrong, it was in the wrong file. It is stated on the
    // surface it belongs to now, level with `.note` beside it.
    expect(rule(journey, ".conditionNoteMeasure")).toContain("max-width: 46ch");
    expect(rule(journey, ".conditionNoteMeasure > p:last-of-type")).toContain(
      "font-size: var(--size-3)"
    );
  });

  it("sets the label, the mark and the sentence in the page's own ink", () => {
    // `--ink`, the token the title is set in. Not `--ink-soft`, which is the
    // tone for a caption about the page.
    expect(rule(shared, ".conditionLabelText")).toContain("color: var(--ink)");
    expect(rule(shared, ".conditionMark")).toContain("color: var(--ink)");
    expect(rule(shared, ".note")).toContain("color: var(--ink)");
    // Tokens only, on every one of them.
    for (const selector of [".conditionLabelText", ".conditionMark", ".note"]) {
      expect(rule(shared, selector)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(rule(shared, selector)).not.toMatch(/\brgba?\(/);
    }
    expect(rule(shared, ".note")).not.toContain("--ink-soft");
    expect(rule(shared, ".note")).not.toContain("--ink-2");
  });

  it("sets the sentence at the page's body size", () => {
    // globals.css sets `body` to var(--size-2); the note is body text on this
    // page, and the runner steps it up for its own room.
    expect(rule(shared, ".note")).toContain("font-size: var(--size-2)");
    expect(rule(shared, ".note")).not.toMatch(/font-size:\s*\d/);
  });

  it("draws the mark with the product's 2px pen at whatever size it renders", () => {
    // A literal strokeWidth={2} in a 44 box rendered at 22px puts ONE pixel on
    // the page: half the pen `PreparationGlyph` draws its 24 box at, which is
    // why the mark read faint next to the Before class icons. Derived from the
    // size, so the line is 2px at any size and a resize cannot bring the bug
    // back.
    expect(mark).toContain("const PEN = 2;");
    expect(mark).toContain("strokeWidth={(PEN * BOX) / size}");
    // The literal only survives inside the header explaining why it was wrong.
    expect(mark).not.toMatch(/^\s*strokeWidth=\{2\}$/m);
  });
});
