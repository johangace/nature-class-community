import type { ReactElement } from "react";
import { z } from "zod";
import type { AbilityBand, circleQuestionSchema } from "@/schema/pack";
import { resolveText, spokenLine } from "@/lib/text";
import { BlockMark } from "@/engine/block-mark";

type CircleQuestion = z.infer<typeof circleQuestionSchema>;

/**
 * The question the circle gathers around. Spoken, so it renders as the
 * Fredoka hero on the green plate and carries the same oversized leaf-green
 * quotation mark as say-aloud — circle questions are said out loud too, and
 * an authored wrapping quote is unwrapped for the same reason (spokenLine).
 */
export function CircleQuestionBlock(props: {
  block: CircleQuestion;
  /** Absent when the class has no known band (#860): renders the base text. */
  ability: AbilityBand | undefined;
}): ReactElement {
  return (
    <div className="block block-circle-question">
      <BlockMark kind={props.block.type} />
      <div className="voice-quoted">
        <span className="quote-glyph" aria-hidden="true">
          &ldquo;
        </span>
        <p className="say-aloud-text">
          {spokenLine(
            resolveText(props.block.text, props.block.abilityVariants, props.ability)
          )}
        </p>
      </div>
    </div>
  );
}
