import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AskAtTheDoor,
  IntroduceDay,
  IntroduceLook,
  IntroduceTopic,
  type LessonCast,
} from "@/app/run/HybridJourney";
import { doorQuestion } from "@/lib/lesson/door";
import { loadAllPacks } from "@/lib/pack";
import { journeyProgressKey, parseJourneyProgress } from "@/lib/run/journey-progress";
import { nextStep, previousStep, type JourneyShape } from "@/lib/run/journey-steps";
import { sayConditionsOnce } from "@/lib/run/conditions-once";
import { groundSessionConditions } from "@/lib/run/ground-conditions";
import { thresholdConditions } from "@/lib/run/threshold-conditions";
import type { CastMember } from "@/lib/cast/member";
import type { Session } from "@/schema/pack";

/**
 * INTRODUCE TODAY HAS ONE PURPOSE PER SCREEN (#754).
 *
 * The first real teacher session, 2026-08-31: a teacher who is an experienced
 * outdoor educator walked the runner with the app in her hand and "did not
 * understand that the outdoor session Teaching Started From HERE.. it had too
 * much info and it was not obvious"
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`). She praised the
 * type hierarchy on the same walk, so this is not a legibility failure — the
 * one line she says to thirty children was EIGHTH in reading order on a screen
 * whose other seven entries she reads to herself, and the button under it said
 * the practice had not started.
 *
 * WHAT THIS FILE MEASURES, and why it is a number rather than a word list: the
 * text elements a teacher passes before the line she speaks. Measured over the
 * real packs on the shipped design, with the located, photographed cast below:
 * EIGHT on 31 of the 56 sessions — eyebrow, lesson title, the day's
 * conditions, the evidence heading, the specimen, its name, its credit, and a
 * second eyebrow — 13 or 14 on twenty more, 7 on four, 3 on one. All 56 put
 * the line on that screen. The split puts it on its own screen behind ONE
 * sentence saying what to do with it, and the screen she reads to herself
 * carries no spoken register at all.
 *
 * Both halves are asserted, because either alone is satisfiable by cheating: a
 * screen with nothing on it also has nothing before the line.
 */

const GROUNDED =
  "Right now it feels like 24 degrees out under a soft grey sky, with a light breeze.";

function photographed(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Pedunculate oak",
    scientificName: "Quercus robur",
    photoUrl: "https://inat.example/a.jpg",
    photoRole: "observation",
    iconicTaxon: "Plantae",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
    ...over,
  } as CastMember;
}

/**
 * A cast as strong as the door ever gets: located, photographed, and spread
 * across kinds so the strip fills. The weak states render LESS, so a count
 * taken here is the ceiling — which is the number a teacher actually met.
 */
const FULL_CAST: LessonCast = {
  members: [
    photographed({ commonName: "Pedunculate oak", iconicTaxon: "Plantae", sortRank: 0 }),
    photographed({ commonName: "Rock Pigeon", iconicTaxon: "Aves", sortRank: 1 }),
    photographed({ commonName: "Marmalade Hoverfly", iconicTaxon: "Insecta", sortRank: 2 }),
  ],
  lines: [],
  located: true,
  placeName: "Canonbury",
};

/** No cast at all: the honest empty state, which renders the shorter page. */
const NO_CAST: LessonCast = { members: [], lines: [], located: false };

const sessions = loadAllPacks().flatMap((pack) => pack.sessions);

/** A session exactly as the runner receives it, with the day ground in. */
function asRun(session: Session): Session {
  return sayConditionsOnce(groundSessionConditions(session, GROUNDED));
}

/**
 * The screens she reads before the question: the topic, the look (this time
 * of year, with the pictures) and the day (the conditions). Split on
 * 2026-09-08 (Johan: "we are combining two screens in one"); the day is in
 * the walk only when a note fired, but its markup is counted here regardless,
 * because the property is about what is said and what is repeated.
 */
function day(session: Session, cast: LessonCast): string {
  return (
    renderToStaticMarkup(<IntroduceTopic session={session} />) +
    renderToStaticMarkup(<IntroduceLook cast={cast} session={session} />) +
    renderToStaticMarkup(<IntroduceDay session={session} />)
  );
}

function line(session: Session, cast: LessonCast): string {
  return renderToStaticMarkup(<AskAtTheDoor cast={cast} session={session} />);
}

