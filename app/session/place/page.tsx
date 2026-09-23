import { loadLessonPreparation, type LessonSearchParams } from "../lesson-data";
import { PlaceView } from "../legacy/PlaceView";

/**
 * A retired stop on the five-page plan. The lesson is one scroll now (nc#232).
 *
 * The REDIRECT for this path lives in `next.config.mjs`, not here, and that is
 * deliberate: a page-level `redirect()` answered a direct hit with 200 and an
 * empty body instead of a Location, which is exactly the blank page a cached or
 * home-screened bookmark would show a teacher in a field with no signal. A
 * config redirect answers before any React runs and cannot do that.
 *
 * So this file is only ever reached with `?plan=legacy`, where it renders the
 * real retired page so the old flow can be walked end to end and compared
 * against the scroll. Delete the whole route once that comparison is done.
 */
export default async function PlacePage({
  searchParams,
}: {
  searchParams: LessonSearchParams;
}) {
  return <PlaceView {...(await loadLessonPreparation(searchParams))} />;
}
