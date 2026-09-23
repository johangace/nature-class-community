import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HybridJourney, IntroduceDay } from "@/app/run/HybridJourney";
import { LessonScroll } from "@/app/run/LessonScroll";
import { renderBlock } from "@/engine/registry";
import { findSession, loadAllPacks } from "@/lib/pack";
import { resolvePhases } from "@/lib/resolve";
import { sayConditionsOnce } from "@/lib/run/conditions-once";
import { groundSessionConditions } from "@/lib/run/ground-conditions";
import { phaseMoments } from "@/lib/run/phase-moments";
import {
  thresholdConditions,
  type ConditionsLineBlock,
} from "@/lib/run/threshold-conditions";
import type { AbilityBand, Block, Phase, Session } from "@/schema/pack";

/**
 * THE GROUNDED CONDITIONS SENTENCE REACHES THE TEACHER WHO GETS THE DEFAULT
 * RUNNER (#672).
 *
 * `app/run/page.tsx` composes one grounded sentence per run — a model call plus
 * a set of live lookups, on every session start — and freezes it into the
 * session. `HybridJourney` is what `/run` serves with no `?run=` param, and it
 * rendered NONE of it: `conditions-line` is filtered out of every phase moment
 * and the settle deck reads only spoken lines and their notes. The sentence
 * reached `?run=legacy` and `?run=scroll` and nothing else. Composed at cost,
 * never seen: the one state the product cannot defend, because this sentence is
 * the whole reason the app reads the weather at all.
 *
 * So this file measures the thing the ticket measures — grounded conditions
 * sentences that reach a teacher on the DEFAULT runner — and pins it at one. It
 * fails if that count goes back to zero while `app/run/page.tsx` still pays for
 * the composition, and it fails if it ever goes to two, which is the duplicate
 * #270/#671 closed.
 *
 * It runs against the REAL shipped sessions, through the REAL components. A
 * fixture would have passed on every one of the months this was broken.
 */

/** A sentence shaped like the grounded line the #270 audit quoted, verbatim. */
const GROUNDED =
  "Right now it feels like 24 degrees out under a soft grey sky, with a light breeze. " +
  "Recently seen near here: Borage, common yarrow, Red Admiral.";

/** The four autumn-starter sessions #672 names, which author two of these. */
const AUTUMN_STARTER = [
  "meet-your-tree",
  "leaves-and-their-trees",
  "bark-rubbings",
  "seed-searchers",
];

/**
 * A session exactly as the default runner receives it: place-adapted grounding
 * frozen in, then said once. This is `app/run/page.tsx`'s own line, and the
 * shape of what `HybridJourney` is handed.
 */
function asRun(session: Session): Session {
  return sayConditionsOnce(groundSessionConditions(session, GROUNDED));
}

function real(id: string): Session {
  const found = findSession(id);
  if (!found) throw new Error(`the packs no longer ship ${id}`);
  return found.session;
}

function occurrences(markup: string, sentence: string): number {
  return markup.split(sentence).length - 1;
}

/**
 * A sentence as it appears once React has printed it. The grounded sentence
 * above carries no apostrophe, but authored lines do — "Notice today's
 * weather…" leaves the renderer as `today&#x27;s` — so an authored line is
 * counted through the same escaping React applies rather than against the
 * string the pack holds.
 */
function asHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** The threshold screen a teacher meets before the class goes outside. */
function threshold(session: Session): string {
  return renderToStaticMarkup(<IntroduceDay session={session} />);
}

/** The doorstep brief, which is what `HybridJourney` renders on first paint. */
function doorstep(session: Session): string {
  return renderToStaticMarkup(<HybridJourney session={session} />);
}

/** The teaching phases of a session: everything the journey's body walks. */
function bodyPhases(session: Session): Phase[] {
  const phases = resolvePhases(session, null);
  const authoredSettle = phases.find((phase) => phase.key === "settle");
  return phases.filter((phase) => phase !== authoredSettle);
}

