import type { BioregionPack } from "@/schema/bioregion";
import type { Pack, Session } from "@/schema/pack";

/**
 * The validity resolver: which sessions on the shelf are TRUE for this place.
 *
 * The test case, from office#330: "why leaves change" must not ship to Miami.
 * September is London's wind-down and Arizona's alive month, and a lesson that
 * sends children to look for something that does not happen where they live
 * teaches them that looking does not work.
 *
 * THE RULE THAT KEEPS THIS HONEST, AND IT IS THE WHOLE FILE:
 *
 *   AN EMPTY SLOT NEVER EXCLUDES ANYTHING.
 *
 * Wave 1 declares all 26 dimensions and fills none of them, so every real pack
 * today has an empty season ontology. A resolver that read "no seasons declared"
 * as "this place has no seasons" would empty the shelf for every school in the
 * product on the day it shipped. An unfilled slot is not evidence of absence —
 * that is the same discipline the silence profile runs on, applied to filtering
 * — so it yields `undetermined`, and undetermined SHIPS.
 *
 * The two states are kept apart in the verdict rather than collapsed into a
 * boolean, because "we checked and it is fine" and "we could not check" are
 * different facts about a lesson, and a surface that wants to say so later
 * needs them separate. Nothing renders them today (#208 is where absence gets
 * its render path); this layer only decides.
 */

/** Why a session is or is not admissible here. Never collapse this to a boolean. */
export type ValidityReason =
  /** Authored `universal: true`. True anywhere; nothing was consulted. */
  | "universal"
  /** The session states requirements and this pack meets them. */
  | "satisfied"
  /** Nothing to check against: no flags authored, or the pack's slots are empty. */
  | "undetermined"
  /** The pack declared its seasons and none of the required ones are among them. */
  | "season-absent"
  /** The pack declared its drivers and none of the required ones happen here. */
  | "driver-absent"
  /** The session names the countries it is true in, and this is not one of them. */
  | "country-absent";

export interface ValidityVerdict {
  admissible: boolean;
  reason: ValidityReason;
  /**
   * What the session asked for and this pack does not have. Empty unless the
   * verdict excluded. Carried so a later surface, or a content author looking
   * at a thin September, can say WHAT is missing rather than only that
   * something is.
   */
  missing: string[];
}

const ADMIT = (reason: ValidityReason): ValidityVerdict => ({
  admissible: true,
  reason,
  missing: [],
});

/**
 * Judge one session against one pack.
 *
 * A null pack means we do not know where this class is, which is the cold-URL
 * and demo path and a great deal of live traffic. It resolves `undetermined`
 * and admits: the alternative is a product that shows nothing until it knows
 * everything.
 */
export function sessionValidity(
  session: Session,
  pack: BioregionPack | null,
  /**
   * The country the class stands in, ISO 3166-1 alpha-2, or null when the
   * coordinates are unknown. Only `requiresCountry` reads it.
   */
  country: string | null = null
): ValidityVerdict {
  const validity = session.validity;

  // Authored as true anywhere. Checked first: a universal lesson does not need
  // a pack, and asking one about it would only invite a wrong answer.
  if (validity?.universal) return ADMIT("universal");

  // Nobody has judged this session. Not the same as judging it safe everywhere,
  // and the reason says so.
  if (
    !validity?.requiresSeason?.length &&
    !validity?.requiresDriver?.length &&
    !validity?.requiresCountry?.length
  ) {
    return ADMIT("undetermined");
  }

  // Country is judged before the pack, because it needs no pack: the answer
  // comes from the coordinates alone. An unknown country admits, the same
  // way an unfilled season slot does.
  const requiredCountries = validity.requiresCountry ?? [];
  if (requiredCountries.length > 0 && country && !requiredCountries.includes(country)) {
    return { admissible: false, reason: "country-absent", missing: [...requiredCountries] };
  }

  if (!pack) return ADMIT(requiredCountries.length > 0 && country ? "satisfied" : "undetermined");

  const seasons = pack.seasonOntology.seasons;
  const drivers = pack.seasonOntology.drivers;

  // Each requirement is checked ONLY against a slot the pack has actually
  // filled. A pack that named its drivers but not its seasons can answer the
  // driver question and must not be made to answer the other one.
  let checkedSomething = requiredCountries.length > 0 && Boolean(country);

  const required = validity.requiresSeason ?? [];
  if (required.length > 0 && seasons.length > 0) {
    checkedSomething = true;
    // Alternatives within a flag: any one is enough.
    if (!required.some((season) => seasons.includes(season))) {
      return { admissible: false, reason: "season-absent", missing: [...required] };
    }
  }

  const requiredDrivers = validity.requiresDriver ?? [];
  if (requiredDrivers.length > 0 && drivers.length > 0) {
    checkedSomething = true;
    if (!requiredDrivers.some((driver) => drivers.includes(driver))) {
      return { admissible: false, reason: "driver-absent", missing: [...requiredDrivers] };
    }
  }

  return ADMIT(checkedSomething ? "satisfied" : "undetermined");
}

/** The sessions of one pack that are true here, in their authored order. */
export function admissibleSessions(
  sessions: readonly Session[],
  pack: BioregionPack | null,
  country: string | null = null
): Session[] {
  return sessions.filter((session) => sessionValidity(session, pack, country).admissible);
}

/**
 * Filter a whole shelf. A curriculum pack whose every session was excluded is
 * DROPPED rather than shown empty — the same rule `shelfPacks()` already
 * applies to a mistyped `only` list, and for the same reason: a headed,
 * sessionless section in front of a teacher is worse than no section.
 *
 * What fills the hole a filtered-out lesson leaves is not this function's job
 * and is not wave 1's. Miami's September needs storm-adaptation and monsoon
 * green-up sessions written for it, and that is content authoring (#209-#215).
 * Excluding a false lesson is worth doing before the true one exists: the
 * shelf gets shorter and honest rather than longer and wrong.
 */
export function filterShelfByValidity(
  packs: readonly Pack[],
  bioregionPack: BioregionPack | null,
  country: string | null = null
): Pack[] {
  return packs
    .map((pack) => ({ ...pack, sessions: admissibleSessions(pack.sessions, bioregionPack, country) }))
    .filter((pack) => pack.sessions.length > 0);
}

/**
 * Every verdict for a pack's sessions, keyed by session id. For a report or a
 * test that wants to see the reasoning rather than only the survivors.
 */
export function validityReport(
  sessions: readonly Session[],
  pack: BioregionPack | null,
  country: string | null = null
): Record<string, ValidityVerdict> {
  const report: Record<string, ValidityVerdict> = {};
  for (const session of sessions) report[session.id] = sessionValidity(session, pack, country);
  return report;
}
