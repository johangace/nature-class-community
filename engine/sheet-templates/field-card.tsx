import React from "react";
import { Fragment, type ReactElement } from "react";
import { Wordmark } from "@/app/Wordmark";
import { renderSheetBlock } from "@/engine/child-sheet";
import type { SheetTemplateContext } from "./types";

/**
 * The field card: one A4, one column, the universal default.
 *
 * The bet is that the sheet IS the activity — the collage happens on it, the
 * leaves get stuck to it, the tick is made by hand on it. So the make-space is
 * the elastic part of the page: the masthead, the strip, the noticing line and
 * the book-bag line take the height they need and the collage zone takes
 * everything that is left, which is what makes one sheet fill exactly one page
 * whether or not this session carries a match strip.
 *
 * The blocks are rendered as fragments rather than wrapped in divs on purpose:
 * an anonymous wrapper would become the flex child and the collage would be
 * stuck at its minimum height with dead paper beneath it.
 */
export function FieldCard({ blocks, ability, folio, as: Element = "main" }: SheetTemplateContext & { as?: "main" | "div" }): ReactElement {
  return (
    <Element className="cs-sheet cs-field-card">
      <div className="cs-folio">
        {folio.where && <span className="cs-folio-where">{folio.where}</span>}
        <Wordmark seed className="cs-folio-brand print-logo" />
      </div>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderSheetBlock(block, ability)}</Fragment>
      ))}
    </Element>
  );
}
