"use client";

import { AssistantGlyph } from "@/app/AssistantGlyph";

import { asLocale, localizeText } from "@/lib/localization";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { AbilityBand, Block, Session } from "@/schema/pack";
import { resolvePhases } from "@/lib/resolve";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { resolveText, spokenLine } from "@/lib/text";
import { linkEntities, type EntitySegment } from "@/lib/lesson/entities";
import { castSlug } from "@/lib/cast/member";
import { renderBlock } from "@/engine/registry";
import { GlossedNote, GlossedText } from "./Glossary";
import { CircleTime, readCircle } from "./CircleTime";
import { useGroupNoun } from "./GroupNoun";
import { useRunScope } from "./RunScope";
import { NO_RECORD_CAPTION } from "@/lib/outside/captions";
import { DoorSlot } from "./DoorSlot";
import { doorQuestions, primaryTopicOf, resolveDoor } from "@/lib/lesson/door";
import { OutsideCard } from "./OutsideCard";
import { drivingQuestion } from "@/lib/lesson/driving-question";
import type { DoorLine } from "@/lib/ai/door-line";
import type { Hinge } from "@/lib/lesson/hinge";
import { ConditionsNote } from "../ConditionsNote";
import { LogSession } from "./LogSession";
import { PlayAloud } from "./PlayAloud";
import { previewLength } from "@/lib/lesson/preview";
import { lessonHref } from "@/app/session/lesson-links";
import { fieldHref, fieldPrintHref } from "@/lib/offline/field-location";
import { clipForMoment } from "@/lib/lesson/spoken-clip";
import { childWorkSummaryOf } from "@/lib/lesson/journey";
import { phaseMoments } from "@/lib/run/phase-moments";
import {
  backLabel,
  isHoisted,
  isIndoorIntroduction,
  nextStep,
  outdoorNextLabel,
  previousStep,
  resumePhaseStep,
  type JourneyShape,
  type Step,
} from "@/lib/run/journey-steps";
import { thresholdConditions } from "@/lib/run/threshold-conditions";
import { LessonPictures } from "./LessonPictures";
import { offersImaginativeChoice, picturesForMoment } from "@/lib/lesson/pictures";
import { FieldPhotos } from "./FieldPhotos";
import { shouldShowDoorEvidence, showsFieldMedia } from "@/lib/lesson/media-visibility";
import { AssistantSheet } from "./AssistantSheet";
import type { LessonHazards } from "@/lib/lesson/hazards";
import type { LessonMediaItem } from "@/lib/lesson/media";
import type { SpokenAudio } from "@/lib/lesson/spoken-audio";
import type { LogTarget } from "./Runner";
import type { CastMember } from "@/lib/cast/member";
import { useModalFocus } from "./useModalFocus";
import { useScrollCue } from "./useScrollCue";
import { OfflineLessonControl } from "./OfflineLessonControl";
import { useLessonConnection } from "./useLessonConnection";
import { usesOfflineFallback } from "@/lib/offline/connection-state";
import {
  journeyProgressKey,
  parseJourneyProgress,
  type JourneyProgress,
  type JourneyStep,
} from "@/lib/run/journey-progress";
import styles from "./journey.module.css";

/** The lesson's resolved cast, exactly as the page hands it to the runners. */
export type LessonCast = {
  members: CastMember[];
  lines: string[];
  located: boolean;
  /** What the geocoder called this point, for the door's caption (#350). */
  placeName?: string | null;
};

/**
 * Optional route boundary for data-free runners such as `/field`.
 *
 * The normal journey still owns its existing online routes. Supplying this
 * complete adapter lets an offline shell keep every door and exit within
 * precached public pages without teaching the runner about that shell.
 */
export type HybridJourneyNavigationHrefs = {
  exit: string;
  preview: string;
  primer: string;
  safety: string;
  print: string;
};

