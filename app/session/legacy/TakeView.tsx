import Link from "next/link";
import { LegacyPlanFrame, type LessonViewProps } from "./LegacyPlanFrame";
import { lessonHref } from "../lesson-links";

export function TakeView(props: LessonViewProps) {
  return (
    <LegacyPlanFrame
      {...props}
      back={{ label: "Route", path: "/session/route" }}
      current="/session/take"
      next={{ label: "That's everything. Lead when you're ready →", path: "/run" }}
      title="What should I take with me?"
    >
      <section className="plan-take" aria-labelledby="plan-take-heading">
        <h2 id="plan-take-heading">Paper, if it helps</h2>
        <p>
          The lesson works from the runner. The print bundle is there when paper will
          make the day easier.
        </p>
        <ul className="plan-take-list">
          <li>
            <strong>Teacher plan</strong>
            <span>The spoken lines, notes and route.</span>
          </li>
          <li>
            <strong>Reference cards</strong>
            <span>Included only when this lesson has usable references.</span>
          </li>
          <li>
            <strong>Child sheet</strong>
            <span>The lesson’s authored making or noticing page.</span>
          </li>
        </ul>
        <Link
          className="btn-print plan-print-action"
          href={lessonHref("/print", props.session.id, props.locale)}
        >
          Print lesson pack
        </Link>
      </section>
    </LegacyPlanFrame>
  );
}