/**
 * Text a teacher's eye lands on: headings, paragraphs and list rows. Counted
 * from the markup rather than from a component tree on purpose — what reaches
 * her is what React printed, and a paragraph does not stop being a thing to
 * read because it came from a child component.
 */
function textElements(markup: string): number {
  return (markup.match(/<(?:h1|h2|p|li)[\s>]/g) ?? []).length;
}

/**
 * Where the spoken register starts, or -1. CSS modules keep the key visible in
 * the emitted class name, and the match is anchored on the TAG rather than on
 * the attribute so a slice taken here does not end inside the line's own
 * opening tag and count it as something read before the line.
 */
function spokenAt(markup: string): number {
  return markup.search(/<p class="[^"]*_spoken_/);
}

function textElementsBeforeTheLine(markup: string): number {
  const at = spokenAt(markup);
  expect(at, "no spoken line on this screen at all").toBeGreaterThan(-1);
  return textElements(markup.slice(0, at));
}

describe("the screen she reads, and the line the class hears", () => {
  it("puts the line she speaks behind one sentence, on every shipped session", () => {
    expect(sessions.length).toBeGreaterThan(40);

    for (const session of sessions) {
      const run = asRun(session);
      const markup = line(run, FULL_CAST);

      // The line is really there, in the register that marks speech.
      const question = doorQuestion(run);
      expect(question, session.id).not.toBeNull();
      expect(markup, session.id).toContain("_spoken_");

      // ONE: the eyebrow that names the screen. The instruction sentence went
      // on 2026-09-06 (Johan: the question is projected, do not add "read
      // this to the class"); the speech marks carry that meaning. It was eight.
      expect(textElementsBeforeTheLine(markup), session.id).toBe(1);
    }
  });

  it("says only the season line out loud on the screens before the question", () => {
    // The topic and the day are read together off the board. What is SAID on
    // them is exactly one authored line: how this topic sits in this time of
    // year (Johan, 2026-09-06: "today is today"), plus the weather hinge's
    // child line on the days it fires (not passed here). Never the question,
    // which keeps its own screen (#754).
    for (const session of sessions) {
      const run = asRun(session);
      for (const [name, cast] of [
        ["full cast", FULL_CAST],
        ["no cast", NO_CAST],
      ] as const) {
        const markup = day(run, cast);
        const spoken = (markup.match(/_spoken_/g) ?? []).length;
        expect(spoken, `${session.id} ${name}`).toBe(run.seasonNote ? 1 : 0);
        const question = doorQuestion(run);
        if (question) expect(markup, `${session.id} ${name}`).not.toContain(question);
        if (run.seasonNote) {
          expect(markup, `${session.id} ${name}`).toContain(run.seasonNote.child.replace(/'/g, "&#x27;"));
        }
      }
    }
  });

  it("still says the day once, and never on the line screen", () => {
    // #672's property, held across the split: the grounded sentence the run
    // page pays for on every session start reaches the teacher exactly once,
    // on the screen every route passes. Moving it onto the line screen would
    // put the weather beside the words she is reading to a class.
    for (const session of sessions) {
      const run = asRun(session);
      if (!thresholdConditions(run)) continue;
      const markup = day(run, FULL_CAST);
      expect(markup.split(GROUNDED).length - 1, session.id).toBe(1);
      expect(line(run, FULL_CAST), session.id).not.toContain(GROUNDED);
    }
  });

  it("holds the empty state in code, not in a fact about today's packs", () => {
    // Every shipped session authors a door question, which is exactly why a
    // session without one has to be rendered rather than assumed away.
    const noQuestion = { ...(sessions[0] as Session), doorQuestion: undefined, prompt: "Minibeast hunting." };
    expect(doorQuestion(noQuestion)).toBeNull();
    expect(renderToStaticMarkup(<AskAtTheDoor cast={FULL_CAST} session={noQuestion} />)).toBe("");
  });
});

describe("the journey walks the two screens", () => {
  const source = readFileSync(
    new URL("../../app/run/HybridJourney.tsx", import.meta.url),
    "utf8"
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("mounts the line screen in a step of its own", () => {
    // Same shape as the guard on the threshold in
    // conditions-reach-default-runner.spec.tsx, and anchored on `if (` so a
    // resume clamp reading `saved.step.kind === "ask"` cannot stand in for it.
    expect(code).toMatch(/\bif \(step\.kind === "ask"\) \{[\s\S]{0,400}<AskAtTheDoor/);
  });

  it("walks the four beats, and only then out to the grounding", () => {
    // Asserted through the shared walk rather than by reading the branch for a
    // `setStep`: since #752/#764 every CTA on this surface moves through
    // `goNext`/`goBack` over `lib/run/journey-steps.ts`, so the walk IS where
    // the crossing lives, and `journey-back-navigation.spec.tsx` holds the
    // separate rule that the branch may not step on its own.
    const shape: JourneyShape = {
      settleCards: 5,
      phaseMoments: [3, 2],
      askCount: 1,
      introduceFirst: false,
      day: true,
      circle: true,
      reflect: true,
    };
    // The introduction is said inside, on the board — topic, look, day,
    // question, outside — and the class goes out to ground after it (Johan,
    // 2026-09-06, #1004: "then leave screen behind -> go outside
    // ground/circle"). The day stands only when a note fired (2026-09-08).
    expect(nextStep({ kind: "topic" }, shape)).toEqual({ kind: "look" });
    expect(nextStep({ kind: "look" }, shape)).toEqual({ kind: "day" });
    expect(nextStep({ kind: "look" }, { ...shape, day: false })).toEqual({ kind: "ask", index: 0 });
    expect(nextStep({ kind: "day" }, shape)).toEqual({ kind: "ask", index: 0 });
    expect(nextStep({ kind: "ask", index: 0 }, shape)).toEqual({ kind: "outside" });
    expect(nextStep({ kind: "outside" }, shape)).toEqual({ kind: "settle", card: 0 });
    expect(nextStep({ kind: "settle", card: 4 }, shape)).toEqual({
      kind: "phase",
      phase: 0,
      moment: 0,
    });
    // And it is reversible, so a teacher who mis-taps past the line she has to
    // read gets it back rather than restarting the lesson (#752).
    expect(previousStep({ kind: "outside" }, shape)).toEqual({ kind: "ask", index: 0 });
    expect(previousStep({ kind: "ask", index: 0 }, shape)).toEqual({ kind: "day" });
    expect(previousStep({ kind: "ask", index: 0 }, { ...shape, day: false })).toEqual({ kind: "look" });
    expect(previousStep({ kind: "settle", card: 0 }, shape)).toEqual({ kind: "outside" });
    expect(previousStep({ kind: "phase", phase: 0, moment: 0 }, shape)).toEqual({
      kind: "settle",
      card: 4,
    });
    // A lesson with no authored question has no question screen, in code
    // rather than in the fact that all 56 shipped sessions author one.
    expect(nextStep({ kind: "day" }, { ...shape, askCount: 0 })).toEqual({ kind: "outside" });
    // And one with no grounding crosses straight from outside into its part.
    expect(nextStep({ kind: "outside" }, { ...shape, settleCards: 0 })).toEqual({
      kind: "phase",
      phase: 0,
      moment: 0,
    });
  });

  it("names the crossing on the button instead of denying the practice started", () => {
    const start = code.indexOf('if (step.kind === "ask")');
    expect(start).toBeGreaterThan(-1);
    const branch = code.slice(start, code.indexOf('if (step.kind === "outside")'));
    expect(branch.length).toBeGreaterThan(200);
    // The forward control names the crossing rather than claiming the practice
    // has not started one line under a question she just read to the class.
    expect(branch).toContain("Outside time →");
    expect(code).not.toContain("Start the practice");
  });

  it("resumes onto the line screen rather than back at the top of the threshold", () => {
    // The saved shape is an untrusted boundary (a shared iPad), so the parser
    // is what decides whether a run saved mid-threshold can come back at all.
    const saved = {
      version: 1,
      ownerScope: "class-1",
      sessionId: "meet-your-tree",
      step: { kind: "ask", index: 0 },
      startedAt: null,
      pausedAt: null,
      pausedMs: 0,
    };
    expect(
      parseJourneyProgress(JSON.stringify(saved), {
        ownerScope: "class-1",
        sessionId: "meet-your-tree",
      })?.step
    ).toEqual({ kind: "ask", index: 0 });
    // And the key is unchanged: this is a new step, not a new namespace.
    expect(journeyProgressKey("class-1", "meet-your-tree")).toContain("journey-progress:v1");
  });
});