function JourneyNavigationLink({
  native,
  href,
  className,
  ariaLabel,
  children,
}: {
  native: boolean;
  href: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  if (native) {
    return <a href={href} className={className} aria-label={ariaLabel}>{children}</a>;
  }
  return <Link href={href} className={className} aria-label={ariaLabel}>{children}</Link>;
}

/**
 * THE HYBRID JOURNEY (nc#302) — a next button starts each section's own page.
 *
 * Johan, after walking the scrolled build against his old prototype: the old
 * one was still better, and the hybrid is the ruling — "next button starts a
 * new page. eg settling in next then runner starts new page. then at the end
 * of runner next.. circle etc". Sophia's promoted spec on nc#302 is the
 * drawing this file builds; the pages are:
 *
 *   intro → settle (flashcards) → introduce today → one page per phase
 *   (moments step within the page) → circle → reflection → celebration
 *
 * Reordered since (2026-09-06, `lib/run/journey-steps.ts`): the introduction
 * is said inside, on the board, and the settle begins outside. An authored
 * `introduce` part is part of that indoor introduction (#1187): it presents
 * on the board between the last question and the outside screen, one moment
 * per screen, and keeps its index so the strip and a saved run still name it.
 *
 * The settle is the OLD PROTOTYPE'S five cards as a runner-level constant
 * (#285: the same settle everywhere), overridden outright when the session
 * authors its own settle phase — packs/settle.json is the first real
 * override. Two words deviate from the old verbatim: an em dash became a
 * comma (brand rule) and "meditation" became "quiet time" (Johan's own
 * not-a-mindfulness-app reframe). Both are one-line restores if he says so.
 *
 * The AI never announces itself (#235): one plain sentence under the
 * authored moves — "Something not working?" — opening the same
 * LessonSupportTool the primer uses; the answer wears the for-you register
 * and never becomes a spoken line. The settle offers nothing, deliberately.
 *
 * Species the lesson's cast actually carries become tappable entities
 * (#219/#223) through the deterministic linker — dotted rule, one mark per
 * spoken line, two per note, the card opens over the lower half so the line
 * she was reading never leaves the screen.
 */

const DEFAULT_SETTLE: Array<{ line: string; note: string }> = [
  { line: "Let’s gather into a circle and place your feet firm on the ground.", note: "" },
  {
    line:
      "When you are all calm, let’s take three slow breaths together, a big breath in, and slowly out.",
    note: "Take a minute. Eyes can gently close.",
  },
  { line: "Everybody, open your eyes and bring your attention back to the circle.", note: "" },
  { line: "What did you notice during our quiet time?", note: "Hands up, or share with a partner." },
  { line: "How did it make you feel?", note: "" },
];

/**
 * `Step` moved to `lib/run/journey-steps.ts` with the walk itself (#752). It
 * is imported above; both directions of the walk are now one testable module
 * rather than a type here and fourteen `setStep` call sites below.
 */

const backGlyph = (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="butt"
    strokeLinejoin="miter"
  >
    <path d="M20 12H4.5" />
    <path d="M10.5 5.5 4 12l6.5 6.5" />
  </svg>
);

const pauseGlyph = (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
);

const playGlyph = (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.5 4.7a1 1 0 0 1 1.53-.85l10 7.3a1 1 0 0 1 0 1.7l-10 7.3a1 1 0 0 1-1.53-.85z" />
  </svg>
);

/**
 * The speech marks, given their own ink (#326). The register carries by mark,
 * not by a label (the nc#232 ruling) — but a mark in the same ink as the words
 * is just two more characters in the sentence. In a softer green it says "this
 * one is spoken" before she has read a word. Hidden from screen readers, which
 * would otherwise announce punctuation the sighted eye only glances at.
 */
function quoted(line: ReactNode): ReactNode {
  return (
    <>
      <span className={styles.quote} aria-hidden="true">
        &ldquo;
      </span>
      {line}
      <span className={styles.quote} aria-hidden="true">
        &rdquo;
      </span>
    </>
  );
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * ONE SCREEN, TWO REGISTERS — AND THAT IS WHY SHE COULD NOT FIND THE START
 * (#754, from the first real teacher session, 2026-08-31).
 *
 * A teacher who is an experienced outdoor educator walked this runner with the app
 * in her hand. She praised the type and read every other screen fine. On this
 * one she "did not understand that the outdoor session Teaching Started From
 * HERE.. it had too much info and it was not obvious"
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`). Johan: "we
 * might need to simplify this or create 2 screens instead of 1 with clear
 * purpose."
 *
 * WHAT SHE ACTUALLY MET, COUNTED. Rendered over the real packs with a located,
 * photographed cast, EIGHT text elements stood before the one line she says to
 * thirty children — the eyebrow, the lesson's name at 3.9rem, the day's
 * grounded conditions, the evidence heading, the specimen, its name, its
 * credit, and a second small eyebrow — on 31 of the 56 shipped sessions, and
 * up to fourteen on the rest. All 56 put the line on that screen. Under it, a
 * button reading "Start the practice", which told her the practice had not
 * started yet, one line after she had spoken to the class.
 * (`tests/unit/introduce-today-one-purpose.spec.tsx` holds the count.)
 *
 * WHY A SPLIT RATHER THAN A STRIP. Nothing on this page is padding: #672 put
 * the day's sentence here because this is the one screen every route through
 * the journey passes, and #324 put the evidence here so a lesson about trees
 * shows a tree. Deleting either would re-open a closed ticket. What the page
 * mixes is not information, it is REGISTER — the product already separates the
 * two by mark (#232: the quotation marks say "this one is spoken"), and this
 * screen asked a teacher to find that mark eighth in a list. So the mark gets
 * a page break: everything she reads to HERSELF stays here, the one line the
 * CLASS hears becomes its own screen, and the button between them names the
 * crossing she could not see.
 *
 * #149 closed the same disease in another location by collapsing three
 * restatements into one screen. The general rule it left is one screen, one
 * job — which here means a second screen rather than a shorter one, because
 * both jobs are real and only one of them is spoken aloud.
 *
 * Deliberately NOT touched: the settle's name (#750 owns "Ground the class"),
 * circle time (#753), and back-navigation across the runner (#752). This is
 * the introduce screen and nothing else.
 */

/**
 * INTRODUCE TODAY, REBUILT (#324) — the threshold page's own body.
 *
 * Johan, reading a lesson about trees: *"An Apple is usually around now. Let us
 * look for one."* Three of the complaints about that line are not defects. The
 * capital A is `commonName` arriving title-cased, and `lib/cast/speak.ts`
 * deliberately refuses to edit a species name — "a table that edits one is how
 * a Grey heron becomes a bird that does not exist". The "usually" is the
 * REGIONAL tier describing itself accurately; removing the hedge would make the
 * line less honest.
 *
 * The defect was that this slot took `cast.lines[0]` whatever tier it happened
 * to be. A cast line's job is to describe a creature honestly. Opening a lesson
 * is a different job, and the moment a regional member ranked first the honest
 * description became a bad opening, read aloud to a class. Gating it stopped
 * the bad line; this is the page Sophia drew in its place, and no cast line
 * reaches it at all.
 *
 * TWO HALVES — AND SINCE #754 THEY ARE TWO SCREENS. Here, the EVIDENCE: what is
 * actually standing outside, at a size a child can match against a trunk,
 * shrinking honestly to drawn marks and then to nothing. On the screen after
 * this one (`AskAtTheDoor`), the QUESTION, authored with the lesson and
 * identical at every level of signal — which it can be, because it points at
 * what is in front of the class rather than at what we know.
 *
 * The halves were always described as two things; what changed is that the
 * page break now says so, because a teacher could not find the second half
 * under the first.
 *
 * "Today's guest" is gone with the line. A guest is a creature we are expecting,
 * and that framing was the pressure that turned thin signal into a confident
 * guess.
 *
 * THE CONTEXTUAL SLOT SURVIVES (Johan: "in the introduction of the topic need
 * contextual ai integration pls make a slot for that"). It is the evidence
 * block, and the model's seat here is the JOINING SENTENCE over species, counts
 * and phases that already came back — not the question, which is a teaching
 * decision, and not the naming, which is gated on a photograph having
 * travelled.
 *
 * IT IS ITS OWN COMPONENT (#672) because it is the one screen on this surface
 * that must be provable. The journey's steps live in client state, and the test
 * runner here renders to static markup with no DOM to click through, so a step
 * that is only reachable by pressing two buttons is a step nothing can assert
 * on — which is exactly how the grounded conditions sentence stayed invisible
 * for months while being paid for on every session start. Rendered separately,
 * the whole threshold can be asserted against the real shipped sessions; what
 * is left untested is one JSX reference in the `introduce` branch, and
 * `conditions-reach-default-runner.spec.tsx` reads the source for that.
 */
/**
 * THE TOPIC (#1004, beat 1): what today is about, and nothing else.
 *
 * Johan: "introducing topic / subject, what we gonna talk about". The lesson's
 * name is the subject, in the only green on the page (#342), and the screen
 * carries no spoken register: a lead-in like "today we are going to talk
 * about minibeasts" is a line a teacher says, and no field authors it —
 * composing one from `primaryTopic` would be the app writing speech, which is
 * the same move as editing a species name. So the subject stands alone until
 * a `topicLine` is authored.
 */
export function IntroduceTopic({
  board = false,
  session,
}: {
  /** Presented to the class: the adult's objective is off the screen. */
  board?: boolean;
  session: Session;
}): ReactElement {
  return (
    <div className={styles.body}>
      <p className={styles.tEyebrow}>Introduce today</p>
      <h1 className={styles.doorTitle}>{session.title}</h1>
      {/*
        SOMETHING SMALL FOR THE CLASS TO READ (Johan, 2026-09-06: "this is
        empty, no context"). The authored topic line, child-facing, in the
        reading register rather than the spoken one: it is on the board for
        everyone to read together, not a line she performs. Absent while a
        lesson has none; never composed from a tag.
      */}
      {session.topicLine && <p className={styles.lead}>{session.topicLine}</p>}
      {/* The learning objective, small, for the adult: it was cut from the
          run in #342 as adult prose read aloud, and it comes back here as a
          note she reads to herself while the class reads the line above. */}
      {!board && <p className={styles.note}>{session.objective}</p>}
      {/* The lesson's opening screen is one of three named anchors (#1078).
          Seed searchers shows its three seed photographs here and nowhere
          else; a lesson that authors none shows none, which is most of
          them. */}
      <LessonPictures pictures={session.openingPictures} />
    </div>
  );
}

/**
 * THIS TIME OF YEAR (2026-09-08): what the class hears about the topic in
 * this season, and the pictures of what is out there.
 *
 * Johan, on the day screen as it stood: "i think we are combining two screens
 * in one". It held the grounded conditions, the season line, the weather
 * hinge and the cards, and a class read all four at once. The season line
 * ("Small creatures live all around us…") is about the topic and belongs with
 * the pictures of it; the conditions and the hinge are about TODAY and get
 * the screen after this one, on the days that have one (`IntroduceDay`).
 *
 * Everything the door decided about the cards stands unchanged: the purpose
 * gate (nc#403), the tiered cards first and the lesson's own media only as the
 * fallback (2026-09-06), and the joining sentence over exactly these names.
 */
export function IntroduceLook({
  board = false,
  cast = null,
  doorLine = null,
  media = [],
  session,
}: {
  /** Shown on the classroom board: pictures lead and open big on tap (#1004). */
  board?: boolean;
  cast?: LessonCast | null;
  doorLine?: DoorLine | null;
  media?: LessonMediaItem[];
  session: Session;
}): ReactElement {
  /**
   * THE DOOR OBEYS THE SAME PURPOSE GATE AS THE PHASES BELOW IT (nc#403,
   * reopened). This screen is BEFORE every phase, including an open-count
   * one, so showing its evidence primes the count exactly as the body-phase
   * strip used to — a second surface carrying the same bug, found live on
   * Counting Life on 25 Aug. `shouldShowDoorEvidence` asks the one question
   * the door can ask with no phase yet on screen: does this session open on
   * ANY open-count phase? When it does, `resolveDoor` is not even run —
   * nothing here mints a claim ("seen", "usually around") this screen must
   * not make, and the page renders exactly as it does for a class with no
   * cast at all.
   */
  const showEvidence = shouldShowDoorEvidence(session);
  const evidence = showEvidence
    ? resolveDoor({
        members: cast?.members ?? [],
        located: Boolean(cast?.located),
        // Names the zoom on the regional caption (#350). Same claim, same
        // radius, with the name of the place we already asked the geocoder for.
        placeName: cast?.placeName ?? null,
        // What the lesson is actually about (#339), so a trees lesson stands on
        // trees rather than on whatever ranked first.
        topic: primaryTopicOf(session),
      })
    : ({ kind: "none" } as const);
  return (
    <div className={styles.body}>
      <p className={styles.tEyebrow}>This time of year</p>
      {/*
        HOW THIS TOPIC SITS IN THIS TIME OF YEAR, EVERY DAY (Johan,
        2026-09-06: "today is today"). The authored season note: the teacher
        line as a note in the guide, the child line said. Presented, the class
        gets the spoken line and the cards, and nothing written to the adult.
      */}
      {session.seasonNote && (
        <>
          {!board && <p className={styles.note}>{session.seasonNote.teacher}</p>}
          <p className={styles.spoken}>{quoted(session.seasonNote.child)}</p>
        </>
      )}
      {/*
        THE TIERED CARDS FIRST, THE LESSON'S OWN PICTURES ONLY AS THE FALLBACK
        (2026-09-06, Sophia's third pass). This used to render the pack's
        media list INSTEAD of the door whenever a lesson carried one, so a
        located school with real recorded sightings saw house-picked photos
        wearing no tier. The cards carry the claim per entity now; the media
        list stands in only when the door has nothing honest to show, and
        under the same open-count gate.
      */}
      {evidence.kind !== "none" ? (
        <DoorSlot
          board={board}
          evidence={evidence}
          line={doorLine}
          topic={primaryTopicOf(session)}
          fromRun={session.id}
        />
      ) : showEvidence && media.length > 0 ? (
        <section className={styles.lookFors} aria-label="What to look for in this lesson">
          <FieldPhotos items={media} />
        </section>
      ) : null}
    </div>
  );
}

/**
 * THE DAY (2026-09-08): the grounded conditions and the note that changes the
 * lesson today. Its own screen, and in the walk only when a note fired —
 * Johan: "condition only shows when something changes the lesson".
 *
 * THE DAY'S CONDITIONS, SAID HERE AND NOWHERE ELSE ON THIS SURFACE (#672).
 * `app/run/page.tsx` composes one grounded sentence per run — "Right now it
 * feels like 24 degrees out under a soft grey sky, with a light breeze" — at
 * model cost, on every session start. It is not a spoken line and wears no
 * quotes; the block carries the amber "look around" mark it wears everywhere
 * else. It stays on THIS screen and never travels to the question screen: the
 * day is something she reads, and that screen holds only what the class hears.
 *
 * The component renders the sentence whenever the run carries one; it is the
 * WALK (`lib/run/journey-steps.ts`, `JourneyShape.day`) that leaves this screen
 * out on a day with nothing to say about it.
 */
export function IntroduceDay({
  ability,
  board = false,
  hinge = null,
  session,
}: {
  /**
   * The class's band, or absent when nobody knows it (#860). Absent renders
   * the text as written; it is never filled in with a real band, which would
   * put Year 1 wording in front of a Reception class with nothing on screen
   * to say so.
   */
  ability?: AbilityBand;
  /** Presented to the class: the adult's label and note are off the screen. */
  board?: boolean;
  /** The authored notes for a day like this one (#323, #1007), or null. */
  hinge?: Hinge | null;
  session: Session;
}): ReactElement {
  const conditions = thresholdConditions(session);
  return (
    <div className={styles.body}>
      <p className={styles.tEyebrow}>The day</p>
      {conditions && (
        <div className={styles.doorConditions}>{renderBlock(conditions, ability)}</div>
      )}
      {hinge && (
        <>
          {/*
            THE NOTE IS LABELLED NOW, AND IT LIVES HERE (2026-09-08).

            Johan, on Today: "the top slot can become smaller and less
            relevant. we can add the lesson note on the runner inside with a
            conditions or something label only when we have it".

            The label and the mark are the ADULT's, so they stay behind
            `!board` with the teacher line they head. Presented to the class,
            this block is the spoken line and nothing else, exactly as #1007
            left it. And it is absent altogether when no note fired: no
            placeholder, no "no conditions today". Silence is the design.
          */}
          {/* ONE COMPONENT, THREE PLACEMENTS (2026-09-08). Johan, on the
              lesson page: "i said somewhere here i dont see the line". The
              block moved to `app/ConditionsNote.tsx` whole, with its type,
              so the lesson page and this screen cannot drift apart the first
              time either is tuned. Nothing about what renders here changed. */}
          {!board && <ConditionsNote className={styles.conditionNoteMeasure} hinge={hinge} />}
          {/*
            THE CHILD LINE IS SAID (#1007). Johan: "it is going to be hot
            today, a good day for finding..." — the first thing the class
            hears about the day, authored in the acquaintance register, in
            the speech marks this product uses for every spoken line (#232).
            Absent while a note has only its teacher line.
          */}
          {hinge.child && <p className={styles.spoken}>{quoted(hinge.child)}</p>}
        </>
      )}
    </div>
  );
}

/**
 * THE LINE THE CLASS HEARS, ON ITS OWN SCREEN (#754).
 *
 * This was the bottom eighth of `IntroduceToday` and it is the only thing on
 * that whole threshold a teacher says out loud. It is now the whole page: one
 * plain sentence telling her what to do with it, and the line.
 *
 * WHY THE NOTE IS THERE AT ALL. The product marks speech by mark rather than
 * by word (#232), and the mark is right — it is just not loud enough for a
 * teacher meeting the runner for the first time with thirty children in front
 * of her, which is precisely what the session on 2026-08-31 measured. One
 * teacher-note sentence, in the same register the settle deck uses to say
 * "read each line aloud, slowly", costs nothing to a teacher who has already
 * learned the mark and is the whole screen to one who has not.
 *
 * IT DOES NOT CLAIM TO BE THE FIRST THING THE CLASS HEARS. The settle deck ran
 * five spoken lines before this on most routes, so "teaching starts here"
 * would be false on the common path. What IS true, and is the thing she was
 * missing, is that this is the first the class hears about TODAY — the settle
 * calms them and looks outward, and never names the lesson.
 *
 * IT IS ITS OWN COMPONENT for the same reason `IntroduceToday` is (#672): the
 * journey's steps live in client state and the unit runner has no DOM to click
 * through, so a screen that is only reachable by pressing three buttons is a
 * screen nothing can assert on. Rendered separately, it is asserted against
 * every shipped session in `introduce-today-one-purpose.spec.tsx`.
 */
export function AskAtTheDoor({
  board = false,
  cast = null,
  index = 0,
  session,
}: {
  /** On the board the pictures stay under the question, small (#1004). */
  board?: boolean;
  cast?: LessonCast | null;
  /** Which of the introduction's questions this screen asks (#1004). */
  index?: number;
  session: Session;
}): ReactElement | null {
  const groupNoun = useGroupNoun();
  const questions = doorQuestions(session);
  const authored = questions[index];
  if (!authored) return null;
  const question = authored.question;
  // The same resolve the threshold ran, for one reason only: whether the gap
  // sentence below is honest here. Pure function, same inputs, same answer.
  const evidence = resolveDoor({
    members: cast?.members ?? [],
    located: Boolean(cast?.located),
    placeName: cast?.placeName ?? null,
    topic: primaryTopicOf(session),
    // How many creatures this question wants (#1079). "What is your favourite
    // minibeast and why?" is answered by walking up and tapping one, so it
    // takes a board rather than the three a glance takes.
    purpose: authored.species,
  });
  return (
    <div className={styles.body}>
      <p className={styles.tEyebrow}>
        {questions.length > 1
          ? `Ask the ${groupNoun} · ${index + 1} of ${questions.length}`
          : `Ask the ${groupNoun}`}
      </p>
      {/*
        NO INSTRUCTION LINE (Johan, 2026-09-06: "this is an interactive
        session that might be projected on the screen, maybe don't add: Read
        this to the class"). The speech marks say it is said (#232); the
        question stands alone on the board.
      */}
      {/* The hanging quotation marks, which are how this product marks
          speech everywhere (#232: registers carry by mark, not by word).
          Sophia's sheet drew a green rule here instead; a second mark for
          "read this out" is a second vocabulary for one idea, and the settle
          cards two screens back already use the quotes. */}
      <p className={styles.spoken}>{quoted(question)}</p>
      {/* AUTHORED PICTURES HOLD THE SLOT (#1078). The minibeast hunt asks two
          questions on this component: "where would you hide?" is about places
          and takes the woodlice photograph, and "your favourite minibeast?"
          is about creatures and takes the board. Before this the difference
          could only be expressed by matching the question string. */}
      <LessonPictures pictures={authored.pictures} />
      {/* The one concession, and it is small: it admits the gap and hands the
          lesson back to the real thing, which is outside whether or not we
          know its name. Only when the screen before this one showed no
          evidence, so it never explains away evidence we do have. */}
      {!authored.pictures && evidence.kind === "none" && (
        <p className={styles.slotGap}>
          We do not know your patch yet. Whatever they answer, they are
          looking at the real thing.
        </p>
      )}
      {/*
        THE PICTURES STAY UNDER THE QUESTION, SMALL, ON THE BOARD (#1004,
        Sophia's beat 3): a child can walk up and tap one while answering.
        Same gate as the day screen — an open-count lesson shows no evidence
        here either, and a projector makes that rule stronger, not weaker
        (nc#403, D8).
      */}
      {!authored.pictures && board && shouldShowDoorEvidence(session) && (
        <DoorSlot
          board
          compact
          evidence={evidence}
          topic={primaryTopicOf(session)}
          fromRun={session.id}
        />
      )}
    </div>
  );
}

export function HybridJourney({
  ability,
  assistEnabled = false,
  audio = {},
  cast = null,
  doorLine = null,
  hazards = null,
  hinge = null,
  homeHref = "/",
  locale,
  logTo,
  media = [],
  navigationHrefs,
  nextTitle,
  offlineAvailable = false,
  ownerScope = null,
  previewSeconds = null,
  session,
  startAt,
  introductionSetting,
  autoResume = false,
  exampleNote = null,
}: {
  /**
   * The class's band, or absent when nobody knows it (#860). `app/run/page.tsx`
   * passes `classBand ?? undefined` and `app/field/FieldShell.tsx` passes
   * nothing at all, so absent is a live case on the DEFAULT runner and it
   * renders the words as written rather than a band's.
   */
  ability?: AbilityBand;
  assistEnabled?: boolean;
  /**
   * The recordings this lesson's spoken lines actually have (nc#358), resolved
   * on the server. Keyed on the spoken line itself, so a moment finds its own
   * clip by the string it is already rendering and nothing else is possible:
   * a teacher note has no key here and can never be played to a class.
   * Empty until the synthesis script has been run, which is the honest state
   * and the one that shows no control at all.
   */
  audio?: SpokenAudio;
  /** The lesson's resolved cast — the only source the entity linker may use. */
  cast?: LessonCast | null;
  /**
   * The rights-complete photo references the page already resolves (#375).
   * The legacy runner held these behind a collapsed tray; here they are a
   * tap-to-full-bleed surface for holding a photograph up to the class.
   */
  media?: LessonMediaItem[];
  navigationHrefs?: HybridJourneyNavigationHrefs;
  /** The released public lesson has a cache-proven field fallback. */
  offlineAvailable?: boolean;
  /** One honest sentence on the doorstep when the run is the public example (#877). */
  exampleNote?: string | null;
  /**
   * Re-enter the saved run without the resume gate (#874): the way back from a
   * page this run opened, such as a species profile. Leaving for a moment and
   * returning is not a fresh visit, so the "pick up?" question is already
   * answered by the tap that brought her back.
   */
  /** Open on the grounding\'s first card: for static renders that need an interior screen. No URL carries it. */
  startAt?: "settle";
  /** Starting place is independent of the presentation toggle. */
  introductionSetting?: "indoors" | "outside";
  autoResume?: boolean;
  /**
   * Authored hazards for these grounds and this month (#376), resolved on the
   * server from plain data. Null means nothing is known, and nothing renders:
   * an absent hazard list must never read as "nothing to worry about".
   */
  hazards?: LessonHazards | null;
  /** The authored hinge for a day like this one (#323, #1007), resolved on the run page. */
  hinge?: Hinge | null;
  /** Landing for public demos; Today for a signed-in teacher. */
  homeHref?: "/" | "/today";
  /**
   * The door's joining sentence, drafted on the server over the evidence this
   * component is about to resolve for itself (#342). Carries the names it was
   * written over so `DoorSlot` can refuse it if the screen disagrees.
   */
  doorLine?: DoorLine | null;
  locale?: string;
  logTo?: LogTarget | null;
  nextTitle?: string | null;
  /**
   * Opaque server-derived teacher/class ownership for this run — the same
   * scope `Runner.tsx` receives (see `app/run/page.tsx`). Public demos get
   * their own explicit scope; a signed-in teacher without an active class
   * gets null and leaves no resumable state on the shared device.
   */
  ownerScope?: string | null;
  /**
   * How long this lesson's narrated preview runs (#515), or null when none of
   * it has been voiced. Null means NO ROW AT ALL on the doorway — the same rule
   * the play control follows, for the same reason: there is never a control
   * here that does not play.
   *
   * A number rather than the deck, because the deck lives on its own full-
   * screen route now and the doorway only needs to caption the door to it.
   */
  previewSeconds?: number | null;
  session: Session;
}): ReactElement {
  // Who is in front of her (#1214): "class" for a school and for a signed-out
  // visitor, "family" or "group" for a stored non-school audience.
  const groupNoun = useGroupNoun();
  const phases = resolvePhases(session, null);
  // Null where the prompt only restates the title or the objective (#150).
  const heroQuestion = drivingQuestion(session);
  const connectionState = useLessonConnection(offlineAvailable);
  const useFieldFallback =
    offlineAvailable && usesOfflineFallback(connectionState);
  const navigation =
    navigationHrefs ??
    (useFieldFallback
      ? {
          exit: fieldHref(session.id, "lesson", homeHref),
          preview: fieldHref(session.id, "lesson", homeHref),
          primer: fieldHref(session.id, "primer", homeHref),
          safety: fieldHref(session.id, "safety", homeHref),
          print: fieldPrintHref(session.id, homeHref),
        }
      : {
          exit: homeHref,
          preview: lessonHref("/session/preview", session.id, locale),
          primer: lessonHref("/session/primer", session.id, locale),
          safety: lessonHref("/session/safety", session.id, locale),
          print: lessonHref("/print", session.id, locale),
        });
  const nativeNavigation = navigationHrefs !== undefined || useFieldFallback;

  // A pack-authored settle overrides the default ritual outright (#285).
  const authoredSettle = phases.find((phase) => phase.key === "settle");
  const bodyAll = phases.filter((phase) => phase !== authoredSettle);
  const isCircle = (blocks: Block[]) =>
    blocks.some((block) => block.type === "circle-question");
  const circlePhase = bodyAll.find((phase) => isCircle(phase.blocks));
  const bodyPhases = bodyAll.filter((phase) => phase !== circlePhase);
  /**
   * An authored introduction is said inside (#1187). The walk hoists part 0
   * ahead of the outside screen when the pack keyed it `introduce`; here the
   * same fact decides the board rendering, the beat pager, the clock and the
   * strip, read once so none of them can disagree.
   */
  const introduceFirst = isIndoorIntroduction(bodyPhases[0]);

  const settleCards = useMemo(() => {
    if (!authoredSettle) return DEFAULT_SETTLE;
    // The authored settle reads positionally, like the circle: a spoken line
    // opens a card, the note that follows it rides along.
    const cards: Array<{ line: string; note: string }> = [];
    for (const block of authoredSettle.blocks) {
      if (block.type === "say-aloud") {
        cards.push({
          line: spokenLine(resolveText(block.text, block.abilityVariants, ability)),
          note: "",
        });
      } else if (block.type === "teacher-note" && cards.length > 0) {
        const last = cards[cards.length - 1];
        if (last && !last.note) {
          last.note = resolveText(block.text, block.abilityVariants, ability);
        }
      }
    }
    return cards.length > 0 ? cards : DEFAULT_SETTLE;
  }, [authoredSettle, ability]);

  // The board asked these already (#1004); the phase pages must not ask them
  // again. `phaseMoments` drops a spoken line that says the same words.
  const askedAtTheDoor = useMemo(
    () => doorQuestions(session).map((entry) => entry.question),
    [session]
  );

  /**
   * THE LESSON'S SHAPE, ONCE, FOR BOTH DIRECTIONS OF THE WALK (#752).
   *
   * Every mover on this surface — the CTAs, the back control, the back-swipe —
   * reads the same five facts, so forward and back cannot disagree about
   * where the parts end. `phaseMoments` is the same function the phase page
   * renders with, so "the last moment of the previous part" is the screen a
   * teacher was actually just on and not an index computed a second way.
   */
  const shape: JourneyShape = useMemo(
    () => ({
      settleCards: settleCards.length,
      phaseMoments: bodyPhases.map((phase) => phaseMoments(phase, askedAtTheDoor).length),
      // Whether the threshold is one screen or two (#754). The spoken line
      // only has a screen when the lesson authored a line for it.
      askCount: doorQuestions(session).length,
      // The day screen stands only when a note fired today (2026-09-08).
      day: Boolean(hinge),
      introduceFirst,
      circle: Boolean(circlePhase),
      reflect: Boolean(logTo),
    }),
    // `bodyPhases`/`circlePhase` are derived fresh each render from `session`,
    // which cannot change inside a mounted journey (`app/run/page.tsx` keys on
    // the session id), so the session is the honest dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, settleCards.length, logTo, hinge, askedAtTheDoor, introduceFirst]
  );
  /**
   * Whether part 0 is said inside is the WALK's answer (`isHoisted`), read
   * from the same shape the walk reads, so the board page, the beat pager,
   * the strip chip and the clock guard can never classify a screen the walk
   * did not send her to (Codex review on #1193).
   */
  const hoisted = isHoisted(shape);
  const onIndoorIntroduction = (at: Step): boolean =>
    hoisted && at.kind === "phase" && at.phase === 0;

  // The introduction is the first screen (Johan, 2026-09-06): the lesson
  // screen opens it directly, and the run has no doorstep of its own.
  const [step, setStep] = useState<Step>(
    startAt === "settle" ? { kind: "settle", card: 0 } : { kind: "topic" }
  );
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /**
   * Resume, restored (#456). A locked phone or a dropped signal used to lose
   * the exact place the paused card promised to keep — nothing in this file
   * persisted, so a reload always came back to `intro` and "your place is
   * kept" was a line with nothing behind it.
   *
   * `pendingResume` starts null on both the server and the client's first
   * render, so `intro` (or whatever the caller renders statically, which the
   * pre-read brief tests exercise directly via `renderToStaticMarkup`) is
   * never blocked behind a client-only check. The localStorage read happens
   * ONLY in the mount effect below, client-side and after that first paint —
   * matching `Runner.tsx`'s rule that a saved run waits for the teacher's
   * say-so rather than re-entering silently, an accidental open must not
   * swallow today's class into yesterday's clock — at the cost of a resuming
   * teacher seeing `intro` for one frame before the resume gate replaces it,
   * which is the honest trade for a component whose SSR output the product
   * depends on being real content, not a hold.
   */
  const [pendingResume, setPendingResume] = useState<JourneyProgress | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const exitDialogRef = useRef<HTMLDivElement | null>(null);
  const pausedDialogRef = useRef<HTMLDivElement | null>(null);
  // The lesson's two lifecycle controls, restored (#325). The legacy runner
  // has carried them all along — an accumulating paused span the clock
  // subtracts, and an end that lands in the close rather than dropping the
  // teacher home — and the hybrid shipped without either. A class does get
  // interrupted, and a lesson does have to stop early.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [openEntity, setOpenEntity] = useState<string | null>(null);
  /*
   * Outdoor mode is a STATE, not the live register (#870).
   *
   * This defaulted to `true`, so crossing the threshold turned the ground dark
   * moss — the reading being that "live" looks different from "preparing".
   * Johan rejected exactly that on 2 September: "NO this does not respect our
   * colors". The reasoning behind the rejection is the type + ink rule this
   * product already holds itself to, that colour means state and nothing else.
   *
   * Dark moss already means one specific thing, and it is not "a lesson is
   * running". `.run.outdoor` in globals.css is the GLARE answer: the teacher
   * is standing in sun and needs the ground that survives it. Spending that
   * register on the lifecycle takes the meaning off it, and leaves a teacher
   * teaching indoors reading a sun palette she did not ask for.
   *
   * So the live guide opens on paper, in the product's colours, and she flips
   * to moss when the sky says so. The toggle is untouched — this is a deletion
   * of a default, not a removal of a mode. It also puts the hybrid runner back
   * in step with the legacy one, which has defaulted to light all along
   * (`Runner.tsx`, OUTDOOR_KEY).
   */
  const [outdoor, setOutdoor] = useState(false);
  /*
   * THE BOARD IS A DISPLAY MODE OF THE INTRODUCTION, NOT A ROUTE (#1004, D3).
   * The same four screens, the same data, the same honesty tiers, at a size a
   * class can read from the carpet and with the pictures as the tap targets.
   * A state like outdoor light, flipped from the head on the four
   * introduction screens. The entry choice sets the initial display, while
   * the starting place survives resume independently of this display toggle.
   */
  const [startingPlace, setStartingPlace] = useState(introductionSetting);
  const [board, setBoard] = useState(introductionSetting === "indoors");
  /**
   * Whether the sticky footer is covering anything (#1079). Declared with the
   * other hooks and above every early return, because this walk returns from
   * a dozen places and a hook below any of them is a hook that sometimes does
   * not run. The only thing it changes is the fade above the action.
   */
  const moreAttr = useScrollCue() ? "true" : undefined;
  /**
   * The reflection's save button lives in the sticky foot (Johan,
   * 2026-09-08: "finish here should also be static"), so `LogSession`
   * portals its action row into this slot. State, not a ref: a ref set
   * after render would leave the portal with no target on the first paint.
   */
  const [reflectActions, setReflectActions] = useState<HTMLDivElement | null>(null);
  /**
   * PRESENTING FILLS THE SCREEN (2026-09-08). Johan: "the presentation mode
   * is not cool at all... just expands the screen and makes these texts
   * bigger". Present now asks the browser for the whole screen, so the board
   * shows the lesson and nothing of the browser; the request itself is made
   * in the button's click (it needs the gesture), and this effect is the way
   * back — leaving the board, by the Guide button or by walking out of the
   * door, gives the screen back. Best effort on every step: a school iPad
   * that refuses fullscreen still gets the board layout.
   */
  useEffect(() => {
    if (board) return;
    if (typeof document === "undefined" || !document.fullscreenElement) return;
    document.exitFullscreen?.().catch(() => {});
  }, [board]);
  const [openQuestion, setOpenQuestion] = useState(0);
  /*
   * There was a fourth piece of circle state here until #753: the questions a
   * teacher had swapped for a model's rephrasing, via the "Ask it another way"
   * row (#390). The row is gone from the circle card and so is the state it
   * fed — see the circle branch below for the whole reasoning. The card now
   * shows one thing per question, which is the thing the author wrote.
   */
  // The Teacher's assistant sheet (#378): two doors, one surface. The thread
  // lives in the sheet; this only holds whether it is up.
  const [assistOpen, setAssistOpen] = useState(false);

  useModalFocus(showExitConfirm, exitDialogRef, () => setShowExitConfirm(false));

  // Look for a saved place once, on the client — a server render always sees
  // `intro`, so the check has to happen after mount, exactly like `Runner.tsx`.
  useEffect(() => {
    if (!ownerScope) return;
    try {
      const saved = parseJourneyProgress(
        window.localStorage.getItem(journeyProgressKey(ownerScope, session.id)),
        { ownerScope, sessionId: session.id }
      );
      if (saved && autoResume) {
        // Back from a page this run opened (#874): restore the beat she left,
        // clock still running, without asking.
        applyResume(saved);
      } else if (saved) {
        setPendingResume(saved);
      }
    } catch {
      // A blocked storage API must never block the lesson.
    }
    // Runs once per mount. `HybridJourney` is keyed on `ownerScope:session.id`
    // in `app/run/page.tsx`, so a session change is a fresh mount rather than
    // this effect re-running mid-lesson over a different session's key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearSavedJourney() {
    if (!ownerScope) return;
    try {
      window.localStorage.removeItem(journeyProgressKey(ownerScope, session.id));
    } catch {
      // Local resume is best effort; the active lesson must keep working.
    }
  }

  // Persist the exact step, sub-step and clock so a locked phone or a dropped
  // signal resumes the teaching posture, not the doorstep. `intro` is never
  // saved — opening the lesson to look is free — and reaching `celebrate`
  // clears the saved run outright: the lesson is over and there is nothing
  // left to pick up.
  useEffect(() => {
    if (!ownerScope) return;
    // Opening the lesson to look is free: nothing is saved until she has
    // moved past the first screen.
    if (step.kind === "topic") return;
    if (step.kind === "celebrate") {
      clearSavedJourney();
      return;
    }
    const state: JourneyProgress = {
      version: 1,
      ownerScope,
      sessionId: session.id,
      step,
      startedAt,
      pausedAt,
      pausedMs,
      introductionSetting: startingPlace,
    };
    try {
      window.localStorage.setItem(journeyProgressKey(ownerScope, session.id), JSON.stringify(state));
    } catch {
      // Local resume is best effort; the active lesson must keep working.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerScope, session.id, step, startedAt, pausedAt, pausedMs, startingPlace]);

  /** The saved run's own name, for the resume gate and nowhere else. */
  function stepLabel(saved: JourneyStep): string {
    switch (saved.kind) {
      case "settle":
        return `Grounding the ${groupNoun}`;
      case "topic":
        return "Introduce today";
      case "look":
        return "this time of year";
      case "day":
        return "the day";
      case "ask":
        return "the question";
      case "outside":
        return "the outdoor activity";
      case "phase":
        return bodyPhases[saved.phase]?.title ?? "the lesson";
      case "circle":
        return circlePhase?.title ?? "Circle time";
      case "reflect":
        return "your reflection";
    }
  }

  /** Restore a saved run exactly, after the teacher chose to pick it up. */
  function applyResume(saved: JourneyProgress) {
    setPendingResume(null);
    if (!introductionSetting && saved.introductionSetting) {
      setStartingPlace(saved.introductionSetting);
      setBoard(saved.introductionSetting === "indoors");
    }
    setStartedAt(saved.startedAt);
    setPausedAt(saved.pausedAt);
    setPausedMs(saved.pausedMs);

    // Defensive: a saved index outside today's resolved pack (an authoring
    // edit landed between sessions) falls back to a safe, real step rather
    // than stranding the teacher on a page that no longer exists.
    if (saved.step.kind === "phase") {
      const phase = bodyPhases[saved.step.phase];
      if (!phase) {
        setStep({ kind: "topic" });
        return;
      }
      // A part can EMPTY between the saved run and this one (#1194): every
      // line it authored was asked at the door, `phaseMoments` returns none,
      // and the walk steps over it. Resume reads the same rule rather than
      // clamping to moment 0, which opened the page the walk refuses to show.
      setStep(resumePhaseStep(shape, saved.step.phase, saved.step.moment));
      return;
    }
    if (saved.step.kind === "settle") {
      setStep({
        kind: "settle",
        card: Math.min(saved.step.card, Math.max(settleCards.length - 1, 0)),
      });
      return;
    }
    if (saved.step.kind === "circle" && !circlePhase) {
      setStep({ kind: "reflect" });
      return;
    }
    // The line-screen exists only while the lesson authors a line (#754). An
    // authoring edit between sessions lands her on the threshold before it
    // rather than on a page with nothing on it.
    // A question screen exists only while the lesson authors that question
    // (#754, #1004). An authoring edit between sessions lands her on the last
    // question there is, or on the day when there is none.
    if (saved.step.kind === "ask") {
      const count = doorQuestions(session).length;
      setStep(
        count > 0
          ? { kind: "ask", index: Math.min(saved.step.index, count - 1) }
          : hinge
            ? { kind: "day" }
            : { kind: "look" }
      );
      return;
    }
    // The day screen exists only while a note fired (2026-09-08). A run saved
    // on it yesterday comes back on the look when today has nothing to say.
    if (saved.step.kind === "day" && !hinge) {
      setStep({ kind: "look" });
      return;
    }
    setStep(saved.step);
  }

  // Six parts do not fit a phone, so the strip scrolls — and a strip that
  // scrolls has to carry the current chip with it, or by the fourth part the
  // teacher is looking at a row that says nothing about where she is.
  const tabsRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const rail = tabsRef.current;
    // The rail wraps rather than scrolls now (#457), so on a phone there is
    // nothing to bring into view and asking anyway would scroll the page under
    // a teacher mid-sentence. Only chase the chip when the row genuinely is a
    // scroller, which is a narrow window no phone hits.
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    rail.querySelector('[aria-current="step"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }, [step]);

  // The clock starts when the first OUTDOOR phase page opens — teaching, not
  // opening. An introduction said inside is still the opening (#1187).
  useEffect(() => {
    if (step.kind === "phase" && !onIndoorIntroduction(step) && startedAt === null) {
      setStartedAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, startedAt]);

  // The clock stops where the lesson does. Reflection and the celebration are
  // destinations, not teaching, and a number still counting up behind
  // "beautifully done" is the lesson refusing to be over.
  useEffect(() => {
    if (startedAt === null) return;
    if (step.kind === "reflect" || step.kind === "celebrate") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, step.kind]);

  /**
   * Old-prototype precedent: an elbow or a back-swipe must not drop the
   * lesson. One history entry guards the journey; leaving is the ✕, which asks
   * before ending an active run.
   *
   * THE SWIPE NOW MEANS WHAT IT SAYS (#752). It used to be swallowed outright:
   * re-push the guard entry, and nothing else — so on an iPad, the one gesture
   * every teacher already has for "go back" did nothing at all, which is a
   * large part of what "clunky navigation back and forth between prompts"
   * feels like in the hand. It now takes the same single step the back control
   * takes, and the guard entry is re-pushed so the gesture walks the lesson
   * backwards instead of ever dropping it. At `intro` the guard is gone and a
   * swipe leaves the doorway, which it always did.
   *
   * THE GUARD IS UNWOUND WHERE IT WAS ARMED (#776). The effect pushes one
   * entry on LEAVING the doorway; the swipe that walks back TO the doorway is
   * the one that has to spend it, and until now nothing did. `onPop` re-pushed
   * unconditionally, the dep then flipped and the cleanup pulled the listener
   * off an entry still sitting on the stack — so the next swipe at the doorway
   * popped a dead entry with no listener and no URL change and appeared to do
   * nothing, and only the swipe after that left the page. One dead gesture at
   * the door, in a gesture #752/#764 had otherwise made honest.
   *
   * So the re-push is now conditional on where the step is about to land, and
   * the depth of the guard becomes a property of the STEP rather than of the
   * route taken to it: none at the doorway, exactly one anywhere else, whether
   * she arrived by opening the lesson or by walking back into it. Landing
   * nowhere (`null`, which is only the celebration) still re-pushes: there is
   * no step to walk back to there, so the entry is what absorbs the swipe, and
   * that is the behaviour that already shipped.
   *
   * The guarantee #764 bought is untouched. Every step that is not the doorway
   * restores its entry BEFORE stepping, so a running lesson still cannot be
   * lost to a back-swipe; the only case that now spends the entry is the one
   * that arrives somewhere the guard is contractually absent anyway.
   */
  useEffect(() => {
    if (step.kind === "topic") return;
    history.pushState({ journey: true }, "");
    const onPop = () => {
      // The pop has already spent the guard entry. `previousStep` is pure and
      // reads the same ref `goBack` is about to read in the same synchronous
      // turn, so this asks where the gesture lands without taking the step
      // itself — the step stays `goBack`'s, one control for the swipe and the
      // button both.
      const to = previousStep(stepRef.current, shape);
      if (to === null || to.kind !== "topic") history.pushState({ journey: true }, "");
      goBack();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Armed once, on leaving the intro. `goBack` reads the live step from
    // `stepRef`, so a closure captured here is never stale about where she is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind === "topic"]);

  const members = useMemo(() => cast?.members ?? [], [cast]);

  /**
   * WARM THE REST OF THE LESSON'S RECORDINGS, ONCE SHE HAS ASKED FOR ONE.
   *
   * The runner is used in a field. `/run` is a personalised page and therefore
   * NetworkOnly in the service worker — it is not available from a cold start
   * offline, and paper stays the deep offline (see app/sw.ts). The case that
   * actually happens is the other one: she opens the lesson on staffroom wifi,
   * walks outside, and the signal goes. Every recording she has not fetched yet
   * would die at the door.
   *
   * So the moment she presses play for the first time, the whole lesson's audio
   * is pulled in the background and lands in the worker's audio cache, where it
   * survives the walk. A whole session is a few hundred kilobytes. Before that
   * first press nothing is fetched at all, because most teachers will read the
   * lines themselves and a shared iPad should not spend its data on audio
   * nobody asked for.
   *
   * `no-store: false` is the point — these go THROUGH the service worker so the
   * CacheFirst rule keeps them. Failures are ignored: a warm that does not
   * happen costs a control later, never an error now.
   */
  const warmed = useRef(false);
  const warmLessonAudio = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    for (const clip of Object.values(audio)) {
      void fetch(clip.src).catch(() => {});
    }
  }, [audio]);

  /**
   * A concept is marked ONCE, where it is introduced (Johan, on the template:
   * "we dont have to always HIGHLIGHT the concept... MINIBEAST ONLY ONCE WHEN
   * CONCEPT IS INTRODUCED"). Walk the journey in reading order and record,
   * per entity, the one position where its mark lives. Every later mention is
   * plain ink. Deterministic: the same session maps the same way every time.
   */
  const firstSightings = useMemo(() => {
    const map = new Map<string, string>();
    if (members.length === 0) return map;
    // The same moments the phase pages render, from the same selector, so a
    // position key computed here is the position key the page computes — it is
    // one function now rather than a copy of the walk that has to agree with it
    // (#738). Introductions live in the teaching body; the circle recaps in
    // plain ink.
    bodyPhases.forEach((phase, phaseIndex) => {
      phaseMoments(phase, askedAtTheDoor).forEach((moment, momentIndex) => {
        moment.blocks.forEach((block, blockIndex) => {
          if (block.type !== "say-aloud" && block.type !== "teacher-note") return;
          const text = resolveText(block.text, block.abilityVariants, ability);
          for (const segment of linkEntities(text, members)) {
            if (segment.kind === "entity" && !map.has(segment.slug)) {
              map.set(segment.slug, `${phaseIndex}:${momentIndex}:${blockIndex}`);
            }
          }
        });
      });
    });
    return map;
  }, [bodyPhases, members, ability]);

  /** Mark an entity only at its recorded first introduction. */
  /**
   * Species names become taps into the cast. With `gloss`, the prose BETWEEN
   * them also gets the session's glossary words (#350).
   *
   * The two layers run in this order and not the other way round: a species
   * name is claimed by the entity linker first, so a glossary term that
   * happens to sit inside one ("oak" inside "oak apple gall") cannot steal the
   * tap from the creature. What is left over is ordinary prose, and that is
   * where a vocabulary word belongs.
   */
  const linked = useCallback(
    (text: string, at: string | null, gloss = false): ReactNode => {
      const plain = (value: string, index: number): ReactNode =>
        gloss ? <GlossedText key={`g${index}`}>{value}</GlossedText> : value;

      if (members.length === 0) return plain(text, 0);
      const segments = linkEntities(text, members);
      return segments.map((segment: EntitySegment, index) => {
        if (segment.kind === "text") return plain(segment.text, index);
        if (at === null || firstSightings.get(segment.slug) !== at) {
          return plain(segment.text, index);
        }
        return (
          <button
            key={index}
            type="button"
            className={styles.entity}
            onClick={() => setOpenEntity(segment.slug)}
          >
            {segment.text}
          </button>
        );
      });
    },
    [members, firstSightings]
  );

  /** Engine rendering, with the two speech registers passed through the linker. */
  const renderMomentBlock = (block: Block, key: number, at: string | null): ReactNode => {
    if (block.type === "say-aloud") {
      /*
       * The option to press play instead of reading (nc#358), as a small round
       * control AFTER the line it speaks rather than a strip under it. The
       * sentence stays the thing on the page.
       *
       * It is rendered INSIDE the paragraph, not as a sibling of it, so it
       * follows the closing quote the way a full stop does and reflows with
       * the last line at any width. Leading it — the first draft put it to the
       * left of the opening quote — made a teacher's eye land on a control
       * before it landed on the words she is about to say.
       *
       * `clipForMoment` is given this one block, so what plays is this line and
       * nothing else. The teacher note that shares the screen with it is never
       * looked up.
       *
       * Keyed on the position, not the loop index: without it React reuses the
       * same element across two moments at the same index and the previous
       * line's recording keeps playing over the next one's words.
       */
      return (
        <div className={styles.spokenRow} key={key}>
          <p className={styles.spoken}>
            {quoted(
              linked(spokenLine(resolveText(block.text, block.abilityVariants, ability)), at)
            )}
            <PlayAloud
              key={at ?? String(key)}
              clip={clipForMoment([block], ability, audio)}
              onFirstPlay={warmLessonAudio}
            />
          </p>
        </div>
      );
    }
    if (block.type === "teacher-note") {
      // Glossed here and NOT in the say-aloud above: this is the half she
      // reads to herself. A tappable word inside a sentence she is halfway
      // through speaking to the class is an interruption aimed at the wrong
      // moment.
      return (
        <GlossedNote className={styles.note} key={key}>
          {linked(resolveText(block.text, block.abilityVariants, ability), at, true)}
        </GlossedNote>
      );
    }
    return <div key={key}>{renderBlock(block, ability)}</div>;
  };

  const openMember =
    openEntity !== null
      ? members.find((member) => castSlug(member) === openEntity) ?? null
      : null;

  const goHomeLabel = "Leave the lesson";

  /* ── shared chrome ── */

  // Elapsed, with every paused span subtracted — the live one included, so a
  // clock that is paused simply stops rather than catching up on resume.
  const elapsed =
    startedAt === null
      ? 0
      : now - startedAt - pausedMs - (pausedAt !== null ? now - pausedAt : 0);
  const paused = pausedAt !== null;

  /**
   * A run exists to lose (#456). Before `settle` there is nothing taught yet
   * to leave behind, and `celebrate` is the lesson's own done, so the ✕ is a
   * plain link at both ends and a guarded one in between — except `reflect`,
   * which keeps its own deliberate, tested escape (#344, see the comment on
   * that page): a teacher who does not want to log still leaves by the same
   * ✕ with no extra question. The reflection can be saved completely blank,
   * so this screen adds no second confirmation on the way home.
   */
  const activeRun =
    step.kind !== "topic" && step.kind !== "celebrate" && step.kind !== "reflect";

  const togglePause = () => {
    if (pausedAt !== null) {
      setPausedMs(pausedMs + (Date.now() - pausedAt));
      setPausedAt(null);
    } else {
      setPausedAt(Date.now());
    }
  };

  // The pause card is a dialog (role="dialog", aria-modal) the moment it is on
  // screen, so it gets the same Escape/trap/return-focus contract every other
  // dialog on this surface gets, rather than leaving Tab free to walk straight
  // through it into the teaching page underneath (nc#59). Escape and the card's
  // own "Back to the lesson" button both resume, which is what closing this one
  // dialog always means here.
  useModalFocus(paused, pausedDialogRef, togglePause);

  /** End early where the lesson ends anyway, so the run is closed, not dropped. */
  const endLesson = () => {
    if (pausedAt !== null) {
      setPausedMs(pausedMs + (Date.now() - pausedAt));
      setPausedAt(null);
    }
    setStep(logTo ? { kind: "reflect" } : { kind: "celebrate" });
  };

  /**
   * THE WALK, BOTH WAYS (#752).
   *
   * `goNext` is every CTA on the surface and `goBack` is the new control
   * beside it; both defer to `lib/run/journey-steps.ts`, so neither screen
   * decides for itself where its neighbours are. A null from either means
   * there is nowhere to go, and nothing renders — never a control that
   * does nothing when pressed.
   *
   * The ref is the fast-thumb fix `PreviewDeck` already learned the hard way:
   * a handler that closes over `step` from its own render computes the same
   * previous step for four taps inside one frame. Reading the ref at the
   * moment of the tap makes four taps four steps.
   */
  const stepRef = useRef(step);
  stepRef.current = step;

  const goNext = useCallback(() => {
    const from = stepRef.current;
    const to = nextStep(from, shape);
    if (!to) return;
    // "GO OUTSIDE" IS THE DOOR (Johan, 2026-09-06: "after that it should go
    // to outdoor mode"). Crossing it ends the presentation and switches the
    // run to the outdoor light, so the first thing on the grass is already
    // drawn for the sun. #870 refused a DEFAULT dark palette on every live
    // run; this is a state change at the one step whose whole meaning is
    // leaving the building, and the toggle in the head still flips it back.
    if (from.kind === "outside") {
      setBoard(false);
      setOutdoor(true);
    }
    setStep(to);
  }, [shape]);

  const goBack = useCallback(() => {
    const to = previousStep(stepRef.current, shape);
    if (to) setStep(to);
  }, [shape]);

  /**
   * ONE BACK CONTROL, DRAWN ONCE, STANDING BESIDE THE FORWARD ACTION ON EVERY
   * SCREEN THAT HAS A PREVIOUS ONE.
   *
   * The teacher, running the app on 2026-08-31: the navigation back and
   * forth between prompts is clunky, and Circle time and other parts have no
   * way back to the previous prompt. She is right, and it was a regression —
   * the legacy `Runner` has carried a `← Back` on every teaching page all
   * along; the hybrid that replaced it shipped forward-only.
   *
   * WHERE IT STANDS. In the foot, immediately left of the CTA, because that is
   * where her thumb already is when she mis-taps Next: the reversal of a
   * control belongs beside the control. Not in the head — the head's left is
   * the ✕, and one tap's difference between "previous prompt" and "leave the
   * lesson" is not a difference to design in.
   *
   * WHAT IT IS. An `iconBtn`, the same 44px circle the pause, the light toggle
   * and the assistant already use, holding an arrow drawn to the Mark system's
   * own rules (26-unit box scaled to 20, 2 stroke, butt caps, miter joins,
   * currentColor, no fill). No new visual primitive, no second primary action
   * competing with the CTA, and quiet enough that a teacher reading a line
   * aloud does not see it until she wants it.
   *
   * WHAT IT SAYS. Its accessible name is the screen it lands on — "Back to
   * Introduce today", "Back to Notice" — not the word "Back", which is
   * identical on all six screens and answers the one question a teacher
   * reversing mid-lesson actually has.
   */
  const backTo = previousStep(step, shape);
  const backControl = backTo ? (
    <button
      type="button"
      className={`${styles.iconBtn} ${styles.backStep}`}
      aria-label={backLabel(
        backTo,
        {
          partTitles: bodyPhases.map((phase) => phase.title),
          circleTitle: circlePhase?.title ?? null,
        },
        shape
      )}
      onClick={goBack}
    >
      {backGlyph}
    </button>
  ) : null;

  /**
   * The foot's action row: the way back, then the way on. A screen with no
   * previous step still renders the row, so the CTA does not shift sideways
   * between the doorway and the first settle card.
   */
  const actionRow = (forward: ReactNode) => (
    <div className={styles.actions}>
      {backControl ?? <span className={styles.actionSlot} aria-hidden="true" />}
      {forward}
      <span className={styles.actionSlot} aria-hidden="true" />
    </div>
  );

  /**
   * The clock, given the middle of the head and the size to be read at arm's
   * length. It says what it is under itself — the lesson's allotted minutes
   * while it runs, the word "Paused" while it does not — so the number never
   * needs a label beside it.
   */
  const clock =
    startedAt !== null ? (
      <span className={`${styles.clock} ${paused ? styles.clockPaused : ""}`}>
        <span className={styles.clockTime} aria-label="Time in this lesson">
          {formatClock(elapsed)}
        </span>
        <span className={styles.clockOf}>
          {paused ? "Paused" : `of ${session.durationMin} min`}
        </span>
      </span>
    ) : (
      // Before teaching starts there is no elapsed time, and the brief on the
      // screen itself already carries the minutes. An empty middle.
      <span className={styles.clock} />
    );

  /**
   * The light toggle, an icon now (#378). Johan, from a screenshot of this
   * bar: "remove the outdoor mode option or make it smaller like sun and
   * moon and add the AI icon Assistant". The toggle stays — outdoor mode is
   * a ruling that already came back once, and a teacher who walks indoors
   * mid-lesson needs it — it just stops spending a word on itself, and the
   * space it gives back is exactly where the assistant's door went.
   */
  const sunGlyph = (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </svg>
  );

  const moonGlyph = (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z" />
    </svg>
  );

  const sparkleGlyph = <AssistantGlyph />;

  // A WORD, NOT ONLY A GLYPH (Johan, 2026-09-06: "I don't see present
  // button"). The screen icon alone read as decoration; the button says what
  // it does. Pressing it asks for the whole screen (see the effect above).
  const presentButton = (
    <button
      type="button"
      className={styles.presentBtn}
      aria-pressed={board}
      aria-label={board ? "Back to the guide" : `Present to the ${groupNoun}`}
      title={
        board ? "Presenting. Tap for your guide." : `Your guide. Tap to present to the ${groupNoun}.`
      }
      onClick={() => {
        const next = !board;
        setBoard(next);
        if (!next || typeof document === "undefined" || document.fullscreenElement) return;
        document.documentElement.requestFullscreen?.().catch(() => {});
      }}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M12 16v4M8 20h8" />
      </svg>
      <span>{board ? "Guide" : "Present"}</span>
    </button>
  );

  /**
   * WHERE THE CLASS IS IN THE INTRODUCTION (2026-09-08). On the board the
   * head carries no ✕, no clock and no pause — a child at the board must not
   * be one tap from ending the lesson — only the beat, and the way back to
   * the guide.
   */
  const introBeat = (): { at: number; of: number } | null => {
    const dayBeats = shape.day ? 1 : 0;
    // The authored introduction's moments are beats of the same run (#1187).
    const introMoments = hoisted ? (shape.phaseMoments[0] ?? 0) : 0;
    const of = 3 + dayBeats + shape.askCount + introMoments;
    switch (step.kind) {
      case "topic":
        return { at: 1, of };
      case "look":
        return { at: 2, of };
      case "day":
        return { at: 3, of };
      case "ask":
        return { at: 3 + dayBeats + step.index, of };
      case "phase":
        return onIndoorIntroduction(step)
          ? { at: 3 + dayBeats + shape.askCount + step.moment, of }
          : null;
      case "outside":
        return { at: of, of };
      default:
        return null;
    }
  };

  const head = (
    leave = true,
    withOutdoor = false,
    withPause = false,
    withAssist = false,
    withBoard = false
  ) =>
    withBoard && board ? (
      <div className={`${styles.head} ${styles.boardHead}`}>
        <span className={styles.iconBtn} aria-hidden="true" />
        {(() => {
          const beat = introBeat();
          return beat ? (
            <span className={styles.boardPager} aria-label={`Screen ${beat.at} of ${beat.of}`}>
              {beat.at} of {beat.of}
            </span>
          ) : (
            <span />
          );
        })()}
        {presentButton}
      </div>
    ) : (
    <div className={styles.head}>
      {leave ? (
        activeRun ? (
          // A run mid-way was silently discarded by this exact ✕ (#456): one
          // tap on the way to Today, no question asked, whatever the class
          // was doing gone. It now opens the same choice the paused card
          // offers — keep the place, or end the lesson properly — rather
          // than leaving instantly.
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={goHomeLabel}
            onClick={() => setShowExitConfirm(true)}
          >
            ✕
          </button>
        ) : (
          <JourneyNavigationLink
            native={nativeNavigation}
            href={navigation.exit}
            className={styles.iconBtn}
            ariaLabel={goHomeLabel}
          >
            ✕
          </JourneyNavigationLink>
        )
      ) : (
        <span className={styles.iconBtn} />
      )}
      {clock}
      <span className={styles.headRight}>
        {/* Pause is the door to every other lifecycle control, so it is the
            only one standing on the teaching surface: one tap stops the clock
            and opens the card that holds resume and end. Ending a lesson is
            never one mis-tap away from the line she is reading. */}
        {withPause && startedAt !== null && (
          <button
            type="button"
            className={styles.iconBtn}
            aria-pressed={paused}
            aria-label={paused ? "Resume the lesson" : "Pause the lesson"}
            onClick={togglePause}
          >
            {paused ? playGlyph : pauseGlyph}
          </button>
        )}
        {withBoard && presentButton}
        {withOutdoor && (
          <button
            type="button"
            className={styles.iconBtn}
            aria-pressed={outdoor}
            aria-label={outdoor ? "Switch to indoor light" : "Switch to outdoor light"}
            title={outdoor ? "Outdoor light. Tap for indoor." : "Indoor light. Tap for outdoor."}
            onClick={() => setOutdoor((value) => !value)}
          >
            {outdoor ? moonGlyph : sunGlyph}
          </button>
        )}
        {/* The assistant's door in the chrome (#378): the only accented thing
            in the head, for the moment she is already holding the phone with
            a child in front of her. The second door stands above the CTA. */}
        {withAssist && assistEnabled && (
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.assistSpark}`}
            aria-label="Teacher's assistant"
            onClick={() => setAssistOpen(true)}
          >
            {sparkleGlyph}
          </button>
        )}
      </span>
    </div>
    );

  /**
   * THE PART STRIP, WITH GROUNDING ON IT.
   *
   * Johan, on the grounding screen: *"ground the class is missing from the
   * Runner and also preview.. in runner it should be treated like the other
   * sections.. also having the outdoor mode like the rest"*.
   *
   * The strip was built from `bodyPhases` plus the circle, which is the list
   * of PACK phases — and grounding is chrome on 52 of the 56 shipped sessions
   * (`DEFAULT_SETTLE`; only autumn-starter authors a `settle` phase, and
   * `authoredSettle` lifts that one out of `bodyPhases` too). So the one
   * section every single run passes through was the one section the strip
   * never named, in both directions: a teacher standing in grounding could
   * not see where she was, and a teacher two parts in had no way back to it
   * short of restarting.
   *
   * It renders here rather than inline on the phase page because a second
   * copy on the settle page is a second thing to keep in step — the state
   * rules (done / now / to come) are the reason #325 made these chips real
   * controls, and a hand-copied strip is how one of the two copies quietly
   * stops agreeing about which chip is current.
   *
   * The chip walks to `card: 0` rather than to wherever she left off: a
   * teacher who taps back to grounding is asking for the ritual, not for the
   * fourth line of it. That is the same rule the phase chips already keep
   * (`moment: 0`).
   */
  const partStrip = () => {
    const groundingNow = step.kind === "settle";
    const at = step.kind === "phase" ? step.phase : null;
    return (
      <nav className={styles.tabs} aria-label="Parts of this lesson" ref={tabsRef}>
        {/* The introduction said inside stands first, and is always behind
            her here: this strip only renders outside (#1187). Tapping it is
            the way back to what the class was told before the door. */}
        {hoisted && bodyPhases[0] && (
          <button
            type="button"
            className={`${styles.tab} ${styles.tabDone}`}
            onClick={() => setStep({ kind: "phase", phase: 0, moment: 0 })}
          >
            {bodyPhases[0].title}
          </button>
        )}
        <button
          type="button"
          className={
            groundingNow
              ? `${styles.tab} ${styles.tabNow}`
              : `${styles.tab} ${styles.tabDone}`
          }
          aria-current={groundingNow ? "step" : undefined}
          onClick={() => setStep({ kind: "settle", card: 0 })}
        >
          Ground the {groupNoun}
        </button>
        {/* A part with no moments is not a screen (#1194), so it is not a
            chip either: `phaseMoments` can empty a part whose every line the
            board already asked, and the walk steps over it in both
            directions. A chip for it is the one control left that opens a
            page with nothing to teach on it. */}
        {bodyPhases.map((candidate, index) =>
          (hoisted && index === 0) || (shape.phaseMoments[index] ?? 0) === 0 ? null : (
            <button
              type="button"
              key={candidate.key}
              className={
                at === null
                  ? styles.tab
                  : index < at
                    ? `${styles.tab} ${styles.tabDone}`
                    : index === at
                      ? `${styles.tab} ${styles.tabNow}`
                      : styles.tab
              }
              aria-current={index === at ? "step" : undefined}
              onClick={() => setStep({ kind: "phase", phase: index, moment: 0 })}
            >
              {candidate.title}
            </button>
          )
        )}
        {circlePhase && (
          <button
            type="button"
            className={
              step.kind === "circle" ? `${styles.tab} ${styles.tabNow}` : styles.tab
            }
            aria-current={step.kind === "circle" ? "step" : undefined}
            onClick={() => setStep({ kind: "circle" })}
          >
            {circlePhase.title}
          </button>
        )}
      </nav>
    );
  };

  /**
   * A mark for each door.
   *
   * Johan, 2026-08-17: "pre reading print and gather materials could have
   * their icons".
   *
   * Drawn to the mark system's own rules rather than pulled from an icon set:
   * a 26 unit box, 2 stroke, butt caps and miter joins, `currentColor`, no
   * fill. Round caps and a fill are the two things that would make these read
   * as a settings menu instead of a field guide. 26px is the measured floor
   * from the mark study, below which the counters close up on a photocopy.
   */
  function Mark({ of }: { of: "preview" | "reading" | "safety" | "print" }) {
    const common = {
      width: 26,
      height: 26,
      viewBox: "0 0 26 26",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "butt" as const,
      strokeLinejoin: "miter" as const,
    };
    if (of === "preview") {
      /*
       * A FILLED play mark, and the only one on the doorway (#575).
       *
       * It was drawn stroked and unfilled like the other three, on the
       * argument that a fill would make it the only solid shape here. Johan
       * overruled that: *"I think we had a better presentation UI before on
       * the button ... more differentiated"*.
       *
       * He is right, and the reason is that this row is not the same kind of
       * thing as its neighbours. Pre-reading, Before you go out and Print open
       * a document to read at her own pace. This one starts a voice and moves
       * on its own. Four identically drawn rows give a teacher no way to know
       * which of them plays, and the whole point of the row is that she finds
       * it in the seconds she has.
       *
       * A filled triangle in the action colour is what a play control looks
       * like everywhere, including in our own runner. That is not a break in
       * the mark system so much as an admission that one of these four is a
       * control and three are links.
       *
       * Still not a banner and still not a second primary action: it keeps the
       * row, the position and the arrow. Only the mark changes weight.
       */
      return (
        <svg {...common} fill="currentColor" stroke="none" role="presentation">
          <path d="M8 4.5 20.5 13 8 21.5z" />
        </svg>
      );
    }
    if (of === "reading") {
      // An open book: two leaves meeting at a spine.
      return (
        <svg {...common} role="presentation">
          <path d="M13 7v13" />
          <path d="M13 7C10.5 5.4 7.8 5 4 5v13c3.8 0 6.5.4 9 2" />
          <path d="M13 7c2.5-1.6 5.2-2 9-2v13c-3.8 0-6.5.4-9 2" />
        </svg>
      );
    }
    if (of === "safety") {
      // A field sign: the plain triangle, with the stroke and the mitred
      // corners the other two marks use. Not a filled warning glyph — a fill
      // here would be the only solid shape in the whole mark set, and it would
      // shout on a screen whose register is a field guide. The mark says
      // "there is something to read", and the page says what.
      return (
        <svg {...common} role="presentation">
          <path d="M13 4 23 21H3z" />
          <path d="M13 10v5" />
          <path d="M13 18h.01" />
        </svg>
      );
    }
    // A sheet with a turned corner, and the lines that make it a script.
    return (
      <svg {...common} role="presentation">
        <path d="M6 3h9l5 5v15H6z" />
        <path d="M15 3v5h5" />
        <path d="M9.5 13h7M9.5 17h7" />
      </svg>
    );
  }

  /**
   * The paused surface. A teacher pauses because something took the class
   * away from her, so this screen holds the two things she does next and
   * nothing else to read: come back, or stop here. Stopping goes to the close,
   * which is where the lesson gets written down.
   */
  const pausedCard = paused ? (
    <div className={styles.pausedScrim} role="dialog" aria-modal="true" aria-label="Lesson paused">
      <div className={styles.pausedCard} ref={pausedDialogRef} tabIndex={-1}>
        <p className={styles.pausedClock}>{formatClock(elapsed)}</p>
        <p className={styles.pausedWord}>The clock is stopped</p>
        <p className={styles.tBody}>Your place is kept. Nothing here is lost.</p>
        <button type="button" className={styles.cta} onClick={togglePause}>
          Back to the lesson
        </button>
        <button type="button" className={styles.quiet} onClick={endLesson}>
          End the lesson here
        </button>
      </div>
    </div>
  ) : null;

  /**
   * The ✕'s guard (#456). Ending is a decision, so it asks once, with both
   * real intentions on the card — leaving does not silently discard the run:
   * whatever is saved (`clearSavedJourney` above) stays saved regardless, so
   * "Keep for later" only needs to navigate away.
   */
  const exitDialog = showExitConfirm ? (
    <div className={styles.pausedScrim} role="dialog" aria-modal="true" aria-label="Leave the lesson">
      <div className={styles.pausedCard} ref={exitDialogRef} tabIndex={-1}>
        <p className={styles.pausedWord}>Leave the lesson?</p>
        <p className={styles.tBody}>
          Keep this place for later, or end the lesson properly{logTo ? " and log it" : ""}.
        </p>
        <button type="button" className={styles.cta} onClick={() => setShowExitConfirm(false)}>
          Keep teaching
        </button>
        <JourneyNavigationLink
          native={nativeNavigation}
          href={navigation.exit}
          className={styles.quiet}
        >
          Keep for later
        </JourneyNavigationLink>
        <button
          type="button"
          className={styles.quiet}
          onClick={() => {
            setShowExitConfirm(false);
            endLesson();
          }}
        >
          End the lesson
        </button>
      </div>
    </div>
  ) : null;

  /* ── pages ── */

  // ── The resume gate: a saved run waits for the teacher's say-so ──
  if (pendingResume) {
    const saved = pendingResume;
    const label = stepLabel(saved.step);
    return (
      <main className={styles.journey} data-more={moreAttr}>
        {head(false)}
        <div className={styles.body}>
          <p className={styles.tEyebrow}>Part-way through</p>
          <h1 className={styles.tHero}>{session.title}</h1>
          <p className={styles.tBody}>You were at {label}.</p>
        </div>
        <div className={styles.foot} style={{ flexDirection: "column", gap: "var(--space-2)" }}>
          <button type="button" className={styles.cta} onClick={() => applyResume(saved)}>
            Pick up at {label} →
          </button>
          <button
            type="button"
            className={styles.quiet}
            onClick={() => {
              clearSavedJourney();
              setPendingResume(null);
            }}
          >
            Start fresh
          </button>
        </div>
      </main>
    );
  }

  /*
   * The live route begins in the live job. Preparation now has one explicit
   * home on `/session`; repeating its preview, reading, safety and print links
   * here made the two modes indistinguishable. The data-free `/field` shell
   * keeps its self-contained legacy brief below until its cache contract is
   * migrated separately.
   */
  /**
   * THE THRESHOLD IS TWO SCREENS NOW, AND THE BUTTONS BETWEEN THEM SAY SO
   * (#754).
   *
   * "Start the practice" sat one line under the question a teacher had just
   * read to thirty children, and told her the practice had not started. It is
   * replaced by two labels that each name what actually happens next:
   * "Introduce today" hands the lesson to the class, and "Begin: <part>" names
   * the part that follows — the shape `Runner.tsx`'s doorstep has always used
   * ("Begin: {firstPhaseTitle}"), borrowed rather than invented.
   *
   * A lesson with no authored question has no line-screen at all: the
   * threshold goes straight to the first part, and the button says so. Every
   * shipped session authors one today (56 of 56), which is exactly why the
   * empty state has to be held by code rather than by that fact.
   */
  /**
   * "Skip grounding" is a jump, not a step, so it does not go through the
   * shared walk — but it lands exactly where the walk's last settle card
   * lands, so the two can never disagree about what follows the grounding.
   */
  const skipGrounding: Step =
    nextStep({ kind: "settle", card: Math.max(settleCards.length - 1, 0) }, shape) ??
    { kind: "celebrate" };
  // The grounding's last button names where it actually lands (Codex review
  // on #1192): part 1 when part 0 was said inside, never "Begin: Introduce";
  // the circle or the finish when nothing is taught outside.
  const beginLabel =
    skipGrounding.kind === "phase"
      ? `Begin: ${bodyPhases[skipGrounding.phase]?.title ?? "the lesson"}`
      : skipGrounding.kind === "circle"
        ? `Begin: ${circlePhase?.title ?? "circle time"}`
        : "Finish";

  if (step.kind === "settle") {
    const card = settleCards[step.card];
    return (
      // Outdoor light is a mode of the RUN, not of one page (#442's register,
      // reached the same way the phase page reaches it). It was reachable only
      // from the teaching pages and painted only there, so a teacher who set it
      // for the playground had it fall back to indoor white the moment she
      // stepped back into grounding — on the screen she is holding up in front
      // of thirty children in the sun.
      <main
        className={`${styles.journey} ${outdoor ? styles.outdoor : ""}`}
        data-outdoor={outdoor ? "true" : undefined}
      >
        {head(true, true)}
        {partStrip()}
        <div className={styles.body}>
          <p className={styles.tSect}>Ground the {groupNoun}</p>
          <p className={styles.tBody}>
            Bring the {groupNoun} into a loose circle, then read each line aloud, slowly.
          </p>
          <div className={styles.progressRow}>
            <span className={styles.dots}>
              {settleCards.map((_, index) => (
                <span
                  key={index}
                  className={
                    index < step.card
                      ? `${styles.dot} ${styles.dotDone}`
                      : index === step.card
                        ? `${styles.dot} ${styles.dotNow}`
                        : styles.dot
                  }
                />
              ))}
            </span>
            <span className={styles.tMeta}>
              {step.card + 1} of {settleCards.length}
            </span>
          </div>
          <div className={styles.settleCard}>
            {card?.note ? (
              <p className={styles.note}>{card.note}</p>
            ) : null}
            {/*
              THE SETTLE LINE PLAYS TOO (#531).
              
              This screen tells a teacher, on every session, to "read each line
              aloud, slowly" — and it was the one spoken line in the product
              with no play control beside it. The moment she is most likely to
              want the option is the one before thirty children, at the door,
              and that is exactly where it was missing.

              The lookup is the same one every other spoken line uses: the
              audio map is keyed on the rendered line, and `settleCards` has
              already put `card.line` through `spokenLine(resolveText(...))`,
              so the string that plays and the string on the page are one
              string.

              `DEFAULT_SETTLE` is fixed chrome rather than pack text, so those
              five lines have no recording and no control appears — which is
              the same absent state the rest of the feature keeps, reached
              here without a special case.
            */}
            <p className={styles.spoken}>
              {quoted(card?.line)}
              <PlayAloud
                key={`settle:${step.card}`}
                clip={(card?.line ? audio[card.line] : null) ?? null}
                onFirstPlay={warmLessonAudio}
              />
            </p>
            {/* The settle's Next lives inside the card, not the foot, so its
                way back stands with it. `.actions` outside `.foot` keeps the
                pill its own width, which is the arrangement this card has
                always had. */}
            {/*
              THE LAST CARD NAMES THE PART IT OPENS. Grounding is the section
              before the first part now (Johan, 2026-09-06: the introduction is
              said inside, on the board; "grounding starts here" outside), so
              its final Next is the crossing into teaching, and it borrows the
              shape the legacy doorstep has always used, "Begin: <part>".
            */}
            {actionRow(
              <button type="button" className={styles.cta} onClick={goNext}>
                {step.card + 1 < settleCards.length ? "Next →" : `${beginLabel} →`}
              </button>
            )}
          </div>
        </div>
        <div className={styles.foot}>
          <button
            type="button"
            className={styles.quiet}
            onClick={() => setStep(skipGrounding)}
          >
            Skip grounding
          </button>
        </div>
        {exitDialog}
      </main>
    );
  }

  const introHead = () => head(true, false, false, false, true);
  const boardAttr = board ? "board" : undefined;

  if (step.kind === "topic") {
    return (
      <main className={styles.journey} data-display={boardAttr} data-more={moreAttr}>
        {introHead()}
        <IntroduceTopic board={board} session={session} />
        {/* Whose patch this is (#877): the demo's one honest line, on the first
            screen and nowhere else. */}
        {exampleNote && <p className={styles.lead}>{exampleNote}</p>}
        <div className={styles.foot}>
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              Begin →
            </button>
          )}
          {/*
            HOW THIS GETS ONTO THE BOARD (Johan, 2026-09-08: "is it clear to
            teacher that they can connect this to the interactive board?").
            One line, on the first screen, in the guide only: what to plug in
            and which button to press. Gone the moment she is presenting.
          */}
          {!board && (
            <p className={styles.presentHint}>
              To show this to the {groupNoun}, plug this device into the interactive
              board or mirror the screen, then tap Present. Tap Guide to get
              your notes back.
            </p>
          )}
        </div>
        {exitDialog}
      </main>
    );
  }

  // The button after the reading names the crossing (#754): the day when
  // one fired, else the first question, else the door.
  // What follows the last thing read or asked inside: the authored
  // introduction when there is one (#1187), else the door.
  const afterQuestionsLabel = hoisted ? "Next →" : "Outside time →";
  const afterReading = shape.askCount > 0 ? `Ask the ${groupNoun} →` : afterQuestionsLabel;

  if (step.kind === "look") {
    return (
      <main className={styles.journey} data-display={boardAttr} data-more={moreAttr}>
        {introHead()}
        <IntroduceLook board={board} cast={cast} doorLine={doorLine} session={session} />
        <div className={styles.foot}>
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              {shape.day ? "The day →" : afterReading}
            </button>
          )}
        </div>
        {exitDialog}
      </main>
    );
  }

  if (step.kind === "day") {
    return (
      <main className={styles.journey} data-display={boardAttr} data-more={moreAttr}>
        {introHead()}
        <IntroduceDay ability={ability} board={board} hinge={hinge} session={session} />
        <div className={styles.foot}>
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              {afterReading}
            </button>
          )}
        </div>
        {exitDialog}
      </main>
    );
  }

  if (step.kind === "ask") {
    return (
      <main className={styles.journey} data-display={boardAttr} data-more={moreAttr}>
        {introHead()}
        <AskAtTheDoor board={board} cast={cast} index={step.index} session={session} />
        <div className={styles.foot}>
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              {step.index + 1 < shape.askCount
                ? "Next question →"
                : hoisted
                  ? "Next →"
                  : "Outside time →"}
            </button>
          )}
        </div>
        {exitDialog}
      </main>
    );
  }

  if (step.kind === "outside") {
    return (
      <main className={styles.journey} data-display={boardAttr} data-more={moreAttr}>
        {introHead()}
        <OutsideCard setting={startingPlace} />
        <div className={styles.foot}>
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              Begin outdoor activity →
            </button>
          )}
        </div>
        {exitDialog}
      </main>
    );
  }

  /**
   * THE AUTHORED INTRODUCTION, ON THE BOARD (#1187). Same page grammar as the
   * beats before it — the board head with the beat pager, no strip, no clock,
   * no assistant — because the class is still in the room. Notes for the
   * adult ("write the answers on the board") stay in the guide and off the
   * presented screen, as on every other indoor beat.
   */
  if (step.kind === "phase" && onIndoorIntroduction(step)) {
    const phase = bodyPhases[0]!;
    const moments = phaseMoments(phase, askedAtTheDoor);
    const moment = moments[step.moment];
    const lastMoment = step.moment >= moments.length - 1;
    return (
      <main className={styles.journey} data-display={boardAttr} data-more={moreAttr}>
        {introHead()}
        <div className={styles.body}>
          <p className={styles.tEyebrow}>{phase.title}</p>
          {moments.length > 1 && (
            <div className={styles.progressRow}>
              <span className={styles.dots}>
                {moments.map((_, index) => (
                  <span
                    key={index}
                    className={
                      index < step.moment
                        ? `${styles.dot} ${styles.dotDone}`
                        : index === step.moment
                          ? `${styles.dot} ${styles.dotNow}`
                          : styles.dot
                    }
                  />
                ))}
              </span>
              <span className={styles.tMeta}>
                {step.moment + 1} of {moments.length}
              </span>
            </div>
          )}
          <div className={styles.moment}>
            {/* A note-only moment is real (`phase-moments-already-asked`:
                the question went to the door, its note stayed). Presented,
                it keeps its note rather than becoming a blank board. */}
            {(() => {
              const blocks = moment?.blocks ?? [];
              const shown = board ? blocks.filter((block) => block.type !== "teacher-note") : blocks;
              return (shown.length > 0 ? shown : blocks).map((block, index) =>
                renderMomentBlock(block, index, `${step.phase}:${step.moment}:${index}`)
              );
            })()}
          </div>
          <LessonPictures pictures={picturesForMoment(phase, step.moment, moments)} />
        </div>
        <div className={styles.foot}>
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              {lastMoment ? "Outside time →" : "Next →"}
            </button>
          )}
        </div>
        {exitDialog}
        {openMember && <EntitySheet member={openMember} onClose={() => setOpenEntity(null)} />}
      </main>
    );
  }

  if (step.kind === "phase") {
    const phase = bodyPhases[step.phase];
    if (!phase) {
      setStep(circlePhase ? { kind: "circle" } : { kind: "reflect" });
      return <main className={styles.journey} />;
    }
    // The day's line is off these pages already — `phaseMoments` drops it, and
    // the threshold said it once on the way out (#672, #738).
    const moments = phaseMoments(phase, askedAtTheDoor);
    const moment = moments[step.moment];
    // The label names where Next actually LANDS, which is not the adjacent
    // part once one of them is empty (#1194). It is derived from the walk,
    // beside the walk, so the promise and the tap cannot drift apart.
    const nextLabel = outdoorNextLabel(step, shape, {
      partTitles: bodyPhases.map((candidate) => candidate.title),
    });

    return (
      // data-outdoor opts this element into globals.css's single outdoor token
      // register (#442). The module class still carries this file's own --o-*
      // vocabulary and its gradient ground; what it no longer carries is a
      // hand-kept copy of the shared tokens.
      <main
        className={`${styles.journey} ${outdoor ? styles.outdoor : ""}`}
        data-outdoor={outdoor ? "true" : undefined}
      >
        {head(true, true, true, true)}
        {/* The part strip, as chips (#325). Three states a glancing eye can
            tell apart on a bright playground, and every one of them a real
            control: a teacher who needs a part again taps back to it, and one
            who has lost ten minutes to the weather taps forward. They were
            spans, which is to say a picture of navigation. */}
        {partStrip()}
        <div className={styles.body}>
          {moments.length > 1 && (
            <div className={styles.progressRow}>
              <span className={styles.dots}>
                {moments.map((_, index) => (
                  <span
                    key={index}
                    className={
                      index < step.moment
                        ? `${styles.dot} ${styles.dotDone}`
                        : index === step.moment
                          ? `${styles.dot} ${styles.dotNow}`
                          : styles.dot
                    }
                  />
                ))}
              </span>
              <span className={styles.tMeta}>
                {step.moment + 1} of {moments.length}
              </span>
            </div>
          )}
          <div className={styles.moment}>
            {moment?.blocks.map((block, index) =>
              renderMomentBlock(block, index, `${step.phase}:${step.moment}:${index}`)
            )}
          </div>
          {/*
            Once, on the phase where a class goes and looks (#1019). This
            passed `shouldShowFieldMedia(phase, media)`, which is only a veto,
            so the same strip mounted under every screen in the session.
          */}
          {/* One slot: what the phase authored for THIS moment, or the
              species strip when nothing authored claims it and the moment
              earns it. Never both (#1078). */}
          <LessonPictures pictures={picturesForMoment(phase, step.moment, moments)} />
          <FieldPhotos
            items={media}
            visible={
              !picturesForMoment(phase, step.moment, moments) &&
              !offersImaginativeChoice(session) &&
              showsFieldMedia(bodyPhases, step.phase, media)
            }
          />
        </div>
        {/* The assistant stands with the action, not under the teaching text
            (Johan: "place this button above the big next buttons, make it a
            bit bigger"). Her thumb is already at the foot of the screen. The
            button is one of two doors into the same sheet — this one for the
            beat where she decides whether to move on, the chrome sparkle for
            mid-phase with a child in front of her (#378). */}
        <div className={styles.foot}>
          {assistEnabled && (
            <button
              type="button"
              className={styles.assistAsk}
              onClick={() => setAssistOpen(true)}
            >
              {sparkleGlyph}
              <span>Teacher&rsquo;s assistant</span>
            </button>
          )}
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              {nextLabel}
            </button>
          )}
        </div>
        {pausedCard}
        {exitDialog}
        {openMember && <EntitySheet member={openMember} onClose={() => setOpenEntity(null)} />}
        {assistEnabled && (
          <AssistantSheet
            ability={ability}
            hazards={hazards}
            locale={locale}
            onClose={() => setAssistOpen(false)}
            open={assistOpen}
            phaseKey={phase.key}
            session={session}
          />
        )}
      </main>
    );
  }

  if (step.kind === "circle" && circlePhase) {
    /**
     * CIRCLE TIME, WITH LESS ON IT (#753).
     *
     * The first real teacher to run this app, 2026-08-31
     * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`), carried by
     * Johan: *"Circle time is nice but too much information. please improve,
     * remove the ask another way, simplify buttons"*.
     *
     * She is standing outdoors with a class in a ring around her. Three things
     * came off this screen, and each one was something SHE had to read or
     * decide about while children waited:
     *
     * 1. THE "ASK IT ANOTHER WAY" ROW (#390). Three chips and a lead line under
     *    every open question, plus an offer, a "Use this" and a way back once
     *    she took one — up to six more controls, all of them asking her to
     *    think about the wording of a question instead of about the children in
     *    front of her. It was the one thing she named by itself. The prompt,
     *    the route and the row component all stay where they are; what is gone
     *    is the invitation to use them mid-circle.
     * 2. THE THIRD LINE OF PREAMBLE. "A guide, not a script. Every question
     *    opens in place." is the screen explaining its own interaction design
     *    to a teacher who is about to speak. Guide-not-script is a stance she
     *    named approvingly and it is protected — it lives in how the questions
     *    behave, which is unchanged, not in a caption saying so.
     * 3. THE SECOND DOOR TO THE ASSISTANT. The head already carries the
     *    sparkle. A labelled duplicate in the foot made three buttons compete
     *    down there. #378's "two doors, one surface" is a ruling about the
     *    teaching pages; on the close, the foot is left holding exactly what a
     *    teacher standing with children needs — the way back and the way on.
     *
     * WHAT DID NOT MOVE. The way back stands beside the CTA, in the same
     * `actionRow`, and the CTA still walks through `goNext` (#752/#764). The teacher
     * asked for both of these things in the same session; simplifying her
     * circle is not licence to undo the other half of her feedback. Every
     * authored word — the questions, their notes, any opening or closing block
     * — renders exactly as the pack wrote it.
     */
    const reading = readCircle(phaseBlocks(circlePhase));
    return (
      // THE PAINT, NOT THE TOGGLE. Outdoor light is a mode of the run, and the
      // close is the one part always taught in a ring outdoors — so a circle
      // that flipped back to indoor white was dropping the mode she set two
      // parts ago. What it does NOT get is the toggle: #753 counted the
      // controls on this screen down from twelve to eight on the teacher's "too much
      // information", and `circle-time-density.spec.tsx` holds that census. A
      // mode she already chose costs her nothing; a fourth head control does.
      <main
        className={`${styles.journey} ${outdoor ? styles.outdoor : ""}`}
        data-outdoor={outdoor ? "true" : undefined}
      >
        {head(true, false, true, true)}
        <div className={styles.body} style={{ justifyContent: "flex-start" }}>
          <h1 className={styles.tHero} style={{ textAlign: "center" }}>
            Close the circle
          </h1>
          <p className={styles.tBody} style={{ alignSelf: "center", textAlign: "center" }}>
            Gather the {groupNoun}. Every voice once.
          </p>
          <div className={styles.circleList}>
            {reading.opening.map((block, index) => (
              <div key={`o-${index}`}>{renderBlock(block, ability)}</div>
            ))}
            {reading.items.map((item, index) => {
              const isOpen = openQuestion === index;
              // The author's words, and only ever the author's words (#753).
              const authored = spokenLine(
                resolveText(item.question.text, item.question.abilityVariants, ability)
              );
              return (
                <div
                  className={isOpen ? styles.circleCard : `${styles.circleCard} ${styles.circleClosed}`}
                  key={index}
                >
                  <button
                    type="button"
                    className={styles.qToggle}
                    aria-expanded={isOpen}
                    onClick={() => setOpenQuestion(isOpen ? -1 : index)}
                  >
                    <span className={styles.qText}>{quoted(authored)}</span>
                    <span className={styles.qMark} aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && item.note && (
                    <p className={styles.note}>
                      {resolveText(item.note.text, item.note.abilityVariants, ability)}
                    </p>
                  )}
                </div>
              );
            })}
            {/* The named skill does not close the circle here — it is said
                once, on the celebration, where "today we practised" belongs
                (Johan: "remove this ugly"). */}
            {reading.closing
              .filter((block) => block.type !== "named-skill")
              .map((block, index) => (
                <div key={`c-${index}`}>{renderBlock(block, ability)}</div>
              ))}
          </div>
        </div>
        <div className={styles.foot}>
          {/* TWO THINGS IN THE FOOT, AND NO THIRD (#752, #753).
              The way back — the teacher's other named complaint, the circle was the
              one part with no way at all to step back — and the way on. The
              labelled "Teacher's assistant" button that used to stand above
              them is a second door to the sheet the head's sparkle already
              opens; on the screen she called too much, one door is enough. */}
          {actionRow(
            <button type="button" className={styles.cta} onClick={goNext}>
              Done with circle time →
            </button>
          )}
        </div>
        {pausedCard}
        {exitDialog}
        {assistEnabled && (
          <AssistantSheet
            ability={ability}
            hazards={hazards}
            locale={locale}
            onClose={() => setAssistOpen(false)}
            open={assistOpen}
            phaseKey={circlePhase.key}
            session={session}
          />
        )}
      </main>
    );
  }

  if (step.kind === "reflect" && logTo) {
    return (
      <main className={styles.journey} data-more={moreAttr}>
        {head(true)}
        <div className={styles.body} style={{ justifyContent: "flex-start" }}>
          <LogSession
            classId={logTo.classId}
            className={logTo.className}
            homeHref={homeHref}
            nextTitle={nextTitle}
            onCompleted={() => setStep({ kind: "celebrate" })}
            onStartAgain={() => setStep({ kind: "topic" })}
            actionsInto={reflectActions}
            runStartedAt={startedAt}
            sessionId={session.id}
            startedAt={startedAt}
          />
        </div>
        {/*
          NO SKIP HERE, deliberately (#344).

          This foot used to carry a "Skip for now" that went straight to the
          celebration. It read as "skip the reflection" — every question on
          this screen is optional, so that is what a teacher takes it to mean —
          but it skipped the COMPLETION and journal entry, then showed a
          celebration telling her the lesson was beautifully done. A whole
          lesson, taught outdoors, recorded nowhere, with nothing on screen to
          say so.

          The rule the other two finish surfaces already hold: the reflection
          is optional, the record is not. Saving the record is the only gate,
          and the celebration is what a saved lesson opens.
          `tests/unit/completion-before-reflection-contract.spec.ts` had banned
          this exact string from LogSession; the journey reintroduced it one
          component up, outside that guard's reach, and the guard now reads
          every run surface instead.

          A teacher who truly does not want to log still has the ✕ in the
          running head, which leaves without claiming anything was saved.

          THE BACK BELOW IS NOT THAT SKIP, AND THE DIFFERENCE IS THE DIRECTION
          (#752). #344 is a rule about getting PAST the record: nothing may
          reach the celebration except a saved completion, and the guard above
          holds that by counting celebrate transitions in this branch — there
          is still exactly one, and it is `LogSession`'s own `onCompleted`.
          This control goes the other way, back into the lesson she was
          teaching, which is what a teacher who tapped "Done with circle time"
          one question early is asking for. Nothing has been written on the way
          in here, so nothing is unwritten by stepping out.
        */}
        <div className={styles.foot}>
          <div className={styles.actions}>
            {backControl}
            {/* The save button and its note, portalled here by LogSession. */}
            <div className={styles.reflectActions} ref={setReflectActions} />
            <span className={styles.actionSlot} aria-hidden="true" />
          </div>
        </div>
      </main>
    );
  }

  // celebrate — reached from reflect, from a signed-out circle, or directly,
  // and (folio jumps + the circle's direct "Done" both being one tap away)
  // with no guarantee any phase in between was ever taught. THE APP DOES NOT
  // KNOW WHAT THE CLASS FOUND.
  //
  // The pack's authored headline and keepsake are Johan's own lines ("You
  // met the neighbours." / "Legs were counted. Wings were found...") —
  // specific claims about what thirty children did outdoors,
  // made by software that was in a pocket the whole run (nc#458, usability
  // study #455: a phase-jumped, zero-observation run still closed on them).
  // They are verbatim-guarded (scripts/verbatim-fidelity.mjs), so they stay
  // in the pack exactly as authored; the assertion is suppressed at the
  // renderer instead, the same move the legacy `Runner` already made
  // (tests/unit/walk-blockers.spec.tsx) and the same "ship silence, not
  // invention" rule `lib/cast/closing.ts` follows elsewhere. Restoring them
  // is a one-line change the day a real per-phase observation record exists
  // to back them — no such tally is collected today, phase-jumped or not.
  //
  // What we DO know, unconditionally: the session finished, what skill this
  // lesson is built to grow (a fact about the plan, not a claim that it
  // landed), and what next week is (a fact about the shelf). All three
  // survive regardless of path or input — a teacher's optional reflection
  // (LogSession: mood/happenings/timing/note) may one day earn a specific
  // outcome line of its own, but until it does, no input there becomes a
  // positive claim here either.
  return (
    <main className={`${styles.journey} ${styles.celebrate}`}>
      {head(false)}
      <div className={`${styles.body} ${styles.celebrateBody}`}>
        {session.celebration?.emoji && (
          <span style={{ fontSize: "2rem" }} aria-hidden="true">
            {session.celebration.emoji}
          </span>
        )}
        <p className={styles.tEyebrow}>that was today</p>
        <h1 className={styles.tHero}>{session.title} is done.</h1>
        <div>
          <p className={styles.tEyebrow}>the skill we grow</p>
          <p className={styles.tSect} style={{ color: "var(--tj-green-pale)" }}>
            {session.namedSkill}
          </p>
        </div>
        {(session.celebration?.nextWeekTease ?? nextTitle) && (
          <p className={styles.tMeta} style={{ color: "rgb(244 238 216 / 70%)" }}>
            {session.celebration?.nextWeekTease ?? `Next week: ${nextTitle}.`}
          </p>
        )}
      </div>
      <div className={styles.foot} style={{ alignItems: "center" }}>
        <JourneyNavigationLink
          native={nativeNavigation}
          href={navigation.exit}
          className={styles.cta}
        >
          Done
        </JourneyNavigationLink>
      </div>
    </main>
  );
}

