import { DandelionTransition } from "./DandelionTransition";

/**
 * The quiet transition into Today.
 *
 * The teacher and their class are still resolving here, so this state makes
 * no claims about either. The product mark is the only thing we know to be
 * true. Three seeds lift from it on transform and opacity alone; teachers who
 * ask for reduced motion see one still seed instead.
 */
export default function TodayLoading() {
  return <DandelionTransition message="Opening Nature Class." />;
}
