import type { ReactElement } from "react";
import { z } from "zod";
import type { AbilityBand, sayAloudSchema } from "@/schema/pack";
import { resolveText, spokenLine } from "@/lib/text";

type SayAloud = z.infer<typeof sayAloudSchema>;

/**
 * The words the teacher speaks: the hero of the page, and the largest thing in
 * the PRODUCT — nothing anywhere is allowed to outrank it.
 *
 * It wears NO mark of its own beyond its quotation marks, and that is the
 * whole idea. The quotes are unique on the page, they open and close so a
 * teacher can see where the line ends when she looks up mid-sentence, they
 * measure 6.28:1 in daylight and 1.75:1 under glare, and they survive a
 * staffroom photocopier where hue does not. A glyph as well would be saying
 * the same thing twice, and a caption reading "say aloud" was a label doing a
 * job that punctuation does better and cannot be read to the class by mistake.
 *
 * The quotation mark is this surface's, so a line already authored inside
 * quotes is unwrapped for display (see spokenLine) rather than shown wearing
 * both. The author's line breaks are phrasing and survive intact.
 */
export function SayAloudBlock(props: {
  block: SayAloud;
  /** Absent when the class has no known band (#860): renders the base text. */
  ability: AbilityBand | undefined;
}): ReactElement {
  return (
    <div className="block block-say-aloud">
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
