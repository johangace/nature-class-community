import React from "react";
import { Fragment } from "react";
import { Wordmark } from "@/app/Wordmark";
import { renderSheetBlock } from "@/engine/child-sheet";
import { resolveText } from "@/lib/text";
import type { SheetTemplateContext } from "./types";

/** Layout instructions describe what to put on the paper, never a nature
 * fact or an expected result. All lesson prompts and take-home copy remain
 * authored blocks. Different investigations need different recording tools. */
export const activityLayouts = {
  "seed-study": { instruction: "Draw four seeds. Test each one and record how it moved.", panels: ["Seed 1", "Seed 2", "Seed 3", "Seed 4"], detail: "It moved like this:", columns: 2 },
  "leaf-sequence": { instruction: "Draw five leaves in the order you found: from least to most broken down.", panels: ["1 · Least broken down", "2", "3", "4", "5 · Most broken down"], columns: 5 },
  "maths-record": { instruction: "Sort, count and compare. Measure across the middle in centimetres.", panels: ["Our biggest conker", "Our smallest acorn"], columns: 2, table: { columns: ["What we found", "Tally marks", "Total"], rows: ["Conkers", "Acorns", "Altogether"] }, detail: "Across the middle:       cm" },
  "bark-study": { instruction: "Take two rubbings. Put the paper against the bark and use the side of a crayon.", panels: ["Tree 1 · a rubbing", "Tree 2 · a rubbing"], detail: "It feels:", columns: 2 },
  "bird-watch": { instruction: "Draw the bird you saw. Look for the position of its colours and markings.", panels: ["The bird I saw", "A marking I noticed"], columns: 2 },
  "seed-bomb-plan": { instruction: "Draw where your two seed bombs will go. Agree the places with an adult.", panels: ["One for school", "One to take home"], detail: "Where it will go:", columns: 2 },
  "flower-study": { instruction: "Look at a flower where it grows. Draw what you can actually see.", panels: ["The whole plant", "One flower, close up"], detail: "A colour or shape I noticed:", columns: 2 },
  "paint-palette": { instruction: "Try your colours in the small spaces. Make your painting in the space below.", panels: ["Colour 1", "Colour 2", "Colour 3", "Colour 4"], detail: "Made from:", columns: 4, painting: true },
  "feeder-watch": { instruction: "Draw your feeder and where it hangs. Come back to see what happens.", panels: ["Our feeder", "Where we hung it"], columns: 2, table: { columns: ["When we looked", "What we noticed"], rows: ["", "", ""] } },
  "life-survey": { instruction: "Record the living things you find within your ten steps. A drawing or your own name for one is enough.", panels: [], columns: 1, table: { columns: ["Living thing", "Tally marks", "Total"], rows: ["", "", "", "", "", ""] } },
  "minibeast-study": { instruction: "Look closely. Draw the minibeast you met, including the legs and wings you can see.", panels: ["My minibeast, close up"], columns: 1 },
  "tree-study": { instruction: "Look from far away, then close up. Record two different views of your tree.", panels: ["The whole tree", "A detail of its bark"], columns: 2 },
  "winter-sort": { instruction: "Draw one animal for each pile: one that sleeps through winter, one that leaves, one that stays.", panels: ["Hibernate", "Migrate", "Adapt"], columns: 3, table: { columns: ["Animal", "Hibernate, migrate or adapt?"], rows: ["Hedgehog", "Swallow", "Robin", "Squirrel"] } },
  "life-sort": { instruction: "Draw one thing from each circle. Then write what made you decide.", panels: ["Alive", "Dead", "Never alive"], columns: 3, table: { columns: ["What we found", "Which circle", "What decided it"], rows: ["", "", "", "", ""] } },
  "micro-habitat-study": { instruction: "Draw the small place exactly as you opened it. Then draw one creature and one plant close up. If there was none, write none found here in that box.", panels: ["The small place", "One creature, close up", "One plant, close up"], detail: "It was in or under:", columns: 3, table: { columns: ["What lived here", "How many"], rows: ["", "", "", ""] } },
  "habitat-needs": { instruction: "Draw your patch from where you stood. Then record what it gives animals and plants, and where you saw it. Air is all around, so write all around. Write not seen today for anything else you could not find today.", panels: ["Our patch"], columns: 1, table: { columns: ["What this place gives", "Where we saw it"], rows: ["Air", "Water", "Food, for animals", "Shelter, for animals", "Light, for plants", "Somewhere to grow, for plants"] } },
  "food-chain": { instruction: "Draw the chain in order. Put an arrow on each join, pointing at the eater.", panels: ["1 · The plant", "2 · What eats the plant", "3 · What eats that"], detail: "Its name, or what it looked like:", columns: 3 },
} as const;

export type ActivityLayoutId = keyof typeof activityLayouts;
type Layout = { instruction: string; panels: readonly string[]; columns: number; detail?: string; painting?: boolean; table?: { columns: readonly string[]; rows: readonly string[] } };

export function ActivitySheet({ layout, ...context }: SheetTemplateContext & { layout: ActivityLayoutId }) {
  const spec: Layout = activityLayouts[layout];
  const { blocks, ability, folio } = context;
  const title = blocks.find((block) => block.type === "sheet-title");
  const hint = blocks.find((block) => block.type === "collage-zone");
  const authoredHint = hint?.type === "collage-zone" && hint.hint ? resolveText(hint.hint, hint.abilityVariants, ability) : null;
  return (
    <section className={`cs-sheet activity-sheet activity-${layout}`} aria-label={title?.type === "sheet-title" ? title.title : "Activity sheet"}>
      <div className="cs-folio">
        {folio.where && <span className="cs-folio-where">{folio.where}</span>}
        <Wordmark seed className="cs-folio-brand print-logo" />
      </div>
      {title && renderSheetBlock(title, ability)}
      <p className="activity-instruction">{spec.instruction}</p>
      {spec.panels.length > 0 && <div className="activity-panels" style={{ gridTemplateColumns: `repeat(${spec.columns}, minmax(0, 1fr))` }}>
        {spec.panels.map((label) => <div className="activity-panel" key={label}>
          <h2>{label}</h2>
          <div className="activity-drawing-space" />
          {spec.detail && <p className="activity-detail">{spec.detail}<span /></p>}
        </div>)}
      </div>}
      {spec.painting && <div className="activity-painting"><span>My painting</span></div>}
      {spec.table && <table className="activity-table">
        <thead><tr>{spec.table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{spec.table.rows.map((label, index) => <tr key={index}><th scope="row">{label || <span className="sr-only">Observation {index + 1}</span>}</th>{spec.table!.columns.slice(1).map((column) => <td key={column} />)}</tr>)}</tbody>
      </table>}
      {authoredHint && authoredHint !== "Draw or stick something from today's session here." && <p className="activity-original-hint">{authoredHint}</p>}
      {blocks.filter((block) => block.type !== "sheet-title" && block.type !== "collage-zone").map((block, index) => <Fragment key={index}>{renderSheetBlock(block, ability)}</Fragment>)}
    </section>
  );
}
