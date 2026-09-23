import type { ReactElement } from "react";
import { z } from "zod";
import type { demoSchema } from "@/schema/pack";
import { DemoMark } from "@/engine/demo-marks";

type Demo = z.infer<typeof demoSchema>;

/**
 * Something the teacher shows with their hands (#252).
 *
 * This used to render as one prose line in the spoken hero's face, on the
 * spoken hero's plate, told apart from a line she reads to the class only by
 * the ABSENCE of a quotation mark. Johan, on a live screenshot: "what is this
 * anyways? looks misleading". He was right, and the mechanism was worse than
 * the symptom: `.demo-plate` was filled with `var(--plate-spoken)`, the spoken
 * plate's own token, at 40px against the hero's 41.7px. By every channel that
 * survives glare and distance the two blocks WERE the same block.
 *
 * The fix cannot work by contrast, because the teacher never sees the two
 * registers side by side — `groupViews` puts a demo and its say-aloud in
 * consecutive views, so she only ever holds one. The block has to declare
 * itself alone. A numbered list does that with no neighbour to compare against;
 * a missing glyph never could.
 *
 * No block mark here. Round one uncovered the old hand glyph, which was being
 * drawn at left:0 inside the plate's own tinted corner in the same pigment as
 * the tint. Round two deleted it instead: once every step carries a picture, a
 * picture for the whole block says the same word twice.
 *
 * The numerals disappear at a single step. Nothing in the authored corpus lands
 * on one beat, but three are borderline compounds an author could reasonably
 * write as one, and a list of one item reads as a fragment of a longer list
 * that failed to load.
 */
export function DemoBlock(props: { block: Demo }): ReactElement {
  const { move, steps, look, materials } = props.block;
  const numbered = steps.length > 1;

  return (
    <div className="block block-demo">
      <p className="demo-move">{move}</p>
      <ol className={`demo-steps${numbered ? "" : " demo-steps-single"}`}>
        {steps.map((step, index) => (
          <li key={`${step.text}:${index}`}>
            {numbered && <span className="demo-num">{index + 1}</span>}
            <span className="demo-mk">
              <DemoMark id={step.mark} />
            </span>
            <p className="demo-st">{step.text}</p>
          </li>
        ))}
      </ol>
      {look && (
        <p className="demo-look">
          <span className="demo-mk">
            <DemoMark id="m-look" />
          </span>
          <span className="demo-st">{look}</span>
        </p>
      )}
      {materials.length > 0 && (
        <p className="demo-materials">with {materials.join(" · ")}</p>
      )}
    </div>
  );
}
