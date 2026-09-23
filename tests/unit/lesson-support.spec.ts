import { describe, expect, it } from "vitest";
import { parseLessonSupportDraft } from "@/lib/ai/plate-draft";
import { crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";
import { buildLessonSupport } from "@/lib/ai/prompts";
import { projectLessonJourney, projectRouteBeat } from "@/lib/lesson/journey";
import { lessonSupportContext } from "@/lib/lesson/support-context";
import { findSession, loadAllPacks } from "@/lib/pack";
import { allPhases, availableConditions, resolvePhases } from "@/lib/resolve";
import type { OutsideNow } from "@/lib/outside";

const context = {
  sessionTitle: "A5 Leaf Collage",
  objective: "Notice the variety in fallen leaves and arrange them into a collage.",
  ageBand: "Reception",
  childWork: "Choose fallen leaves, notice their shapes, and make one collage together.",
  phaseTitles: ["Collect", "Create", "Gather"],
  currentPhase: "Create",
  authoredWords: "Arrange the leaves you have already collected.",
  safetyAndCare: ["Use fallen leaves only.", "Do not pick living material."],
  localFacts: ["Great Willowherb was recorded within 5 km this week."],
};

describe("lesson-support prompt boundary", () => {
  it.each([
    "age",
    "hyperlocal",
    "time",
    "space",
    "materials",
    "explain",
    "simpler",
    "movement",
    "challenge",
    "child-question",
  ] as const)("supports the %s teacher task without changing the authored spine", async (task) => {
    const prompt = await buildLessonSupport({ task, context, constraint: "A child asked why." });
    if (!prompt) throw new Error("lesson-support prompt failed to load");

    expect(prompt.system).toContain("AUTHORED SPINE IS IMMUTABLE");
    expect(prompt.user).toContain("Collect → Create → Gather");
    expect(prompt.user).toContain("Use fallen leaves only.");
    expect(prompt.user).toContain("Great Willowherb was recorded within 5 km this week.");
    expect(prompt.user).toContain(task);
  });
});

describe("lesson-support output gate", () => {
  it("accepts one short teacher-facing overlay", () => {
    expect(parseLessonSupportDraft({
      headline: "Make the noticing smaller",
      teacherNote: "Ask each child to compare just two leaves before joining the group collage.",
      sayAloud: "Choose two leaves. What is one thing that is different?",
      change: "Keep the authored Collect, Create and Gather order.",
    })).toEqual({
      headline: "Make the noticing smaller",
      teacherNote: "Ask each child to compare just two leaves before joining the group collage.",
      sayAloud: "Choose two leaves. What is one thing that is different?",
      change: "Keep the authored Collect, Create and Gather order.",
    });
  });

  it("rejects links, markup, dangerous handling advice, and oversized prose", () => {
    expect(parseLessonSupportDraft({
      headline: "Open this",
      teacherNote: "Visit https://example.test for the answer.",
      sayAloud: null,
      change: null,
    })).toBeNull();
    expect(parseLessonSupportDraft({
      headline: "Try it",
      teacherNote: "Taste the berries to compare them.",
      sayAloud: null,
      change: null,
    })).toBeNull();
    expect(parseLessonSupportDraft({
      headline: "Too much",
      teacherNote: "x".repeat(401),
      sayAloud: null,
      change: null,
    })).toBeNull();
    expect(parseLessonSupportDraft({
      headline: "Try it",
      teacherNote: "Put the mushroom in your mouth to compare it.",
      sayAloud: null,
      change: null,
    })).toBeNull();
  });

  it.each([
    "Free sweets from the hedge! Pick the fat shiny black ones.",
    "Pull out a tiny tube-flower and suck the sweet nectar.",
    "Eat them on the trail, they taste like summer!",
    "Pop one in your mouth. Wild blueberries are tiny but sweet.",
    "Blueberry picking time! Your fingers and tongue turn purple-blue.",
    "Pull out the tiny string inside for a drop of nectar.",
    "Fill your pockets with pecans! Crack one open and eat the sweet nutty insides.",
  ])("rejects unsafe advice already present in the phenology corpus: %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(true);
  });
});

