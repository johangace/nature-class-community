/**
 * THE JOURNEY'S WALK, BOTH DIRECTIONS (#752).
 *
 * The first real teacher to run this app (2026-08-31, part 3):
 * *"She found the navigation back and forth between prompts clunky.. eg Circle
 * time and other parts dont have a go back to previous prompt button."*
 *
 * She is describing a regression, not a gap. `Runner.tsx` — the legacy paged
 * runner — has carried a `goBack()` and a `← Back` on every teaching page since
 * it shipped. `HybridJourney`, which replaced it as the default `/run` surface
 * (nc#302), was built forward-only: `setStep` was called from fourteen places,
 * every one of them moving on. A teacher who read a line, mis-tapped, or wanted
 * the previous question again had exactly two ways out of it — the part strip,
 * which drops her at moment 0 of a part and loses her place inside it, and
 * restarting the lesson.
 *
 * WHY THIS IS A MODULE AND NOT A `goBack()` BESIDE `advance()`.
 *
 * A back that is not the exact inverse of the forward walk is worse than no
 * back: it strands a teacher on a screen the forward walk cannot reach, or
 * skips the screen she was actually asking for. The forward walk was already
 * spread across the file — a CTA here, a guard clause there, a fall-through in
 * the phase branch — so a hand-written mirror would have had to agree with four
 * separate call sites and stay agreeing with them.
 *
 * `phase-moments.ts` records what that costs and what to do instead: a rule
 * spread across a file is a rule a test can only grep for; named once, it is a
 * rule a test can CALL. So both directions live here, over one description of
 * the lesson's shape, and `journey-steps.spec.ts` walks every shipped session
 * end to end asserting `previousStep(nextStep(s)) === s` at every step. The
 * mirror cannot drift, because the drift is the assertion.
 *
 * WHAT HAS NO BACK, DELIBERATELY.
 *
 * - `topic` is the first screen. The doorstep that used to stand before it
 *   ("Run Session Outside", the 1-4 list) is gone (Johan, 2026-09-06: "who
 *   told you to add this session?"); the lesson screen opens the introduction
 *   directly, and there is nothing before it.
 * - `celebrate` is past the record. The reflection has been saved and the
 *   resumable run cleared (`HybridJourney`'s persistence effect); reversing
 *   into a closed lesson would re-open a run that no longer exists. #344's
 *   ruling — the reflection is optional, the record is not — is a rule about
 *   getting PAST the record, and a back into it would be a way around it.
 *
 * Everything between those two ends is reversible, including `reflect`: a
 * teacher who tapped "Done with circle time" one question early gets her
 * circle back. Nothing is written on the way out of `reflect`, so nothing is
 * undone by stepping back into the lesson.
 */

/**
 * THE INTRODUCTION COMES BEFORE THE GROUNDING (Johan, 2026-09-06).
 *
 * The walk used to run intro → settle → introduce → ask → parts: the class was
 * grounded first and told what today was afterwards, on the argument (#163)
 * that calm → questions → topic is a slope. Johan's ruling of 6 September
 * reverses the two for the way lessons actually begin: *"teachers start the
 * session inside in the interactive board"* — the two threshold screens are an
 * Introduction shown on the classroom board, with the photographs of what the
 * class might find and the question leading, and *"grounding starts here"*
 * once the class is outside in its circle. So the order is now
 * topic → look → day → ask[0..n) → outside → settle → parts, and every mirror
 * below follows it.
 *
 * THE DAY IS TWO SCREENS, AND ONE OF THEM IS SOMETIMES ABSENT (Johan,
 * 2026-09-08: "i think we are combining two screens in one"). What the class
 * hears about the topic in this time of year, with the pictures of what is out
 * there, is `look`; the grounded conditions with the note that changes the
 * lesson today is `day`. Johan: "condition only shows when something changes
 * the lesson" — so `day` exists in the walk only while a hinge fired
 * (`JourneyShape.day`), and on a plain day the walk goes look → ask.
 *
 * `?at=settle` (the preview's own end card, #515) still opens on the first
 * settle card; a teacher who ran the preview walked its own version of the
 * introduction and lands past it here, as before.
 *
 * AN AUTHORED INTRODUCTION IS SAID INSIDE TOO (Johan, 2026-09-13, #1187).
 * Eight starter sessions author an `introduce` part as their first body
 * part: "What season is it right now?", "Write the answers on the board",
 * "Look out of the window together", "before you set off". With the parts
 * after the grounding, that part ran outside, after the settle, as a second
 * introduction — Johan: "after that is another intro? it usually asks
 * questions that could be asked inside." So when `JourneyShape.introduceFirst`
 * says the first part is an authored introduction, the walk hoists it into
 * the indoor beats: ask[n-1] → phase 0 (its moments) → outside → settle →
 * phase 1. The part keeps its index, so a saved run and the part strip need
 * no second vocabulary; only where it stands in the walk changes.
 */

