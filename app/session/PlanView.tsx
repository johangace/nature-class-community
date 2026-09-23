import Link from "next/link";
import { carriesNothing, NOTHING_TO_CARRY } from "@/lib/kit";
import { PlanPageFrame, type LessonViewProps } from "./PlanPageFrame";
import { resolveAbility } from "@/lib/ability";
import { ClassBandChoice } from "./ClassBandChoice";
import { lessonHref } from "./lesson-links";

/**
 * The doorway's content: what today is, in about a hundred words.
 *
 * Every line here has to survive the question "would she cancel or change the
 * lesson because of this?" — that is what belongs at a door. Time, age and
 * space each can; the primer cannot, which is why it is a link and not a fold.
 *
 * The rejected build held 82 words in its FIRST VIEWPORT. This is ~100 across
 * a screen and a half, and the hero is one line rather than two competing ones.
 *
 * MERGE NOTE: #243 landed the band chooser here while this surface was being
 * rewritten, and left a comment saying its placement was provisional. It is
 * kept, at the foot beside the door, because its own reasoning holds under the
 * new architecture and is in fact stronger: the band is the last thing decided
 * before leading, not something reached for mid-lesson with thirty children
 * waiting. What did NOT survive is the old folded "what to understand first"
 * and "paper" sections — those became the primer page and the print step, which
 * is the whole point of splitting the pre-leading read into three.
 *
 * The preparation assistant also moved off this page. A doorway that must be
 * readable in ten seconds cannot also host a helper, and the primer is where a
 * teacher is actually sitting down with the lesson.
 */
export function PlanView(props: LessonViewProps) {
  const { journey, session } = props;
  const hasQuestion = journey.questionSource === "prompt";
  const nothingToCarry = carriesNothing(session.kit);

  return (
    <PlanPageFrame {...props}>
      {/*
       * The hero is the authored driving question when a real one exists, and
       * the lesson's own TITLE when it does not — never the objective, which is
       * adult prose written for a subject lead, and never a generated question.
       * A page that leads with a fabricated question would be lying about which
       * words are the author's.
       *
       * `journey.questionSource` is now decided by `drivingQuestion` (nc#150),
       * so "no real one exists" covers three more cases than it used to: a
       * prompt that IS the title with a full stop on it, and a prompt that is
       * the objective's opening clause. Those used to reach this hero and then
       * repeat themselves in the subtitle or in "What this is for" directly
       * below. They fall back to the title here, exactly as an absent prompt
       * does, and Johan's lines supersede the fallback whenever he writes them.
       */}
      <h1 className="plan-question">{hasQuestion ? journey.question : journey.title}</h1>
      {hasQuestion && <p className="plan-session-title">{journey.title}</p>}

      {/* Johan's "few lines": already an authored field, used verbatim. */}
      <p className="plan-lead">{journey.childWork.summary}</p>

      <section className="plan-block" aria-labelledby="plan-objective-heading">
        <h2 className="plan-quiet-head" id="plan-objective-heading">
          What this is for
        </h2>
        <p className="plan-body">{journey.objective}</p>
      </section>

      {/*
       * The three facts that can cancel a lesson at the door, on one line of
       * type rather than in three labelled cells. Chrome was doing typography's
       * job here for a long time.
       */}
      <p className="plan-facts">
        {journey.durationMinutes} min · ages {journey.ageBand} · {journey.location}
      </p>

      <p className="plan-kit">
        {nothingToCarry ? NOTHING_TO_CARRY : session.kit.join(" · ")}
      </p>

      {/*
       * Two plain doorway links. The primer is its own page because it is a
       * different read — seated, the night before — and the paper is one tap
       * because a teacher who wants paper has already decided.
       */}
      <nav className="plan-doors" aria-label="Before you lead">
        <Link href={lessonHref("/session/primer", session.id, props.locale)}>
          Read the primer
        </Link>
        <Link href={lessonHref("/print", session.id, props.locale)}>Print</Link>
      </nav>

      <ClassBandChoice
        band={resolveAbility({ classBand: props.activeClass?.abilityBand, yearGroup: props.activeClass?.yearGroup }).band}
        sample={session.phases.flatMap((phase) => phase.blocks).find((block) => block.type === "say-aloud")}
      />

      <nav className="plan-threshold" aria-label="Lead this lesson">
        <Link href={lessonHref("/run", session.id, props.locale)} className="btn-start">
          Lead now →
        </Link>
      </nav>
    </PlanPageFrame>
  );
}
