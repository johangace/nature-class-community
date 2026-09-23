import { LegacyPlanFrame, type LessonViewProps } from "./LegacyPlanFrame";
import { LessonPreparationAssistant } from "../LessonPreparationAssistant";

/** Ready is the lesson promise, not an index of everything that follows. */
export function ReadyView(props: LessonViewProps) {
  return (
    <LegacyPlanFrame
      {...props}
      back={{ label: "Today", path: "/" }}
      current="/session"
      next={{ label: "Read the primer →", path: "/session/primer" }}
      title={props.journey.question}
      withContext
    >
      <section className="plan-do" aria-labelledby="plan-do-heading">
        <h2 id="plan-do-heading">What children will do</h2>
        <p>{props.journey.childWork.summary}</p>
      </section>
      <LessonPreparationAssistant
        enabled={Boolean(props.assistantAvailable)}
        locale={props.locale}
        sessionId={props.session.id}
        tasks={["age", "hyperlocal"]}
      />
    </LegacyPlanFrame>
  );
}