/**
 * Where a teacher can stand in the hybrid journey.
 *
 * Lives here rather than in `HybridJourney.tsx` so the walk can be tested
 * without a DOM. `lib/run/journey-progress.ts` holds the narrower PERSISTED
 * subset (no `intro`, no `celebrate`) and stays the boundary schema; this is
 * the in-memory position.
 */
export type Step =
  /**
   * THE INTRODUCTION, IN FIVE BEATS (Johan, 2026-09-06, #1004; split again
   * 2026-09-08): the topic — what today is about; the look — how the topic
   * sits in this time of year, and the pictures of what the class might
   * find; the day — the conditions and the note that changes the lesson,
   * only on a day that has one; the question(s) the class answers out loud;
   * and the screen that sends them outside. Shown inside, on the classroom
   * board, before the grounding. The old two-screen threshold ("Before you
   * speak", "Introduce today", #754) is folded into these: what she read to
   * herself is the day, and the line the class hears is the question.
   */
  | { kind: "topic" }
  | { kind: "look" }
  /** Absent from the walk unless `JourneyShape.day` says a note fired today. */
  | { kind: "day" }
  /**
   * One authored question per screen, 0 .. askCount - 1. Every shipped session
   * authors one today; the index is held so a second can be authored without
   * the walk changing shape again (`JourneyShape.askCount`).
   */
  | { kind: "ask"; index: number }
  /** The last screen inside: "now we go outside". Fixed chrome, never absent. */
  | { kind: "outside" }
  | { kind: "settle"; card: number }
  | { kind: "phase"; phase: number; moment: number }
  | { kind: "circle" }
  | { kind: "reflect" }
  | { kind: "celebrate" };

/**
 * The lesson's shape, as far as the walk is concerned: how many settle cards,
 * how many moments each body part renders, whether this session closes with a
 * circle, and whether a reflection screen stands before the celebration (it
 * does exactly when the runner has a class to log against).
 *
 * Counts rather than the phases themselves, so the walk cannot reach for pack
 * content and quietly grow a second job.
 */
export interface JourneyShape {
  /** Cards in the settle ritual — authored, or the default five. */
  settleCards: number;
  /** Moments rendered per body part, in reading order. */
  phaseMoments: number[];
  /**
   * How many questions the introduction asks the class, one per screen. Zero
   * is a real state the walk must hold (day → outside), even though all 56
   * shipped sessions author exactly one today.
   */
  askCount: number;
  /**
   * Whether today has a day screen at all (2026-09-08): true only when the
   * run resolved a weather hinge, the one thing that changes the lesson.
   */
  day: boolean;
  /**
   * Whether the first body part is an authored introduction, said inside
   * before the outside screen (#1187). Its moments still count in
   * `phaseMoments[0]`; this flag only moves them ahead of the door.
   */
  introduceFirst: boolean;
  /** Does this session close with a circle-time part? */
  circle: boolean;
  /** Is there a reflection screen before the celebration? (`logTo` is set.) */
  reflect: boolean;
}

/**
 * The one authored part key the walk reads (#1187): a first part keyed
 * `introduce` is the class's introduction and belongs inside. Named here, once,
 * so the runner and the tests agree on what hoists.
 */
export function isIndoorIntroduction(phase: { key: string } | undefined): boolean {
  return phase?.key === "introduce";
}

/**
 * Is part 0 hoisted into the indoor beats? Only while it has a moment to say:
 * an introduction whose every line the board already asked renders no
 * moments (`phaseMoments`), and a screen with chrome and nothing to say is
 * not a screen. Exported because the runner's board rendering, beat pager,
 * strip chip and clock guard must read the SAME answer as the walk (Codex
 * review on #1193: a private copy of this rule drifted from it).
 */
export function isHoisted(shape: JourneyShape): boolean {
  return shape.introduceFirst && (shape.phaseMoments[0] ?? 0) > 0;
}
const hoisted = isHoisted;

