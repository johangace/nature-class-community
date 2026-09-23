import { LegacyPlanFrame, type LessonViewProps } from "./LegacyPlanFrame";
import { PhaseNotesContent } from "../TeachingNotes";

export function RouteView(props: LessonViewProps) {
  return (
    <LegacyPlanFrame
      {...props}
      back={{ label: "Place", path: "/session/place" }}
      current="/session/route"
      next={{ label: "Choose what to take →", path: "/session/take" }}
      title="How will the lesson flow?"
    >
      <section className="plan-route-section" aria-labelledby="plan-route-heading">
        <h2 id="plan-route-heading">The route</h2>
        <ol className="plan-route">
          {props.journey.route.map((phase, index) => (
            <li key={phase.key}>
              <span className="plan-route-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <strong>{phase.title}</strong>
                {phase.durationMinutes && <small>{phase.durationMinutes} min</small>}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <PhaseNotesContent session={props.session} />
    </LegacyPlanFrame>
  );
}
