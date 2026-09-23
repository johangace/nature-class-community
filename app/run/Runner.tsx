"use client";

import Link from "next/link";
import { RunHold } from "./RunHold";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { AbilityBand, Block, ConditionKind, Session, TopicTag } from "@/schema/pack";
import { availableConditions, resolvePhase, resolvePhases } from "@/lib/resolve";
import { groupMoments, phaseAbilitySignature, type Moment } from "@/lib/moments";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { renderBlock } from "@/engine/registry";
import { Wordmark } from "../Wordmark";
import { Folio, type FolioPhase } from "./Folio";
import { LogSession } from "./LogSession";
import { CircleTime } from "./CircleTime";
import { useGroupNoun } from "./GroupNoun";
import { SpeakAndShow, type SpeakCastMember } from "@/app/cast/SpeakAndShow";
import {
  parseRunProgress,
  runProgressKey,
  type RunLocation,
  type RunProgress,
} from "@/lib/run/progress";
import { useModalFocus } from "./useModalFocus";
import { WorkPhase } from "./WorkPhase";
import { teachingModeAt } from "@/lib/run/teaching-flow";
import type { LessonMediaItem } from "@/lib/lesson/media";
import { FieldReferenceTray } from "./FieldReferenceTray";
import { TeachingAssistant } from "./TeachingAssistant";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/client";

/**
 * The run surface, set as a book page: one page per screen, with explicit
 * footer navigation so an incidental tap cannot move the class on.
 *
 * A page never holds more than two elements — the for-you note (quiet,
 * above) and the spoken line (the Fredoka hero, below). Teaching-moment
 * grouping (lib/moments.ts) is unchanged; this file lays each moment out
 * as pages: note above spoken line on one page, and a conditions line
 * either taking the note's position (when the moment has no note) or a
 * quiet page of its own (when it does). Never a third element.
 *
 * Before the pages, the runner stages ONE doorstep: INTRODUCE, where the
 * teacher names the session to the class, skippable, then the steps. There
 * used to be a PREPARE room in front of it holding read-first and the kit,
 * but both live on /session, one tap earlier, and a teacher was being asked
 * to start the same session twice (#149). A session
 * whose phase one is keyed `settle` opens on the settling ritual, whose
 * words live in pack data, not in this file; a session without one opens
 * straight on its first phase. The stopwatch starts when the steps do.
 *
 * - Honest elapsed time: computed from a stored start timestamp, never from
 *   an accumulating tick, so backgrounding the iPad can't drift it. A pause
 *   control freezes it (paused spans accumulate, then subtract).
 * - Resume: position, start timestamp, and pause state persist in
 *   localStorage, so a locked screen mid-session comes back exactly where
 *   the class was — a resumed run skips the doorstep and re-enters the steps.
 * - Guarded exit: mid-steps, a back-swipe or reload asks before leaving;
 *   the saved place survives either answer.
 *
 * At the other end of the arc, a phase keyed `circle` wears its own chrome
 * too (app/run/CircleTime.tsx): one screen holding every question with its
 * teacher note, not a page walk, because a circle needs the questions in view
 * at once. Then the finish, where the teacher's own reflection is taken.
 *
 * - "Stuck?" whisper: phases can carry pre-authored when/then tips
 *   (schema `tips`); the runner reveals them one at a time on request.
 *   Whispers are scripted contingencies from the pack, never live AI.
 * - Mode feedback: a weather switch applies instantly wherever it is visible;
 *   when the CURRENT page is unaffected, a brief typographic toast names where
 *   the change lands, and the folio index annotates the affected phases while
 *   a non-default mode is active.
 *
 * The running head carries exactly three things, and each earned it (#243):
 * the product's name, which is also the way back to Today; outdoor mode,
 * which a teacher reaches for precisely when she cannot read the screen and so
 * cannot be three taps inside a menu; and one disclosure holding what she DOES
 * to a live lesson. What she should have decided beforehand is not here: the
 * ability band is resolved from the class before the run (lib/ability.ts).
 */

/**
 * The runner's two rooms: one doorstep, then the pages. It was two doorsteps
 * until #149; the first one only restated what /session already says.
 */
type RunStage = "introduce" | "steps";

/** One book page: at most a quiet top line and the hero underneath. */
interface PageScreen {
  /** The quiet element above the hero: for-you note, or conditions in its place. */
  top: Block[];
  /** The hero: the spoken/shown anchor — or a lone quiet block on its own page. */
  core: Block[];
  /** Everything on the page, for ability-signature comparison. */
  blocks: Block[];
  /** True when the page holds a single quiet block and no spoken hero. */
  quiet: boolean;
}

/**
 * Lay a phase's moments out as pages under the two-element law.
 * Grouping itself stays in lib/moments.ts; this is presentation only.
 */
function buildPages(moments: Moment[]): PageScreen[] {
  const pages: PageScreen[] = [];
  for (const moment of moments) {
    const notes = moment.blocks.filter((b) => b.type === "teacher-note");
    const conditions = moment.blocks.filter((b) => b.type === "conditions-line");
    const core = moment.blocks.filter(
      (b) => b.type !== "teacher-note" && b.type !== "conditions-line"
    );
    if (core.length === 0) {
      // A leading quiet block (set-up note before the class gathers): its own page.
      pages.push({ top: [], core: moment.blocks, blocks: moment.blocks, quiet: true });
      continue;
    }
    if (notes.length > 0) {
      pages.push({ top: notes, core, blocks: [...notes, ...core], quiet: false });
      if (conditions.length > 0) {
        // The note holds its position; the sky gets a page of its own.
        pages.push({ top: [], core: conditions, blocks: conditions, quiet: true });
      }
    } else {
      // No note: the conditions line takes the note's position above the hero.
      pages.push({ top: conditions, core, blocks: [...conditions, ...core], quiet: false });
    }
  }
  return pages;
}

function lastPageIndex(
  session: Session,
  condition: ConditionKind | null,
  phaseIndex: number
): number {
  const phase = resolvePhases(session, condition)[phaseIndex];
  if (!phase) return 0;
  return Math.max(0, buildPages(groupMoments(phaseBlocks(phase))).length - 1);
}

const OUTDOOR_KEY = "nature-class-outdoor";

/** Set once a class has been led on this device; gates the first-timer whisper. */
const LED_KEY = "nature-class-led";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  // Hours roll over so an overnight resume reads 19:43:04, never 1183:04.
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "Collect" / "Collect and Circle" / "Collect, Create & glue and Circle" */
function listTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/** Present when a signed-in teacher has an active class to log sessions for. */
export interface LogTarget {
  classId: string;
  className: string;
}

