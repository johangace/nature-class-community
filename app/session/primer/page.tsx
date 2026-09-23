import { loadLessonPreparation, type LessonSearchParams } from "../lesson-data";
import { PrimerPage } from "./PrimerPage";
import { PrimerView } from "../legacy/PrimerView";

/**
 * The primer, as its own page.
 *
 * Johan: "Read Primer with keyowrds goals, structure  long in a page separate".
 * This route used to redirect into a fold on the one-scroll plan; the primer is
 * a different READ — seated, the night before — and folding it into the doorway
 * demoted background knowledge to something optional. See PrimerPage.
 *
 * `?plan=legacy` still renders the retired five-page version for comparison.
 */
export default async function Primer({
  searchParams,
}: {
  searchParams: LessonSearchParams;
}) {
  const { plan } = await searchParams;
  const data = await loadLessonPreparation(searchParams);
  return plan === "legacy" ? <PrimerView {...data} /> : <PrimerPage {...data} />;
}
