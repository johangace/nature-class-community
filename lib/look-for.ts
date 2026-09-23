/**
 * The FACTS a place-bearing instruction is written from (#266).
 *
 * ── THIS FILE USED TO COMPOSE THE SENTENCE. IT NO LONGER DOES. ─────────────
 *
 * The first version replaced six hardcoded climate sentences with thirteen
 * hardcoded habitat fragments and a joiner that picked three and glued them
 * together. Better, but still a fixed vocabulary: there was no fourteenth
 * sentence it could produce, so a school whose situation nobody anticipated
 * got the nearest phrase somebody happened to type.
 *
 * Johan, 2026-08-17: *"each context lesson place needs to pass by ai"*, *"no
 * deterministic machine!"*
 *
 * So the sentence is written by the model now (lib/ai/place-instruction.ts),
 * and what survives here is the half that must NOT be a model's: working out
 * what is actually true about this school. office#330's rule, both halves —
 * the config grounds, the model beautifies.
 */

export interface LookForContext {
  /**
   * Habitats this week's regional phenology actually puts life in, commonest
   * first. Empty when the week is thin, and then there is nothing to adapt to.
   */
  aliveIn: readonly string[];
  /**
   * Habitats this class can actually reach: their grounds, plus the features
   * inside the fence they told us about (#277).
   */
  reachable: readonly string[];
}

/**
 * The habitats a class can reach, from what they have told us.
 *
 * Their grounds (the six-word onboarding vocabulary, mapped to habitat tags
 * elsewhere) plus the features inside the fence. A log pile is woodland for
 * this purpose even in a tarmac yard, which is exactly the kind of thing no
 * map and no climate group could ever know.
 */
const FEATURE_HABITATS: Readonly<Record<string, readonly string[]>> = {
  "a pond": ["pond", "stream"],
  "a vegetable garden": ["garden"],
  "raised beds": ["garden"],
  "a log pile": ["woodland"],
  "a bug hotel": ["woodland", "garden"],
  "bird feeders": ["garden", "urban"],
  "a compost heap": ["garden"],
  "a wild corner nobody mows": ["meadow", "grassland"],
  "old walls": ["wall_fence"],
  "one big tree": ["woodland"],
  "a bit that floods in winter": ["pond"],
};

export function habitatsFromFeatures(features: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const feature of features) {
    for (const tag of FEATURE_HABITATS[feature] ?? []) tags.add(tag);
  }
  return [...tags];
}
