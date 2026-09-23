import type { HabitatTag } from "@/lib/outside/types";
import type { BioregionPack } from "@/schema/bioregion";

/**
 * Hazards (#376, grown in #388): the one place in the product where a wrong
 * answer hurts a child, so no model is ever in it. The answer must be
 * identical every time and available with no signal, which is why it is
 * authored data filtered by plain code and rendered from the run payload — it
 * works offline because it never was an API call.
 *
 * Three tiers, by who is allowed to write them (Johan's ruling, 2026-08-24):
 *
 *   1. UNIVERSAL — the physics-and-biology constants of taking children
 *      outdoors: water, weather, ground, mouths, insects, boundaries. True of
 *      any grounds anywhere, filtered only to the habitats the class can
 *      reach and the months when the hazard is live. Authored here, once.
 *   2. REGIONAL, record-selected — hazards that belong to a place: hogweed,
 *      poison ivy, adders, rattlesnakes. Each entry is keyed to the species
 *      that carries it, and it travels ONLY when that species is on the
 *      occurrence record near this school. Ticks being denser in the eastern
 *      US than in Europe is not a fact we author: it falls out of the record.
 *      No model decides; a genus match against the field-truth payload does.
 *   3. `pack.hazardVectors` — a bioregion pack that authors its own hazards
 *      answers for the place, and the universal set stands down. Record
 *      entries still ride along: a receipt beats authored generality. The
 *      long-tail proposer (#388, p2) will land its entries here too, so the
 *      pack path is the growing room.
 *
 * The card these feed presents itself honestly: a general list for grounds
 * like hers, never a survey of her patch, and her own risk assessment leads.
 * A record-selected entry says what it stands on. When nothing is known the
 * surface says "not checked", never reassurance — an absent hazard list must
 * never render as "there is nothing to worry about".
 */

export interface HazardEntry {
  id: string;
  /** The hazard, named plainly. */
  name: string;
  /** What she checks or says. Authored, one or two sentences, no model. */
  note: string;
  /**
   * Set only on a record-selected regional entry: the scientific name that
   * put it on the card, so the surface can show its receipt. Absent on a
   * universal or pack entry, which claim only "grounds like yours".
   */
  recordedAs?: string;
}

export interface LessonHazards {
  entries: HazardEntry[];
  /** Where the base list came from, so the surface can say so honestly. */
  source: "pack" | "starter";
}

interface UniversalHazard extends HazardEntry {
  /**
   * Months (1–12) when the hazard is live. Empty means all year. Northern
   * temperate months, matching the market this set is written for; a
   * bioregion pack that knows better overrides the whole set.
   */
  months: readonly number[];
  /**
   * Habitats where the hazard applies. Empty means any grounds at all.
   * A hazard only travels when the class can actually reach a habitat that
   * carries it — a pond warning on a paved yard is noise that teaches her to
   * stop reading the card.
   */
  habitats: readonly HabitatTag[];
}

interface RegionalHazard extends UniversalHazard {
  /**
   * Scientific-name prefixes that put this hazard on the record. A genus
   * ("Vipera") matches every species in it; a binomial matches exactly one.
   * Matching is a case-insensitive prefix on the record's own scientific
   * name — the same closed-world posture as the species-ID allowlist: the
   * record claims it, or the card does not.
   */
  species: readonly string[];
  /**
   * A universal entry this one replaces when it matches. The specific snake
   * on the record stands in for the generic basking-snake caution rather
   * than doubling it.
   */
  supersedes?: string;
}

/**
 * Tier 1 — the universal core. Constants of the outdoors, not facts about a
 * region. Kept deliberately short per entry: this is a card she glances at
 * on the way out, not a risk-assessment form, and her own assessment leads.
 */
