// Server-only: current producer expectations plus species reference articles.
// The calendar labels its phase as a regional expectation, never an observation.
import type { SpeciesLearning } from "./species-learning";

import { curatedEntries } from "@/lib/outside/curated-phenology";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { getSpeciesSource } from "@/lib/outside/species-source";
import { draftSpeciesLearning } from "@/lib/ai/species-learning";
import { draftSpeciesNote } from "@/lib/ai/species-note";
import { type ClimateGroup } from "@/lib/outside/climate";
import { groundsToHabitats } from "@/lib/outside/grounds";
import type { HabitatTag, PhenologyEntry } from "@/lib/outside/types";
import { commonNameKey } from "./member";

export interface SpeciesDepth {
  forChildren?: SpeciesLearning | null;
  /** What it is: kind, where to look, which sense finds it. */
  whatItIs: string | null;
  /** What it is doing now: the week's narrative phase, in plain words. */
  rightNow: string | null;
  /** For the teacher: one thing worth knowing when a class meets it. */
  forTeacher: string | null;
  /**
   * Where the natural history came from, when it came from an article rather
   * than our own phenology. Rendered as a credit: CC BY-SA asks for one, and a
   * teacher who wants to check us is a teacher we want.
   */
  credit: { title: string; url: string } | null;
}

const EMPTY: SpeciesDepth = {
  whatItIs: null,
  rightNow: null,
  forTeacher: null,
  credit: null,
};

/** Iconic taxon to a word a person uses. Unknown taxa simply say nothing. */
const KIND: Record<string, string> = {
  Insecta: "an insect",
  Arachnida: "a spider or its relatives",
  Aves: "a bird",
  Mammalia: "a mammal",
  Amphibia: "an amphibian",
  Reptilia: "a reptile",
  Mollusca: "a snail, slug or shellfish",
  Plantae: "a plant",
  Fungi: "a fungus",
};

/** Habitat tags as a teacher would say them. */
const WHERE: Record<HabitatTag, string> = {
  pond: "the pond",
  stream: "the stream",
  woodland: "the woodland",
  hedgerow: "the hedgerow",
  grassland: "the grassland",
  meadow: "the meadow",
  urban: "the built edges",
  coast: "the coast",
  garden: "the garden",
  playing_field: "the playing field",
  wall_fence: "walls and fences",
};

const SENSE_WORD: Record<string, string> = {
  sight: "seen",
  sound: "heard",
  smell: "smelled",
  touch: "touched",
};

/** The narrative phase, said plainly. Absent when the entry did not carry one. */
const PHASE_LINE: Record<string, string> = {
  emerging: "The regional calendar describes this as emerging.",
  peak: "The regional calendar describes this as at its peak.",
  fading: "The regional calendar describes this as fading.",
};

/** A list, joined the way a person says one. */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Compose the three sections from one phenology entry plus the member's taxon.
 * Pure, so the composition is testable without touching disk.
 */
export function composeDepth(
  entry: PhenologyEntry | null,
  iconicTaxon: string | null
): SpeciesDepth {
  const kind = iconicTaxon ? KIND[iconicTaxon] : undefined;

  // What it is. Built from the kind, where the entry says to look, and which
  // sense finds it — three facts, each of them recorded.
  const whatParts: string[] = [];
  if (kind) whatParts.push(`This is ${kind}.`);
  if (entry && entry.habitats.length > 0) {
    const places = list(entry.habitats.map((h) => WHERE[h]).filter(Boolean));
    if (places) whatParts.push(`Look for it around ${places}.`);
  }
  if (entry && entry.senses.length > 0) {
    const senses = list(
      entry.senses.map((s) => SENSE_WORD[s]).filter((w): w is string => Boolean(w))
    );
    if (senses) whatParts.push(`It is usually ${senses}.`);
  }

  const rightNow = entry?.narrativePhase ? (PHASE_LINE[entry.narrativePhase] ?? null) : null;

  // The teacher register, verbatim. It is already written for her, and
  // rewriting it would be us paraphrasing a fact we did not establish.
  const description = entry?.description?.trim();
  const forTeacher = description
    ? description.endsWith(".")
      ? description
      : `${description}.`
    : null;

  return {
    whatItIs: whatParts.length > 0 ? whatParts.join(" ") : null,
    rightNow,
    forTeacher,
    credit: null,
  };
}

export interface DepthQuery {
  commonName: string;
  scientificName?: string | null;
  iconicTaxon?: string | null;
  lat?: number | null;
  lng?: number | null;
  climate?: ClimateGroup | null;
  grounds?: string[];
  date?: Date;
}

/**
 * The depth for one species, this week, at this place — or empty.
 *
 * Reads a wider slice of the week than the card does, because the card is
 * choosing two or three faces and this is answering about one named species
 * that may sit further down the same week's list.
 */
export async function getSpeciesDepth(query: DepthQuery): Promise<SpeciesDepth> {
  try {
    const { lat, lng, grounds, date = new Date() } = query;
    const data = await fetchFieldTruth({ lat: lat ?? undefined, lng: lng ?? undefined });
    const entries = await curatedEntries(data, date, grounds ? groundsToHabitats(grounds) : undefined, 40);

    const scientific = query.scientificName?.trim().toLowerCase();
    const common = commonNameKey(query.commonName);

    const entry =
      entries.find(
        (e) => e.kind === "species" && scientific && e.scientificName?.trim().toLowerCase() === scientific
      ) ??
      entries.find((e) => common && commonNameKey(e.species) === common &&
        (!scientific || (e.kind === "species" && e.scientificName?.trim().toLowerCase() === scientific))) ??
      null;

    return await withArticle(composeDepth(entry, query.iconicTaxon ?? null), query);
  } catch {
    // Depth is an enrichment. A failure is a shorter profile, never a broken one.
    return EMPTY;
  }
}

/**
 * Replace the composed notes with the article's, when there is an article.
 *
 * BOTH NOTES OR NEITHER, and the composed pair is what stands in. `rightNow`
 * never comes from here: the article knows the species, only the phenology
 * knows the week.
 */
async function withArticle(
  composed: SpeciesDepth,
  query: DepthQuery
): Promise<SpeciesDepth> {
  const source = await getSpeciesSource({
    commonName: query.commonName,
    scientificName: query.scientificName,
  });
  if (!source) return composed;

  const input = { commonName: query.commonName, scientificName: query.scientificName, source };
  const [note, forChildren] = await Promise.all([draftSpeciesNote(input), draftSpeciesLearning(input)]);
  return {
    ...composed,
    forChildren,
    whatItIs: note?.whatItIs ?? composed.whatItIs,
    forTeacher: note?.forTeacher ?? composed.forTeacher,
    credit: note || forChildren ? { title: source.title, url: source.url } : null,
  };
}
