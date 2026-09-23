import type { HabitatTag } from "./types";

/**
 * The onboarding flow offers a short, universal grounds vocabulary (screen 5):
 * trees · meadow · hedgerow · pond · playground · coast. Those are the words a
 * teacher reads. The nature layer speaks in HabitatTags. This is the honest
 * bridge between the two — one ground can open more than one habitat's
 * look-fors (trees means woodland; a playground is an urban playing field).
 * A ground with no habitat mapping simply contributes nothing, never invents.
 */
export type Ground = "trees" | "meadow" | "hedgerow" | "pond" | "playground" | "coast";

const GROUND_TO_HABITATS: Record<Ground, HabitatTag[]> = {
  trees: ["woodland"],
  meadow: ["meadow", "grassland"],
  hedgerow: ["hedgerow"],
  pond: ["pond", "stream"],
  playground: ["playing_field", "urban"],
  coast: ["coast"],
};

/**
 * The runtime twin of `HabitatTag`, and the reason it cannot drift from it.
 *
 * Written as a `Record<HabitatTag, true>` rather than an array on purpose: add
 * a tag to the type and this stops compiling until it is added here too. The
 * audit found several places in this codebase where a union and its runtime
 * list are kept in step by hand, and each one is a quiet trap. This is the
 * same shape without the trap.
 */
const HABITAT_TAG_SET: Record<HabitatTag, true> = {
  pond: true,
  stream: true,
  woodland: true,
  hedgerow: true,
  grassland: true,
  meadow: true,
  urban: true,
  coast: true,
  garden: true,
  playing_field: true,
  wall_fence: true,
};

/**
 * Narrow arbitrary strings to the tags the phenology corpus actually uses.
 *
 * The teacher's reachable habitats arrive as plain strings, merged from her
 * grounds and her site features. Filtering rather than casting means a value
 * we stop recognising drops out quietly instead of reaching the phenology
 * filter and silently matching nothing, which would look like a school with
 * no wildlife rather than like the bug it is.
 */
export function asHabitatTags(values: readonly string[]): HabitatTag[] {
  return values.filter((v): v is HabitatTag => v in HABITAT_TAG_SET);
}

/** Turn the teacher's chosen grounds into the habitat tags Outside-now reads. */
export function groundsToHabitats(grounds: readonly string[]): HabitatTag[] {
  const tags = new Set<HabitatTag>();
  for (const g of grounds) {
    const mapped = GROUND_TO_HABITATS[g as Ground];
    if (mapped) for (const t of mapped) tags.add(t);
  }
  return [...tags];
}