const UNIVERSAL_HAZARDS: readonly UniversalHazard[] = [
  {
    id: "stings-and-scratches",
    name: "Nettles and brambles",
    note:
      "Stings and scratches live at child height. Walk the route first and point them out rather than fencing them off, so the children learn to see them.",
    months: [],
    habitats: ["garden", "meadow", "grassland", "hedgerow", "woodland"],
  },
  {
    id: "ticks",
    name: "Ticks",
    note:
      "Long grass and bracken carry ticks in the warm months. Trousers tucked into socks going in, a quick check of ankles and hairlines coming out.",
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    habitats: ["grassland", "meadow", "woodland", "hedgerow"],
  },
  {
    id: "water",
    name: "Deep or moving water",
    note:
      "Set the boundary before anyone moves: how close, and who goes with them. A pond edge holds thirty children only when the line was drawn first.",
    months: [],
    habitats: ["pond", "stream", "coast"],
  },
  {
    id: "berries-and-fungi",
    name: "Berries and fungi",
    note:
      "Nothing goes in a mouth. Say it once at the start, in those words, and again the moment anything is picked.",
    months: [],
    habitats: ["hedgerow", "woodland", "garden", "meadow"],
  },
  {
    id: "basking-snakes",
    name: "Snakes",
    note:
      "Warm open ground can hold a basking snake. Look where feet land, keep hands out of holes, and leave anything found exactly where it is.",
    months: [4, 5, 6, 7, 8, 9],
    habitats: ["grassland", "meadow", "coast"],
  },
  {
    id: "sun-and-heat",
    name: "Sun and heat",
    note:
      "Shade, water and hats before it feels urgent. On a hot day the lesson moves to the shade and the drinking happens on a rhythm, not on request.",
    months: [5, 6, 7, 8, 9],
    habitats: [],
  },
  {
    id: "cold-and-wet",
    name: "Cold and wet",
    note:
      "A cold child stops noticing anything. Coats done up before you leave, and one spare layer in your bag decides whether the lesson finishes.",
    months: [11, 12, 1, 2, 3],
    habitats: [],
  },
  {
    id: "wind-and-branches",
    name: "Wind and falling branches",
    note:
      "After a storm or in strong wind, look up before you gather under trees. Dead wood comes down without asking.",
    months: [],
    habitats: ["woodland", "hedgerow", "garden"],
  },
  {
    id: "thunder",
    name: "Thunder",
    note:
      "If you hear it, the lesson walks in. Open ground and lone trees are the two places not to be.",
    months: [],
    habitats: [],
  },
  {
    id: "slips-and-ground",
    name: "Slips and uneven ground",
    note:
      "Wet grass, mud and roots take feet out at running speed. Name the walking places and the running places before anyone moves.",
    months: [],
    habitats: [],
  },
  {
    id: "sharp-finds",
    name: "Sharp or man-made finds",
    note:
      "Glass, cans and anything sharp stay where they are. The rule is flag it, do not lift it — a child who finds something fetches you.",
    months: [],
    habitats: [],
  },
  {
    id: "stinging-insects",
    name: "Bees and wasps",
    note:
      "Still beats swatting: an insect that is waved at stings. Know your sting-allergy children before you leave the door.",
    months: [4, 5, 6, 7, 8, 9, 10],
    habitats: [],
  },
  {
    id: "field-water",
    name: "Field water",
    note:
      "Pond and stream water is for looking, never for drinking, and hands that were in it wash before anything is eaten.",
    months: [],
    habitats: ["pond", "stream", "coast"],
  },
  {
    id: "other-animals",
    name: "Dogs and other animals",
    note:
      "Shared ground is shared. Children stand still and call you rather than running from or towards any animal that is not theirs.",
    months: [],
    habitats: ["meadow", "grassland", "coast"],
  },
  {
    id: "boundaries",
    name: "Staying together",
    note:
      "Count going out, count coming back, and name the gather point before you leave. A boundary the children set with you is one they keep.",
    months: [],
    habitats: [],
  },
];

/**
 * The data-free safety copy that may travel in the public offline lesson
 * release. It deliberately projects away month and habitat selectors: those
 * selectors describe how an online, place-aware run narrows the starter set,
 * while the public core has no class, school, coordinates, or grounds profile
 * to evaluate them against. The field overlay carries the exact selected
 * `LessonHazards`; this list is the authored general fallback only.
 *
 * A fresh object is returned on every call so a browser consumer cannot mutate
 * the server module's authored constants.
 */
