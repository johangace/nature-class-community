import type { ReactElement } from "react";
import { z } from "zod";
import type { AbilityBand, namedSkillSchema } from "@/schema/pack";
import { resolveText } from "@/lib/text";
import { BlockMark } from "@/engine/block-mark";

type NamedSkill = z.infer<typeof namedSkillSchema>;

/**
 * The skill this session grows, named out loud so it sticks.
 *
 * It used to borrow the spoken line's oversized quotation mark, and that was
 * wrong in a way only visible once the marks were closed: the glyph lives in
 * `.voice-quoted` but the closer belongs to `.say-aloud-text`, and this block
 * renders `.named-skill-text`. So it opened a quotation it never closed — an
 * opening mark around `greeting and returning` with nothing after it.
 *
 * Closing it would have been the wrong repair. A skill name is not a line she
 * says to the class; it is the name of the thing the lesson grows. Quotation
 * marks now mean exactly one thing on this surface — these are the words you
 * say out loud — and that meaning only holds if nothing else wears them.
 */
export function NamedSkillBlock(props: {
  block: NamedSkill;
  /** Absent when the class has no known band (#860): renders the base text. */
  ability: AbilityBand | undefined;
}): ReactElement {
  return (
    <div className="block block-named-skill">
      <BlockMark kind={props.block.type} />
      <p className="named-skill-text">
        {resolveText(props.block.skill, props.block.abilityVariants, props.ability)}
      </p>
    </div>
  );
}
