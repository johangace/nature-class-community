/**
 * Child safety for the cast — which species need look-don't-touch framing, and
 * which should not be put in front of the youngest year groups at all.
 *
 * Johan, 2026-08-11, from the live card: an Oriental Hornet on a reception
 * class's card needs handling. So safety is part of the selection recipe, not a
 * label bolted on after.
 *
 * THE LIST IS DELIBERATELY SMALL. It matches on scientific name at genus or
 * family level, because that is the level at which "this can sting" is actually
 * true — Vespa is hornets everywhere in the world, and a list of individual
 * species would be both endless and wrong the moment a class is somewhere the
 * author was not thinking about. Every entry names a real, common, and
 * genuinely consequential hazard for a child outdoors. Anything speculative is
 * left off: a list that flags everything teaches a teacher to ignore it.
 *
 * It is conservative in the direction that costs least. A species we cannot
 * match is treated as ordinary, because the alternative — guessing danger from
 * a name — would put a warning on a harmless hoverfly whose common name happens
 * to contain the word "hornet" (Volucella zonaria, the hornet mimic hoverfly,
 * is in the real London payload and is entirely harmless). Matching on
 * scientific name rather than common name is what prevents exactly that.
 *
 * The phrasing is observation, never alarm: what to do, not what to fear. A
 * child who is told to look and not touch has been given a way to stay near
 * the thing. That is the register the whole product speaks in.
 */

/** What the cast should do with a species that carries a hazard. */
export type SafetyHandling =
  /** Show it, with the note. The ordinary case for a stinging insect. */
  | "note"
  /** Keep it off the cast for the youngest year groups. */
  | "exclude-youngest";

interface SafetyRule {
  /**
   * Matched case-insensitively against the START of the scientific name, so a
   * genus entry ("Vespa ") covers every species in it. The trailing space is
   * load-bearing: "Vespa " must not match "Vespula" (the common wasps, which
   * have their own entry) and must never match a longer unrelated genus.
   */
  prefix: string;
  handling: SafetyHandling;
  /** The teacher-facing line, in the observation register. */
  note: string;
}

/**
 * Year groups this product serves, youngest first. "exclude-youngest" means
 * reception: a four-year-old and a seven-year-old are not the same reader.
 */
const YOUNGEST_YEAR_GROUPS = new Set(["Reception"]);

const RULES: readonly SafetyRule[] = [
  // Hornets. The loudest case, and the one that started this.
  {
    prefix: "Vespa ",
    handling: "exclude-youngest",
    note: "A hornet. Worth watching from a few steps back, and never worth touching.",
  },
  // Wasps and yellowjackets.
  {
    prefix: "Vespula ",
    handling: "note",
    note: "A wasp. Look, and let it get on with its day. It stings if it is handled.",
  },
  {
    prefix: "Dolichovespula ",
    handling: "note",
    note: "A wasp. Look, and let it get on with its day. It stings if it is handled.",
  },
  // Honey bees and bumblebees: a sting, but a calm animal. Worth meeting.
  {
    prefix: "Apis ",
    handling: "note",
    note: "A honey bee, busy and not interested in us. Watch it work, hands away.",
  },
  {
    prefix: "Bombus ",
    handling: "note",
    note: "A bumblebee, gentle and slow. Lovely to watch closely, still not one to hold.",
  },
  // Stinging plants and the berries a child might put in a mouth.
  {
    prefix: "Urtica ",
    handling: "note",
    note: "A nettle. It stings on contact, so this one is for eyes only.",
  },
  {
    prefix: "Heracleum mantegazzianum",
    handling: "exclude-youngest",
    note: "Giant hogweed. Its sap burns skin in sunlight. Keep well clear and tell an adult.",
  },
  {
    prefix: "Atropa ",
    handling: "exclude-youngest",
    note: "Deadly nightshade. The berries are poisonous. Nothing here goes near a mouth.",
  },
  {
    prefix: "Taxus ",
    handling: "note",
    note: "A yew. Its red berries are poisonous to eat, so this is a looking tree.",
  },
  {
    prefix: "Ilex ",
    handling: "note",
    note: "A holly. Prickly leaves, and berries that are not for eating.",
  },
  // Spiders and scorpions with a bite worth respecting.
  {
    prefix: "Latrodectus ",
    handling: "exclude-youngest",
    note: "A widow spider. A real bite, so this is a look-only from a distance.",
  },
  {
    prefix: "Loxosceles ",
    handling: "exclude-youngest",
    note: "A recluse spider. A real bite, so this is a look-only from a distance.",
  },
  {
    prefix: "Centruroides ",
    handling: "exclude-youngest",
    note: "A scorpion. Worth knowing lives here, and worth leaving entirely alone.",
  },
  // Desert plants a child in an arid school will genuinely meet.
  {
    prefix: "Cylindropuntia ",
    handling: "note",
    note: "A cholla cactus. Its spines catch easily, so this one is admired from a step back.",
  },
  {
    prefix: "Opuntia ",
    handling: "note",
    note: "A prickly pear. Fine spines as well as big ones, so hands stay away.",
  },
];

export interface SafetyVerdict {
  /** The look-don't-touch line, when the species carries one. */
  note: string;
  handling: SafetyHandling;
}

/**
 * The safety verdict for a species, matched on SCIENTIFIC name only.
 *
 * Returns null for the ordinary majority, which is most of every payload. A
 * species with no scientific name cannot be matched and is treated as ordinary:
 * inventing a hazard from a common name is the failure mode this avoids.
 */
export function safetyFor(scientificName?: string | null): SafetyVerdict | null {
  if (typeof scientificName !== "string") return null;
  const name = scientificName.trim().toLowerCase();
  if (name.length === 0) return null;

  for (const rule of RULES) {
    if (name.startsWith(rule.prefix.toLowerCase())) {
      return { note: rule.note, handling: rule.handling };
    }
  }
  return null;
}

/** True when this year group is one the "exclude-youngest" rule protects. */
export function isYoungestYearGroup(yearGroup?: string | null): boolean {
  return typeof yearGroup === "string" && YOUNGEST_YEAR_GROUPS.has(yearGroup.trim());
}

/**
 * The same protection, asked of the ABILITY band instead of the year group.
 *
 * J2 (adopted, office#330): age and ability are orthogonal axes. The exclusion
 * this gate drives is about who is reading, not about how old they are — a
 * Year 2 class taught at reception band should be protected from a hornet the
 * same way a reception class is, and today it is not, because the only thing
 * the resolver can ask is what year they are in.
 *
 * The bands are the pack's own vocabulary (schema/pack.ts), which is what the
 * year groups already map one-to-one onto, so for every class that has not set
 * a band explicitly this answers exactly what `isYoungestYearGroup` answers.
 * The behaviour only diverges where a teacher has deliberately said the two
 * axes differ, which is the point of having two axes.
 */
const YOUNGEST_ABILITY_BANDS = new Set(["reception"]);

export function isYoungestAbility(abilityBand?: string | null): boolean {
  return typeof abilityBand === "string" && YOUNGEST_ABILITY_BANDS.has(abilityBand.trim());
}
