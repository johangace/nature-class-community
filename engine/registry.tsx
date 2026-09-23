import type { ReactElement } from "react";
import type { AbilityBand, Block } from "@/schema/pack";
import { SayAloudBlock } from "./renderers/say-aloud";
import { TeacherNoteBlock } from "./renderers/teacher-note";
import { DemoBlock } from "./renderers/demo";
import { ConditionsLineBlock } from "./renderers/conditions-line";
import { CircleQuestionBlock } from "./renderers/circle-question";
import { NamedSkillBlock } from "./renderers/named-skill";

/**
 * The engine: a renderer registry keyed on block type.
 *
 * The runtime walks a phase's blocks and looks each one up here. A new
 * interaction is one schema entry plus one renderer file registered below —
 * nothing else in the app changes.
 */

type BlockOf<K extends Block["type"]> = Extract<Block, { type: K }>;

/**
 * A BAND IS SOMETHING A SURFACE MAY NOT HAVE (#860). A class can be signed out
 * or carry a year group the app does not recognise, and the honest value to
 * hand a renderer then is `undefined` — "no variant" — which `resolveText`
 * answers with the text as written. Every renderer takes it, so no surface has
 * to invent a band to satisfy a type.
 */
type Renderer<K extends Block["type"]> = (props: {
  block: BlockOf<K>;
  ability: AbilityBand | undefined;
}) => ReactElement;

const registry: { [K in Block["type"]]: Renderer<K> } = {
  "say-aloud": SayAloudBlock,
  "teacher-note": TeacherNoteBlock,
  demo: DemoBlock,
  "conditions-line": ConditionsLineBlock,
  "circle-question": CircleQuestionBlock,
  "named-skill": NamedSkillBlock,
};

export function renderBlock(
  block: Block,
  ability: AbilityBand | undefined
): ReactElement {
  // The mapped type above guarantees each key's renderer takes exactly that
  // key's block; the lookup erases the correspondence, so re-assert it here.
  const Renderer = registry[block.type] as (props: {
    block: Block;
    ability: AbilityBand | undefined;
  }) => ReactElement;
  return <Renderer block={block} ability={ability} />;
}
