import { z } from "zod";
import { draft } from "./draft";
import { loadPrompt } from "./prompt-registry";
import type { SpeciesEvidence } from "@/lib/outside/species-allowlist";

/**
 * Identify the visible nature subject (#1115). Nearby observations are
 * context, not an answer gate. Only a match to those records earns a
 * provenance label, and the label is the MATCHED RECORD'S OWN tier (#401) —
 * a recent local sighting and a multi-year regional one are different claims
 * and this surface is where the difference is felt. A broader or unrecorded
 * identification can still help, and carries no claim at all.
 * Photographs are used for the call only, never stored or traced.
 */
export interface SpeciesIdCandidate {
  name: string;
  scientificName: string | null;
  /** Which record this name came from. Ours, never the model's (#401). */
  evidence: SpeciesEvidence;
}

const responseSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable(),
  scientificName: z.string().trim().min(1).max(160).nullable(),
  note: z.string().trim().min(1).max(400),
});

export interface SpeciesIdAnswer {
  name: string | null;
  scientificName: string | null;
  note: string;
  /**
   * What our own records support about this name, or null when they support
   * nothing (#401). Replaces a boolean `locallyRecorded`, which could only say
   * "some record exists" and so read a multi-year regional record as a local
   * sighting. The distinction is the claim, so it has to be in the type.
   */
  evidence: SpeciesEvidence | null;
}

export function buildSpeciesId(
  candidates: readonly SpeciesIdCandidate[]
): { id: string; version: number; system: string; user: string } | null {
  const prompt = loadPrompt("species-id", {
    // The tier never reaches the model. It cannot choose or upgrade what it
    // is not shown, and the list is context for recognition, not provenance
    // (#401). This also keeps the prompt's rendered text — and its lockfile
    // hash — exactly what it was.
    speciesList: JSON.stringify(
      candidates.map(({ name, scientificName }) => ({ name, scientificName }))
    ),
  });
  if (!prompt) return null;
  return { ...prompt, user: "Help us identify and understand the nature subject in this photograph." };
}

/** Validate the reply and attach local provenance from our records only. */
export function parseSpeciesId(
  value: unknown,
  candidates: readonly SpeciesIdCandidate[]
): SpeciesIdAnswer | null {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) return null;
  const answer = parsed.data;
  if (answer.name === null) {
    return { ...answer, scientificName: null, evidence: null };
  }
  const identifiedName = answer.name;
  const fold = (text: string) => text.trim().toLowerCase();
  // A SCIENTIFIC-NAME MATCH OUTRANKS A COMMON-NAME ONE (#401).
  //
  // When both supply a scientific name, it must agree: a common name can
  // refer to different taxa and cannot overrule a conflicting identity. But
  // a candidate carrying NO scientific name matches on its common name
  // alone, and the allowlist deduplicates on common name, so two rows can
  // describe one taxon in two tiers: `{ "Willow", null }` recorded nearby
  // and `{ "Goat willow", "Salix caprea" }` from the seasonal tier. An
  // answer of `{ "Willow", "Salix caprea" }` then took the first row it
  // met and read `recent` off it — the very upgrade this ticket is named
  // for, for a taxon only the seasonal tier knows. Looking for the taxon
  // before the word settles it on the record that is actually about this
  // species.
  const byScientificName =
    answer.scientificName === null
      ? undefined
      : candidates.find(
          (candidate) =>
            candidate.scientificName &&
            fold(candidate.scientificName) === fold(answer.scientificName!)
        );
  const canonical =
    byScientificName ??
    candidates.find((candidate) =>
      candidate.scientificName && answer.scientificName
        ? fold(candidate.scientificName) === fold(answer.scientificName)
        : fold(candidate.name) === fold(identifiedName)
    );
  return {
    ...answer,
    name: canonical?.name ?? answer.name,
    scientificName: canonical?.scientificName ?? answer.scientificName,
    // Read off the matched record, so an off-list answer carries no claim and
    // a matched one carries exactly the claim its own tier supports.
    evidence: canonical?.evidence ?? null,
  };
}

export async function identifySpecies(input: {
  image: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  candidates: readonly SpeciesIdCandidate[];
}): Promise<SpeciesIdAnswer | null> {
  const prompt = buildSpeciesId(input.candidates);
  if (!prompt) return null;
  return draft({
    prompt,
    facts: input.candidates,
    image: input.image,
    maxTokens: 300,
    parse: (json, candidates) => parseSpeciesId(json, candidates),
  });
}