/**
 * Every phase page of the journey, rendered from the REAL selector the phase
 * step renders from — `phaseMoments`, the one `HybridJourney`'s
 * `step.kind === "phase"` branch calls (#738).
 *
 * It used to re-implement that walk here, copying the filter into the test:
 * `groupViews(phaseBlocks(phase))`, drop the conditions-only moments, drop the
 * conditions-line inside the survivors. A copy of a filter reports on the copy.
 * The evaluator of #733 deleted the filter from the component and this file —
 * and all 1,932 tests in the repository — stayed green, because the test was
 * filtering the block out with its own hands and then asserting it was gone.
 *
 * Now the blocks come back from the component's own selector, so what is
 * rendered below is what a teacher's phase page renders. Delete the filter in
 * `lib/run/phase-moments.ts` and the day's sentence appears in this markup.
 */
function phasePages(session: Session, ability: AbilityBand = "y1"): string {
  return bodyPhases(session)
    .flatMap((phase) => phaseMoments(phase))
    .flatMap((moment) => moment.blocks)
    .map((block, index) =>
      renderToStaticMarkup(<div key={index}>{renderBlock(block, ability)}</div>)
    )
    .join("");
}

/**
 * Source with its comments removed, so a paragraph that merely MENTIONS a
 * function cannot satisfy a read of the code that calls it (the same helper
 * walk-blockers.spec.tsx and completion-before-reflection-contract.spec.ts
 * use). Every source read in this file goes through it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** Conditions-lines the plan still carries INSIDE the teaching body. */
function conditionsInBody(session: Session): Block[] {
  return bodyPhases(session)
    .flatMap((phase) => phase.blocks)
    .filter((block) => block.type === "conditions-line");
}