export function universalSafetyEntries(): HazardEntry[] {
  return UNIVERSAL_HAZARDS.map(({ id, name, note }) => ({ id, name, note }));
}

/**
 * Tier 2 — the regional library. Each entry names the species that carries
 * it, and ships only on a record receipt. The prefixes are genera unless one
 * species is the whole hazard. UK and US both covered; a region without the
 * species simply never matches, which is the point.
 */
const REGIONAL_HAZARDS: readonly RegionalHazard[] = [
  {
    id: "giant-hogweed",
    name: "Giant hogweed",
    note:
      "The sap burns skin in sunlight. Tall, white-flowered, often near water. Look together, never touch, and wash straight away if anyone does.",
    months: [4, 5, 6, 7, 8, 9],
    habitats: ["meadow", "grassland", "stream", "pond", "hedgerow"],
    species: ["Heracleum mantegazzianum", "Heracleum sosnowskyi"],
  },
  {
    id: "poison-ivy",
    name: "Poison ivy and poison oak",
    note:
      "Leaves of three, let it be — the oil blisters skin on contact. Long sleeves near the edges, and anything that touched it washes before it comes home.",
    months: [],
    habitats: ["woodland", "hedgerow", "meadow", "grassland", "garden"],
    species: ["Toxicodendron"],
  },
  {
    id: "adder",
    name: "Adders",
    note:
      "The adder is on the record for your area. It bites only when cornered: look where feet land on warm open ground, and any bite goes straight to hospital, calmly.",
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    habitats: ["grassland", "meadow", "coast", "woodland"],
    species: ["Vipera"],
    supersedes: "basking-snakes",
  },
  {
    id: "rattlesnakes",
    name: "Rattlesnakes",
    note:
      "Rattlesnakes are on the record for your area. Feet and hands stay out of anywhere eyes cannot see, and a rattle means everyone stands still, then backs away the way they came.",
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    habitats: ["grassland", "meadow", "coast", "woodland"],
    species: ["Crotalus", "Sistrurus"],
    supersedes: "basking-snakes",
  },
  {
    id: "pit-vipers",
    name: "Copperheads and cottonmouths",
    note:
      "Venomous snakes are on the record for your area. They hold still and trust their camouflage, so feet look before they land — near water especially.",
    months: [3, 4, 5, 6, 7, 8, 9, 10],
    habitats: ["woodland", "stream", "pond", "grassland"],
    species: ["Agkistrodon"],
    supersedes: "basking-snakes",
  },
  {
    id: "fire-ants",
    name: "Fire ants",
    note:
      "The mounds look like loose soil and the stings come in dozens. Teach the mound shape on the way out, and nobody sits or kneels without looking first.",
    months: [],
    habitats: ["grassland", "meadow", "garden"],
    species: ["Solenopsis invicta", "Solenopsis richteri"],
  },
  {
    id: "processionary",
    name: "Processionary caterpillars",
    note:
      "The nose-to-tail caterpillar lines and their silk nests carry hairs that burn skin and airways. Nobody touches the line, the nest, or the tree it is in.",
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    habitats: ["woodland", "hedgerow", "garden"],
    species: ["Thaumetopoea"],
  },
  {
    id: "widow-spiders",
    name: "Widow spiders",
    note:
      "They keep to dry, undisturbed corners — wood piles, stones, sheds. Hands do not reach where eyes have not looked, and lifting anything is a two-step: tip it away from you first.",
    months: [],
    habitats: ["garden", "grassland", "woodland"],
    species: ["Latrodectus"],
  },
  {
    id: "recluse-spiders",
    name: "Recluse spiders",
    note:
      "Dry sheltered corners and long-undisturbed piles are theirs. The wood-pile rule covers it: tip things away from you, and gloves if anything is being moved.",
    months: [],
    habitats: ["garden", "woodland"],
    species: ["Loxosceles"],
  },
  {
    id: "stinging-jellyfish",
    name: "Stinging jellyfish",
    note:
      "Washed-up jellyfish still sting. Look, draw, photograph — never touch, even the ones that look long dead.",
    months: [],
    habitats: ["coast"],
    species: ["Physalia", "Cyanea", "Chrysaora", "Pelagia noctiluca"],
  },
];

