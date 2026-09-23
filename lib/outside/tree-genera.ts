import type { TopicTag } from "@/schema/pack";

/**
 * WHICH PLANTS ARE TREES (nc#962).
 *
 * iNaturalist's iconic taxa stop at the kingdom for plants, so to the
 * observation feed a buddleia, a spear thistle and an oak are all "Plantae".
 * On 2026-09-04 that put buddleia, spear thistle and bittersweet under a
 * lesson about tree leaves, and Johan called it "a big failure of the
 * contextual AI". The `trees` tag needs a second question the feed cannot
 * answer: is this plant a tree?
 *
 * Nothing upstream carries growth form — not the observation, not the taxon
 * reference (#321), not the phenology file. Genus does, and genus is the
 * first word of the scientific name every sighting already carries. So this
 * is a set of genera whose members are trees or large shrubs a class would
 * call a tree, for the temperate and Mediterranean places this product ships
 * to. It is taxonomy, not region: an Acer is a maple in London and in
 * Phoenix. A genus that is not here is not a tree as far as a trees lesson is
 * concerned, and a sighting with no scientific name at all is dropped rather
 * than guessed, which is the same rule the resolver applies to everything
 * else it cannot verify.
 *
 * Add a genus when a real sighting shows a tree being dropped. Never add one
 * to make a particular cast look fuller.
 */
const TREE_GENERA: ReadonlySet<string> = new Set(
  [
    // Broadleaf, temperate
    "Acer", "Aesculus", "Ailanthus", "Alnus", "Betula", "Carpinus", "Castanea",
    "Catalpa", "Celtis", "Cercis", "Cornus", "Corylus", "Crataegus", "Fagus",
    "Fraxinus", "Gleditsia", "Ilex", "Juglans", "Laburnum", "Liquidambar",
    "Liriodendron", "Magnolia", "Malus", "Morus", "Nyssa", "Paulownia",
    "Platanus", "Populus", "Prunus", "Pyrus", "Quercus", "Robinia", "Salix",
    "Sambucus", "Sorbus", "Tilia", "Ulmus",
    // Conifers
    "Abies", "Araucaria", "Cedrus", "Chamaecyparis", "Cupressus", "Juniperus",
    "Larix", "Metasequoia", "Picea", "Pinus", "Pseudotsuga", "Sequoia",
    "Sequoiadendron", "Taxus", "Thuja", "Tsuga",
    // Warm-temperate and Mediterranean
    "Arbutus", "Ceratonia", "Citrus", "Cupressus", "Eucalyptus", "Ficus",
    "Jacaranda", "Olea", "Phoenix", "Pistacia", "Washingtonia",
  ].map((genus) => genus.toLowerCase())
);

/** The genus of a scientific name: its first word, lower-cased. */
function genusOf(scientificName: string | null | undefined): string | null {
  const first = scientificName?.trim().split(/\s+/)[0];
  return first ? first.toLowerCase() : null;
}

/** True when the named plant is a tree for the purposes of a `trees` lesson. */
export function isTreeGenus(scientificName: string | null | undefined): boolean {
  const genus = genusOf(scientificName);
  return genus !== null && TREE_GENERA.has(genus);
}

/**
 * The tags whose PLANTAE leg needs a second, genus-level question.
 *
 * `trees` has always been here (nc#962). `soil` joins it for nc#1012: "From
 * leaf to soil" asks where a fallen leaf goes, and the leaves fell off trees,
 * so a decomposition lesson has to be able to name the oak and the beech
 * overhead. Without a gate `soil` would take every Plantae the feed holds and
 * put a thistle under a lesson about leaf litter, which is the failure nc#962
 * was opened for.
 *
 * THE GATE IS PER-TAXON, NOT PER-TAG, and that is load-bearing. `soil` also
 * means Fungi and Insecta, and neither a bracket fungus nor a woodlouse has a
 * tree's genus. Gating the whole tag would empty the decomposer legs the
 * lesson is actually about. Only the Plantae leg answers the second question.
 */
const GENUS_GATED_TAGS: ReadonlySet<TopicTag> = new Set<TopicTag>(["trees", "soil"]);

/**
 * The one iconic taxon the genus gate applies to. iNaturalist stops at the
 * kingdom for plants and nowhere else that matters here: Insecta, Fungi and
 * Aves are already narrow enough for a lesson to mean them.
 */
const GENUS_GATED_TAXON = "Plantae";

/**
 * True when this (tag, taxon) pair must clear `isTreeGenus` as well as the
 * iconic-taxon test. For `trees`, whose only taxon is Plantae, this is exactly
 * the old whole-tag behaviour.
 */
export function needsTreeGenus(tag: TopicTag, taxon: string): boolean {
  return taxon === GENUS_GATED_TAXON && GENUS_GATED_TAGS.has(tag);
}