/** The first part said outside: part 1 when part 0 is the introduction. */
function firstOutdoorPart(shape: JourneyShape): number {
  return hoisted(shape) ? 1 : 0;
}

/**
 * A PART WITH NO MOMENTS IS NOT A SCREEN. `phaseMoments` can empty a part
 * entirely (every line already asked at the door); the walk steps over such
 * a part in both directions rather than landing a teacher on chrome with
 * nothing to say. Outdoor parts only: the hoisted introduction is, by
 * `isHoisted`, never empty.
 */
function nextOutdoorPart(shape: JourneyShape, after: number): number | null {
  for (let phase = Math.max(after + 1, firstOutdoorPart(shape)); phase < shape.phaseMoments.length; phase += 1) {
    if ((shape.phaseMoments[phase] ?? 0) > 0) return phase;
  }
  return null;
}
function previousOutdoorPart(shape: JourneyShape, before: number): number | null {
  for (let phase = Math.min(before, shape.phaseMoments.length) - 1; phase >= firstOutdoorPart(shape); phase -= 1) {
    if ((shape.phaseMoments[phase] ?? 0) > 0) return phase;
  }
  return null;
}

/** The last outdoor part's last moment, or null when nothing is taught outside. */
function lastTeachingStep(shape: JourneyShape): Step | null {
  const phase = previousOutdoorPart(shape, shape.phaseMoments.length);
  if (phase === null) return null;
  return { kind: "phase", phase, moment: (shape.phaseMoments[phase] ?? 1) - 1 };
}

/** Where the teaching body ends: the circle if there is one, else reflect/celebrate. */
function afterTeaching(shape: JourneyShape): Step {
  if (shape.circle) return { kind: "circle" };
  return shape.reflect ? { kind: "reflect" } : { kind: "celebrate" };
}

/** The first outdoor teaching screen, or the close when nothing is taught outside. */
function firstTeachingStep(shape: JourneyShape): Step {
  const phase = nextOutdoorPart(shape, -1);
  if (phase === null) return afterTeaching(shape);
  return { kind: "phase", phase, moment: 0 };
}

/**
 * WHERE A SAVED POSITION INSIDE THE PARTS LANDS TODAY (#1194).
 *
 * A part can empty between the run that was saved and the run that picks it
 * up: `phaseMoments` drops a line the board already asked, and a part whose
 * every line went to the door has nothing left to say. The walk above steps
 * over such a part in both directions, so the forward and back CTAs can never
 * reach it — but resume does not walk, it lands, and clamping the saved
 * moment to 0 landed a teacher on the one page the walk refuses to show.
 *
 * Same rule, one door later: an empty part resolves FORWARD to the next part
 * that has something to say, and to the close when there is none. Resolving
 * forward rather than back is what the saved position means — she was working
 * through the lesson, not returning to it.
 *
 * BUT NEVER FORWARD PAST THE RECORD. `afterTeaching` ends at `celebrate` when
 * a lesson authors neither a circle nor a reflection, and `celebrate` is one
 * of the walk's two dead ends: `previousStep` returns null there, the surface
 * draws no back control, and `HybridJourney`'s persistence effect CLEARS the
 * saved run on arrival. Landing a resume there would answer "your part is
 * empty" with "your lesson is over", delete the saved position, and leave no
 * way back into the lesson — strictly worse than the empty page this fixes,
 * which at least had a working Next and Back. So the last thing actually
 * taught is the floor, exactly as `previousStep` out of the circle already
 * treats it. `reflect` needs no such guard: it is reversible and nothing is
 * written on the way out of it.
 *
 * `phase` is assumed to exist in `shape.phaseMoments`, and `moment` to be a
 * non-negative integer — `lib/run/journey-progress.ts` is the boundary that
 * makes both true (`z.number().int().nonnegative()` on the persisted step),
 * and a saved index outside today's pack is a different failure the surface
 * answers before calling here.
 */
export function resumePhaseStep(shape: JourneyShape, phase: number, moment: number): Step {
  const moments = shape.phaseMoments[phase] ?? 0;
  if (moments > 0) {
    return { kind: "phase", phase, moment: Math.min(Math.max(moment, 0), moments - 1) };
  }
  // The hoisted introduction is never empty (`isHoisted` requires a moment),
  // so an empty part here is always an outdoor one.
  const next = nextOutdoorPart(shape, phase);
  if (next !== null) return { kind: "phase", phase: next, moment: 0 };
  const close = afterTeaching(shape);
  if (close.kind !== "celebrate") return close;
  return lastTeachingStep(shape) ?? beforeTeaching(shape);
}

