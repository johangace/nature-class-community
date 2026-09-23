import type { ReactElement } from "react";
import type { AbilityBand, Block } from "@/schema/pack";
import { resolveText, spokenLine } from "@/lib/text";
import { KindIcon, kindCaption, type BlockKind } from "@/engine/icons";

/** The same glyph grammar as the runner, sized for the margin of an A4 page. */
function PrintTag({ kind }: { kind: BlockKind }): ReactElement {
  return (
    <span className="p-tag" role="img" aria-label={kindCaption[kind]}>
      <KindIcon kind={kind} size={14} />
    </span>
  );
}

/**
 * The print surface is nothing but a second renderer registry over the same
 * blocks, in their authored order. The shared phase layout handles the
 * A4 reading rhythm. Same data, different walk.
 *
 * The spoken kinds wrap their line in curly quotes here rather than hanging a
 * glyph, so they take the same unwrap as the screen (spokenLine): a line the
 * pack already carries inside quotes prints with one pair, not two.
 */

type BlockOf<K extends Block["type"]> = Extract<Block, { type: K }>;

type PrintRenderer<K extends Block["type"]> = (
  block: BlockOf<K>,
  ability: AbilityBand | undefined
) => ReactElement;

const printRegistry: { [K in Block["type"]]: PrintRenderer<K> } = {
  "say-aloud": (b, a) => (
    <p className="p-say">
      <PrintTag kind="say-aloud" />{" "}
      {`“${spokenLine(resolveText(b.text, b.abilityVariants, a))}”`}
    </p>
  ),
  "teacher-note": (b, a) => (
    <p className="p-note">
      <PrintTag kind="teacher-note" /> {resolveText(b.text, b.abilityVariants, a)}
    </p>
  ),
  demo: (b) => (
    <div className="p-demo">
      <p><b>{b.move}</b></p>
      <ol>{b.steps.map((step, index) => <li key={index}>{step.text}</li>)}</ol>
      {b.look && <p>{b.look}</p>}
      {b.materials.length > 0 && <p className="p-note">With {b.materials.join(", ")}</p>}
    </div>
  ),
  "conditions-line": (b, a) => (
    <p className="p-conditions">
      <PrintTag kind="conditions-line" />{" "}
      {resolveText(b.fallbackText, b.abilityVariants, a)}
    </p>
  ),
  "circle-question": (b, a) => (
    <p className="p-say">
      <PrintTag kind="circle-question" />{" "}
      {`“${spokenLine(resolveText(b.text, b.abilityVariants, a))}”`}
    </p>
  ),
  "named-skill": (b, a) => (
    <p className="p-skill">
      <PrintTag kind="named-skill" /> {resolveText(b.skill, b.abilityVariants, a)}
    </p>
  ),
};

export function renderPrintBlock(block: Block, ability: AbilityBand | undefined): ReactElement {
  const render = printRegistry[block.type] as (
    block: Block,
    ability: AbilityBand | undefined
  ) => ReactElement;
  return render(block, ability);
}
