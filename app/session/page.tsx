import { redirect } from "next/navigation";
import { canonicalSessionId } from "@/lib/pack";
import { curriculumPosition } from "@/lib/curriculum";
import { previewForSession } from "@/lib/lesson/preview-audio";
import { loadLessonPreparation, type LessonSearchParams } from "./lesson-data";
import { PlanView } from "./PlanView";
import { ReadyView } from "./legacy/ReadyView";
import { SessionModes } from "./SessionModes";
import { lessonHref } from "./lesson-links";

/**
 * ONE FIRST SCREEN (Johan, 2026-08-17, on nc#302): "the first screen and this
 * might be redundant?... reading primer and gathering material should be on
 * first one and the adaptation should remove."
 *
 * Preparation and live teaching are different jobs. The default page keeps
 * them together without mixing their controls: the lesson page (Before class)
 * holds preview, ground, safety, print and offline preparation; Run Session
 * Outside starts the four-part live sequence.
 *
 * `/session/primer` stays its own page (the seated ten-minute read), and
 * `?plan=legacy` still opens the retired five-page version for comparison.
 */
export default async function SessionPage({
  searchParams,
}: {
  searchParams: LessonSearchParams;
}) {
  const params = await searchParams;
  const { plan, session, locale } = params;
  if (plan === "legacy") {
    const data = await loadLessonPreparation(Promise.resolve(params));
    return <ReadyView {...data} />;
  }
  if (plan === "scroll") {
    const data = await loadLessonPreparation(Promise.resolve(params));
    return <PlanView {...data} />;
  }

  // A retired session id is rewritten on the way through (#468), so a link a
  // teacher saved under an old slug does not just resolve — it lands her on
  // the URL the lesson is called by now.
  if (session && canonicalSessionId(session) !== session) {
    redirect(lessonHref("/session", canonicalSessionId(session), locale));
  }

  const data = await loadLessonPreparation(Promise.resolve(params));
  const preview = previewForSession(data.session);
  return (
    <SessionModes
      {...data}
      offlineAvailable={curriculumPosition(data.session.id) !== null}
      previewSeconds={preview?.seconds ?? null}
    />
  );
}
