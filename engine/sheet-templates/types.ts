import type { ReactElement } from "react";
import type { AbilityBand, ChildSheetBlock } from "@/schema/pack";

/**
 * The folio line a template may print as its own chrome: which pack this sheet
 * came from and where it sits in the term. Derived from the pack at print time,
 * never authored — so it can never disagree with the shelf. `where` is null
 * when it cannot be derived, and a template must then simply omit it.
 */
export interface SheetFolio {
  where: string | null;
}

/**
 * Everything a sheet template is given. Note what is NOT here: any copy of its
 * own, any data source, any auth. A template composes the blocks it is handed
 * onto a geometry, and that is the whole of its job.
 */
export interface SheetTemplateContext {
  blocks: ChildSheetBlock[];
  ability: AbilityBand | undefined;
  folio: SheetFolio;
}

/** One template: a layout wrapper around the shared block renderers. */
export type SheetTemplate = (context: SheetTemplateContext) => ReactElement;
