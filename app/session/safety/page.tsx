import { loadLessonPreparation, type LessonSearchParams } from "../lesson-data";
import { SafetyPage } from "./SafetyPage";

/**
 * The hazards, as their own page (#417). Loaded through the same
 * `loadLessonPreparation` as every other preparation page, which resolves them
 * with the shared helper the runner uses — so this page and the field cannot
 * disagree about what is out there.
 */
export default async function Safety({
  searchParams,
}: {
  searchParams: LessonSearchParams;
}) {
  const data = await loadLessonPreparation(searchParams);
  return <SafetyPage {...data} />;
}
