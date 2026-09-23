import { abilityBands, type AbilityBand } from "@/schema/pack";
import type { Locale } from "@/lib/localization";

/** The band's name in a teacher's own words, not the schema's. */
export const abilityLabels: Record<AbilityBand, string> = {
  reception: "Reception",
  y1: "Year 1",
  y2: "Year 2",
};

const US_ABILITY_LABELS: Readonly<Record<AbilityBand, string>> = {
  reception: "Pre-K",
  y1: "Kindergarten",
  y2: "Grade 1",
};

/** The teacher-facing label for one authored ability identity. */
export function abilityLabel(band: AbilityBand, locale: Locale): string {
  return locale === "us" ? US_ABILITY_LABELS[band] : abilityLabels[band];
}

/**
 * Keep the existing canonical value while changing only the label a teacher
 * reads. There is still one stored level and one set of authored variants.
 */
export function abilityOptions(locale: Locale) {
  return abilityBands.map((band) => ({
    band,
    value: abilityLabels[band],
    label: abilityLabel(band, locale),
  }));
}

/**
 * What the shelf is actually written for, said where the ladder is picked
 * (#873). A reviewer asked for grades beyond Grade 1; the picker stops
 * where the authored sessions stop, ages 4 to 6, and a teacher of older
 * children should read that on the spot rather than find it in a lesson.
 * In grade names only: the picker never advertises an age (the 08-31
 * teacher ruling, pinned in app-shell-brand.spec). When the shelf grows,
 * this sentence follows `abilityBands`.
 */
export function shelfRangeLine(locale: Locale): string {
  const first = abilityLabel(abilityBands[0]!, locale);
  const last = abilityLabel(abilityBands[abilityBands.length - 1]!, locale);
  return `Lessons are written for ${first} to ${last}.`;
}

function isBand(value: unknown): value is AbilityBand {
  return abilityBands.includes(value as AbilityBand);
}

/** A stored band, or null when nothing usable is stored. */
export function parseBand(raw: string | null | undefined): AbilityBand | null {
  return isBand(raw) ? raw : null;
}

/**
 * The band a class's year group means. Unknown spellings return null rather
 * than guessing: a school that types "Kindergarten" gets the default, not
 * Reception wording asserted about a class we cannot place.
 */
export function bandForYearGroup(
  yearGroup: string | null | undefined
): AbilityBand | null {
  if (typeof yearGroup !== "string") return null;
  const normalised = yearGroup.trim().toLowerCase();
  for (const band of abilityBands) {
    if (abilityLabels[band].toLowerCase() === normalised) return band;
  }
  return null;
}

/** One precedence rule for every lesson surface. No device state participates. */
export function resolveAbility(input: {
  preparationBand?: string | null;
  classBand?: string | null;
  yearGroup?: string | null;
} = {}): {
  band: AbilityBand | null;
  resolvedBy: "preparation" | "class" | "year-group" | "base";
} {
  const preparation = parseBand(input.preparationBand);
  if (preparation) return { band: preparation, resolvedBy: "preparation" };
  const stored = parseBand(input.classBand);
  if (stored) return { band: stored, resolvedBy: "class" };
  const derived = bandForYearGroup(input.yearGroup);
  return derived
    ? { band: derived, resolvedBy: "year-group" }
    : { band: null, resolvedBy: "base" };
}
