import React from "react";
import type { ReactElement } from "react";
import type { ChildSheetBlock, Session, SheetTemplateId } from "@/schema/pack";
import { ActivitySheet } from "./activity-sheet";
import { A5Collage } from "./a5-collage";
import { AnimalMask } from "./animal-mask";
import { FieldCard } from "./field-card";
import type { SheetTemplate, SheetTemplateContext } from "./types";

export type { SheetFolio, SheetTemplateContext } from "./types";

/**
 * The sheet template layer.
 *
 * The child sheet was already a typed block system with one renderer per block
 * (engine/child-sheet.tsx). This sits one level above that: a small registry of
 * named layouts, one chosen per session, each composing the SAME shared block
 * renderers onto its own geometry. A template picks how the paper is laid out
 * and nothing else — it owns no copy rules, no data source, no auth.
 *
 * Selection is authored, with a derived fallback: a session may name its
 * template in the pack (`session.sheetTemplate`), and when it does not, one is
 * derived from the session's shape. Both paths end at a template that exists,
 * because a session without its printable is not finished — that is the product
 * law this file is here to keep.
 */

/**
 * The universal default. Every degradation path lands here, so this template's
 * layout must be the one that always works: one A4, plain print, no fancy
 * geometry to fail.
 */
export const FALLBACK_TEMPLATE_ID = "field-card" satisfies SheetTemplateId;

/**
 * The built templates. `field-card` is required by the type, so the fallback
 * can never be missing; the others are optional entries that get filled in as
 * their geometry lands.
 *
 * `field-book` (one A4 imposed into an 8-panel fold) is deliberately absent:
 * its print-CSS fold imposition is a separate de-risking spike, and until that
 * clears, a pack naming it degrades to the field card rather than printing a
 * fold that does not fold. Dropping it in later is one entry here plus one
 * layout module beside field-card.tsx — nothing else in this file changes.
 */
const templates: Record<typeof FALLBACK_TEMPLATE_ID, SheetTemplate> &
  Partial<Record<SheetTemplateId, SheetTemplate>> = {
  "field-card": FieldCard,
  "animal-mask": AnimalMask,
  "a5-collage": A5Collage,
  "seed-study": (context) => <ActivitySheet {...context} layout="seed-study" />,
  "leaf-sequence": (context) => <ActivitySheet {...context} layout="leaf-sequence" />,
  "maths-record": (context) => <ActivitySheet {...context} layout="maths-record" />,
  "bark-study": (context) => <ActivitySheet {...context} layout="bark-study" />,
  "bird-watch": (context) => <ActivitySheet {...context} layout="bird-watch" />,
  "seed-bomb-plan": (context) => <ActivitySheet {...context} layout="seed-bomb-plan" />,
  "flower-study": (context) => <ActivitySheet {...context} layout="flower-study" />,
  "paint-palette": (context) => <ActivitySheet {...context} layout="paint-palette" />,
  "feeder-watch": (context) => <ActivitySheet {...context} layout="feeder-watch" />,
  "life-survey": (context) => <ActivitySheet {...context} layout="life-survey" />,
  "minibeast-study": (context) => <ActivitySheet {...context} layout="minibeast-study" />,
  "tree-study": (context) => <ActivitySheet {...context} layout="tree-study" />,
  "winter-sort": (context) => <ActivitySheet {...context} layout="winter-sort" />,
  "life-sort": (context) => <ActivitySheet {...context} layout="life-sort" />,
  "micro-habitat-study": (context) => <ActivitySheet {...context} layout="micro-habitat-study" />,
  "habitat-needs": (context) => <ActivitySheet {...context} layout="habitat-needs" />,
  "food-chain": (context) => <ActivitySheet {...context} layout="food-chain" />,

};

/** The part of a session this layer actually reads. */
type TemplateChoice = Pick<Session, "sheetTemplate" | "childSheet">;

const sessionWords = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
] as const;

/**
 * The folio line: which pack this sheet came from and where it sits in the
 * term, in the sheet's own quiet voice ("autumn starter · session three").
 * Derived from the shelf at print time, so it can never drift from it. Returns
 * null when the session is not on the shelf, and the template then omits the
 * line rather than printing a half-truth.
 */
export function sheetFolioLine(packTitle: string, sessionIndex: number): string | null {
  if (sessionIndex < 0) return null;
  const nth = sessionWords[sessionIndex] ?? String(sessionIndex + 1);
  return `${packTitle.toLowerCase()} · session ${nth}`;
}

/**
 * Derive a template from the session's shape, for packs that name none.
 *
 * Today every derived answer is the field card, and that is the honest state
 * rather than an oversight: a session built around a collage zone wants the
 * single A4 make-space, and a session without one still wants a sheet that
 * cannot fail to print. The folded field book is never derived — it needs the
 * teacher to fold it, so it is only ever used when a pack asks for it by name.
 * This function is the seam a future shape rule hooks into.
 */
export function deriveSheetTemplate(session: TemplateChoice): SheetTemplateId {
  const hasCollage = session.childSheet.some((block) => block.type === "collage-zone");
  return hasCollage ? "field-card" : FALLBACK_TEMPLATE_ID;
}

/**
 * The template this session's sheet will actually be laid out with, after
 * degradation. Named but unbuilt templates, and anything that survived the
 * schema without a layout, resolve to the fallback rather than failing.
 */
export function resolveSheetTemplate(session: TemplateChoice): SheetTemplateId {
  const wanted = session.sheetTemplate ?? deriveSheetTemplate(session);
  return templates[wanted] ? wanted : FALLBACK_TEMPLATE_ID;
}

/**
 * Render a session's child sheet with its resolved template. The blocks are
 * passed in rather than read off the session so the print surface can fill the
 * place line from the signed-in class first.
 *
 * Returns NULL when the session has no sheet blocks at all. A session whose
 * sheet nobody has written yet prints no second page, rather than a bordered
 * A4 carrying a folio line, a wordmark and nothing else — which reads as a
 * sheet that failed to print rather than one that was never written. Same
 * degradation rule the match strip already follows: show it properly or not
 * at all, never a labelled blank.
 */
export function renderChildSheet(
  session: TemplateChoice,
  context: Omit<SheetTemplateContext, "blocks"> & { blocks: ChildSheetBlock[] }
): ReactElement | null {
  if (context.blocks.length === 0) return null;
  const template = templates[resolveSheetTemplate(session)] ?? FieldCard;
  return template(context);
}