describe("lesson-support closed context", () => {
  it("passes authored words and bounded evidence without school coordinates", () => {
    const found = findSession("summer-w3-a5-leaf-collage");
    expect(found).not.toBeNull();
    if (!found) return;

    const outside: OutsideNow = {
      conditions: { line: "A light breeze is moving the leaves.", meta: null },
      // No school coordinates in this case, so no place to name (#315). Null
      // is the honest answer and is stated rather than left off, the same way
      // every other absent slice on this type is.
      place: null,
      sightings: [
        {
          id: "near",
          name: "Field maple",
          photoUrl: null,
          presence: {
            provider: "inaturalist",
            taxonId: "1",
            observationCount: 2,
            radiusKm: 5,
            windowStart: "2026-08-08",
            windowEnd: "2026-08-15",
          },
        },
        {
          id: "far",
          name: "Distant oak",
          photoUrl: null,
          presence: {
            provider: "inaturalist",
            taxonId: "2",
            observationCount: 1,
            radiusKm: 20,
            windowStart: "2026-08-08",
            windowEnd: "2026-08-15",
          },
        },
      ],
      usuallyAround: [],
      lookFors: [],
      regionId: "uk-south",
      week: 33,
    };
    const built = lessonSupportContext({
      journey: projectLessonJourney(found.pack, found.session),
      session: found.session,
      outside,
      phaseKey: found.session.phases[0]?.key,
      ability: "y1",
      classBand: "Reception",
    });

    expect(built.ageBand).toBe("Year 1");
    expect(built.currentPhase).toBe(found.session.phases[0]?.title);
    expect(built.authoredWords).toBeTruthy();
    expect(built.localFacts.join(" ")).toContain("Field maple was recorded within 5 km");
    expect(built.localFacts.join(" ")).not.toContain("Distant oak");
    expect(JSON.stringify(built)).not.toContain("51.546");
  });

  /**
   * #1281 · The seasonal read reaches the lesson, captioned as the calendar's
   * claim and not as a reading taken at this school. Before this it was
   * composed on every read and consumed by nothing.
   */
  it("carries the seasonal read as a regional expectation, never as a verified local fact", () => {
    const found = findSession("summer-w3-a5-leaf-collage");
    expect(found).not.toBeNull();
    if (!found) return;

    const outside: OutsideNow = {
      conditions: {
        line: "A light breeze is moving the leaves.",
        meta: null,
        seasonalNote:
          "The regional calendar describes seasonal signs as at their peak. " +
          "The regional calendar names one headline this week: Blackberries at peak, ripe fruits everywhere.",
      },
      place: null,
      sightings: [],
      usuallyAround: [],
      lookFors: [],
      regionId: "uk-south",
      week: 33,
    };
    const built = lessonSupportContext({
      journey: projectLessonJourney(found.pack, found.session),
      session: found.session,
      outside,
      phaseKey: found.session.phases[0]?.key,
    });

    expect(built.regionalExpectation).toContain("Blackberries at peak");
    // The load-bearing half. `prompts/lesson-support.md` lets the model claim
    // a species is PRESENT exactly when it appears in verified local facts,
    // so a regional headline in that list would license "there are
    // blackberries in the playground" off a sentence that only ever said the
    // region's blackberries are in season (#1293).
    expect(built.localFacts.join(" ")).not.toContain("Blackberries");
    expect(built.localFacts.join(" ")).not.toContain("regional calendar");
  });

  it("renders the regional expectation under its own heading, outside the verified-fact list", () => {
    const built = buildLessonSupport({
      task: "hyperlocal",
      context: {
        sessionTitle: "t",
        objective: "o",
        ageBand: "Year 1",
        childWork: "w",
        phaseTitles: ["a"],
        safetyAndCare: [],
        localFacts: ["Field maple was recorded within 5 km this week."],
        regionalExpectation:
          "The regional calendar names one headline this week: Blackberries at peak, ripe fruits everywhere.",
      },
    })!;

    const verified = built.user.indexOf("Verified local facts:");
    const regional = built.user.indexOf("Regional expectation for this week");
    expect(verified).toBeGreaterThanOrEqual(0);
    expect(regional).toBeGreaterThan(verified);
    expect(built.user).toContain("can never establish that anything is present at this school");
    // The blackberry sentence must sit after the regional heading, not inside
    // the verified block above it.
    expect(built.user.indexOf("Blackberries at peak")).toBeGreaterThan(regional);
  });

  it("adds no regional heading at all when there is no seasonal read", () => {
    const built = buildLessonSupport({
      task: "hyperlocal",
      context: {
        sessionTitle: "t",
        objective: "o",
        ageBand: "Year 1",
        childWork: "w",
        phaseTitles: ["a"],
        safetyAndCare: [],
        localFacts: [],
      },
    })!;
    expect(built.user).not.toContain("Regional expectation");
  });

  it("says nothing about the season when Pointmoon sent nothing this reader recognises", () => {
    const found = findSession("summer-w3-a5-leaf-collage");
    expect(found).not.toBeNull();
    if (!found) return;

    const built = lessonSupportContext({
      journey: projectLessonJourney(found.pack, found.session),
      session: found.session,
      outside: {
        conditions: { line: "A light breeze is moving the leaves.", meta: null, seasonalNote: null },
        place: null,
        sightings: [],
        usuallyAround: [],
        lookFors: [],
        regionId: "uk-south",
        week: 33,
      },
      phaseKey: found.session.phases[0]?.key,
    });

    expect(built.regionalExpectation).toBeNull();
  });
});

