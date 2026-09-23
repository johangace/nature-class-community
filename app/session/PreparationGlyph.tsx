import type { ReactElement, ReactNode } from "react";

/**
 * The preparation tools' glyphs, drawn in the product's one pen.
 *
 * Johan, 2 September: "clear with icons the buttons on pre walk". These are
 * NOT a second icon library arriving. Same grammar as `engine/icons.tsx`: a
 * 24px grid, a uniform 2px stroke, round terminals, and a hint of hand wobble
 * in the curves, because the page around them is a professional instrument and
 * the warmth lives in details like these.
 *
 * They live here rather than in `engine/icons.tsx` because that set is keyed by
 * `BlockKind` — it answers "which voice is this line in", and a preparation
 * tool is not a block. One pen, two sets, no shared type forced between them.
 *
 * The glyph carries WHAT the tool is. The plate behind it carries WHO the tool
 * is for, and reuses the audience washes rather than inventing a colour: the
 * spoken wash behind the preview a teacher will say out loud, the conditions
 * wash behind ground and safety, the teacher wash behind the two she reads
 * alone. Nothing here is a new value.
 */

export type PreparationGlyphName =
  | "place"
  | "season"
  | "rain"
  | "sun"
  | "snow"
  | "life"
  | "present"
  | "preview"
  | "primer"
  | "conditions"
  | "safety"
  | "print"
  | "door"
  | "tablet"
  | "standards"
  | "clock"
  | "chevron";

const glyphs: Record<PreparationGlyphName, ReactNode> = {
  present: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8" /></>,
  place: <><path d="M18.7 9.6c0 5-6.7 11-6.7 11S5.3 14.6 5.3 9.6a6.7 6.7 0 0 1 13.4 0Z" /><circle cx="12" cy="9.5" r="2.2" /></>,
  season: <><path d="M19.7 3.8c.8 8.5-1.6 13.3-6.5 13.6-4.2.3-6.7-2.4-6.2-6.1.6-4.7 6.7-6.5 12.7-7.5Z" /><path d="M4.2 20.3 15.6 9.1M8.7 15.8l-.3-4.1M12.4 12.3l4 .1" /></>,
  rain: <><path d="M6.3 14.1a4 4 0 0 1-.4-8 5.6 5.6 0 0 1 10.4 1.2 3.5 3.5 0 1 1 1.2 6.8Z" /><path d="m7.7 17.1-1 3m5.8-3-1 3m5.8-3-1 3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  snow: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m10 14-1-4 4-1M4 14l4 1-1 4m10-14-1 4 4 1" /></>,
  life: <><path d="M12 20v-9M12 15C5 16 3 12 3 7c6-.4 9 2.7 9 8ZM12 11c0-5 3-7.7 9-7-1 5-4 7.6-9 7Z" /></>,
  // A play triangle with two arcs coming off it: the lesson, spoken through.
  preview: (
    <>
      <path d="M4.6 6.9c0-.9.9-1.5 1.7-1.1l7.4 4.5c.7.4.7 1.4 0 1.8l-7.4 4.5c-.8.4-1.7-.1-1.7-1.1Z" />
      <path d="M17.4 8.4c1.4 2 1.4 5.5 0 7.4" />
      <path d="M20.4 6.2c2.2 3.2 2.2 8.7 0 11.9" />
    </>
  ),
  // An open book with a leaf's veining on the right page: the background read.
  primer: (
    <>
      <path d="M3.4 5.5c3.3-1.1 6-.7 8.3 1.2 2.3-1.9 5-2.3 8.3-1.2v12c-3.3-1.1-6-.7-8.3 1.2-2.3-1.9-5-2.3-8.3-1.2Z" />
      <path d="M11.9 6.8v11.7" />
      <path d="M15.6 10.2c1.4-.3 2.5-.3 3.4 0" />
    </>
  ),
  // Two hills and a sun on a horizon line: the place, and the day over it.
  conditions: (
    <>
      <circle cx="17.1" cy="6.9" r="2.5" />
      <path d="M2.6 18.1c2.4-4 4.3-6 5.9-6 1.5 0 2.9 1.5 4.1 4.4" />
      <path d="M9.4 18.1c2.4-3.4 4.3-5.2 5.8-5.2s3.3 1.7 5.2 5.2" />
      <path d="M2.5 18.2h19" />
    </>
  ),
  // A shield with an exclamation mark: warnings to review before the lesson.
  safety: (
    <>
      <path d="M12 2.8 20 6v5.7c0 4.4-3.4 7.8-8 9.5-4.6-1.7-8-5.1-8-9.5V6Z" />
      <path d="M12 7.5v5.5M12 16.2h.01" />
    </>
  ),
  // A sheet with a folded corner and two written lines: the paper copy.
  print: (
    <>
      <path d="M5.9 3.6h7.4l5 4.9v11.9H5.9Z" />
      <path d="M13.2 3.7v4.9h4.9" />
      <path d="M9 13.2h6" />
      <path d="M9 16.4h4" />
    </>
  ),
  // The row's "there is more this way". Drawn rather than typed: the single
  // guillemet the strip used renders as a hairline in Nunito and disappears
  // against paper at arm's length, which is the one distance that matters.
  // A tablet held upright with one line of script showing: the teleprompter.
  tablet: (
    <>
      <rect x="5.5" y="2.8" width="13" height="18.4" rx="2.2" />
      <path d="M9 8.2h6M9 11.6h4" />
      <path d="M11 18.2h2" />
    </>
  ),
  // A sheet with a tick beside its lines: the objectives the lesson carries.
  standards: (
    <>
      <path d="M5.9 3.6h12.2v16.8H5.9Z" />
      <path d="M9 8.4h6M9 11.8h6" />
      <path d="m9 16.2 1.6 1.5 3.4-3.2" />
    </>
  ),
  // A clock face with the hands at the half hour: the minutes outside.
  clock: (
    <>
      <circle cx="12" cy="12.4" r="8.2" />
      <path d="M12 7.6v4.8l3.2 2" />
    </>
  ),
  chevron: <path d="M9.5 5.4 16.1 12l-6.6 6.6" />,
  // An arch standing on the ground: the one threshold, and it looks like one.
  door: (
    <>
      <path d="M6.3 20.3V9.9a5.7 5.7 0 0 1 11.4 0v10.4" />
      <path d="M3.4 20.4h17.2" />
      <path d="M14.3 14.6h.01" />
    </>
  ),
};

export function PreparationGlyph({
  name,
  size = 24,
}: {
  name: PreparationGlyphName;
  size?: number;
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
    >
      {glyphs[name]}
    </svg>
  );
}
