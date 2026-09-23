import {
  emptyLearnerContext,
  learnerContextSchema,
  type LearnerContext,
} from "@/schema/bioregion";
import { bandForYearGroup, resolveAbility } from "@/lib/ability";
import { abilityBands, type AbilityBand } from "@/schema/pack";

/**
 * The learner half of the bioregion boundary, built from a class row.
 *
 * Pointmoon owns world truth keyed by PLACE; Nature Class owns pedagogy keyed
 * by LEARNER (Johan, office#330). This is where a stored class becomes the
 * learner side of that intersection, so a surface asks one object "who is being
 * taught, under what rules" instead of reaching into columns and re-deriving
 * the same answer three different ways.
 *
 * Every slot it cannot honestly fill stays null. That is the wave-1 discipline
 * and not a shortcut: a declared-empty slot renders as silence, and silence is
 * a better answer than a plausible guess about a school we know nothing about.
 */

/**
 * The one derivation this file makes, and the only one it is entitled to.
 *
 * "Reception" / "Year 1" / "Year 2" are the exact words the class form offers
 * (app/start/vocab.ts) and they map one-to-one onto the ability bands the packs
 * already author variants for (schema/pack.ts). So when nobody has set a band,
 * deriving one from the year group is not a guess — it is reading the same
 * decision back out of the field it was already stored in, and it reproduces
 * today's behaviour exactly.
 *
 * Anything else returns null rather than a nearest match. A year group this
 * product does not serve is not a reception class, and answering "reception"
 * for it would hand a seven-year-old a four-year-old's lesson while looking
 * like a working default.
 */
export const deriveAbilityBand = bandForYearGroup;

/** True for a stored band this build knows how to render variants for. */
export function isAbilityBand(value: unknown): value is AbilityBand {
  return typeof value === "string" && (abilityBands as readonly string[]).includes(value);
}

/**
 * The class row's learner-relevant fields. Deliberately a structural type
 * rather than the Prisma model: this is called from server code, from tests
 * with plain fixtures, and from the cast resolver, and none of them should
 * need a database to build a learner context.
 */
export interface LearnerContextSource {
  yearGroup?: string | null;
  /** The stored column. When set it WINS over the year group — that is the axis. */
  abilityBand?: string | null;
  jurisdiction?: string | null;
  sessionShape?: string | null;
  /** The habitats the teacher says are out there. Dimension 7's first slice. */
  grounds?: readonly string[] | null;
}

/**
 * Build the learner context for a class.
 *
 * The precedence rule is the whole of J2: an EXPLICIT ability band always wins
 * over the one derived from the year group. Age and ability are orthogonal, so
 * a Year 2 class taught at reception band is a real and supportable state, and
 * the derived value exists only to answer for the rows that predate the column.
 *
 * jurisdiction and sessionShape are carried through verbatim or left null.
 * Neither is derived from anything, ever — see the migration for why.
 */
export function learnerContextForClass(source: LearnerContextSource): LearnerContext {
  const stored = typeof source.abilityBand === "string" ? source.abilityBand.trim() : "";
  const abilityBand = resolveAbility({ classBand: stored, yearGroup: source.yearGroup }).band;

  const grounds = (source.grounds ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );

  return learnerContextSchema.parse({
    ...emptyLearnerContext(),
    ageBand: typeof source.yearGroup === "string" && source.yearGroup.length > 0
      ? source.yearGroup
      : null,
    abilityBand: abilityBand && abilityBand.length > 0 ? abilityBand : null,
    jurisdiction:
      typeof source.jurisdiction === "string" && source.jurisdiction.length > 0
        ? source.jurisdiction
        : null,
    sessionShape:
      typeof source.sessionShape === "string" && source.sessionShape.length > 0
        ? source.sessionShape
        : null,
    // Dimension 7 is one onboarding object with several parts and only the
    // grounds list exists today. The rest of the site profile stays null rather
    // than being inferred from the grounds: a school with "trees" ticked has
    // not told us its substrate, its microclimate, or whether the lawn is
    // watered, and the watered lawn is the sneakiest lie surface in the set.
    siteProfile: grounds.length > 0 ? { ...emptySiteProfile(), grounds } : null,
  });
}

/** The site-profile shape with every part empty, so only `grounds` is filled. */
function emptySiteProfile() {
  return {
    grounds: [] as string[],
    microclimate: null,
    substrate: null,
    managedLandscapeOverride: null,
  };
}