/**
 * The last question, or the day when the lesson asks none. Named once because
 * the outside screen's way back and the question walk have to agree on it.
 */
function lastQuestion(shape: JourneyShape): Step {
  return shape.askCount > 0 ? { kind: "ask", index: shape.askCount - 1 } : beforeQuestions(shape);
}

/** The screen before the first question: the day when it fired, else the look. */
function beforeQuestions(shape: JourneyShape): Step {
  return shape.day ? { kind: "day" } : { kind: "look" };
}

/** The screen after the introduction's reading: the first question, or on. */
function afterReading(shape: JourneyShape): Step {
  return shape.askCount > 0 ? { kind: "ask", index: 0 } : afterQuestions(shape);
}

/** After the last question: the authored introduction when there is one, else out. */
function afterQuestions(shape: JourneyShape): Step {
  return hoisted(shape) ? { kind: "phase", phase: 0, moment: 0 } : { kind: "outside" };
}

/** The last thing said inside: the introduction's last moment, or the last question. */
function lastIndoorStep(shape: JourneyShape): Step {
  if (!hoisted(shape)) return lastQuestion(shape);
  return { kind: "phase", phase: 0, moment: Math.max((shape.phaseMoments[0] ?? 0) - 1, 0) };
}

/**
 * Where the introduction leads: the grounding when the lesson has one, else the
 * first part. The introduction is said inside; the class goes out to ground.
 */
function afterIntroduction(shape: JourneyShape): Step {
  return shape.settleCards > 0 ? { kind: "settle", card: 0 } : firstTeachingStep(shape);
}

/**
 * The screen before the first part: the grounding's last card, or the outside
 * screen when the lesson authored no grounding at all.
 */
function beforeTeaching(shape: JourneyShape): Step {
  return shape.settleCards > 0
    ? { kind: "settle", card: shape.settleCards - 1 }
    : { kind: "outside" };
}

/**
 * One step on. Null at the end of the lesson.
 *
 * This is the walk the CTAs take — "Start inside", "The day", "Ask the class",
 * "Leave the screen", "Ground the class", "Next", "Begin: <part>", "Finish ·
 * circle time", "Done with circle time". It is NOT the skips: "Skip grounding" jumps the whole ritual,
 * and jumping is a different intention from moving on.
 */
export function nextStep(step: Step, shape: JourneyShape): Step | null {
  switch (step.kind) {
    case "topic":
      return { kind: "look" };
    case "look":
      return shape.day ? { kind: "day" } : afterReading(shape);
    case "day":
      return afterReading(shape);
    case "ask":
      return step.index + 1 < shape.askCount
        ? { kind: "ask", index: step.index + 1 }
        : afterQuestions(shape);
    case "outside":
      return afterIntroduction(shape);
    case "settle":
      return step.card + 1 < shape.settleCards
        ? { kind: "settle", card: step.card + 1 }
        : firstTeachingStep(shape);
    case "phase": {
      const moments = shape.phaseMoments[step.phase] ?? 0;
      if (step.moment + 1 < moments) {
        return { kind: "phase", phase: step.phase, moment: step.moment + 1 };
      }
      // The hoisted introduction ends at the door, not at part 1 (#1187).
      if (hoisted(shape) && step.phase === 0) return { kind: "outside" };
      const next = nextOutdoorPart(shape, step.phase);
      if (next !== null) return { kind: "phase", phase: next, moment: 0 };
      return afterTeaching(shape);
    }
    case "circle":
      return shape.reflect ? { kind: "reflect" } : { kind: "celebrate" };
    case "reflect":
      return { kind: "celebrate" };
    case "celebrate":
      return null;
  }
}

/**
 * One step back — the exact inverse of `nextStep` wherever `nextStep` moved.
 *
 * Null means there is nowhere to go back to, and the surface renders no back
 * control at all rather than a dead one: `topic` and `celebrate` are the two
 * ends of the lesson, and a session with no settle and no body has no interior
 * to reverse into.
 *
 * Landing on a PART lands on its LAST moment, not its first. That is the half
 * the part strip already gets wrong: tapping the previous part's chip restarts
 * it, which is a jump; stepping back should undo the tap that left it. The
 * legacy `Runner.goBack()` has always done this, and this is that behaviour
 * brought across.
 */
