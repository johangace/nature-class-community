import React from "react";
import { Wordmark } from "@/app/Wordmark";
import { renderSheetBlock } from "@/engine/child-sheet";
import { FieldCard } from "./field-card";
import type { SheetTemplateContext } from "./types";

/** A real A5 card fits inside A4's printable area; two do not. A second sheet
 * keeps the identifying clues and take-home words off the child's artwork. */
export function A5Collage(context: SheetTemplateContext) {
  const title = context.blocks.find((block) => block.type === "sheet-title");
  const collage = context.blocks.find((block) => block.type === "collage-zone");
  return <>
    <section className="a5-cutting-sheet" aria-label="A5 collage card to cut out">
      <p className="a5-cut-note">Print at actual size. Cut around the dotted edge for your A5 card.</p>
      <div className="a5-art-card">
        <Wordmark seed className="print-logo" />
        {title && renderSheetBlock(title, context.ability)}
        {collage && renderSheetBlock(collage, context.ability)}
      </div>
    </section>
    <FieldCard {...context} blocks={context.blocks.filter((block) => block.type !== "collage-zone")} />
  </>;
}