describe("the sentence the default runner never showed", () => {
  it.each(AUTUMN_STARTER)("reaches the teacher exactly once on %s", (id) => {
    const run = asRun(real(id));

    // Grounding really did happen for this session: the cost is paid.
    expect(thresholdConditions(run)?.fallbackText).toBe(GROUNDED);

    // ...and the surface she actually gets says it, once, at the threshold.
    expect(occurrences(threshold(run), GROUNDED)).toBe(1);

    // Once across the whole journey, not once per screen. The doorstep brief
    // is where she decides whether she can teach this; the phase pages are the
    // teaching. Neither repeats the day's sentence.
    expect(occurrences(doorstep(run), GROUNDED)).toBe(0);
    expect(occurrences(phasePages(run), GROUNDED)).toBe(0);
  });

  it("says it in the same words the block carries, not a rewrite of them", () => {
    const run = asRun(real("meet-your-tree"));
    const markup = threshold(run);

    // The engine's own renderer, with the mark it wears everywhere else — not
    // a bespoke paragraph on this one screen.
    expect(markup).toContain("block-conditions-line");
    expect(markup).toContain("conditions-text");
    // And it is NOT dressed as a spoken line: nobody reads the weather to a
    // class in quotation marks.
    expect(markup).not.toContain("say-aloud-text");
  });

  it("holds for every shipped session that authors a conditions-line", () => {
    const sessions = loadAllPacks().flatMap((pack) => pack.sessions);
    expect(sessions.length).toBeGreaterThan(40);

    let shown = 0;
    let none = 0;
    for (const session of sessions) {
      const run = asRun(session);
      const line = thresholdConditions(run);
      const markup = threshold(run);
      if (line) {
        // Grounding reaches every one of them (no session in the packs writes
        // ability variants on this block, which is the only thing that would
        // make grounding stand off), and the threshold shows it once.
        expect(occurrences(markup, GROUNDED), session.id).toBe(1);
        expect(occurrences(phasePages(run), GROUNDED), session.id).toBe(0);
        shown += 1;
      } else {
        // A session with no conditions-line renders a shorter screen. Never a
        // placeholder, and never an empty amber mark standing on its own.
        expect(markup).not.toContain("block-conditions-line");
        none += 1;
      }
    }

    // The packs as they ship today: 59 sessions author one, 6 author none.
    // The four `living-things-spring` sessions (#564) each author one, which
    // is where 55 became 59; the six that author none are still the
    // autumn-garden six.
    expect(shown).toBe(59);
    expect(none).toBe(6);
  });

  it("keeps it off the phase pages, which are where the plan still carries it", () => {
    const sessions = loadAllPacks().flatMap((pack) => pack.sessions);

    // THE MUTATION SURFACE, MEASURED RATHER THAN ASSUMED (#738). Grounding
    // does not remove the block from the plan — it rewrites its words — so
    // most shipped sessions walk into the teaching body still carrying a
    // conditions-line. Every one of those would print the day's sentence a
    // second time, on a page in the middle of the lesson, if the filter in
    // `phaseMoments` stopped filtering. If this count were ever 0 the
    // assertions below would be vacuously true and this test would be the
    // padding it replaced, so the count is pinned too.
    let carriers = 0;

    for (const session of sessions) {
      const run = asRun(session);
      if (conditionsInBody(run).length > 0) carriers += 1;

      const pages = phasePages(run);
      // There ARE pages: a selector that returned nothing would satisfy every
      // absence below by rendering an empty string, and this test would be
      // asserting over emptiness rather than over a lesson. (Test "drops a
      // moment…" pins the same property positively; this keeps THIS test true
      // on its own, over the real packs.)
      expect(pages, session.id).toContain("block-");
      // Not the day's sentence...
      expect(occurrences(pages, GROUNDED), session.id).toBe(0);
      // ...and not a conditions-line in any other clothing either: the block
      // does not reach a phase page at all, so an authored line that grounding
      // could not replace cannot slip through behind the sentence check.
      expect(pages, session.id).not.toContain("block-conditions-line");
    }

    expect(carriers).toBe(57);
  });

  it("drops a moment that would be nothing but the day's line", () => {
    // The other half of the selector, and the shipped packs do not exercise it:
    // a conditions-line at the head of a phase attaches FORWARD to the anchor
    // it sets up (`groupViews`, nc#326), so on today's packs no moment is ever
    // only the day's line. Pinned anyway, because the day a pack authors one
    // the alternative is a blank screen a teacher taps through mid-lesson, and
    // "no pack does that yet" is a fact about the packs, not a guarantee.
    const onlyTheDay: Phase = {
      key: "explore",
      title: "Explore",
      blocks: [{ type: "conditions-line", fallbackText: GROUNDED }],
    };
    expect(phaseMoments(onlyTheDay)).toEqual([]);

    // And a moment that has something else in it survives, carrying only the
    // something else — the drop is of the line, never of the teaching around it.
    const withTeaching: Phase = {
      key: "explore",
      title: "Explore",
      blocks: [
        { type: "conditions-line", fallbackText: GROUNDED },
        { type: "say-aloud", text: "Find a tree you would like to meet." },
      ],
    };
    expect(phaseMoments(withTeaching)).toEqual([
      { blocks: [{ type: "say-aloud", text: "Find a tree you would like to meet." }] },
    ]);
  });

  it("reads the same to Reception as the block says it should", () => {
    // The threshold takes the band, so a pack that ever writes a Reception
    // variant on this block is honoured rather than silently read at Year 1.
    const run = asRun(real("meet-your-tree"));
    const markup = renderToStaticMarkup(
      <IntroduceDay ability="reception" session={run} />
    );
    expect(occurrences(markup, GROUNDED)).toBe(1);
  });
});

