import { carriesNothing, NOTHING_TO_CARRY } from "@/lib/kit";
import { LegacyPlanFrame, type LessonViewProps } from "./LegacyPlanFrame";
import { LessonPreparationAssistant } from "../LessonPreparationAssistant";

export function PlaceView(props: LessonViewProps) {
  const { journey, session } = props;

  return (
    <LegacyPlanFrame
      {...props}
      back={{ label: "Primer", path: "/session/primer" }}
      current="/session/place"
      next={{ label: "See the lesson route →", path: "/session/route" }}
      title="What do I need here?"
    >
      <section className="plan-ready" aria-labelledby="plan-ready-heading">
        <h2 id="plan-ready-heading">Ready for outside</h2>
        <div className="plan-ready-grid">
          <article>
            <h3>Carry outside</h3>
            {carriesNothing(session.kit) ? (
              <p>{NOTHING_TO_CARRY}</p>
            ) : (
              <ul className="plan-kit">
                {session.kit.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </article>
          <article>
            <h3>Space</h3>
            <p>
              {session.spaceNeeded ??
                "No special space is specified. Use your usual safe outdoor area."}
            </p>
          </article>
          <article>
            <h3>Set up</h3>
            <p>{session.preparation ?? "No advance setup is specified."}</p>
            <div className="plan-material-fallback">
              <h4>If materials are unavailable</h4>
              <p>
                {journey.preparation.materialFallback ??
                  (carriesNothing(session.kit)
                    ? "No material fallback is needed."
                    : "No fallback is authored for this kit yet. The route shows where each item is used, so you can judge what to trim if something can't come.")}
              </p>
            </div>
          </article>
        </div>
      </section>
      <LessonPreparationAssistant
        enabled={Boolean(props.assistantAvailable)}
        locale={props.locale}
        sessionId={props.session.id}
        tasks={["time", "space", "materials"]}
      />
    </LegacyPlanFrame>
  );
}
