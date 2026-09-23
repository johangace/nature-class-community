import { fetchFieldTruth } from "./pointmoon";

/**
 * Nearby species records for photograph paths: intake uses an allowlist;
 * in-run identification uses these as optional context and provenance (#1115).
 *
 * Reads Pointmoon's single observation pipeline (#379 — the seasonal read
 * this replaced was deleted with it): today's nearby sightings first, then
 * the producer-ranked historical tier from the same payload, deduplicated,
 * capped. No model is involved in deciding what is here, and no second
 * upstream request is made — both tiers travel in the one field-truth read
 * the rest of the product already pays for.
 *
 * Never throws. No coordinates, a thin read, or a failed read all resolve to
 * an empty list. This means no local-record claim is available; the
 * identifier can still recognise an organism from the photograph.
 */
/**
 * WHICH RECORD A NAME CAME FROM (#401).
 *
 * The two tiers are different claims about the world and they were being
 * flattened into one list, so a species Pointmoon has only ever seen in this
 * region across past seasons came back to a teacher captioned as a local
 * record. That is a false evidence claim even when the photograph is
 * identified correctly, on a surface she is holding in a field in front of
 * children — which is the one place in this product where the claim matters
 * more than the answer.
 *
 * - `recent`   — `observations.nearby`: recorded near this school inside
 *                Pointmoon's own observation window (`recentWindowDays`).
 * - `seasonal` — `observations.historical.nearby`: the producer-ranked
 *                multi-year seasonal tier. A regional, this-time-of-year
 *                claim, never a local-record one.
 *
 * A name in both tiers keeps `recent`: it is recorded near here now, and the
 * seasonal record does not weaken that.
 */
export type SpeciesEvidence = "recent" | "seasonal";

export interface AllowedSpecies {
  name: string;
  scientificName: string | null;
  evidence: SpeciesEvidence;
}

export interface SpeciesAllowlist {
  species: AllowedSpecies[];
  /**
   * How many days back the `recent` tier reaches, as the producer states it.
   * Null when it does not, and a null must leave the copy unbounded rather
   * than inviting a number of our own: the window is the one fact that makes
   * "recorded nearby" a claim rather than an impression.
   */
  recentWindowDays: number | null;
}

const MAX_ALLOWED = 40;

/**
 * A factory, not a shared constant: returning one object by reference from
 * three paths makes the no-records answer process-wide mutable state, and a
 * later `candidates.sort()` or `.push()` would poison every no-location and
 * every failed read after it in a warm instance.
 */
const empty = (): SpeciesAllowlist => ({ species: [], recentWindowDays: null });

export async function speciesAllowlistFor(
  lat: number | null | undefined,
  lng: number | null | undefined
): Promise<SpeciesAllowlist> {
  if (typeof lat !== "number" || typeof lng !== "number") return empty();
  try {
    const data = await fetchFieldTruth({ lat, lng });
    const observations = data?.facts?.fieldSnapshot?.observations;
    const seen = new Set<string>();
    const allowed: AllowedSpecies[] = [];

    const add = (
      evidence: SpeciesEvidence,
      name?: string | null,
      scientificName?: string | null
    ) => {
      const trimmed = name?.trim();
      if (!trimmed) return;
      const fold = trimmed.toLowerCase();
      if (seen.has(fold) || allowed.length >= MAX_ALLOWED) return;
      seen.add(fold);
      allowed.push({ name: trimmed, scientificName: scientificName?.trim() || null, evidence });
    };

    // Recent first, so the stronger claim wins the deduplication.
    for (const entry of observations?.nearby ?? []) {
      add("recent", entry.name, entry.scientificName);
    }
    for (const entry of observations?.historical?.nearby ?? []) {
      add("seasonal", entry.name, entry.scientificName);
    }
    const window = observations?.recentWindowDays;
    return {
      species: allowed,
      recentWindowDays: typeof window === "number" && window > 0 ? window : null,
    };
  } catch {
    return empty();
  }
}
