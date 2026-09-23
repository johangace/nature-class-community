export const GROUP_TYPES = ["school", "family", "other"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];
export const GROUP_OPTIONS = [
  { value: "school", label: "School", defaultName: "My class", placeholder: "e.g. Year 4" },
  { value: "family", label: "My family", defaultName: "My family", placeholder: "e.g. The Smith family" },
  { value: "other", label: "Other group", defaultName: "My group", placeholder: "e.g. Saturday nature club" },
] as const;
export const AGE_RANGES = ["4–6", "7–9", "10–12", "13+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

/**
 * The three words the product uses for the people in front of her. One
 * definition, because the word now travels further than the copy that reads
 * it: the runner's context (#1214), the prepared field envelope (#1266) and
 * that envelope's own zod schema all resolve their union here.
 */
export const GROUP_NOUNS = ["class", "family", "group"] as const;
export type GroupNoun = (typeof GROUP_NOUNS)[number];

/** Missing audience means an existing school record, not an inferred family. */
export function groupNoun(type?: string | null): GroupNoun {
  return type === "family" ? "family" : type === "other" ? "group" : "class";
}

export function isNonSchoolGroup(type?: string | null): boolean {
  return type === "family" || type === "other";
}
