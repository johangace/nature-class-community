import React from "react";
import type { ReactElement } from "react";
import type { AbilityBand, ChildSheetBlock } from "@/schema/pack";
import { resolveText } from "@/lib/text";

/**
 * The child's sheet is a third renderer registry over its own block kinds —
 * the same pattern as the runner (engine/registry.tsx) and the teacher print
 * page (engine/print.tsx): typed blocks in, one renderer each, walked in order
 * and landed on one A4 sheet. Same data model, a surface tuned for a five-year-
 * old's hands.
 *
 * These renderers are shared by every sheet TEMPLATE (engine/sheet-templates).
 * A template picks the geometry the blocks land on; the blocks themselves, and
 * every rule below, stay the same on all of them.
 *
 * The register is acquaintance: the sheet meets, names, and notices, it never
 * counts. The leaf silhouettes and the collage border are the sheet's activity
 * (the collage happens on it) — the child sticks leaves, ticks a tree, writes
 * one line. Words are always live template text; the art carries no words.
 */

type SheetBlockOf<K extends ChildSheetBlock["type"]> = Extract<
  ChildSheetBlock,
  { type: K }
>;

type SheetRenderer<K extends ChildSheetBlock["type"]> = (
  block: SheetBlockOf<K>,
  ability: AbilityBand | undefined
) => ReactElement | null;

/** One leaf silhouette, no text in it — a corner ornament for the collage zone. */
function CornerLeaf({ className }: { className: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 60 90"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M30 4 C 46 22, 54 44, 30 86 C 6 44, 14 22, 30 4 Z M30 12 L30 78" />
    </svg>
  );
}

/**
 * The match strip's leaf shapes.
 *
 * A child is matching a real leaf in their hand against the silhouette on the
 * paper, so a wrong shape is a lie, not a decoration. The dictionary is
 * therefore deliberately tiny and only holds shapes we are certain of; anything
 * we cannot name confidently gets the neutral leaf rather than a guess. Growing
 * this list is a content decision, not a styling one.
 *
 * No words live inside any of these paths — the name and the clue are always
 * live template text beside the art, which is what keeps a sheet typo-free and
 * reprintable in a five-year-old's hands.
 */
/*
 * Every viewBox is exactly 100 units tall and cropped tight in x, because the
 * strip sizes these by HEIGHT: a leaf is recognised by its outline against the
 * others, so they share a height and the wide ones stay wide. It also keeps the
 * stroke weight identical across shapes, which a shared width would not.
 */
const leafShapes = {
  /** Lobed, with the rounded waves along the edge that name it. */
  oak: {
    viewBox: "26 2 48 100",
    paths: [
      "M50 6 C62 18,58 26,70 30 C60 38,68 44,62 54 C72 58,64 68,70 78 C58 80,60 90,50 98 C40 90,42 80,30 78 C36 68,28 58,38 54 C32 44,40 38,30 30 C42 26,38 18,50 6 Z",
    ],
  },
  /** A small teardrop with a clear midrib. */
  birch: {
    viewBox: "22 4 56 100",
    paths: ["M50 8 C68 26,74 52,50 100 C26 52,32 26,50 8 Z", "M50 16 L50 92"],
  },
  /** Palmate: five points like a hand, on a stem. Sycamore shares the shape. */
  maple: {
    viewBox: "0 4 100 100",
    paths: [
      "M50 8 L61 33 L84 26 L67 49 L90 63 L57 68 L50 70 L43 68 L10 63 L33 49 L16 26 L39 33 Z",
      "M50 70 L50 100",
    ],
  },
  /** The neutral leaf: an honest shape that claims no species. */
  generic: {
    viewBox: "2 -5 56 100",
    paths: ["M30 4 C 46 22, 54 44, 30 86 C 6 44, 14 22, 30 4 Z M30 12 L30 78"],
  },
} as const;

/**
 * Whole-word matches only, so "the oak by the gate" resolves and "hazel" does
 * not. Worth knowing before the grounds cast starts feeding real species names:
 * a compound like "oak-leaf hydrangea" would match on its first word and draw
 * the wrong shape. No such name exists in any pack today, but that is the point
 * to add a stopword guard rather than after a child has held the wrong leaf.
 */
