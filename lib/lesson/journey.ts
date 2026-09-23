import { NOTHING_TO_CARRY, carriesNothing } from "@/lib/kit";
import { drivingQuestion } from "@/lib/lesson/driving-question";
import { demoPlainText } from "@/lib/text";
import type { Block, ChildSheetBlock, Pack, Phase, Session } from "@/schema/pack";

export const LESSON_JOURNEY_FALLBACKS = {
  location: "Outside — exact space not authored.",
  preparation: "No additional preparation is authored.",
  materials: "No demonstration materials are authored.",
  childWork: "No child work has been authored for this lesson.",
} as const;

export type LessonMove =
  | "speak"
  | "note"
  | "demonstrate"
  | "conditions"
  | "ask"
  | "name-skill";

export interface LessonRouteBeat {
  key: string;
  title: string;
  durationMinutes: number | null;
  /** First authored line in this phase; never generated or rewritten. */
  lead: string;
  moves: LessonMove[];
}

export type LocalEvidenceNeed = {
  kind: "current-conditions";
  label: "Current conditions";
  reason: "An authored conditions line needs a located, frozen read or its authored fallback.";
  subjects: [];
};

export type AuthoredLessonGap =
  | "driving-question"
  | "preparation"
  | "space"
  | "child-work"
  | "site-qualification";

export interface LessonJourney {
  id: string;
  packId: string;
  packTitle: string;
  title: string;
  question: string;
  questionSource: "prompt" | "objective-fallback";
  objective: string;
  ageBand: string;
  durationMinutes: number;
  location: string;
  locationSource: "authored" | "fallback";
  childWork: {
    status: "authored" | "missing";
    summary: string;
    blockTypes: ChildSheetBlock["type"][];
  };
  route: LessonRouteBeat[];
  preparation: {
    teacherNote: { text: string; source: "authored" | "fallback" };
    kit: { items: string[]; summary: string };
    space: { text: string; source: "authored" | "fallback" };
    materials: { items: string[]; summary: string };
    materialFallback: string | null;
  };
  teachingNeeds: {
    localEvidence: LocalEvidenceNeed[];
    /**
     * Names printed on an authored match strip are possibilities, not proof
     * that those species occur at this site. Until a future explicit lesson
     * policy qualifies them, they remain unresolved and authorize no photo,
     * cast member, local claim or pre-work material.
     */
    siteQualification: {
      status: "unresolved";
      authoredCandidates: string[];
    } | null;
    /**
     * Missing author decisions made machine-readable for an editor or future
     * preparation assistant. A consumer may show the fallback, but a model
     * must not silently fill these seams and pass the result off as authored.
     */
    authoredGaps: AuthoredLessonGap[];
  };
}

