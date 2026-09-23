// Server-only: reads the generated taxon reference from disk. Never import
// from a client component.

/**
 * WHAT KIND OF THING IT IS, AND A PICTURE OF ONE (#321).
 *
 * The regional tier had neither, and the absence showed. A species from the
 * phenology carried `iconicTaxon: null` and no photograph at all, so the daily
 * card and the brief drew a field-guide plate for it — and, because the plate
 * picks its mark by iconic taxon, drew the SAME LEAF for every one. Përmet's
 * page rendered a swallow, a spider and a fire salamander as three identical
 * sprouting seedlings. Johan: *"dont we have images of a salamander?"*
 *
 * We do. iNaturalist holds 5,500 research-grade CC0-or-CC-BY photographs of
 * Salamandra salamandra. Nobody had ever asked for one, even though the photo
 * contract has carried a `taxon-reference` role since it was written, meaning
 * exactly "a picture of the species rather than of an observation near here".
 * The slot was designed and left empty.
 *
 * ── THIS DOES NOT CHANGE ANY CLAIM ─────────────────────────────────────────
 *
 * A `taxon-reference` photograph is NOT evidence that the animal is here. It is
 * a picture of what the species looks like, and the honesty system already
 * knows the difference: `castMaterial` renders a regional member's photograph
 * inset in a paper frame rather than full-bleed, so "around the region" and
 * "on your doorstep" still read differently at a glance and still read
 * differently in greyscale. The tier is unchanged, the caption is unchanged,
 * and nothing moves from "usually around here now" into the seen group.
 *
 * What changes is that a child looking at the word "Fire Salamander" can now
 * see what a fire salamander looks like.
 *
 * ── GENERATED, NOT AUTHORED ────────────────────────────────────────────────
 *
 * `data/taxon-reference.json` is written by `scripts/build-taxon-reference.mjs`
 * from the iNaturalist API and is never hand-edited: a wrong entry is fixed by
 * re-running the script. That matters here more than usual, because the file
 * this serves is itself hand-typed and on its way out (#305, #320). This makes
 * its species look like themselves in the meantime, and is deleted with it.
 *
 * A species absent from the file keeps its drawn plate. That is the ordinary
 * case for the entries that are not species at all — "Autumn Colour", "Dawn
 * Chorus", "First Frost" — which have no taxon to look up and no photograph to
 * find, and are perfectly good plates.
 *
 * BEING ABSENT FROM THIS FILE IS NOT WHAT MAKES A ROW A NON-SPECIES (#1020).
 * Those three are absent because nobody authored a scientific name for them,
 * and reading that absence as the rule is what let "Swallow Gathering" —
 * a seasonal event carrying `Hirundo rustica` — resolve here to Aves and to a
 * portrait of one barn swallow. The rule now lives on the row itself
 * (`PhenologyEntry.kind`), and `resolvePhenologyReference` never asks this
 * file about an event.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { PointmoonPhotoAsset } from "./pointmoon-contract";

export interface TaxonReference {
  taxonId: number;
  /** iNaturalist's own iconic taxon: Aves, Insecta, Amphibia, Plantae... */
  iconicTaxon: string | null;
  commonName: string | null;
  /** A releasable picture OF THE SPECIES. Never evidence of local presence. */
  photo?: PointmoonPhotoAsset;
}

type ReferenceFile = { taxa?: Record<string, TaxonReference> };

const FILE = path.join(process.cwd(), "lib", "outside", "data", "taxon-reference.json");

/** Read once per server instance. `null` means the file is absent or broken,
 * which is a product state and not an error: every species keeps its plate. */
let loaded: Promise<Record<string, TaxonReference>> | null = null;

function read(): Promise<Record<string, TaxonReference>> {
  loaded ??= fs
    .readFile(FILE, "utf8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as ReferenceFile;
      return parsed.taxa && typeof parsed.taxa === "object" ? parsed.taxa : {};
    })
    .catch(() => ({}));
  return loaded;
}

/**
 * The reference for one scientific name, or null.
 *
 * Keyed on the scientific name because it is the same string on both sides by
 * construction. A common-name key would have to guess, and guessing here pairs
 * one animal's photograph with another animal's name, which is the single
 * worst thing this file could do.
 */
export async function taxonReference(
  scientificName: string | null | undefined
): Promise<TaxonReference | null> {
  const key = scientificName?.trim().toLowerCase();
  if (!key) return null;
  const taxa = await read();
  return taxa[key] ?? null;
}

/** The whole map, for callers resolving a cast in one pass. */
export async function taxonReferences(): Promise<Record<string, TaxonReference>> {
  return read();
}

/**
 * Every common name this file knows, as the vocabulary a model may NOT reach
 * for (#342).
 *
 * The same 400-odd names serve two opposite jobs, and the second one is the
 * durable one. As a reference they answer "what does this look like?" for a
 * species the read returned. As a LEXICON they answer "did the model just
 * invent a creature?" for a species the read did not — because a name that
 * appears in a drafted line without being in today's grounded list was put
 * there by the model.
 *
 * `look-for-line.ts` was written expecting the retired phenology JSON to do
 * this job, and #305 is deleting that file. This one is generated from the
 * iNaturalist API, is never hand-edited, and grows when the script is re-run,
 * so it survives what the almanac does not.
 *
 * An empty map is a real state: the guard then catches only names it can see
 * on the screen, which is weaker and still correct.
 */
export async function speciesLexicon(): Promise<string[]> {
  const taxa = await read();
  return Object.values(taxa)
    .map((entry) => entry.commonName)
    .filter((name): name is string => Boolean(name && name.trim()));
}

/** Test seam: drop the memo so a spec can read two different files. */
export function __clearTaxonReferenceCache(): void {
  loaded = null;
}