function SignedOutFinishActions({
  homeHref,
  onStartAgain,
}: {
  homeHref: "/" | "/today";
  onStartAgain: () => void;
}) {
  // Print left this screen by founder ruling: paper belongs with reading the
  // lesson, never at the end of leading it. One quiet exit, one reset.
  return (
    <div className="done-links">
      <Link href={homeHref}>Back to today</Link>
      <button type="button" onClick={onStartAgain}>
        Start again
      </button>
    </div>
  );
}

export function Runner({
  session,
  ownerScope,
  logTo = null,
  nextTitle = null,
  cast = null,
  profileTopic = null,
  assistantAvailable = false,
  classBand = null,
  homeHref = "/",
  locale,
  media = [],
  autoResume = false,
}: {
  session: Session;
  /**
   * Opaque server-derived teacher/class ownership for this run. Public demos
   * receive their own explicit scope; a signed-in teacher without an active
   * class receives null and cannot leave resumable state on the shared device.
   */
  ownerScope: string | null;
  logTo?: LogTarget | null;
  /**
   * Today's lesson cast, resolved server-side. Null or empty means the beat
   * does not exist: no screen, no placeholder, and the session is exactly the
   * session it was before the cast layer arrived.
   */
  cast?: { members: SpeakCastMember[]; lines: string[]; located: boolean } | null;
  /** Validated producer scope to preserve when a cast entity opens its profile. */
  profileTopic?: TopicTag | null;
  /** The next session up on the shelf, for the finish page's after-log line. */
  nextTitle?: string | null;
  assistantAvailable?: boolean;
  /**
   * The class's wording resolved server-side. Null means authored base text.
   * A resumed run retains its recorded band until that run ends.
   */
  classBand?: AbilityBand | null;
  homeHref?: "/" | "/today";
  locale?: string;
  media?: LessonMediaItem[];
  /**
   * Re-enter the saved run without asking (#874). Set by the way back from a
   * page the run itself opened, such as a species profile: the teacher chose
   * to leave for a moment and is now choosing to return, so the "pick up
   * where you left off" question has already been answered.
   */
  autoResume?: boolean;
}) {
  const hasAuthoredTeachingFlow = session.phases.some((phase) => phase.mode !== undefined);
  const hasCast = !hasAuthoredTeachingFlow && (cast?.members.length ?? 0) > 0;
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<RunStage>("introduce");
  // Who is in front of her (#1214); "class" for a school and when signed out.
  const groupNoun = useGroupNoun();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [momentIndex, setMomentIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [ability, setAbility] = useState<AbilityBand | undefined>(classBand ?? undefined);
  const [condition, setCondition] = useState<ConditionKind | null>(null);
  const [outdoor, setOutdoor] = useState(false);
  const [settleCheck, setSettleCheck] = useState(false);
  /**
   * The meet-the-cast beat, between the settling and the session proper.
   *
   * Johan: "very important: species info should be incorporated in the
   * slides". It is its own step rather than a panel bolted onto the grounding
   * slide, because merging text and photographs onto one screen rebuilds the
   * crowded card he had already rejected.
   *
   * It is NOT a phase. The authored phases, their minutes and the folio are
   * untouched — this sits between them like the settled beat does, so a pack
   * still runs the length its author wrote.
   */
  const [castBeat, setCastBeat] = useState(false);
  /**
   * Saved progress found on arrival, held for the teacher's say-so. A run is
   * never re-entered silently: an accidental tap on "Lead now" yesterday must
   * not swallow today's class into a stale clock (#220).
   */
  const [pendingResume, setPendingResume] = useState<RunProgress | null>(null);
  const [showReturnPhaseIndex, setShowReturnPhaseIndex] = useState(0);
  const [showWhisper, setShowWhisper] = useState(false);
  const [whisperIndex, setWhisperIndex] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const setupRef = useRef<HTMLDetailsElement>(null);
  const whisperDialogRef = useRef<HTMLDivElement>(null);
  const endDialogRef = useRef<HTMLDivElement>(null);
  const exitDialogRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);

  useModalFocus(showWhisper, whisperDialogRef, () => setShowWhisper(false));
  useModalFocus(showEnd, endDialogRef, () => setShowEnd(false));
  useModalFocus(showExit, exitDialogRef, () => setShowExit(false));

  // Resume (or arrive at the doorstep) once on the client. A saved run
  // means the class is mid-session: skip the doorstep, re-enter the steps.
  //
  // #253: the whole point of this effect is to flip `ready`, and until it
  // does the runner renders nothing (RunHold, or before that a bare
  // `<main>`). Nothing between mount and the flip may leave `ready` false —
  // so the flip itself sits in a `finally`, structurally reachable whatever
  // throws above it, rather than depending on every branch getting it right.
  // `applyResume` is additionally wrapped on its own: a saved run whose
  // location no longer fits this session (an old phase index, a pack that
  // shrank) must fail the SAME way a saved run that failed to parse already
  // does — held for an explicit choice, never silently discarded and never
  // capable of blocking the doorstep from ever appearing.
  useEffect(() => {
    // Fresh runs use the class resolution. Explicit resume restores the
    // saved run's wording; a former device preview never overrides a class.
    setAbility(classBand ?? undefined);
    try {
      let saved: RunProgress | null = null;
      if (ownerScope) {
        try {
          saved = parseRunProgress(
            window.localStorage.getItem(runProgressKey(ownerScope, session.id)),
            { ownerScope, sessionId: session.id }
          );
        } catch {
          // A blocked storage API must never block the lesson.
        }
      }
      if (saved && autoResume) {
        // The way back from a page this run opened (#874): the choice to
        // pick up is the tap that brought her here, so the saved beat is
        // restored straight away and the clock she left running is still
        // running.
        try {
          applyResume(saved);
        } catch {
          // The saved location no longer resolves against this session.
          // Hold it for an explicit choice instead — same as a genuinely
          // malformed save — rather than let a stale phase index strand the
          // doorstep unrendered.
          setPendingResume(saved);
        }
      } else if (saved) {
        // Hold the saved run for an explicit choice instead of re-entering it
        // silently. applyResume() below performs the actual restore.
        setPendingResume(saved);
      } else if (hasAuthoredTeachingFlow) {
        // A migrated lesson has already been planned on the previous screen.
        // Enter its first authored posture directly: no generic introduce room,
        // no second start verb, and no automatically injected show material.
        // The clock does NOT start here: an accidental open leaves no trace.
        // It starts on the first forward tap instead (see ensureClock).
        setStage("steps");
      }
      try {
        setOutdoor(window.localStorage.getItem(OUTDOOR_KEY) === "1");
        setFirstTime(window.localStorage.getItem(LED_KEY) !== "1");
      } catch {
        // Display preference only; default paper is fine.
      }
    } finally {
      setReady(true);
    }
    // applyResume is a stable function declaration of this component; listing
    // it would re-run the resume on every render. `session.id`, not `session`
    // itself: the session object is rebuilt on every render of a caller that
    // does not memoize its props, and this effect must run once per session,
    // not once per render (#253).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerScope, session.id, hasAuthoredTeachingFlow, hasCast, classBand, autoResume]);

  // Outdoor mode is a display preference, kept across sessions.
  function toggleOutdoor(next: boolean) {
    setOutdoor(next);
    try {
      window.localStorage.setItem(OUTDOOR_KEY, next ? "1" : "0");
    } catch {
      // Best effort.
    }
  }

  // Timestamp-derived clock: re-render each second, never accumulate.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const phases = useMemo(() => resolvePhases(session, condition), [session, condition]);
  const conditions = useMemo(() => availableConditions(session), [session]);
  const pagesByPhase = useMemo(
    () => phases.map((p) => buildPages(groupMoments(phaseBlocks(p)))),
    [phases]
  );

  const done = phaseIndex >= phases.length;
  const phase = done ? undefined : phases[phaseIndex];
  const pages = done ? [] : (pagesByPhase[phaseIndex] ?? []);
  const teachingMode = hasAuthoredTeachingFlow
    ? teachingModeAt(session, phaseIndex)
    : null;
  const workPhase = !done && phase !== undefined && teachingMode === "work";
  // Work is one durable screen however many legacy blocks the phase contains.
  // Canonicalizing its cursor prevents invisible Back taps and stale page
  // indexes from leaking through the compatibility renderer.
  const safePageIndex = workPhase
    ? 0
    : pages.length > 0
      ? Math.min(momentIndex, pages.length - 1)
      : 0;
  const page = pages[safePageIndex];

  // Persist the exact runner room so a locked iPad resumes the teaching
  // posture, not merely the nearest authored page. Nothing is saved until the
  // steps begin; malformed or cross-class state is rejected on the way back.
  useEffect(() => {
    if (!ready || startedAt === null || !ownerScope) return;
    const location: RunLocation = done
      ? { kind: "finish" }
      : castBeat
        ? {
            kind: "show",
            // v3 keeps this field for saved-progress compatibility. The cast
            // is now one all-at-once list, so there is no item cursor to save.
            itemIndex: 0,
            returnPhaseIndex: showReturnPhaseIndex,
          }
        : settleCheck
          ? { kind: "settle-checkpoint", phaseIndex }
          : { kind: "phase", phaseIndex, pageIndex: safePageIndex };
    const state: RunProgress = {
      version: 3,
      ownerScope,
      sessionId: session.id,
      location,
      startedAt,
      pausedAt,
      pausedMs,
      ability: ability ?? null,
      condition,
    };
    try {
      window.localStorage.setItem(
        runProgressKey(ownerScope, session.id),
        JSON.stringify(state)
      );
    } catch {
      // Local resume is best effort; the active lesson must keep working.
    }
  }, [
    ready,
    done,
    castBeat,
    showReturnPhaseIndex,
    settleCheck,
    phaseIndex,
    safePageIndex,
    startedAt,
    pausedAt,
    pausedMs,
    ability,
    condition,
    ownerScope,
    session.id,
  ]);

  // The clock's honest zero: the start timestamp pushed forward by every
  // paused span (including a live one), so elapsed = now - effectiveStart.
  const effectiveStartedAt =
    startedAt === null
      ? null
      : startedAt + pausedMs + (pausedAt !== null ? now - pausedAt : 0);

  // The whisper reads the RESOLVED phase, so a wet-plan variant may carry
  // its own tips; a variant without any falls back to the planned phase's.
  const tips = phase?.tips ?? (done ? [] : (session.phases[phaseIndex]?.tips ?? []));

  // The settling ritual: a genuine opening settle wears the prototype's own
  // chrome — "Settling in" with progress dots, a skip, and the "is the class
  // all settled?" beat before the session proper begins. The words stay pack
  // data; only the treatment is the runner's.
  //
  // Gated on the phase KEY, never its title. Every term pack's opening phase
  // is TITLED "Settle" but keyed `awareness-1` (or `talk-1`): those are the
  // session's first activity, eight minutes long, and wrapping the ritual
  // chrome around them told a teacher she was settling the class while the
  // page read "find something that is frozen". Only key `settle` is a settle.
  // Sessions with no settle phase get no chrome and no ritual: the run opens
  // straight on phase one, which is what the pack actually says.
  const settlePhase =
    !done && phaseIndex === 0 && (session.phases[0]?.key ?? "") === "settle";

  /** The beat exists only when there is genuinely a cast to meet. */
  const afterSettleTitle =
    session.phases[1]?.title ?? phases[1]?.title ?? "the session";
  /** The first thing the class actually does, named on the doorstep's button. */
  const firstPhaseTitle =
    session.phases[0]?.title ?? phases[0]?.title ?? "the session";

  const runStartedRef = useRef(false);

  /**
   * The stopwatch starts on the first deliberate forward tap, never on mount:
   * opening /run to look is free, teaching starts the clock.
   */
  function ensureClock() {
    if (startedAt === null) setStartedAt(Date.now());
    // The one moment on this screen worth counting, and the runner had already
    // chosen it before analytics existed: not opening /run, which a teacher
    // does to look, but the first deliberate forward tap that puts a class into
    // the lesson. Hanging the event on the clock rather than on the doorstep
    // also means it covers a migrated lesson, which has no doorstep at all.
    // recordRunStarted latches, so calling it on every forward tap is one event.
    recordRunStarted(false);
  }

  /**
   * Paired with `lesson_run_completed`, this answers the question the product
   * currently cannot answer at all: of the teachers who sign up, how many ever
   * actually take a class outside.
   */
  function recordRunStarted(resumed: boolean) {
    // `startedAt` is state, so two handlers in one tick would both still read
    // null and both fire. A ref settles synchronously, and a run is only ever
    // started once — a reset() clears it along with the clock.
    if (runStartedRef.current) return;
    runStartedRef.current = true;
    track(ANALYTICS_EVENTS.LESSON_RUN_STARTED, {
      lesson_id: session.id,
      band: ability,
      outdoor,
      resumed,
      signed_in: ownerScope !== null,
    });
  }

  /** Restore a saved run exactly, after the teacher chose to pick it up. */
  function applyResume(saved: RunProgress) {
    setPendingResume(null);
    setStage("steps");
    recordRunStarted(true);
    setStartedAt(saved.startedAt);
    setPausedAt(saved.pausedAt);
    setPausedMs(saved.pausedMs);
    setAbility(saved.ability ?? undefined);
    setCondition(saved.condition);

    switch (saved.location.kind) {
      case "phase":
        setPhaseIndex(saved.location.phaseIndex);
        setMomentIndex(
          hasAuthoredTeachingFlow &&
            teachingModeAt(session, saved.location.phaseIndex) === "work"
            ? 0
            : saved.location.pageIndex
        );
        break;
      case "settle-checkpoint":
        setPhaseIndex(saved.location.phaseIndex);
        setMomentIndex(lastPageIndex(session, saved.condition, saved.location.phaseIndex));
        setSettleCheck(true);
        break;
      case "show":
        if (!hasCast) {
          // A v3 packet can only resume Show when this exact render still
          // supplies one. Never strand a migrated/no-cast lesson in an
          // overlay that has no items or continuation.
          setPhaseIndex(0);
          setMomentIndex(0);
          setCastBeat(false);
          break;
        }
        setPhaseIndex(0);
        setMomentIndex(0);
        setShowReturnPhaseIndex(saved.location.returnPhaseIndex);
        setCastBeat(true);
        break;
      case "finish":
        setPhaseIndex(resolvePhases(session, saved.condition).length);
        setMomentIndex(0);
        break;
    }
  }

  function skipSettling() {
    ensureClock();
    setupRef.current?.removeAttribute("open");
    setSettleCheck(false);
    if (hasCast) {
      setShowReturnPhaseIndex(1);
      setCastBeat(true);
      return;
    }
    setPhaseIndex(1);
    setMomentIndex(0);
  }

  function togglePause() {
    if (startedAt === null) return;
    if (pausedAt !== null) {
      setPausedMs(pausedMs + (Date.now() - pausedAt));
      setPausedAt(null);
    } else {
      setPausedAt(Date.now());
    }
  }

  /**
   * End the session deliberately, from anywhere in it.
   *
   * A teacher who finishes early, or who opened the wrong session, had no
   * offered way out: the nav is hidden by design and the exit guard only fires
   * on a back-swipe, so leaving meant fighting the product rather than being
   * shown a door. Ending lands on the finish page, which is where the elapsed
   * time, the printable sheet and the log already live.
   *
   * The clock is deliberately NOT touched here. `effectiveStartedAt` already
   * subtracts every paused span (including a live one), so a session ended at
   * twelve minutes logs twelve minutes, never the wall-clock time since the
   * class started. Ending while paused reports the frozen time, which is the
   * honest number.
   */
  function endSession() {
    setShowEnd(false);
    setShowExit(false);
    setPhaseIndex(phases.length);
    setMomentIndex(0);
    setSettleCheck(false);
  }

  // The doorstep's far side: the steps begin and the stopwatch with them.
  function beginSteps() {
    setStage("steps");
    // A session whose first phase is not a settle has no settled beat to hang
    // the cast off, so it meets them on the way in instead. Either way the
    // cast comes early and before the teaching, which is what Johan asked for.
    if (hasCast && (session.phases[0]?.key ?? "") !== "settle") {
      setShowReturnPhaseIndex(0);
      setCastBeat(true);
    }
    ensureClock();
    try {
      window.localStorage.setItem(LED_KEY, "1");
    } catch {
      // The whisper just shows again next time.
    }
  }

  // A page turn puts the whisper away.
  useEffect(() => {
    setShowWhisper(false);
    setWhisperIndex(0);
  }, [phaseIndex, safePageIndex]);

  // Guard the live lesson from an accidental back-swipe or reload — a child
  // grabbing the iPad shouldn't drop the class's place. Catch back and ask;
  // the saved position survives either answer.
  useEffect(() => {
    if (!ready || stage !== "steps" || done) return;
    window.history.pushState({ runGuard: true }, "");
    const onPop = () => {
      window.history.pushState({ runGuard: true }, "");
      setShowExit(true);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [ready, stage, done]);

  /**
   * The closing gather wears its own chrome, as the opening settle does: the
   * whole circle on one screen — every question with its own teacher note —
   * instead of a march through one question per page. Presentation only; the
   * questions and notes stay pack data (app/run/CircleTime.tsx). Every
   * circle-question in every shipped pack sits in a phase keyed "circle", and
   * that phase is always the session's last.
   */
  const circlePhase = !done && phase?.key === "circle";

  function showToast(text: string) {
    setToast({ id: Date.now(), text });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }

  // There is no ability switch here on purpose. The band is decided before
  // the lesson (lib/ability.ts) and only read in this file — the class is
  // never left standing while a teacher works a menu to fix the wording.

  // Weather switch: instant everywhere. If this phase runs as planned either
  // way, say which phase the alternate plan actually swaps.
  function changeCondition(next: ConditionKind | null) {
    if (next === condition) return;
    const basePhase = session.phases[phaseIndex];
    const currentChanged =
      basePhase !== undefined && resolvePhase(basePhase, next) !== resolvePhase(basePhase, condition);
    setCondition(next);
    if (currentChanged) return;
    const affected = session.phases
      .filter((p) => resolvePhase(p, next) !== resolvePhase(p, condition))
      .map((p) => p.title);
    if (next === null) {
      showToast(
        affected.length > 0
          ? `Back to the planned ${listTitles(affected)}`
          : "Running as planned"
      );
    } else {
      showToast(
        affected.length > 0
          ? `${next.charAt(0).toUpperCase()}${next.slice(1)} plan swaps ${listTitles(affected)}`
          : `No ${next} plan in this session. Running as planned.`
      );
    }
  }

  function advance() {
    ensureClock();
    if (castBeat) {
      // Met the cast: on into the session proper.
      setCastBeat(false);
      setPhaseIndex(showReturnPhaseIndex);
      setMomentIndex(0);
      return;
    }
    if (settleCheck) {
      // The class is settled. Meet who is about, then the session proper.
      setSettleCheck(false);
      if (hasCast) {
        setShowReturnPhaseIndex(1);
        setCastBeat(true);
        return;
      }
      setPhaseIndex(1);
      setMomentIndex(0);
      return;
    }
    if (!phase) return;
    if (workPhase) {
      // A work posture can stay open as long as the class needs. Its one
      // explicit footer action crosses the next safe phase boundary.
      setPhaseIndex(phaseIndex + 1);
      setMomentIndex(0);
      return;
    }
    if (circlePhase) {
      // The circle is one screen, not a page walk: leaving it finishes.
      setPhaseIndex(phaseIndex + 1);
      setMomentIndex(0);
      return;
    }
    if (safePageIndex + 1 < pages.length) {
      setMomentIndex(safePageIndex + 1);
    } else if (settlePhase) {
      setSettleCheck(true);
    } else {
      setPhaseIndex(phaseIndex + 1);
      setMomentIndex(0);
    }
  }

  function goBack() {
    if (castBeat) {
      setCastBeat(false);
      if (
        showReturnPhaseIndex === 1 &&
        (session.phases[0]?.key ?? "") === "settle"
      ) {
        setPhaseIndex(0);
        setMomentIndex(lastPageIndex(session, condition, 0));
        setSettleCheck(true);
      } else {
        setPhaseIndex(showReturnPhaseIndex);
        setMomentIndex(0);
      }
      return;
    }
    if (settleCheck) {
      setSettleCheck(false);
      return;
    }
    if (safePageIndex > 0 && !circlePhase) {
      setMomentIndex(safePageIndex - 1);
      return;
    }
    if (phaseIndex > 0) {
      const previous = pagesByPhase[phaseIndex - 1];
      const previousMode = hasAuthoredTeachingFlow
        ? teachingModeAt(session, phaseIndex - 1)
        : null;
      setPhaseIndex(phaseIndex - 1);
      setMomentIndex(previousMode === "work" ? 0 : previous ? previous.length - 1 : 0);
    }
  }

  function clearSavedProgress() {
    if (ownerScope) {
      try {
        window.localStorage.removeItem(runProgressKey(ownerScope, session.id));
      } catch {
        // A blocked storage API must not block starting again.
      }
    }
  }

  function reset() {
    clearSavedProgress();
    setStage(hasAuthoredTeachingFlow ? "steps" : "introduce");
    setPhaseIndex(0);
    setMomentIndex(0);
    setSettleCheck(false);
    setCastBeat(false);
    setShowReturnPhaseIndex(0);
    // No clock on a fresh start either: it begins on the first forward tap
    // (ensureClock), so a reset-and-walk-away leaves no resumable trace.
    runStartedRef.current = false;
    setStartedAt(null);
    setPausedAt(null);
    setPausedMs(0);
    setupRef.current?.removeAttribute("open");
  }

  /**
   * THE SECOND BLANK, AND IT IS #253 (#355).
   *
   * This returned a bare `<main className="run" />` — the empty page reported
   * on 16 August on the cold demo URL, found one day before a live prototype.
   * It sits AFTER the server render, so on a cold instance a teacher waited
   * out the whole read and then got a white screen anyway.
   *
   * It shows the same hold the route's loading file shows, so the two blanks
   * on this journey become one continuous state and nothing flashes between
   * them.
   *
   * WHETHER `ready` FLIPS AT ALL was the open half of #253: the mount
   * effect's dependency array carried the whole `session` object (rebuilt on
   * every render of an unmemoized caller) and nothing guaranteed the flip
   * survived whatever the resume branch did with a saved run. Fixed at the
   * effect itself — `session.id` in the deps, `setReady(true)` in a `finally`
   * — so this can still shimmer while data loads, but never forever.
   */
  if (!ready) {
    return <RunHold />;
  }

  // ── The resume gate: a saved run waits for the teacher's say-so ──
  //
  // Whatever left this state behind — yesterday's real lesson, or one stray
  // tap on "Lead now" — the teacher standing here with a class decides. A
  // stale run (older than six hours) leads with the fresh start instead.
  if (pendingResume) {
    const saved = pendingResume;
    const savedPhases = resolvePhases(session, saved.condition);
    const savedPhaseTitle =
      saved.location.kind === "phase" || saved.location.kind === "settle-checkpoint"
        ? (savedPhases[saved.location.phaseIndex]?.title ?? null)
        : saved.location.kind === "finish"
          ? "the finish"
          : null;
    const stale = Date.now() - saved.startedAt > 6 * 60 * 60 * 1000;
    const pickUp = (
      <button
        type="button"
        className={stale ? "btn-fresh" : "btn-begin"}
        onClick={() => applyResume(saved)}
      >
        Pick up{savedPhaseTitle ? ` at ${savedPhaseTitle}` : " where you left off"}
        <span aria-hidden="true">&ensp;&rarr;</span>
      </button>
    );
    const startFresh = (
      <button
        type="button"
        className={stale ? "btn-begin" : "btn-fresh"}
        onClick={() => {
          setPendingResume(null);
          reset();
        }}
      >
        Start fresh
      </button>
    );
    return (
      <main className={`run run-doorstep${outdoor ? " outdoor" : ""}`}>
        <div className="prep-top">
          <Link href={`/session?session=${session.id}`} className="prep-back">
            <span aria-hidden="true">&larr;&ensp;</span>Get ready
          </Link>
        </div>
        <div className="prep-body">
          <p className="prep-eyebrow">Part-way through</p>
          <h1 className="prep-title">{session.title}</h1>
          <p className="prep-bridge">
            {stale
              ? "This lesson was left part-way through a while ago."
              : savedPhaseTitle
                ? `You were at ${savedPhaseTitle}.`
                : "You were part-way through."}
          </p>
        </div>
        <div className="prep-foot resume-foot">
          {stale ? startFresh : pickUp}
          {stale ? pickUp : startFresh}
        </div>
      </main>
    );
  }

  // ── The doorstep, now one room: the teacher names the session ──
  //
  // There used to be a "Get ready" room in front of this one, restating the
  // title and the objective and offering Read first and the kit. Every one of
  // those facts is already on /session, one tap earlier, which is the screen a
  // teacher actually decides on, so this room said nothing new and the run
  // asked to be started twice (#149). The room is gone; /session carries Read
  // first and the kit, and this screen keeps only what is new here: the bridge
  // from last week, the skill, and the title the teacher says out loud to the
  // class. The objective is not restated: it was read on /session, and a
  // teacher reading it aloud to 4-year-olds is not what it is for.
  if (stage === "introduce") {
    return (
      <main className={`run run-doorstep${outdoor ? " outdoor" : ""}`}>
        <div className="prep-top">
          <Link href={`/session?session=${session.id}`} className="prep-back">
            <span aria-hidden="true">&larr;&ensp;</span>Get ready
          </Link>
          <button type="button" className="prep-skip" onClick={beginSteps}>
            Skip
          </button>
        </div>
        <div className="prep-body">
          <p className="prep-eyebrow">Introduce today</p>
          <h1 className="prep-title">{session.title}</h1>
          {session.connectionToLast && (
            <p className="prep-bridge">Last time: {session.connectionToLast}</p>
          )}
          <p className="prep-skill">the skill we grow &middot; {session.namedSkill}</p>
          {firstTime && (
            <p className="prep-whisper">
              A whisper &middot; the next screens guide you line by line, at
              your pace. There&rsquo;s no wrong way to do this.
            </p>
          )}
        </div>
        <div className="prep-foot">
          <button type="button" className="btn-begin" onClick={beginSteps}>
            Begin: {firstPhaseTitle}
            <span aria-hidden="true">&ensp;&rarr;</span>
          </button>
        </div>
      </main>
    );
  }

  const nextLabel = settleCheck
    ? `Begin: ${afterSettleTitle}`
    : circlePhase
      ? "Done with circle time"
      : workPhase
        ? phaseIndex + 1 < phases.length
          ? teachingModeAt(session, phaseIndex + 1) === "gather"
            ? `Gather: ${session.phases[phaseIndex + 1]?.title ?? phases[phaseIndex + 1]?.title}`
            : `Continue: ${session.phases[phaseIndex + 1]?.title ?? phases[phaseIndex + 1]?.title}`
          : "Finish"
      : phase
        ? safePageIndex + 1 < pages.length
          ? "Next"
          : settlePhase
            ? "Done"
            : phaseIndex + 1 < phases.length
              ? `Next: ${session.phases[phaseIndex + 1]?.title ?? phases[phaseIndex + 1]?.title}`
              : "Finish"
        : "Next";

  const folioPhases: FolioPhase[] = phases.map((p, i) => {
    const base = session.phases[i];
    return {
      key: base?.key ?? p.key,
      title: base?.title ?? p.title,
      durationMin: p.durationMin,
      // The circle is one screen however many questions it holds, so the
      // folio counts it as one page and its page maths stays honest.
      pageCount:
        p.key === "circle" ||
        (hasAuthoredTeachingFlow && teachingModeAt(session, i) === "work")
          ? 1
          : (pagesByPhase[i]?.length ?? 0),
      weatherSwapped:
        condition !== null && base !== undefined && resolvePhase(base, condition) !== base,
      abilityReworded:
        ability !== undefined &&
        phaseAbilitySignature(p, ability) !== phaseAbilitySignature(p, undefined),
    };
  });

  const runnerStageTitle = done
    ? "Finish"
    : castBeat
      ? `What to look for, ${cast?.members.length ?? 0} species`
      : settleCheck
        ? "Ready to begin"
        : circlePhase
          ? "Circle time"
          : workPhase
            ? `Work · ${phase?.title ?? session.title}`
          : settlePhase
            ? `Settling in, ${safePageIndex + 1} of ${pages.length}`
            : phase?.title ?? session.title;
  const runnerAnnouncement =
    !done && !castBeat && !settleCheck && !circlePhase && !workPhase && phase
      ? `${runnerStageTitle}, page ${safePageIndex + 1} of ${pages.length}`
      : runnerStageTitle;
  /** A class is actually in front of her: the clock is running and it isn't over. */
  const liveLesson = !done && startedAt !== null;

  return (
    <main className={`run${outdoor ? " outdoor" : ""}`}>
      <div className="run-top">
        {/* The name is also the way out. A teacher mid-lesson who wants Today
            gets the leave card, which says her place is kept; before the clock
            starts, or once the lesson is finished, there is nothing to guard
            and the mark is an ordinary link. */}
        {liveLesson ? (
          <button
            type="button"
            className="run-brand-home"
            onClick={() => setShowExit(true)}
          >
            <Wordmark className="run-brand" />
            <span className="sr-only">Back to today</span>
          </button>
        ) : (
          <Link href={homeHref} className="run-brand-home">
            <Wordmark className="run-brand" />
            <span className="sr-only">Back to today</span>
          </Link>
        )}
        <span className="run-title">{runnerStageTitle}</span>
        <div className="run-top-right">
          {/* This control earns the head, not a menu: it is the one a
              teacher reaches for BECAUSE she cannot read the screen, and a
              teacher in glare does not go hunting three taps down to fix the
              glare. One tap, always in the same corner.
              #357: labelled "mode" until cohort feedback (Rebecca, Aug 18
              demo) read it as audio — reasonably, since nothing else on
              screen says what kind of mode it is. It is a display preference
              (bigger type and contrast for an iPad in sun; app/globals.css's
              own comment: "a legibility aid for an iPad in glare"), so it is
              named for that now — "light", the same word HybridJourney's own
              toggle already settled on (#378's sun/moon icon,
              "Switch to outdoor light"). Behaviour and the `run-outdoor-*`
              CSS class names are unchanged; this is copy only. */}
          <button
            type="button"
            className="run-outdoor-toggle"
            aria-pressed={outdoor}
            title={outdoor ? "Outdoor light. Tap for indoor." : "Indoor light. Tap for outdoor."}
            onClick={() => toggleOutdoor(!outdoor)}
          >
            {/* On a phone the head has no room for the second word, and
                "Outdoor" alone still says it, so the word is dropped from the
                label rather than hidden from it — what is read aloud matches
                what is on screen. The space is hard because the pill is a flex
                box, which trims an ordinary one at a flex item's edge and
                renders "Outdoorlight". */}
            Outdoor<span className="run-outdoor-word">&nbsp;light</span>
          </button>
          <span
            className={`run-timer${pausedAt !== null ? " paused" : ""}`}
            title={pausedAt !== null ? "Paused" : "Elapsed"}
          >
            {effectiveStartedAt !== null
              ? formatElapsed(now - effectiveStartedAt)
              : "0:00"}
          </span>
          <details className="run-setup" ref={setupRef}>
            <summary>Lesson controls</summary>
            {/* Everything in here is something a teacher DOES to the lesson
                while she is leading it: hold it, end it, skip the settle, ask
                for help, take the wet plan, start over. Nothing in here is a
                setting she should have decided beforehand — the class band
                went back to the Ready page, and the display went to the head
                as its own pill. */}
            <div className="setup-panel">
              {liveLesson && (
                <div
                  className="setup-lifecycle"
                  role="group"
                  aria-label="Hold or end the lesson"
                >
                  <button
                    type="button"
                    className="run-pause"
                    aria-pressed={pausedAt !== null}
                    onClick={togglePause}
                  >
                    {pausedAt !== null ? "Resume lesson" : "Pause lesson"}
                  </button>
                  <button
                    type="button"
                    className="run-end"
                    onClick={() => setShowEnd(true)}
                  >
                    End session
                  </button>
                </div>
              )}
              {settlePhase && !castBeat && !settleCheck && (
                <button
                  type="button"
                  className="setup-skip-settle"
                  onClick={skipSettling}
                >
                  Skip settling in
                </button>
              )}
              <FieldReferenceTray items={media} />
              <TeachingAssistant
                ability={ability}
                enabled={assistantAvailable && !done}
                locale={locale}
                phaseKey={phase?.key}
                sessionId={session.id}
              />
              {conditions.length > 0 && (
                <div className="toggle-group" role="group" aria-label="Conditions">
                  <span className="toggle-label">Weather</span>
                  <div className="toggle-row">
                    <button
                      type="button"
                      className={condition === null ? "active" : ""}
                      aria-pressed={condition === null}
                      onClick={() => changeCondition(null)}
                    >
                      As planned
                    </button>
                    {conditions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={condition === c ? "active" : ""}
                        aria-pressed={condition === c}
                        onClick={() => changeCondition(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" className="btn-fresh" onClick={reset}>
                Start fresh
              </button>
            </div>
          </details>
        </div>
      </div>

      <div
        className="run-body"
        role="region"
        aria-labelledby="run-state-heading"
      >
        <h2 id="run-state-heading" className="sr-only" aria-live="polite">
          {runnerAnnouncement}
        </h2>
      {done || !phase || !page ? (
        <div className="run-done">
          {/* The quiet mantel: the moment first, at full weight — the mark, the
              eyebrow, the headline, the keepsake framed between hairlines, the
              tease demoted. Then the paper. Then the housekeeping, beneath. */}
          <div className="done-moment">
            {session.celebration ? (
              <div className="celebration">
                {session.celebration.emoji && (
                  <span className="celebration-emoji" aria-hidden="true">
                    {session.celebration.emoji}
                  </span>
                )}
                {/* THE APP DOES NOT KNOW WHAT THE CLASS FOUND.
                    The authored celebration asserts one: "your class found
                    life everywhere", "more life than anyone expected". That is
                    a claim about thirty children outdoors, made by software
                    that was in a pocket the whole time — the same
                    fake-what-today-held pattern lib/cast/closing.ts ships
                    silence rather than commit.

                    The copy is Johan's own and lives in a verbatim-guarded
                    pack (scripts/verbatim-fidelity.mjs covers summer's
                    celebration strings), so it is not ours to rewrite. The
                    assertion is suppressed at the renderer instead: the close
                    names the session finished, which is the one thing we do
                    know, and the forward-looking tease survives because next
                    week is a fact about the shelf. Restoring the headline is
                    a one-line change here the day the app can honestly know. */}
                <p className="celebration-eyebrow">that was today</p>
                <h2 className="celebration-headline">{session.title} is done.</h2>
                {session.celebration.nextWeekTease && (
                  <p className="celebration-tease">{session.celebration.nextWeekTease}</p>
                )}
              </div>
            ) : (
              <h2>That&rsquo;s the session</h2>
            )}
          </div>

          <div className="done-keeping">
            <p className="done-elapsed">
              {effectiveStartedAt !== null
                ? `${formatElapsed(now - effectiveStartedAt)} elapsed, ${session.durationMin} min planned.`
                : `${session.durationMin} min planned.`}
            </p>
            {logTo ? (
              <LogSession
                sessionId={session.id}
                classId={logTo.classId}
                className={logTo.className}
                homeHref={homeHref}
                runStartedAt={startedAt}
                startedAt={effectiveStartedAt}
                nextTitle={nextTitle}
                onStartAgain={reset}
                onCompleted={clearSavedProgress}
              />
            ) : (
              <SignedOutFinishActions
                homeHref={homeHref}
                onStartAgain={reset}
              />
            )}
          </div>
        </div>
      ) : castBeat ? (
        /* ── Optional show material: who the class might meet ─────────────
           The same speak-and-show surface /cast renders, relocated into the
           flow. The whole topic-filtered cast stays visible as small linked
           field-guide entities, each with the line in the child's language.
           Continue moves into the lesson like any other step. */
        <div className="run-page run-cast-beat">
          {/* Never claims a school we do not know. Signed out, or a class with
              no coordinates, this is the sample patch — the same rule the
              species profile and the daily card captions follow. */}
          <p className="run-cast-eyebrow">
            Who we might meet today
          </p>
          <SpeakAndShow
            members={cast?.members ?? []}
            lines={cast?.lines ?? []}
            sessionTitle={session.title}
            profileTopic={profileTopic}
            sessionId={session.id}
            mode="run"
            onBack={goBack}
            onContinue={advance}
          />
        </div>
      ) : settleCheck ? (
        /* ── The settled beat: a breath between settling and the session ── */
        <>
          <div className="run-stage settle-check">
            <h2 className="settle-check-line">Is the {groupNoun} all settled?</h2>
            <p className="settle-check-sub">
              When you&rsquo;re ready, begin.
            </p>
          </div>
          <div className="run-controls">
            <button type="button" className="btn-back" onClick={goBack}>
              <span aria-hidden="true">&larr;&ensp;</span>Back
            </button>
            <button type="button" className="btn-next" onClick={advance}>
              {nextLabel}
              <span aria-hidden="true">&ensp;&rarr;</span>
            </button>
          </div>
        </>
      ) : circlePhase ? (
        /* ── Circle time: the closing gather, all of it on one screen ── */
        <>
          <CircleTime
            blocks={phaseBlocks(phase)}
            ability={ability}
          />
          {tips.length > 0 && (
            <div className="run-aside">
              <button
                type="button"
                className="aside-link aside-stuck"
                onClick={() => setShowWhisper(true)}
              >
                Stuck?
              </button>
            </div>
          )}
          <div className="run-controls">
            <button type="button" className="btn-back" onClick={goBack}>
              <span aria-hidden="true">&larr;&ensp;</span>Back
            </button>
            <button type="button" className="btn-next" onClick={advance}>
              {nextLabel}
              <span aria-hidden="true">&ensp;&rarr;</span>
            </button>
          </div>
        </>
      ) : workPhase ? (
        <>
          <WorkPhase phase={phase} ability={ability} />
          <div className="run-controls run-work-controls">
            <button
              type="button"
              className="btn-back"
              onClick={goBack}
              disabled={phaseIndex === 0}
            >
              <span aria-hidden="true">&larr;&ensp;</span>Back
            </button>
            <button type="button" className="btn-next" onClick={advance}>
              {nextLabel}
              <span aria-hidden="true">&ensp;&rarr;</span>
            </button>
          </div>
        </>
      ) : (
        <>
          {settlePhase && (
            <div className="settle-head">
              <div className="settle-head-row">
                <span className="settle-eyebrow">Settling in</span>
                <span className="settle-dots" aria-hidden="true">
                  {pages.map((_, i) => (
                    <span
                      key={i}
                      className={i === safePageIndex ? "dot on" : "dot"}
                    />
                  ))}
                </span>
                <span className="settle-count">
                  {safePageIndex + 1} of {pages.length}
                </span>
              </div>
              {/* The one sentence that tells a teacher what this screen is
                  FOR. Fixed chrome, every session, not pack data. */}
              <p className="settle-instruction">
                Bring the {groupNoun} into a loose circle, then read each line
                aloud, slowly.
              </p>
            </div>
          )}
          <div className="run-stage">
            <div
              key={`${phaseIndex}:${safePageIndex}`}
              className={`moment${page.quiet ? " moment-quiet" : ""}${
                page.top.length > 0 ? " moment-grouped" : ""
              }`}
            >
              {page.top.map((b, i) => (
                <Fragment key={`t${i}`}>{renderBlock(b, ability)}</Fragment>
              ))}
              {page.core.map((b, i) => (
                <Fragment key={`c${i}`}>{renderBlock(b, ability)}</Fragment>
              ))}
            </div>
          </div>
          {tips.length > 0 && (
            <div className="run-aside">
              <button
                type="button"
                className="aside-link aside-stuck"
                onClick={() => setShowWhisper(true)}
              >
                Stuck?
              </button>
            </div>
          )}
          <div className="run-controls">
            <button
              type="button"
              className="btn-back"
              onClick={goBack}
              disabled={phaseIndex === 0 && safePageIndex === 0}
            >
              <span aria-hidden="true">&larr;&ensp;</span>Back
            </button>
            <button type="button" className="btn-next" onClick={advance}>
              {nextLabel}
              <span aria-hidden="true">&ensp;&rarr;</span>
            </button>
          </div>
          {/* A class that is already calm should be able to leave the ritual
              in one obvious tap, the way the prototype's footer offered it. */}
          {settlePhase && (
            <div className="settle-foot">
              <button
                type="button"
                className="btn-skip-settle"
                onClick={skipSettling}
              >
                Skip settling in
              </button>
            </div>
          )}
        </>
      )}
      </div>

      <Folio
        phases={folioPhases}
        currentPhase={Math.min(phaseIndex, phases.length - 1)}
        currentPage={
          done
            ? Math.max(0, (folioPhases[phases.length - 1]?.pageCount ?? 1) - 1)
            : circlePhase || workPhase
              ? 0
              : safePageIndex
        }
        onJump={(i, p) => {
          setCastBeat(false);
          setSettleCheck(false);
          setShowWhisper(false);
          setPhaseIndex(i);
          setMomentIndex(p ?? 0);
        }}
      />

      {showWhisper &&
        tips.length > 0 &&
        (() => {
          const tip = tips[whisperIndex % tips.length];
          if (!tip) return null;
          const more = tips.length > 1;
          return (
            <div className="whisper-scrim" onClick={() => setShowWhisper(false)}>
              <div
                className="whisper-card"
                ref={whisperDialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="A whisper"
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="whisper-eyebrow">A whisper</p>
                <p className="whisper-when">{tip.when}</p>
                <p className="whisper-then">{tip.then}</p>
                <div className="whisper-row">
                  <button
                    type="button"
                    className="whisper-close"
                    onClick={() => setShowWhisper(false)}
                  >
                    Close
                  </button>
                  {more && (
                    <button
                      type="button"
                      className="whisper-more"
                      onClick={() => setWhisperIndex(whisperIndex + 1)}
                    >
                      Another tip<span aria-hidden="true">&ensp;&rarr;</span>
                    </button>
                  )}
                </div>
                {more && (
                  <p className="whisper-count">
                    {(whisperIndex % tips.length) + 1} of {tips.length}
                  </p>
                )}
              </div>
            </div>
          );
        })()}

      {/* Ending is a decision, so it asks once. Both real intentions are on
          the card: finish properly and record it, or step away and keep the
          place. Neither is scolded. */}
      {showEnd && (
        <div className="exit-scrim">
          <div
            className="exit-card"
            ref={endDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="End the session"
            tabIndex={-1}
          >
            <h3>End the session?</h3>
            <p>
              {effectiveStartedAt !== null
                ? `${formatElapsed(now - effectiveStartedAt)} so far. You'll go to the finish${logTo ? ", where you can log it" : ""}.`
                : `You'll go to the finish${logTo ? ", where you can log it" : ""}.`}
            </p>
            <div className="exit-row">
              <button
                type="button"
                className="exit-keep"
                onClick={() => setShowEnd(false)}
              >
                Keep going
              </button>
              <button type="button" className="exit-leave" onClick={endSession}>
                End session
              </button>
            </div>
            <Link href={homeHref} className="exit-away">
              Leave for now and keep my place
            </Link>
          </div>
        </div>
      )}

      {showExit && (
        <div className="exit-scrim">
          <div
            className="exit-card"
            ref={exitDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Leave the session"
            tabIndex={-1}
          >
            <h3>Leave the session?</h3>
            <p>Your place is saved. Pick it up again from Today.</p>
            <div className="exit-row">
              <button
                type="button"
                className="exit-keep"
                onClick={() => setShowExit(false)}
              >
                Keep going
              </button>
              <Link href={homeHref} className="exit-leave">
                Leave
              </Link>
            </div>
            {/* A teacher who swiped back is often actually finished. Offer the
                proper ending here too, rather than making them go back in to
                find it. */}
            <button type="button" className="exit-away" onClick={endSession}>
              I&rsquo;m finished, end the session
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className="mode-toast" role="status">
          {toast.text}
        </div>
      )}
    </main>
  );
}
