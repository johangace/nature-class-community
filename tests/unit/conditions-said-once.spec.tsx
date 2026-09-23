import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonScroll } from "@/app/run/LessonScroll";
import { renderBlock } from "@/engine/registry";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { findSession } from "@/lib/pack";
import { sayConditionsOnce } from "@/lib/run/conditions-once";
import { groundSessionConditions } from "@/lib/run/ground-conditions";
import { resolvePhases } from "@/lib/resolve";
import type { Block, Phase, Session } from "@/schema/pack";

/**
 * THE CONDITIONS SENTENCE IS SAID ONCE (#270).
 *
 * A frontend QA audit of `/run?session=meet-your-tree` found the same grounded
 * sentence rendered twice — once in `settle`, once in `choose` — byte for
 * byte, in one session view. The mechanism was working as designed: the line
 * is frozen once per session, and the session authors two `conditions-line`
 * blocks, so grounding stamped one sentence into both. What the teacher reads
 * is a duplicate, minutes apart, live in front of a class.
 *
 * These tests drive the REAL `meet-your-tree` session out of the shipped pack
 * and the real render path, so the thing under test is the sentence a teacher
 * actually meets rather than a fixture's idea of one.
 */

/** A sentence shaped like the grounded line the audit quoted, verbatim. */
const GROUNDED =
  "Right now it feels like 24 degrees out under a soft grey sky, with a light breeze. " +
  "Recently seen near here: Borage, common yarrow, Red Admiral.";

function realSession(id = "meet-your-tree"): Session {
  const found = findSession(id);
  if (!found) throw new Error(`the pack no longer ships ${id}`);
  return found.session;
}

function conditionsLines(session: Session): Array<{ phase: string; text: string }> {
  return resolvePhases(session, null).flatMap((phase) =>
    phase.blocks
      .filter((block) => block.type === "conditions-line")
      .map((block) => ({ phase: phase.key, text: block.fallbackText }))
  );
}

/**
 * What the surfaces that walk every block of every phase put on screen — the
 * legacy runner's page walk (`?run=legacy`, `buildPages` over
 * `phaseBlocks`) and the printed plan both read a phase this way, through the
 * same registry renderers. Counting occurrences in the markup is the same
 * measurement the audit made against rendered DOM text.
 */
function occurrencesInMarkup(session: Session, sentence: string): number {
  const markup = resolvePhases(session, null)
    .flatMap((phase) => phaseBlocks(phase))
    .map((block, index) => renderToStaticMarkup(<div key={index}>{renderBlock(block, "y1")}</div>))
    .join("");
  return markup.split(sentence).length - 1;
}

function conditionsLine(text: string, extra: Partial<Block> = {}): Block {
  return { type: "conditions-line", fallbackText: text, ...extra } as Block;
}

/** A session shell borrowed from the real pack, with phases of our own. */
function sessionWithPhases(phases: Phase[]): Session {
  return { ...realSession(), phases };
}

function phase(key: string, blocks: Block[], conditionVariants?: Phase["conditionVariants"]): Phase {
  return { key, title: key, blocks, ...(conditionVariants ? { conditionVariants } : {}) } as Phase;
}

describe("the duplicate the audit found", () => {
  it("is manufactured by grounding: two different authored lines become one sentence", () => {
    const authored = conditionsLines(realSession());

    // The shape the ticket describes, straight out of the shipped pack.
    expect(authored).toHaveLength(2);
    expect(authored[0]?.phase).toBe("settle");
    expect(authored[1]?.phase).toBe("choose");
    expect(authored[0]?.text).not.toBe(authored[1]?.text);

    const grounded = conditionsLines(groundSessionConditions(realSession(), GROUNDED));
    expect(grounded.map((line) => line.text)).toEqual([GROUNDED, GROUNDED]);
  });

  it("says the grounded sentence once, in the phase where 'right now' is first true", () => {
    const run = sayConditionsOnce(groundSessionConditions(realSession(), GROUNDED));

    expect(conditionsLines(run)).toEqual([{ phase: "settle", text: GROUNDED }]);
  });

  it("renders the sentence exactly once across the whole session view", () => {
    const grounded = groundSessionConditions(realSession(), GROUNDED);

    // What the audit measured, and why it is a bug.
    expect(occurrencesInMarkup(grounded, GROUNDED)).toBe(2);
    // What a teacher meets now.
    expect(occurrencesInMarkup(sayConditionsOnce(grounded), GROUNDED)).toBe(1);
  });

  it("changes nothing else in the session", () => {
    const grounded = groundSessionConditions(realSession(), GROUNDED);
    const once = sayConditionsOnce(grounded);

    const strip = (session: Session) =>
      session.phases.map((p) => ({
        ...p,
        blocks: p.blocks.filter((b) => b.type !== "conditions-line"),
      }));

    expect(strip(once)).toEqual(strip(grounded));
    expect(once.title).toBe(grounded.title);
    expect(once.phases.map((p) => p.key)).toEqual(grounded.phases.map((p) => p.key));
  });
});

