import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskAtTheDoor, HybridJourney, IntroduceLook, type LessonCast } from "@/app/run/HybridJourney";
import { OutsideCard } from "@/app/run/OutsideCard";
import { DoorSlot } from "@/app/run/DoorSlot";
import { doorQuestion, doorQuestions, resolveDoor } from "@/lib/lesson/door";
import { findSession, loadAllPacks } from "@/lib/pack";
import type { CastMember } from "@/lib/cast/member";
import type { Session } from "@/schema/pack";

/**
 * THE INTRODUCTION ASKS ONE OR TWO QUESTIONS, AND SHOWS ITS PICTURES BIG ON
 * THE BOARD (#1004).
 *
 * Johan, 2026-09-06: one or two questions the class answers out loud, and
 * for the minibeast hunt "that question should be in the intro"; big images
 * with child-friendly descriptions the children can tap, on the board.
 *
 * Three things are pinned. The questions list leads with the door question
 * wherever both are authored, so the phone's single-question surfaces and
 * the board never disagree about what is asked first. The second question is
 * house copy and is held to the house voice the door question already obeys.
 * And the board is a display mode of the same components: the picture is
 * the tap target, the child line stands under the name, and the small row
 * under a question obeys the open-count gate.
 */

const sessions = loadAllPacks().flatMap((pack) => pack.sessions);

function member(over: Partial<CastMember>): CastMember {
  return {
    commonName: "Buff-tailed Bumblebee",
    scientificName: "Bombus terrestris",
    photoUrl: "https://inat.example/bee.jpg",
    photoRole: "observation",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "A big fuzzy bee bumbles past",
    ...over,
  } as CastMember;
}

const CAST: LessonCast = {
  members: [
    member({}),
    member({ commonName: "Garden Spider", scientificName: "Araneus diadematus", iconicTaxon: "Arachnida", sortRank: 1, line: "" }),
    member({ commonName: "Speckled Wood", scientificName: "Pararge aegeria", iconicTaxon: "Insecta", sortRank: 2, line: "A brown butterfly with cream spots" }),
  ],
  lines: [],
  located: true,
  placeName: "Canonbury",
};

describe("the introduction's questions", () => {
  it("asks the minibeast hunt three questions, the door question first", () => {
    // Johan, 2026-09-13: the woodlouse question opens the hunt outside; the
    // board asks what they know, their favourite, and why minibeasts matter.
    const found = findSession("summer-w2-minibeast-hunting");
    expect(found).toBeTruthy();
    const questions = doorQuestions(found!.session);
    expect(questions).toHaveLength(3);
    expect(questions[0]?.question).toBe(doorQuestion(found!.session));
    expect(questions[0]?.question).toBe("What minibeasts do you know? Can you name them?");
    expect(questions[1]?.question).toBe("What is your favourite minibeast and why?");
    expect(questions[2]?.question).toBe("Why do you think minibeasts matter to our planet?");
  });

  it("leads with the door question wherever both are authored, on every shipped session", () => {
    for (const session of sessions) {
      // `doorQuestions` returns the object form since #1078; this spec is
      // about the WORDS, so it reads the question off each entry.
      const list = doorQuestions(session).map((entry) => entry.question);
      const first = doorQuestion(session);
      if (session.doorQuestions) {
        expect(list[0], session.id).toBe(first);
        expect(list.length, `${session.id} asks more than three`).toBeLessThanOrEqual(3);
      } else {
        expect(list, session.id).toEqual(first ? [first] : []);
      }
      // House voice, the same rules the door question keeps
      // (introduce-today-door-line.spec.ts): capitalised, no em dash, a
      // question, trimmed.
      for (const q of list) {
        expect(q, session.id).toBe(q.trim());
        expect(q, session.id).toMatch(/^[A-Z]/);
        expect(q, session.id).not.toContain("—");
        expect(q, session.id).toMatch(/[?.]$/);
      }
    }
  });

  it("numbers the question screen only when there is more than one", () => {
    const two = findSession("summer-w2-minibeast-hunting")!.session;
    const second = renderToStaticMarkup(<AskAtTheDoor index={1} session={two} />);
    expect(second).toContain("Ask the class · 2 of 3");
    expect(second).toContain("What is your favourite minibeast and why?");
    const one = sessions.find((s) => !s.doorQuestions && doorQuestion(s)) as Session;
    const only = renderToStaticMarkup(<AskAtTheDoor index={0} session={one} />);
    expect(only).toContain(">Ask the class<");
    expect(only).not.toContain(" of ");
    // Past the end is not a screen: the resume clamp keeps the index in range.
    expect(renderToStaticMarkup(<AskAtTheDoor index={5} session={two} />)).toBe("");
  });
});

