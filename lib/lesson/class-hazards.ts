import "server-only";
import { hazardsFor, type LessonHazards } from "@/lib/lesson/hazards";
import { speciesAllowlistFor } from "@/lib/outside/species-allowlist";
import type { HabitatTag } from "@/lib/outside/types";
import type { BioregionPack } from "@/schema/bioregion";

/**
 * The hazards for THIS class, resolved once (#417).
 *
 * `hazardsFor` is the pure filter and stays pure. This is the server step
 * around it: read the field-truth record near the school, hand it the month
 * and the habitats she can reach, and give both surfaces the same answer.
 *
 * ── WHY IT IS A FUNCTION AND NOT TWO CALL SITES ────────────────────────────
 *
 * Hazards were resolved inside `app/run/page.tsx` and nowhere else, which was
 * correct while the runner was the only surface that showed them. #417 moves
 * the card off the brief and onto its own page under `/session`, which loads
 * through `loadLessonPreparation` — a completely different function, with its
 * own idea of the class's coordinates and its own habitat narrowing.
 *
 * Two independent resolutions of a SAFETY list is the failure worth designing
 * against: she reads six hazards on the page at breaktime and the runner shows
 * her five in the field, and nothing anywhere says which is right. The same
 * rule lesson-data.ts already writes down for instructions — the pre-read and
 * the lead must resolve identically or the pre-read is not a pre-read — binds
 * hardest here, because this is the list where being wrong hurts a child.
 *
 * Still no model, still no run-time API: the record read rides the cached
 * payload the species guards already pay for, and a school with no coordinates
 * gets the universal core and nothing regional, which is the honest answer.
 */
export async function hazardsForClass(input: {
  pack: BioregionPack;
  habitats: readonly HabitatTag[];
  lat?: number | null;
  lng?: number | null;
  /** Injectable so a test can ask for February without waiting for February. */
  month?: number;
}): Promise<LessonHazards | null> {
  // Hazards want every name either tier knows about: a plant that stings is
  // worth naming whether it was seen last week or in this month of past
  // years. The tier the allowlist now carries (#401) is a claim about
  // evidence, and this is the one caller that deliberately does not make one.
  const record = await speciesAllowlistFor(
    input.lat ?? undefined,
    input.lng ?? undefined
  ).catch(() => ({ species: [], recentWindowDays: null }));

  return hazardsFor({
    pack: input.pack,
    habitats: input.habitats,
    month: input.month ?? new Date().getMonth() + 1,
    recordedSpecies: record.species.map((entry) => entry.scientificName),
  });
}
