"use client";

import { useState } from "react";
import { abilityBands, type AbilityBand, type Block } from "@/schema/pack";
import { abilityLabels } from "@/lib/ability";
import { resolveText } from "@/lib/text";

/** A local wording preview. Preparation choices will be saved with their day. */
export function ClassBandChoice({ band, sample }: {
  band: AbilityBand | null;
  sample?: Extract<Block, { type: "say-aloud" }>;
}) {
  const [preview, setPreview] = useState<AbilityBand | null>(null);
  const chosen = preview ?? band;
  return (
    <section className="plan-band" aria-labelledby="plan-band-heading">
      <h2 id="plan-band-heading">Preview the wording</h2>
      <p>Try another level here. Your lesson stays unchanged.</p>
      <div className="toggle-row">
        {abilityBands.map((option) => (
          <button key={option} type="button"
            className={option === chosen ? "active" : ""}
            aria-pressed={option === chosen}
            onClick={() => setPreview(option)}>
            {abilityLabels[option]}
          </button>
        ))}
      </div>
      {sample && preview !== null && <blockquote>{resolveText(sample.text, sample.abilityVariants, chosen ?? undefined)}</blockquote>}
      {preview !== null && <button type="button" onClick={() => setPreview(null)}>Reset preview</button>}
      {band !== null && <p className="plan-band-note">Your class uses {abilityLabels[band]} wording.</p>}
    </section>
  );
}