describe("the board display mode", () => {
  const evidence = resolveDoor({
    members: CAST.members,
    located: true,
    placeName: "Canonbury",
    topic: "minibeasts",
  });

  it("makes the picture the tap target on the board, and a link in the hand", () => {
    const hand = renderToStaticMarkup(<DoorSlot evidence={evidence} topic="minibeasts" />);
    expect(hand).toMatch(/<a [^>]*href="\/species\//);
    expect(hand).not.toContain("Tap a picture");
    // The guide keeps the claim and the credit under each card.
    expect(hand).toContain("recorded nearby");
    const board = renderToStaticMarkup(<DoorSlot board evidence={evidence} topic="minibeasts" />);
    expect(board).not.toMatch(/<a [^>]*href="\/species\//);
    expect(board).toMatch(/<button[^>]*class="[^"]*_slotButton_/);
    expect(board).toContain("Tap a picture to see it big");
  });

  it("presented, keeps a card to a picture and a name, with the credit behind the tap", () => {
    // Johan, 2026-09-06: "there is a lot of text, this should be children
    // facing, remove credits, the images should be more like cards"; and
    // "we need a way that it could be both teacher guide and children
    // facing, maybe a button, present". Presenting is the button.
    const markup = renderToStaticMarkup(<DoorSlot board evidence={evidence} topic="minibeasts" />);
    expect(markup).toContain("Buff-tailed Bumblebee");
    expect(markup).not.toContain("A big fuzzy bee bumbles past");
    expect(markup).not.toContain("CC BY");
    expect(markup).not.toContain("recorded nearby");
    expect(markup).not.toContain("_spoken_");
  });

  it("keeps the pictures under the question on the board, gated like the day", () => {
    const minibeasts = findSession("summer-w2-minibeast-hunting")!.session;
    // INDEX 1, WHICH IS THE QUESTION ABOUT CREATURES (#1078). This read
    // index 0 until the two questions were allowed to differ, and index 0 is
    // "if you were the size of a woodlouse, where would you hide?" — a
    // question about PLACES, which now takes the woodlice photograph and
    // holds the slot against the board. The board belongs on "what is your
    // favourite minibeast and why?", where a child walks up and taps one.
    const withRow = renderToStaticMarkup(<AskAtTheDoor board cast={CAST} index={1} session={minibeasts} />);
    expect(withRow).toContain("Buff-tailed Bumblebee");
    expect(withRow).toMatch(/data-compact="true"/);
    // Since 2026-09-13 the authored cards sit under the third question, why
    // minibeasts matter, and hold that slot against the board.
    const why = renderToStaticMarkup(<AskAtTheDoor board cast={CAST} index={2} session={minibeasts} />);
    expect(why).not.toContain("Buff-tailed Bumblebee");
    expect(why).toContain("turn them back into soil");
    const inHand = renderToStaticMarkup(<AskAtTheDoor cast={CAST} index={1} session={minibeasts} />);
    expect(inHand).not.toContain("Buff-tailed Bumblebee");
    // An open-count lesson primes no answers on a projector (nc#403).
    const counting = findSession("summer-w1-counting-life")!.session;
    const gated = renderToStaticMarkup(<AskAtTheDoor board cast={CAST} index={0} session={counting} />);
    expect(gated).not.toContain("Buff-tailed Bumblebee");
    expect(renderToStaticMarkup(<IntroduceLook board cast={CAST} session={counting} />)).not.toContain("Buff-tailed Bumblebee");
  });
});


describe("starting the same introduction indoors or outside", () => {
  const session = findSession("animal-leaf-masks")!.session;
  it("opens on the topic in both settings and presents only the indoor start", () => {
    const indoors = renderToStaticMarkup(<HybridJourney session={session} introductionSetting="indoors" />);
    const outside = renderToStaticMarkup(<HybridJourney session={session} introductionSetting="outside" />);
    for (const markup of [indoors, outside]) {
      expect(markup).toContain(session.title);
      expect(markup).toContain("Begin →");
      expect(markup).not.toContain("Skip grounding");
    }
    expect(indoors).toContain('data-display="board"');
    expect(indoors).not.toContain(session.objective);
    expect(outside).not.toContain('data-display="board"');
    expect(outside).toContain(session.objective);
  });
  it("adapts departure to the starting place without promising local sightings", () => {
    expect(renderToStaticMarkup(<OutsideCard setting="indoors" />)).toContain("Let’s take our ideas outside.");
    const outside = renderToStaticMarkup(<OutsideCard setting="outside" />);
    expect(outside).toContain("Let’s bring our ideas to life.");
    expect(outside).not.toContain("take our ideas outside");
  });
});
