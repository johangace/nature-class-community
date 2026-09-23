import { drivingQuestion } from "@/lib/lesson/driving-question";
import type { Session } from "@/schema/pack";
import type { SeasonPackView } from "./SeasonPackSection";

/**
 * One shelf row's data, narrowed from the authored session.
 *
 * A seam rather than an inline `.map` in the page, so the shelf's display
 * decisions can be tested without standing up a server component, and so the
 * client bundle carries four fields per session instead of a whole pack.
 *
 * The one decision it makes: the row is the title with the driving question
 * under it, so a `prompt` that only restates the title prints the same words
 * twice ("Minibeast hunting" over "Minibeast hunting."). `drivingQuestion`
 * (#150) returns null for those, and the row is simply the title, exactly as
 * it is for a session that authored no prompt at all.
 */
export function shelfSessionView(session: Session): SeasonPackView["sessions"][number] {
  const question = drivingQuestion(session);
  return {
    id: session.id,
    title: session.title,
    ...(session.labels ? { labels: session.labels } : {}),
    ...(question === null ? {} : { prompt: question }),
    durationMin: session.durationMin,
  };
}