describe("the threshold is the screen every route passes", () => {
  /**
   * The one seam a static render cannot cross: the journey's steps live in
   * client state and this suite has no DOM to click through. So the screen
   * itself is asserted above, and the reference that mounts it is read out of
   * the source — with comments stripped, so a paragraph that merely mentions
   * the component cannot satisfy it (the same helper walk-blockers.spec.tsx
   * and completion-before-reflection-contract.spec.ts use).
   */
  const code = stripComments(
    readFileSync(new URL("../../app/run/HybridJourney.tsx", import.meta.url), "utf8")
  );

  /**
   * ONE STEP BRANCH OF THE JOURNEY, SLICED OUT — because a regex that only
   * ANCHORS is not enough (#738, second pass).
   *
   * This test read `/step\.kind === "phase"[\s\S]{0,600}phaseMoments\(phase\)/`
   * and called itself anchored. It was not: `saved.step.kind === "phase"` in
   * the resume clamp CONTAINS `step.kind === "phase"`, and `phaseMoments(phase)`
   * appears three times in the file, so the clamp's own call satisfied the
   * pattern six hundred characters later while the render branch below did
   * whatever it liked. Two rewrites of the render branch — reading
   * `phaseBlocks(phase)` raw, and importing `groupViews` under an alias — put
   * the day's sentence back on a phase page mid-lesson with all 14 tests here
   * green. That is the defect this whole PR exists to kill, one layer along.
   *
   * So the branch is cut out of the source and asserted on as a region, and
   * nothing outside it can stand in for it: the cut starts at a real `if (…)`
   * (the clamp's `if (saved.step.kind` cannot match) and ends where the next
   * step branch begins.
   */
  function stepBranch(kind: string): string {
    const opener = `if (step.kind === "${kind}")`;
    const start = code.indexOf(opener);
    expect(start, `HybridJourney.tsx has no \`${opener}\` branch`).toBeGreaterThan(-1);
    const rest = code.slice(start + opener.length);
    const end = rest.indexOf('\n  if (step.kind ===');
    const branch = end === -1 ? rest : rest.slice(0, end);
    // A slice that comes back tiny means the shape this reads has changed, not
    // that the branch is clean. Fail rather than assert over almost nothing.
    expect(branch.length, `the ${kind} branch read back as ${branch.length} chars`)
      .toBeGreaterThan(400);
    return branch;
  }

  it("mounts the day's body in the day step", () => {
    // `if (` and the closing paren, so this cannot be satisfied by
    // `saved.step.kind === "day"` if the resume clamp ever grows one —
    // the collision that made the phase-branch guard below a lie. The day is
    // beat 2 of the introduction (#1004), the screen the conditions reach.
    expect(code).toMatch(/\bif \(step\.kind === "day"\) \{[\s\S]{0,400}<IntroduceDay/);
  });

  it("builds its phase pages from the shared selector and nowhere else", () => {
    /**
     * WHAT THIS REPLACED (#738). It was `expect(code).toContain('block.type
     * !== "conditions-line"')` — a substring that occurred FOUR times in this
     * file, so deleting the phase render's own filter left the other three and
     * the guard passed. The evaluator of #733 deleted it and all 1,932 tests
     * in the repository stayed green while the #270 duplicate re-opened.
     *
     * The filter now lives once, in `lib/run/phase-moments.ts`, and the tests
     * above render what it returns — so the deletion this guard failed to
     * catch is caught by behaviour rather than by a word count. What is left
     * for a source read is the seam it cannot cross: the phase step lives in
     * client state and this suite has no DOM to click through, so the branch
     * itself is read here — see `stepBranch` for why anchoring was not enough.
     */
    const branch = stepBranch("phase");

    // The moments come from the shared selector, by that name, in this branch.
    // Rewriting the right-hand side at all — `viewsOf(phaseBlocks(phase))`,
    // `phaseBlocks(phase).map(…)` — fails here, which is what the old anchor
    // let through.
    expect(branch).toContain("const moments = phaseMoments(phase, askedAtTheDoor);");
    // And the page renders THOSE blocks, rather than reaching past them.
    expect(branch).toMatch(/\{moment\?\.blocks\.map\(/);
    // Nothing in the branch reads a phase's blocks raw beside them, which is
    // the shape a second, unfiltered walk would take.
    expect(branch).not.toMatch(/phaseBlocks\(|groupMoments\(|groupViews\(/);

    // And the file cannot group a phase into moments by any other name: an
    // aliased import is how the second bypass got past the negative that used
    // to live here. Grouping is `phaseMoments`'s job now — this file having
    // its own is how the rule came to be written out three times.
    expect(code).not.toMatch(/from "@\/lib\/moments"/);
  });

  it("still pays for grounding on the page that feeds this runner", () => {
    // The other half of "show it, or stop paying for it". If grounding is ever
    // removed from the run page, this test is where the choice has to be made
    // deliberately rather than left half-done.
    //
    // Comments stripped, and both reads anchored to a CALL: `toContain(
    // "getGroundedConditions")` was satisfied by the import line alone, so
    // deleting the call and keeping the import left it green — the same
    // substring-collision defect as the phase branch above, found by auditing
    // the rest of this file rather than by waiting for a mutation to prove it.
    const page = stripComments(
      readFileSync(new URL("../../app/run/page.tsx", import.meta.url), "utf8")
    );
    expect(page).toMatch(/const grounded = await getGroundedConditions\(/);
    expect(page).toMatch(/sayConditionsOnce\(\s*groundSessionConditions\(/);
  });
});

describe("the other surfaces are unchanged", () => {
  it("leaves the scroll's single arrival line exactly where it was", () => {
    const run = asRun(real("meet-your-tree"));
    const markup = renderToStaticMarkup(<LessonScroll session={run} />);

    expect(occurrences(markup, GROUNDED)).toBe(1);
    expect(markup).toContain("run-arrival");
  });

  it("picks the FIRST line of the plan for both surfaces, from one shared rule", () => {
    /**
     * THIS TEST USED TO COMPARE GROUNDED SESSIONS (#738). It asserted
     * `thresholdConditions(run)` was the first conditions-line of the run —
     * but `asRun` grounds the session first, and grounding writes ONE sentence
     * into every groundable line, after which `sayConditionsOnce` deletes the
     * repeat. There is exactly one conditions-line left, so first and last are
     * the same block and the word "first" could not fail: rewriting
     * `thresholdConditions` to return the LAST line kept the whole 1,932-test
     * suite green.
     *
     * So it reads the plan UNGROUNDED, which is the only state where the
     * choice is visible and is a state that really ships — no location, no
     * key, a failed read; the named cost in `lib/run/threshold-conditions.ts`.
     * There the four autumn starters carry two genuinely different authored
     * lines, and the rule is that a teacher meets the one "right now" is true
     * for, which is the earliest one authored.
     */
    for (const id of AUTUMN_STARTER) {
      const plan = real(id);
      const lines = resolvePhases(plan, null)
        .flatMap((phase) => phase.blocks)
        .filter((block): block is ConditionsLineBlock => block.type === "conditions-line");

      expect(lines.length, id).toBe(2);
      const [first, second] = lines as [ConditionsLineBlock, ConditionsLineBlock];
      // Two different sentences, so "first" and "last" are distinguishable
      // here — the property the grounded version quietly lost.
      expect(second.fallbackText, id).not.toBe(first.fallbackText);

      expect(thresholdConditions(plan), id).toBe(first);

      // And both modern surfaces say that one, once, and never the second —
      // which is what "one shared rule" means in the only place the two could
      // have disagreed.
      const surfaces: Array<[string, string]> = [
        ["threshold", threshold(plan)],
        ["scroll", renderToStaticMarkup(<LessonScroll session={plan} />)],
      ];
      for (const [name, markup] of surfaces) {
        expect(occurrences(markup, asHtml(first.fallbackText)), `${id} ${name}`).toBe(1);
        expect(occurrences(markup, asHtml(second.fallbackText)), `${id} ${name}`).toBe(0);
      }
    }
  });
});
