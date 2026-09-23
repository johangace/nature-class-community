import { sessionSchema, type Session, type Phase, type Block, type ChildSheetBlock } from "@/schema/pack";

/** Public v1 content fields. Adding an authoring field does not publish it. */
const sessionFields = [
  "id", "title", "prompt", "doorQuestion", "doorQuestions", "topicLine", "seasonNote",
  "topic", "topicTags", "primaryTopic", "labels", "validity", "objective",
  "childWorkSummary", "namedSkill", "kit", "durationMin", "preparation", "conditionNotes",
  "materialFallback", "spaceNeeded", "spaceNeededVariants", "connectionToLast", "settle",
  "primer", "openingPictures", "phases", "childSheet", "sheetTemplate", "standards", "celebration",
] as const satisfies readonly (keyof Session)[];
const phaseFields = [
  "key", "title", "mode", "materialPurpose", "childTask", "durationMin", "stretch",
  "blocks", "tips", "conditionVariants", "pictures",
] as const satisfies readonly (keyof Phase)[];
// A schema addition must be classified here before it can silently disappear
// from the public release. Runtime-only authoring metadata is still excluded.
type AllFieldsClassified<T extends never> = T;
type SessionFieldCoverage = AllFieldsClassified<
  Exclude<keyof Session, typeof sessionFields[number] | "nodeSeq" | "authorNotes">
>;
type PhaseFieldCoverage = AllFieldsClassified<
  Exclude<keyof Phase, typeof phaseFields[number] | "nid" | "authorNotes">
>;

const common = ["type", "abilityVariants", "habitatVariants", "adaptsToPlace"] as const;
const blockFields = {
  "say-aloud": [...common, "text"],
  "teacher-note": [...common, "text"],
  demo: [...common, "move", "steps", "look", "materials"],
  "conditions-line": [...common, "fallbackText"],
  "circle-question": [...common, "text"],
  "named-skill": [...common, "skill"],
  "sheet-title": [...common, "title", "place", "nameLine"],
  "collage-zone": [...common, "hint"],
  "match-strip": [...common, "prompt", "cards"],
  "notice-line": [...common, "prompt"],
  "parent-line": [...common, "text", "url"],
} as const satisfies Record<Block["type"] | ChildSheetBlock["type"], readonly string[]>;

export type CoreFieldObserver = (source: object, field: string, value: unknown) => void;
const structuralFields = new Set(["phases", "childSheet", "blocks", "tips", "conditionVariants"]);
function pick(value: object, keys: readonly string[], observer?: CoreFieldObserver): Record<string, unknown> {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) continue;
    const input = (value as Record<string, unknown>)[key];
    if (structuralFields.has(key) && Array.isArray(input)) observer?.(value, `${key}.$order`, input.map((v, i) => v?.nid ?? i));
    else observer?.(value, key, input);
  }
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key))
    .map(key => [key, structuredClone((value as Record<string, unknown>)[key])]));
}
function block(value: Block | ChildSheetBlock, observer?: CoreFieldObserver): Record<string, unknown> {
  const keys = blockFields[value.type];
  if (!keys) throw new Error(`Unreleased core block kind: ${value.type}`);
  return pick(value, keys, observer);
}
function phase(value: Phase, observer?: CoreFieldObserver): Record<string, unknown> {
  const result = pick(value, phaseFields, observer);
  result.blocks = value.blocks.map(value => block(value, observer));
  if (value.tips) result.tips = value.tips.map(tip => pick(tip, ["when", "then"], observer));
  if (value.conditionVariants) result.conditionVariants = value.conditionVariants.map(variant => {
    observer?.(variant, "when", variant.when);
    return {when: variant.when, phase: phase(variant.phase, observer)};
  });
  return result;
}

/** Project before hashing and publishing, retaining all v1 teaching content. */
export function projectCoreSessionV1(value: Session, observer?: CoreFieldObserver): Session {
  const result = pick(value, sessionFields, observer);
  result.phases = value.phases.map(value => phase(value, observer));
  result.childSheet = value.childSheet.map(value => block(value, observer));
  return sessionSchema.parse(result);
}