/**
 * The entity card (#219/#223): opens over the lower half so the line she was
 * reading stays on screen. Honest per-layer silence — a thin entity makes a
 * shorter card, never a padded one.
 */
export function EntitySheet({
  member,
  onClose,
}: {
  member: LessonCast["members"][number];
  onClose: () => void;
}) {
  // Whose patch this sheet may speak about (#370).
  const scope = useRunScope();
  // Was a hand-rolled Escape listener with no Tab trap and no return-focus —
  // the one dialog on this surface not built on the shared contract every
  // other sheet here uses (nc#59). Reusing it rather than patching the gap in
  // place, per the house rule against reinventing dialog focus handling.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(true, dialogRef, onClose);

  return (
    <>
      <button
        type="button"
        className={styles.sheetScrim}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={member.commonName}
        tabIndex={-1}
      >
        <div className={styles.sheetInner}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={member.commonName}
                className={styles.sheetPhoto}
                src={member.photoUrl}
              />
            ) : null}
            <div>
              <p className={styles.tSect} style={{ margin: 0 }}>
                {member.commonName}
              </p>
              {member.scientificName && (
                <p className={styles.tMeta} style={{ fontStyle: "italic" }}>
                  {member.scientificName}
                </p>
              )}
            </div>
          </div>
          {member.line ? (
            <p className={styles.tBody}>{member.line}</p>
          ) : (
            /* Whose patch we found nothing on (#370): sample mode has no
               school to have found nothing near. */
            <p className={styles.tBody}>{NO_RECORD_CAPTION[scope]}</p>
          )}
          <button
            type="button"
            className={styles.quiet}
            onClick={onClose}
          >
            Put this away
          </button>
        </div>
      </div>
    </>
  );
}
