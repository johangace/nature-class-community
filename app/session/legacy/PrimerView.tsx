import { LegacyPlanFrame, type LessonViewProps } from "./LegacyPlanFrame";
import { PrimerContent } from "../TeachingNotes";
import { LessonPreparationAssistant } from "../LessonPreparationAssistant";

export function PrimerView(props: LessonViewProps) {
  return (
    <LegacyPlanFrame
      {...props}
      back={{ label: "Ready", path: "/session" }}
      current="/session/primer"
      next={{ label: "Prepare the place →", path: "/session/place" }}
      title="What should I understand first?"
    >
      <PrimerContent session={props.session} />
      <LessonPreparationAssistant
        enabled={Boolean(props.assistantAvailable)}
        locale={props.locale}
        sessionId={props.session.id}
        tasks={["explain"]}
      />
    </LegacyPlanFrame>
  );
}