/** Turn a pack hazard id into a readable name without inventing words. */
function nameFromId(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The record species that puts `hazard` on the card, or null. */
function recordMatch(
  hazard: RegionalHazard,
  recordNames: readonly string[]
): string | null {
  for (const name of recordNames) {
    const fold = name.toLowerCase();
    for (const prefix of hazard.species) {
      const p = prefix.toLowerCase();
      // A genus prefix must match a whole word boundary: "Vipera" claims
      // "Vipera berus", never "Viperana sp." — half a genus is no receipt.
      if (fold === p || fold.startsWith(`${p} `)) return name;
    }
  }
  return null;
}

function inSeason(months: readonly number[], month: number): boolean {
  return months.length === 0 || months.includes(month);
}

function reachesHabitat(
  entryHabitats: readonly HabitatTag[],
  reachable: ReadonlySet<HabitatTag>
): boolean {
  return (
    entryHabitats.length === 0 ||
    entryHabitats.some((tag) => reachable.has(tag))
  );
}

/**
 * The hazards for this class, this month. Pure, deterministic, no I/O.
 *
 * `habitats` empty means she has not told us her grounds yet; only the
 * habitat-free entries travel then, because claiming a pond hazard for a
 * school that never mentioned water is a guess wearing a warning's clothes.
 *
 * `recordedSpecies` is the field-truth record near the school (nearby plus
 * historical, scientific names) — the same payload the species guards read.
 * Empty means no record reached us, and no regional entry ships: a regional
 * hazard without its receipt is a rumour.
 */
export function hazardsFor({
  pack,
  habitats,
  month,
  recordedSpecies = [],
}: {
  pack: BioregionPack;
  habitats: readonly HabitatTag[];
  month: number;
  recordedSpecies?: readonly (string | null | undefined)[];
}): LessonHazards | null {
  const reachable = new Set(habitats);
  // The record's own casing survives into the receipt; only the comparison
  // folds.
  const recordNames = recordedSpecies
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));

  // Tier 2 first, because a match can stand a universal entry down.
  const regional: HazardEntry[] = [];
  const superseded = new Set<string>();
  for (const hazard of REGIONAL_HAZARDS) {
    if (!inSeason(hazard.months, month)) continue;
    if (!reachesHabitat(hazard.habitats, reachable)) continue;
    const receipt = recordMatch(hazard, recordNames);
    if (!receipt) continue;
    const { id, name, note } = hazard;
    regional.push({ id, name, note, recordedAs: receipt });
    if (hazard.supersedes) superseded.add(hazard.supersedes);
  }

  // Tier 3: a pack that authors hazards answers for the place, and the
  // universal set stands down. Record receipts still ride along.
  if (pack.hazardVectors.length > 0) {
    const authored = pack.hazardVectors.map((vector) => ({
      id: vector.id,
      name: nameFromId(vector.id),
      note: vector.note,
    }));
    const authoredIds = new Set(authored.map((entry) => entry.id));
    return {
      entries: [
        ...authored,
        ...regional.filter((entry) => !authoredIds.has(entry.id)),
      ],
      source: "pack",
    };
  }

  // Tier 1: the universal core, minus anything a matched regional entry
  // answers more specifically.
  const universal = UNIVERSAL_HAZARDS.filter(
    (hazard) =>
      !superseded.has(hazard.id) &&
      inSeason(hazard.months, month) &&
      reachesHabitat(hazard.habitats, reachable)
  ).map(({ id, name, note }) => ({ id, name, note }));

  const entries = [...regional, ...universal];
  return entries.length > 0 ? { entries, source: "starter" } : null;
}