const leafShapeByWord: Record<string, keyof typeof leafShapes> = {
  oak: "oak",
  birch: "birch",
  maple: "maple",
  sycamore: "maple",
};

function leafShapeFor(name: string): (typeof leafShapes)[keyof typeof leafShapes] {
  for (const word of name.toLowerCase().split(/[^a-z]+/)) {
    const shape = leafShapeByWord[word];
    if (shape) return leafShapes[shape];
  }
  return leafShapes.generic;
}

/** The silhouette on one match card: the named tree's own shape, or the neutral leaf. */
function MatchLeaf({ name }: { name: string }): ReactElement {
  const shape = leafShapeFor(name);
  return (
    <svg
      className="cs-match-leaf"
      viewBox={shape.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      aria-hidden="true"
    >
      {shape.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const sheetRegistry: {
  [K in ChildSheetBlock["type"]]: SheetRenderer<K>;
} = {
  "sheet-title": (b, a) => (
    <header className="cs-top">
      <h1 className="cs-title">{resolveText(b.title, b.abilityVariants, a)}</h1>
      {b.place && <p className="cs-place">{b.place}</p>}
      <p className="cs-name">
        {resolveText(b.nameLine, b.abilityVariants, a)}{" "}
        <span className="cs-writeline" aria-hidden="true" />
      </p>
    </header>
  ),
  // The hint is optional (see collageZoneSchema). Without one the zone is the
  // bordered make-space and its corner leaves, and no label — never an empty
  // paragraph holding a line's worth of blank paper, which reads as words that
  // failed to print. A space with no words is honest; a label with no words is
  // a mistake on a child's page.
  "collage-zone": (b, a) => (
    <div className="cs-collage">
      <CornerLeaf className="cs-cornerleaf cs-cl1" />
      {b.hint ? <p className="cs-hint">{resolveText(b.hint, b.abilityVariants, a)}</p> : null}
      <CornerLeaf className="cs-cornerleaf cs-cl2" />
    </div>
  ),
  // Degradation rule: the strip names real trees from the grounds cast. Until
  // that cast exists a pack carries a generic-region trio, and every template
  // must render correctly with those fallback cards. If fewer than two trees
  // are nameable the strip is omitted entirely rather than shown with one card
  // — a sheet with a lone tree on it reads as a mistake to a child. The schema
  // already requires 2 to 4, so this guard is the seam that keeps the rule true
  // once the cards come from a live cast rather than the pack.
  "match-strip": (b, a) =>
    b.cards.length < 2 ? null : (
      <div className="cs-match">
        <p className="cs-match-prompt">{resolveText(b.prompt, b.abilityVariants, a)}</p>
        <div
          className="cs-match-row"
          style={{ gridTemplateColumns: `repeat(${b.cards.length}, 1fr)` }}
        >
          {b.cards.map((card) => (
            <div className="cs-match-cell" key={card.name}>
              {/\b(leaves|leaf)\b/i.test(b.prompt) && <MatchLeaf name={card.name} />}
              <p className="cs-tname">{card.name}</p>
              <p className="cs-tclue">{card.clue}</p>
              <span className="cs-tick">
                <span className="cs-tickbox" aria-hidden="true" />
                <span className="cs-ticklabel">found one</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  "notice-line": (b, a) => (
    <div className="cs-notice">
      <p className="cs-nq">{resolveText(b.prompt, b.abilityVariants, a)}</p>
      <span className="cs-noticeline" aria-hidden="true" />
      <span className="cs-noticeline" aria-hidden="true" />
    </div>
  ),
  "parent-line": (b, a) => (
    <footer className="cs-foot">
      <p className="cs-parent">{resolveText(b.text, b.abilityVariants, a)}</p>
      {b.url ? <p className="cs-brand">{b.url}</p> : null}
    </footer>
  ),
};

/**
 * Render one sheet block. Returns null when the block cannot be shown honestly
 * (see the match-strip guard above); a template must handle that rather than
 * assume every block draws something.
 */
export function renderSheetBlock(
  block: ChildSheetBlock,
  ability: AbilityBand | undefined
): ReactElement | null {
  const render = sheetRegistry[block.type] as (
    block: ChildSheetBlock,
    ability: AbilityBand | undefined
  ) => ReactElement | null;
  return render(block, ability);
}