describe("a conditions-line carrying different content still renders", () => {
  it("keeps two lines that read differently", () => {
    const session = sessionWithPhases([
      phase("settle", [conditionsLine("Notice today's weather on the way out.")]),
      phase("choose", [conditionsLine("Today's sky is part of the choosing.")]),
    ]);

    expect(conditionsLines(sayConditionsOnce(session))).toHaveLength(2);
  });

  it("keeps an ungrounded line beside the grounded one, because grounding skipped it", () => {
    // An author who wrote ability variants keeps their block whole
    // (`groundSessionConditions`), so the two sentences genuinely differ and
    // both belong on screen.
    const session = sessionWithPhases([
      phase("settle", [conditionsLine("Notice today's weather on the way out.")]),
      phase("choose", [
        conditionsLine("Today's sky is part of the choosing.", {
          abilityVariants: { reception: "Look up. What is the sky doing?" },
        }),
      ]),
    ]);
    const run = sayConditionsOnce(groundSessionConditions(session, GROUNDED));

    expect(conditionsLines(run).map((line) => line.text)).toEqual([
      GROUNDED,
      "Today's sky is part of the choosing.",
    ]);
  });

  it("keeps two blocks that share a fallback but read differently for a band", () => {
    const shared = "Look at the sky and name what it is doing.";
    const session = sessionWithPhases([
      phase("settle", [conditionsLine(shared)]),
      phase("choose", [
        conditionsLine(shared, { abilityVariants: { reception: "Is the sky grey or blue?" } }),
      ]),
    ]);

    // Identical for a Year 1 reader, different for Reception — and the legacy
    // runner lets a teacher change band mid-lesson, so the session handed to
    // the client has to be right for whichever band she lands on. Dropping the
    // second block would blank Reception's own line the moment she switched.
    expect(conditionsLines(sayConditionsOnce(session))).toHaveLength(2);
  });

  it("does not drop a line that is only a repeat in some weathers", () => {
    // Phase 0 says the sentence ONLY in its wet-weather alternate. On a dry
    // day the line in phase 1 is the first time it is said, so it has to
    // survive — dropping it would blank the conditions on the plan as written.
    const line = "Rain is part of today.";
    const session = sessionWithPhases([
      phase("settle", [], [{ when: "wet", phase: phase("settle", [conditionsLine(line)]) }]),
      phase("choose", [conditionsLine(line)]),
    ]);

    expect(conditionsLines(sayConditionsOnce(session))).toEqual([
      { phase: "choose", text: line },
    ]);
  });
});

describe("the fix is wired into the surface that grounds", () => {
  it("routes the run page's grounded session through it", () => {
    const page = readFileSync(new URL("../../app/run/page.tsx", import.meta.url), "utf8");

    expect(page).toContain("sayConditionsOnce");
    expect(page).toMatch(/sayConditionsOnce\(\s*groundSessionConditions\(/);
  });

  it("leaves the scroll's single arrival line exactly where it was", () => {
    const run = sayConditionsOnce(groundSessionConditions(realSession(), GROUNDED));
    const markup = renderToStaticMarkup(<LessonScroll session={run} />);

    expect(markup.split(GROUNDED).length - 1).toBe(1);
    expect(markup).toContain("run-arrival");
  });
});
