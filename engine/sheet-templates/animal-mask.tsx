import React from "react";
import { Wordmark } from "@/app/Wordmark";
import { FieldCard } from "./field-card";
import type { SheetTemplateContext } from "./types";

/** SVG units are millimetres at actual print size. The open lower edge leaves
 * the nose and mouth uncovered. The large outer shape leaves room for leaves;
 * eye centres remain 62mm apart instead of scaling with the decoration area.
 * Instructions and the authored reflection sheet follow the landscape template. */
export function AnimalMask(context: SheetTemplateContext) {
  return (
    <>
      <section className="mask-sheet mask-template-page" aria-label="Animal mask cutting template">
        <div className="print-masthead">
          <Wordmark seed className="print-logo" />
          <span>Animal leaf mask · print at actual size</span>
        </div>
        <div className="mask-cutting-area">
          <svg className="mask-pattern" viewBox="0 0 260 150" role="img" aria-label="Mask outline with two eye openings and two string holes">
            <path className="mask-outline" d="M8 71 C8 39 26 10 62 10 C92 10 112 28 130 30 C148 28 168 10 198 10 C234 10 252 39 252 71 L258 73 L258 95 L245 98 C233 125 208 138 180 133 C157 130 147 110 142 96 Q138 85 130 85 Q122 85 118 96 C113 110 103 130 80 133 C52 138 27 125 15 98 L2 95 L2 73 Z" />
            <ellipse className="mask-eye" cx="99" cy="72" rx="19" ry="11" />
            <ellipse className="mask-eye" cx="161" cy="72" rx="19" ry="11" />
            <circle className="mask-hole" cx="9" cy="84" r="2" />
            <circle className="mask-hole" cx="251" cy="84" r="2" />
          </svg>
          <p className="mask-cut-caption">Cut around the outside. An adult helps with the eyes and small holes.</p>
        </div>
      </section>
      <section className="mask-sheet mask-instructions" aria-label="Animal mask making instructions">
        <div className="print-masthead">
          <Wordmark seed className="print-logo" />
          <span>Make • wear • tell a story</span>
        </div>
        <header className="mask-intro">
          <p className="mask-eyebrow">Your leaves. Your animal.</p>
          <h1>Who will you become?</h1>
          <p>A fox’s ears? An owl’s feathers? Make this face your own.</p>
        </header>
        <ol className="mask-steps">
          <li><strong>Choose</strong><span>Pick an animal. Try out your leaves before you glue.</span></li>
          <li><strong>Make</strong><span>Build its face. Keep the eye openings clear. Let the glue dry.</span></li>
          <li><strong>Become</strong><span>Hold it up or ask an adult to attach the string. Tell us who you are.</span></li>
        </ol>
        <div className="mask-adult-note">
          <strong>Before you make</strong>
          <p>Print at 100% / actual size on light card, or mount the paper on card. Check the fit and eye openings before decorating. An adult cuts or enlarges the eye openings and fits any string. Hold the mask for storytelling; take it off to move around.</p>
          <div className="mask-scale"><span aria-hidden="true" />This line should measure 5 cm.</div>
        </div>
        <p className="mask-story">“I am a <span />. My story begins…”</p>
      </section>
      <FieldCard {...context} />
    </>
  );
}
