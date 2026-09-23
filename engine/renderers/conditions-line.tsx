import type { ReactElement } from "react";
import { z } from "zod";
import type { AbilityBand, conditionsLineSchema } from "@/schema/pack";
import { resolveText } from "@/lib/text";
import { BlockMark } from "@/engine/block-mark";

type ConditionsLine = z.infer<typeof conditionsLineSchema>;

/**
 * A line about the conditions the lesson was authored or prepared for.
 *
 * Child-facing words are frozen before a run starts. A client renderer must
 * never replace a sentence while a teacher is reading it aloud. The authored
 * fallback is therefore the whole render contract until a server-prepared,
 * provenance-carrying run packet can provide an equally frozen alternative.
 *
 * On the page it never stacks as a third element: the runner gives it the
 * note's position, or a page of its own.
 */

export function ConditionsLineBlock(props: {
  block: ConditionsLine;
  /** Absent when the class has no known band (#860): renders the base text. */
  ability: AbilityBand | undefined;
}): ReactElement {
  return (
    <div className="block block-conditions-line">
      <BlockMark kind={props.block.type} />
      <p className="conditions-text">
        {resolveText(props.block.fallbackText, props.block.abilityVariants, props.ability)}
      </p>
    </div>
  );
}
