import type { ReactElement } from "react";
import type { Block } from "@/schema/pack";

/**
 * One glyph grammar for the whole product.
 *
 * Every block kind has exactly one icon, drawn on a 24px grid with a uniform
 * stroke and round terminals. The set is deliberately characterful — a
 * storybook-pictogram quality with a hint of hand wobble in the curves —
 * because the page around it is a professional instrument and the warmth
 * lives in details like these. Not clip-art, not emoji: one pen, one weight.
 *
 * The icon plus a single accent colour carries WHO a block is for
 * (umber = spoken to the class, slate = teacher-only, amber = live
 * conditions); typography carries WHAT it is.
 */

export type BlockKind = Block["type"];

/** Which audience a kind addresses; drives its accent colour. */
export const kindTone: Record<BlockKind, "green" | "slate" | "amber"> = {
  "say-aloud": "green",
  "circle-question": "green",
  "named-skill": "green",
  demo: "green",
  "teacher-note": "slate",
  "conditions-line": "amber",
};

/**
 * The kind's name in words. No longer rendered on the page — the marks carry
 * the register now (see block-mark.tsx) — but still read to screen readers,
 * still used by the lesson's front-matter key, and still the one place each
 * kind is named, so the app cannot spell itself two ways.
 */
export const kindCaption: Record<BlockKind, string> = {
  // NOT "say aloud". Johan, 16 August: "say aloud too.. or suggested words or
  // soemthing more suggestive". "Say aloud" hands a teacher a script and asks
  // her to perform it, which is why an authored line that does not fit her
  // class reads as a failure rather than a starting point. These lines are
  // offered, not dictated: she is the one standing in the field and she may
  // put any of them in her own mouth. The caption should say so.
  //
  // Kept verb-first like its neighbours ("show them", "look around", "ask the
  // circle") so the set still reads as one system, and kept to the words a
  // colleague would actually use when handing you a line.
  //
  // This changes only how the line is FRAMED to the teacher. It does not touch
  // the verbatim guard: pack copy is still Johan's, still exact, and
  // scripts/verbatim-fidelity.mjs is unaffected.
  "say-aloud": "say something like",
  "teacher-note": "just for you",
  demo: "show them",
  // NOT "today's sky". Johan, on the deployed run: "I dont think this is
  // about the sky." The block's live line is the session-grounded one — it
  // names what is out there to notice, spiders and living things, and reaches
  // the sky only when the sky is what the read had. A label that claims the
  // sky over a line about spiders is the caption lying about the figure.
  // "Look around" is true of every line this block can carry, which is the
  // test a generic label has to pass.
  "conditions-line": "look around",
  "circle-question": "ask the circle",
  "named-skill": "name the skill",
};

const glyphs: Record<BlockKind, ReactElement> = {
  // A round little speech bubble with three seed-dots — words for the class.
  "say-aloud": (
    <>
      <path d="M12.2 4.4c4.5-.3 7.5 2.1 7.8 5.4.3 3.4-2 6.2-6 6.7-1.1.1-2.2 0-3.3-.3l-3.7 2.1.8-3.3c-1.5-1.1-2.4-2.7-2.5-4.4-.2-3.3 2.5-5.9 6.9-6.2Z" />
      <circle cx="8.9" cy="10.7" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="12.2" cy="10.5" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.3" r="0.95" fill="currentColor" stroke="none" />
    </>
  ),
  // A friendly eye with softly waving lids — only the teacher sees this.
  "teacher-note": (
    <>
      <path d="M2.8 12.2c1.8-3.3 5.2-5.9 9.2-5.8 4 .1 7.3 2.7 9.2 5.8-1.9 3.1-5.3 5.6-9.3 5.5-3.9-.1-7.3-2.5-9.1-5.5Z" />
      <circle cx="12" cy="12.1" r="2.5" />
      <circle cx="12.9" cy="11.2" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  // An open hand, mitten-round — something shown, not said.
  demo: (
    <>
      <path d="M7.4 11.6V7c0-.9.7-1.6 1.5-1.6.9 0 1.5.7 1.5 1.6v3.8" />
      <path d="M10.4 10.6V5.3c0-.9.7-1.6 1.6-1.6.9 0 1.5.7 1.5 1.6v5.3" />
      <path d="M13.5 10.8V6.4c0-.9.7-1.6 1.6-1.6.9 0 1.5.8 1.5 1.7v6.1" />
      <path d="M16.6 12.7c.2-1 1-1.7 1.9-1.5.9.2 1.4 1 1.3 2-.4 3.5-1.6 7.2-6.1 7.4-3.3.2-4.9-1.2-6.4-3.5-.6-.9-1.4-1.9-2-2.8-.5-.8-.3-1.7.4-2.2.7-.5 1.6-.3 2.2.4l1.7 1.9" />
    </>
  ),
  // The sun leaning out from behind a puffy cloud — today's real sky.
  "conditions-line": (
    <>
      <circle cx="16.1" cy="7.7" r="2.6" />
      <path d="M16.3 2.8v1.3" />
      <path d="m20.7 5.4-.9 1" />
      <path d="M21.6 10h-1.3" />
      <path d="M4.9 18c-1.6-.4-2.6-1.7-2.4-3.2.2-1.6 1.7-2.7 3.4-2.5.5-1.9 2.3-3.2 4.4-3 1.9.2 3.4 1.6 3.7 3.4 1.5.1 2.7 1.2 2.8 2.7.1 1.6-1.2 2.8-3 2.8-2.9 0-6 .1-8.9-.2Z" />
    </>
  ),
  // A ring of pebbles, no two quite alike — the class gathered round.
  "circle-question": (
    <>
      <circle cx="12.1" cy="4.5" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="18.3" cy="8.1" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="15.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19.5" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="15.9" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="5.7" cy="8.4" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  // A leaf on its stem with one wandering vein — the skill this session grows.
  "named-skill": (
    <>
      <path d="M6.3 17.9C5.6 12 9.6 6.9 17.6 5.6c.8 8.1-3.3 13-11.3 12.3Z" />
      <path d="M6.5 17.8c2.3-4.4 5.4-7.7 9.3-9.9" />
      <path d="M6.3 18c-.9 1-1.5 1.9-1.9 2.9" />
    </>
  ),
};

export function KindIcon({
  kind,
  size = 24,
  className,
}: {
  kind: BlockKind;
  size?: number;
  className?: string;
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {glyphs[kind]}
    </svg>
  );
}