export function previousStep(step: Step, shape: JourneyShape): Step | null {
  switch (step.kind) {
    case "topic":
      return null;
    case "look":
      return { kind: "topic" };
    case "day":
      return { kind: "look" };
    case "ask":
      return step.index > 0 ? { kind: "ask", index: step.index - 1 } : beforeQuestions(shape);
    case "outside":
      return lastIndoorStep(shape);
    case "settle":
      return step.card > 0
        ? { kind: "settle", card: step.card - 1 }
        : { kind: "outside" };
    case "phase": {
      if (step.moment > 0) {
        return { kind: "phase", phase: step.phase, moment: step.moment - 1 };
      }
      // Reversing out of the hoisted introduction lands on the last question,
      // and reversing out of the first outdoor part lands on the grounding,
      // never on the introduction said inside (#1187).
      if (hoisted(shape) && step.phase === 0) return lastQuestion(shape);
      const previous = previousOutdoorPart(shape, step.phase);
      if (previous !== null) {
        return { kind: "phase", phase: previous, moment: (shape.phaseMoments[previous] ?? 1) - 1 };
      }
      return beforeTeaching(shape);
    }
    case "circle":
      return lastTeachingStep(shape) ?? beforeTeaching(shape);
    case "reflect":
      if (shape.circle) return { kind: "circle" };
      return lastTeachingStep(shape) ?? beforeTeaching(shape);
    case "celebrate":
      return null;
  }
}

/**
 * What the back control says it is going back TO, for the label a screen
 * reader hears. A bare "Back" on a teaching surface is the least useful word
 * available: it is the same on all six screens, and the one thing a teacher
 * reversing mid-lesson wants to know is which screen she is about to land on.
 *
 * `partTitles` are the authored part titles in the same order as
 * `shape.phaseMoments`; `circleTitle` is the circle part's own title. Both are
 * optional, and an absent title falls back to a true generic rather than an
 * invented one.
 */
export function backLabel(
  target: Step,
  names: { partTitles?: string[]; circleTitle?: string | null } = {},
  shape?: Pick<JourneyShape, "askCount">
): string {
  switch (target.kind) {
    case "settle":
      return "Back to grounding";
    case "topic":
      return "Back to the topic";
    case "look":
      return "Back to this time of year";
    case "day":
      return "Back to the day";
    case "ask":
      return shape && shape.askCount > 1
        ? `Back to question ${target.index + 1}`
        : "Back to the question";
    case "outside":
      return "Back to the outdoor activity";
    case "phase":
      return `Back to ${names.partTitles?.[target.phase] ?? "the previous part"}`;
    case "circle":
      return `Back to ${names.circleTitle ?? "circle time"}`;
    case "reflect":
      return "Back to your reflection";
    case "celebrate":
      return "Back";
  }
}

/**
 * What the outdoor part page's forward CTA says it is going TO (#1194).
 *
 * The mirror of `backLabel`, and here for the same reason: the label used to
 * be computed beside the button, off `bodyPhases[step.phase + 1]` — the
 * ADJACENT part. That is not where Next goes once a part is empty. With parts
 * `[2, 0, 3, 0]` the last moment of part 0 promised part 1 while `goNext`
 * opened part 2, because `goNext` asks `nextStep` and the label asked the
 * array. One of them was reading the lesson's shape and the other its
 * storage order.
 *
 * So the label asks the same question the button does. Computed here rather
 * than in the surface because a rule beside a button is a rule only a grep
 * can test; named here, it is a rule a test can CALL — the same argument
 * `phase-moments.ts` and this file's own header make.
 *
 * `partTitles` are the authored part titles in `shape.phaseMoments` order.
 */
export function outdoorNextLabel(
  step: Extract<Step, { kind: "phase" }>,
  shape: JourneyShape,
  names: { partTitles?: string[] } = {}
): string {
  const moments = shape.phaseMoments[step.phase] ?? 0;
  if (step.moment < moments - 1) return "Next →";
  const after = nextStep(step, shape);
  if (after?.kind === "phase") {
    // The index comes from `nextOutdoorPart`, so it is inside `phaseMoments`
    // and therefore inside `partTitles`. The fallback is not expected to fire;
    // it is here because a missing title must degrade to a true generic on a
    // playground rather than throw in front of a class.
    return `Next: ${names.partTitles?.[after.phase] ?? "the next part"} →`;
  }
  if (after?.kind === "circle") return "Finish · circle time →";
  return "Finish →";
}
