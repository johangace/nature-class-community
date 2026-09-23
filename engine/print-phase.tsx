import type { AbilityBand, Phase } from "@/schema/pack";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { phaseMinutes } from "@/lib/minutes";
import { renderPrintBlock } from "./print";

/** The phase is a reading unit: a margin to find your place, then the words
 * in their authored order. Long phases may continue onto the next page. */
export function PrintPhase({ phase, ability, number }: { phase: Phase; ability: AbilityBand | undefined; number: number }) {
  return (
    <section className="print-phase print-teaching-phase">
      <h2>
        <span className="print-step">{String(number).padStart(2, "0")}</span>
        {phase.title}
        {phaseMinutes(phase) && <span className="mins">{phaseMinutes(phase)}</span>}
      </h2>
      <div className="print-phase-body">
        {phaseBlocks(phase).map((block, index) => <div key={index}>{renderPrintBlock(block, ability)}</div>)}
        {phase.conditionVariants?.map((variant) => (
          <div className="print-variant" key={variant.when}>
            <h3>If {variant.when}: {variant.phase.title}{phaseMinutes(variant.phase) ? ` · ${phaseMinutes(variant.phase)}` : ""}</h3>
            {phaseBlocks(variant.phase).map((block, index) => <div key={index}>{renderPrintBlock(block, ability)}</div>)}
          </div>
        ))}
      </div>
    </section>
  );
}
