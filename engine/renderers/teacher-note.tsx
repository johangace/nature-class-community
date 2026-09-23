import type { ReactElement } from "react";
import { z } from "zod";
import type { AbilityBand, teacherNoteSchema } from "@/schema/pack";
import { resolveText } from "@/lib/text";
import { BlockMark } from "@/engine/block-mark";
import { GlossedNote, GlossedText } from "@/app/run/Glossary";

type TeacherNote = z.infer<typeof teacherNoteSchema>;

/**
 * For the teacher's eyes only — the stage direction beside the spoken line.
 * No card, no fill, no plate. It is a paragraph with its own left edge and its
 * own size, and that is the whole mechanism: the spoken line starts flush at
 * zero with its quotation mark hung into the margin, this insets, and the two
 * never share a left edge, so they separate before the words resolve.
 *
 * The words are PLAIN INK and deliberately large. Colour used to carry this
 * distinction and could not: measured, the teacher brown held only 1.58:1
 * against the spoken ink, hue is the first thing glare takes, and both render
 * the same grey on a staffroom photocopier. Size and left edge survive all
 * three. Johan ruled the brown out on 16 August; see globals.css
 * `.teacher-note-text` for the measurements.
 *
 * This is the line she reads under the most pressure, with a class already
 * moving, so it is not allowed to be the quieter of the two.
 *
 * It is also the half of the page she reads to HERSELF, which is why the
 * session's glossary words are made live here and nowhere else in the runner
 * (#350). A word she looked up at a desk last night is tappable in the moment
 * she needs it. Sessions without a glossary render exactly as before.
 */
export function TeacherNoteBlock(props: {
  block: TeacherNote;
  /** Absent when the class has no known band (#860): renders the base text. */
  ability: AbilityBand | undefined;
}): ReactElement {
  return (
    <div className="block block-teacher-note">
      <BlockMark kind={props.block.type} />
      <GlossedNote className="teacher-note-text">
        <GlossedText>
          {resolveText(props.block.text, props.block.abilityVariants, props.ability)}
        </GlossedText>
      </GlossedNote>
    </div>
  );
}