const MOVE_BY_BLOCK: Record<Block["type"], LessonMove> = {
  "say-aloud": "speak",
  "teacher-note": "note",
  demo: "demonstrate",
  "conditions-line": "conditions",
  "circle-question": "ask",
  "named-skill": "name-skill",
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function blockText(block: Block): string {
  switch (block.type) {
    case "demo":
      return demoPlainText(block);
    case "conditions-line":
      return block.fallbackText;
    case "named-skill":
      return block.skill;
    default:
      return block.text;
  }
}

function phaseTree(phases: Phase[]): Phase[] {
  const expanded: Phase[] = [];
  for (const phase of phases) {
    expanded.push(phase);
    for (const variant of phase.conditionVariants ?? []) {
      expanded.push(...phaseTree([variant.phase]));
    }
  }
  return expanded;
}

/**
 * One phase, projected as a route beat.
 *
 * Exported (#791) because `route` is the lesson's SPINE — the base phases, the
 * thing a teacher is shown — and must not grow a beat per weather variant. But
 * a surface asking about the phase on screen may name a variant
 * (`explore-windy`), and it still needs that phase's title and authored words.
 * So the projection is shared and the route stays the spine:
 * `lib/lesson/support-context.ts` projects the variant on demand rather than
 * finding a hollow context and passing nulls to the model.
 */
export function projectRouteBeat(phase: Phase): LessonRouteBeat {
  const firstBlock = phase.blocks[0];
  if (!firstBlock) {
    // Parsed packs cannot reach this branch (`phaseSchema` requires one
    // block), but keeping the projection total over its declared input
    // prevents an unvalidated caller from receiving an invented lead.
    throw new Error(`Lesson phase "${phase.key}" has no authored blocks`);
  }
  return {
    key: phase.key,
    title: phase.title,
    durationMinutes: phase.durationMin ?? null,
    lead: blockText(firstBlock),
    moves: unique(phase.blocks.map((block) => MOVE_BY_BLOCK[block.type])),
  };
}

function routeBeats(session: Session): LessonRouteBeat[] {
  return session.phases.map(projectRouteBeat);
}

/**
 * The most specific authored sentence about what the children actually DO.
 *
 * Exported (#524) because the lesson doorway had grown its own, worse chain:
 * `childWorkSummary ?? primer.summary`. `childWorkSummary` is authored on 11
 * of 56 sessions, so on the other 45 the doorway fell through to the primer —
 * a paragraph about the CONCEPT, up to 84 words, whose first sentence never
 * mentions a child. A teacher deciding in ten seconds read an essay where a
 * line belonged.
 *
 * This chain answers the same question better and it already existed. Every
 * step of it comes off the child's own sheet: what they stick down, what they
 * match, what they notice, what the sheet is called. Measured across the
 * shelf it reaches all 56 sessions with a median of eight words, so the
 * doorway needs no fallback paragraph and no new authoring.
 *
 * One chain, two surfaces. Two chains for one question is how they came to
 * disagree in the first place.
 */
export function childWorkSummaryOf(session: Session): string | null {
  const work = childWork(session);
  return work.status === "authored" ? work.summary : null;
}

function childWork(session: Session): LessonJourney["childWork"] {
  const blockTypes = unique(session.childSheet.map((block) => block.type));
  const collage = session.childSheet.find(
    (block): block is Extract<ChildSheetBlock, { type: "collage-zone" }> =>
      block.type === "collage-zone" && Boolean(block.hint)
  );
  const match = session.childSheet.find(
    (block): block is Extract<ChildSheetBlock, { type: "match-strip" }> =>
      block.type === "match-strip"
  );
  const notice = session.childSheet.find(
    (block): block is Extract<ChildSheetBlock, { type: "notice-line" }> =>
      block.type === "notice-line"
  );
  const title = session.childSheet.find(
    (block): block is Extract<ChildSheetBlock, { type: "sheet-title" }> =>
      block.type === "sheet-title"
  );
  const summary =
    session.childWorkSummary ?? collage?.hint ?? match?.prompt ?? notice?.prompt ?? title?.title;

  return summary
    ? { status: "authored", summary, blockTypes }
    : {
        status: "missing",
        summary: LESSON_JOURNEY_FALLBACKS.childWork,
        blockTypes,
      };
}

function preparation(session: Session): LessonJourney["preparation"] {
  const phases = phaseTree(session.phases);
  const materials = unique(
    phases.flatMap((phase) =>
      phase.blocks.flatMap((block) => (block.type === "demo" ? block.materials : []))
    )
  );
  const kit = carriesNothing(session.kit) ? [] : [...session.kit];
  const space = session.spaceNeeded ?? LESSON_JOURNEY_FALLBACKS.location;

  return {
    teacherNote: session.preparation
      ? { text: session.preparation, source: "authored" }
      : { text: LESSON_JOURNEY_FALLBACKS.preparation, source: "fallback" },
    kit: {
      items: kit,
      summary: kit.length > 0 ? kit.join(" · ") : NOTHING_TO_CARRY,
    },
    space: {
      text: space,
      source: session.spaceNeeded ? "authored" : "fallback",
    },
    materials: {
      items: materials,
      summary:
        materials.length > 0
          ? materials.join(" · ")
          : LESSON_JOURNEY_FALLBACKS.materials,
    },
    materialFallback: session.materialFallback ?? null,
  };
}

function localEvidenceNeeds(session: Session): LocalEvidenceNeed[] {
  const phases = phaseTree(session.phases);
  const blocks = phases.flatMap((phase) => phase.blocks);
  const needs: LocalEvidenceNeed[] = [];

  if (blocks.some((block) => block.type === "conditions-line")) {
    needs.push({
      kind: "current-conditions",
      label: "Current conditions",
      reason:
        "An authored conditions line needs a located, frozen read or its authored fallback.",
      subjects: [],
    });
  }

  return needs;
}

function unresolvedSiteQualification(
  session: Session
): LessonJourney["teachingNeeds"]["siteQualification"] {
  const authoredCandidates = unique(
    session.childSheet.flatMap((block) =>
      block.type === "match-strip" ? block.cards.map((card) => card.name) : []
    )
  );
  return authoredCandidates.length > 0
    ? { status: "unresolved", authoredCandidates }
    : null;
}

/**
 * One stable, deterministic lesson contract for Today, Plan and a future
 * preparation assistant. It projects authored pack data only. It does not
 * fetch local evidence, call a model, write lesson prose, or inject a ritual.
 */
export function projectLessonJourney(pack: Pack, session: Session): LessonJourney {
  const work = childWork(session);
  const siteQualification = unresolvedSiteQualification(session);
  // The authored question, minus the ones that only restate the title or the
  // objective this page also renders (#150). A suppressed prompt leaves the
  // same shape as an absent one: the objective carries the hero and the gap is
  // reported, because a line that says nothing new is not an authored question.
  const question = drivingQuestion(session);
  const hasQuestion = question !== null;
  const gaps: AuthoredLessonGap[] = [];
  if (!hasQuestion) gaps.push("driving-question");
  if (!session.preparation) gaps.push("preparation");
  if (!session.spaceNeeded) gaps.push("space");
  if (work.status === "missing") gaps.push("child-work");
  if (siteQualification) gaps.push("site-qualification");

  return {
    id: session.id,
    packId: pack.id,
    packTitle: pack.title,
    title: session.title,
    question: question ?? session.objective,
    questionSource: hasQuestion ? "prompt" : "objective-fallback",
    objective: session.objective,
    ageBand: pack.ageBand,
    durationMinutes: session.durationMin,
    location: session.spaceNeeded ?? LESSON_JOURNEY_FALLBACKS.location,
    locationSource: session.spaceNeeded ? "authored" : "fallback",
    childWork: work,
    route: routeBeats(session),
    preparation: preparation(session),
    teachingNeeds: {
      localEvidence: localEvidenceNeeds(session),
      siteQualification,
      authoredGaps: gaps,
    },
  };
}