/**
 * #791 · The care for the phase she is on always reaches the model.
 *
 * Found in review of PR #1212, verified at source, and the reason it is fixed
 * in that PR rather than filed: `prompts/_shared/hands-in.md` asks the drafter
 * to reach for the version a child can pick up and defers to "the authored
 * lesson's own call" on what may be handled. A deferral to guidance the model
 * was never shown is not a deferral, so the fragment could not ship over a
 * truncation that dropped exactly the phase in question.
 */
describe("lesson-support care lines · the current phase is never the part that is cut", () => {
  const SESSION = "autumn-w3-where-the-leaves-go";
  const MUSHROOM = "Look, never pick, wash hands after";

  const contextFor = (phaseKey: string | undefined) => {
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    return lessonSupportContext({
      journey: projectLessonJourney(found.pack, found.session),
      session: found.session,
      outside: null,
      phaseKey,
    });
  };

  it("authors more care than the budget, which is what makes this a real case", () => {
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    const authored = [
      found.session.preparation,
      found.session.materialFallback,
      ...found.session.phases.flatMap((phase) =>
        (phase.tips ?? []).flatMap((tip) => [tip.when, tip.then])
      ),
    ].filter((line) => Boolean(line?.trim()));
    // If a later edit trims this session's tips below the budget, this suite
    // stops testing anything and says so here rather than passing quietly.
    expect(authored.length).toBeGreaterThan(8);
    expect(authored.join(" ")).toContain(MUSHROOM);
  });

  it("the old flat slice cut the mushroom guidance out of its own phase", () => {
    // The defect, reconstructed rather than described: this is exactly what
    // the function did before, and it is red on the line that matters.
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    const flat = [
      found.session.preparation,
      found.session.materialFallback,
      ...found.session.phases.flatMap((phase) =>
        (phase.tips ?? []).flatMap((tip) => [tip.when, tip.then])
      ),
    ]
      .filter((line): line is string => Boolean(line?.trim()))
      .slice(0, 8);
    expect(flat.join(" ")).not.toContain(MUSHROOM);
  });

  it("carries it now, for the phase that authors it", () => {
    expect(contextFor("lift-2").safetyAndCare.join(" ")).toContain(MUSHROOM);
  });

  it("carries every care line of whichever phase she is on", () => {
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    for (const phase of found.session.phases) {
      const mine = [
        ...(phase.tips ?? []).flatMap((tip) => [tip.when, tip.then]),
        ...(phase.blocks ?? []).flatMap((block) => {
          if (block.type === "teacher-note") return [block.text];
          if (block.type === "demo") {
            return [block.move, ...block.steps.map((step) => step.text), block.look];
          }
          return [];
        }),
      ].filter((line): line is string => Boolean(line?.trim()));
      const shown = contextFor(phase.key).safetyAndCare;
      for (const line of mine) expect(shown, `${phase.key}: ${line}`).toContain(line);
    }
  });

  it("keeps preparation and the material fallback first, then the phase she is on", () => {
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    const built = contextFor("crumble-4");
    if (found.session.preparation?.trim()) {
      expect(built.safetyAndCare[0]).toBe(found.session.preparation);
    }
    const crumble = found.session.phases.find((p) => p.key === "crumble-4");
    const mine = [
      ...(crumble?.tips ?? []).flatMap((tip) => [tip.when, tip.then]),
      ...(crumble?.blocks ?? []).flatMap((block) => {
        if (block.type === "teacher-note") return [block.text];
        if (block.type === "demo") {
          return [block.move, ...block.steps.map((step) => step.text), block.look];
        }
        return [];
      }),
    ].filter((line): line is string => Boolean(line?.trim()));
    const lead = [found.session.preparation, found.session.materialFallback].filter((line) =>
      Boolean(line?.trim())
    );
    expect(built.safetyAndCare.slice(lead.length, lead.length + mine.length)).toEqual(mine);
  });

  it("carries the demo's own handling rule, which no tip states", () => {
    // Round 3 of PR #1212: the most explicit handling rules in the curriculum
    // are `demo.look` fields, and the `earth` phase of `garden-w3-elements`
    // authors no tips at all — so that demo line was its whole position on
    // picking things up, and it used to be invisible.
    const found = findSession("garden-w3-elements");
    if (!found) throw new Error("garden-w3-elements is not on the shelf");
    const earth = found.session.phases.find((phase) => phase.key === "earth");
    expect(earth?.tips ?? []).toEqual([]);
    for (const phaseKey of [undefined, "earth"]) {
      const shown = lessonSupportContext({
        journey: projectLessonJourney(found.pack, found.session),
        session: found.session,
        outside: null,
        phaseKey,
      }).safetyAndCare.join(" ");
      expect(shown, String(phaseKey)).toContain("never picked up");
    }
  });

  it("finds the phase inside a condition variant, which is the key the runner submits", () => {
    // Round 4 of PR #1212: a phase can carry whole alternate phases, and the
    // runner submits the RESOLVED key — `explore-windy` arrives while
    // `session.phases` holds only `explore` — so the phase actually on screen
    // was neither recognised nor visited.
    const found = findSession("seed-searchers");
    if (!found) throw new Error("seed-searchers is not on the shelf");
    const shelter = "away from any dead limbs";
    expect(found.session.phases.some((phase) => phase.key === "explore-windy")).toBe(false);
    for (const phaseKey of [undefined, "explore", "explore-windy"]) {
      const shown = lessonSupportContext({
        journey: projectLessonJourney(found.pack, found.session),
        session: found.session,
        outside: null,
        phaseKey,
      }).safetyAndCare.join(" ");
      expect(shown, String(phaseKey)).toContain(shelter);
    }
  });

  it("the API accepts the resolved variant key, so the traversal is reachable at all", () => {
    // Round 2 of the reframe block: the walk below is pointless if the route
    // rejects the key before it runs. `resolvePhases` hands the runner the
    // RESOLVED phases, so `explore-windy` is what a surface sends on a windy
    // day, and `app/api/lesson-support/route.ts` was validating it against
    // `session.phases` alone — a 404 for the teacher, on the day the weather
    // turns. Both it and the care walk now search `allPhases`.
    const found = findSession("seed-searchers");
    if (!found) throw new Error("seed-searchers is not on the shelf");
    const keys = allPhases(found.session).map((phase) => phase.key);
    expect(keys).toContain("explore-windy");
    expect(found.session.phases.map((phase) => phase.key)).not.toContain("explore-windy");
    // And the resolved phases a surface actually holds are all findable by key.
    for (const condition of availableConditions(found.session)) {
      for (const phase of resolvePhases(found.session, condition)) {
        expect(keys, `${condition}/${phase.key}`).toContain(phase.key);
      }
    }
  });

  it("gives the variant its own title and authored words, not a hollow context", () => {
    // The other half of admitting the resolved key: `journey.route` is the
    // lesson's spine and holds base phases only, so looking `explore-windy` up
    // there found nothing. Before the route accepted the key that was a 404;
    // after it, it would have been a request reaching the model with no
    // current phase and no authored words, while the task rules ask it to
    // adapt the current authored moment.
    const found = findSession("seed-searchers");
    if (!found) throw new Error("seed-searchers is not on the shelf");
    const journey = projectLessonJourney(found.pack, found.session);
    expect(journey.route.map((beat) => beat.key)).not.toContain("explore-windy");

    const variant = allPhases(found.session).find((phase) => phase.key === "explore-windy");
    if (!variant) throw new Error("explore-windy is not on seed-searchers");
    const built = lessonSupportContext({
      journey,
      session: found.session,
      outside: null,
      phaseKey: "explore-windy",
    });
    expect(built.currentPhase).toBe(variant.title);
    // The variant's OWN lead, asserted against the projection rather than
    // against "truthy": a guarded comparison here would skip itself on exactly
    // the regression it exists to catch, which is what review found the first
    // time this test was written.
    expect(built.authoredWords).toBe(projectRouteBeat(variant).lead);

    const baseBuilt = lessonSupportContext({
      journey,
      session: found.session,
      outside: null,
      phaseKey: "explore",
    });
    // The fixture's base and variant open with different words, asserted so
    // this comparison cannot become vacuous if a pack edit makes them equal.
    const base = found.session.phases.find((phase) => phase.key === "explore");
    if (!base) throw new Error("seed-searchers has no explore phase");
    expect(projectRouteBeat(base).lead).not.toBe(projectRouteBeat(variant).lead);
    expect(built.authoredWords).not.toBe(baseBuilt.authoredWords);
    // The spine the teacher is shown is unchanged: no beat per variant.
    expect(built.phaseTitles).toEqual(journey.route.map((beat) => beat.title));
  });

  it("shows the teacher's guidance and not the words she says to the children", () => {
    // The line is the block type, not a guess about the content: say-aloud and
    // circle-question are for the children; teacher-note and demo are for her,
    // and care lives in the second kind.
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    const shown = contextFor(undefined).safetyAndCare;
    const forChildren = found.session.phases.flatMap((phase) =>
      (phase.blocks ?? [])
        .filter((block) => block.type === "say-aloud" || block.type === "circle-question")
        .map((block) => ("text" in block ? block.text : ""))
        .filter((text) => Boolean(text?.trim()))
    );
    for (const line of forChildren) expect(shown, line).not.toContain(line);
  });

  it("drops nothing, whether or not a phase is named", () => {
    // The second half of the review finding: app/session/LessonPreparationAssistant.tsx
    // asks with no phase at all, so a fix that only protected the phased
    // callers left the planning surface — the one request most about materials
    // and care — with the old cut and the handling nudge together.
    const found = findSession(SESSION);
    if (!found) throw new Error(`${SESSION} is not on the shelf`);
    const everything = [
      found.session.preparation,
      found.session.materialFallback,
      ...found.session.phases.flatMap((phase) => [
        ...(phase.tips ?? []).flatMap((tip) => [tip.when, tip.then]),
        ...(phase.blocks ?? []).flatMap((block) => {
          if (block.type === "teacher-note") return [block.text];
          if (block.type === "demo") {
            return [block.move, ...block.steps.map((step) => step.text), block.look];
          }
          return [];
        }),
      ]),
    ].filter((line): line is string => Boolean(line?.trim()));

    for (const phaseKey of [undefined, ...found.session.phases.map((phase) => phase.key)]) {
      const shown = contextFor(phaseKey).safetyAndCare;
      expect([...shown].sort(), String(phaseKey)).toEqual([...everything].sort());
    }
    expect(contextFor(undefined).safetyAndCare).toEqual(everything);
    expect(contextFor(undefined).safetyAndCare.join(" ")).toContain(MUSHROOM);
  });

  it("stays bounded by what the packs actually author, which is measured rather than assumed", () => {
    // The budget is gone, so the bound is the shelf, and these are the exact
    // numbers `lib/lesson/support-context.ts` documents — measured through
    // `careLines` itself rather than by a script beside it, which is how the
    // first two figures went wrong. If a future pack authors past this, that
    // is a real decision about prompt size and it should be made deliberately
    // rather than discovered in a bill.
    let worstLines = 0;
    let worstChars = 0;
    for (const pack of loadAllPacks()) {
      for (const session of pack.sessions) {
        const care = lessonSupportContext({
          journey: projectLessonJourney(pack, session),
          session,
          outside: null,
        }).safetyAndCare;
        worstLines = Math.max(worstLines, care.length);
        worstChars = Math.max(worstChars, care.join(" ").length);
      }
    }
    // bark-rubbings, 35 lines and 2,690 characters joined. Equality, not an
    // upper bound: a traversal regression that silently DROPPED care would
    // lower both maxima and leave a `toBeLessThanOrEqual` green while the
    // documentation went on claiming these two numbers. Drift in either
    // direction is the thing this assertion exists to catch.
    expect(worstLines).toBe(35);
    expect(worstChars).toBe(2690);
  });
});
