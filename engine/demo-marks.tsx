import type { ReactElement } from "react";
import { type DemoMarkId } from "./demo-mark-ids";

/**
 * The demo mark set (#252). One small drawing per beat of a demonstration.
 *
 * These are bespoke rather than a reusable kit, and that was decided by
 * counting rather than taste: across the ten authored techniques there are
 * about fifteen distinct actions and seven of them occur exactly once, so a
 * shared kit would have been a kit of singletons. `hold` made the case on its
 * own — it is the most frequent verb in the corpus and the least reusable,
 * appearing as by-a-stem, flat-to-bark, on-its-side, high-overhead, resting-on-
 * an-open-palm and held-out-under-a-canopy. One "hold" glyph would have been
 * wrong six times.
 *
 * `m-look` is the exception and the one mark that repeats: six of the ten
 * techniques close on an observation, so the closing beat is the only genuinely
 * recurring element in the set.
 *
 * Drawn on a 32x32 grid, stroked in currentColor so the register colours them,
 * never filled. Unknown ids render nothing rather than throwing, which is what
 * lets a pack ship its steps before its pictures exist.
 */
const MARKS: Record<DemoMarkId, ReactElement> = {
  "m-dab": (
    <g><rect x="3" y="13" width="26" height="15" rx="2"/> <path d="M12 3.5 15.5 11"/><path d="M10 4.6 13.4 2.8"/> <circle cx="13" cy="19" r="1.1" fill="currentColor" stroke="none"/> <circle cx="17.5" cy="20.5" r="1.1" fill="currentColor" stroke="none"/> <circle cx="21" cy="18.6" r="1.1" fill="currentColor" stroke="none"/></g>
  ),
  "m-leafdown": (
    <g><path d="M16 3c-6 2.4-8 7-0 13 8-6 6-10.6 0-13Z"/><path d="M16 3.4v12"/> <path d="M16 19v6"/><path d="M12.8 21.8 16 25l3.2-3.2"/> <path d="M4 29h24"/></g>
  ),
  "m-press": (
    <g><path d="M12 2.5h8v6.5a4 4 0 0 1-8 0Z"/> <path d="M6 18c5-4.5 15-4.5 20 0"/> <path d="M4 28h24"/> <path d="M5.5 12h-3"/><path d="M26.5 12h3"/></g>
  ),
  "m-lift": (
    <g><path d="M3 28h26"/> <path d="M16 24c-5-2-6.5-5.6 0-10 6.5 4.4 5 8 0 10Z"/><path d="M16 14.4V24"/> <path d="M16 11V4"/><path d="M12.8 7.2 16 4l3.2 3.2"/></g>
  ),
  "m-turn": (
    <g><path d="M16 27c-5.5-2.4-7-6.6 0-11.6 7 5 5.5 9.2 0 11.6Z"/><path d="M16 15.8V27"/> <path d="M5.5 13a11 11 0 0 1 21 0"/> <path d="M23 10.4 26.7 13l1.3-4"/></g>
  ),
  "m-look": (
    <g><circle cx="16" cy="16" r="3.1"/> <path d="M9.4 9.6a9.2 9.2 0 0 0 0 12.8"/> <path d="M22.6 9.6a9.2 9.2 0 0 1 0 12.8"/> <path d="M5.2 5.6a14.6 14.6 0 0 0 0 20.8"/> <path d="M26.8 5.6a14.6 14.6 0 0 1 0 20.8"/></g>
  ),
  "m-high": (
    <g><path d="M4 3.5h24" strokeDasharray="3 3"/> <path d="M16 11c-2.6-2.4-3.4-5 0-6.2 3.4 1.2 2.6 3.8 0 6.2Z"/> <path d="M9.6 18a6.4 6.4 0 0 1 12.8 0"/> <path d="M16 18v10"/></g>
  ),
  "m-letgo": (
    <g><path d="M16 9c-2.4-2.2-3.2-4.6 0-5.8 3.2 1.2 2.4 3.6 0 5.8Z"/> <path d="M9 22a7 7 0 0 1 14 0"/> <path d="M6.6 19.6 4 17.4"/><path d="M25.4 19.6 28 17.4"/> <path d="M16 22v6.5"/> <path d="M11.6 13.6 9.4 11.4"/><path d="M20.4 13.6l2.2-2.2"/></g>
  ),
  "m-acorn": (
    <g><path d="M7.5 12.5h13a6.5 6.5 0 0 0-13 0Z"/> <path d="M8.5 12.5c0 7 3.2 10.5 5.5 10.5s5.5-3.5 5.5-10.5"/> <path d="M14 23v3"/> <path d="M27 4v24" strokeDasharray="3 3"/> <path d="M24.6 4h4.8"/><path d="M24.6 28h4.8"/></g>
  ),
  "m-compare": (
    <g><path d="M8.5 14c-3.4-2.2-4.2-6 0-9 4.2 3 3.4 6.8 0 9Z"/> <circle cx="23.5" cy="9.5" r="4.5"/> <path d="M8.5 20v5"/><path d="M23.5 20v5"/> <path d="M6.4 25h4.2"/><path d="M21.4 25h4.2"/></g>
  ),
  "m-pickseed": (
    <g><path d="M3 28h26"/> <ellipse cx="16" cy="21.5" rx="3.4" ry="2.6"/> <path d="M16 16.6V6.4"/><path d="M12.8 9.6 16 6.4l3.2 3.2"/></g>
  ),
  "m-palmrest": (
    <g><ellipse cx="16" cy="12.6" rx="3.6" ry="2.8"/> <path d="M4.5 17c1.6 6.4 6.2 9.6 11.5 9.6S25.9 23.4 27.5 17"/> <path d="M4.5 17 3 13.4"/><path d="M27.5 17 29 13.4"/></g>
  ),
  "m-walk": (
    <g><path d="M26 3v26"/><path d="M22.5 3v26"/> <ellipse cx="5" cy="25" rx="2.4" ry="1.6"/> <ellipse cx="10.6" cy="21.4" rx="2.4" ry="1.6"/> <ellipse cx="16.2" cy="17.8" rx="2.4" ry="1.6"/></g>
  ),
  "m-flathand": (
    <g><path d="M8 3v26"/><path d="M4.5 3v26"/> <rect x="11" y="12" width="16" height="9" rx="3"/> <path d="M15.4 12V9.4"/><path d="M19 12V8.6"/><path d="M22.6 12v-3"/></g>
  ),
  "m-breath": (
    <g><circle cx="16" cy="16" r="10.5" strokeDasharray="2.6 4.4"/> <circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none"/></g>
  ),
  "m-stem": (
    <g><path d="M11.6 3.4 15.4 7"/><path d="M20.4 3.4 16.6 7"/> <path d="M16 7.4v5.2"/> <path d="M16 26c-6-3-7.6-8 0-13.4C23.6 18 22 23 16 26Z"/> <path d="M16 12.6V26"/></g>
  ),
  "m-shake": (
    <g><path d="M16 4.6v4.4"/> <path d="M16 25c-5.4-2.8-6.8-7.4 0-12.2 6.8 4.8 5.4 9.4 0 12.2Z"/> <path d="M16 12.8V25"/> <path d="M6.6 12.6q-2.4 4.4 0 8.8"/> <path d="M25.4 12.6q2.4 4.4 0 8.8"/></g>
  ),
  "m-papertrunk": (
    <g><path d="M4.5 3v26"/><path d="M8 3v26"/> <rect x="11.5" y="6" width="16" height="20" rx="1.4"/></g>
  ),
  "m-crayon": (
    <g><rect x="3.5" y="12.6" width="18" height="7" rx="1.4"/> <path d="M21.5 12.6 28.5 16l-7 3.4Z"/> <path d="M8.4 12.6v7"/></g>
  ),
  "m-stroke": (
    <g><rect x="4" y="6.6" width="15" height="6.4" rx="1.3"/> <path d="M19 6.6 25.4 9.8 19 13Z"/> <path d="M5 19.6h21"/><path d="M7.5 24.4h16.5"/> <path d="M6 28.4h12"/></g>
  ),
  "m-canopy": (
    <g><path d="M1.8 12.4a14.2 14.2 0 0 1 28.4 0"/> <path d="M1.8 12.4h28.4"/> <path d="M8 12.8v3.4"/><path d="M16 12.8v4.2"/><path d="M24 12.8v3.4"/> <path d="M3.6 22.6c2.2 5 6.6 7.4 12.4 7.4s10.2-2.4 12.4-7.4"/></g>
  ),
  "m-open": (
    <g><path d="M16 2.4v5"/><path d="M6.6 6.2 10 9.6"/><path d="M25.4 6.2 22 9.6"/> <path d="M2.6 15.4h4.6"/><path d="M29.4 15.4h-4.6"/> <path d="M3.6 22.6c2.2 5 6.6 7.4 12.4 7.4s10.2-2.4 12.4-7.4"/></g>
  ),
  "m-hand": (
    <g><path d="M9.8 15.4V9.4a2 2 0 0 1 4 0v5"/> <path d="M13.8 14V7a2 2 0 0 1 4 0v7"/> <path d="M17.8 14.2V8.6a2 2 0 0 1 4 0v8"/> <path d="M21.8 16.8c.3-1.3 1.4-2.2 2.5-2 1.2.3 1.9 1.4 1.7 2.7-.5 4.6-2.1 9.5-8 9.8-4.4.2-6.5-1.6-8.5-4.6-.8-1.2-1.8-2.5-2.6-3.7-.7-1-.4-2.2.5-2.9.9-.7 2.1-.4 2.9.5l2.2 2.5"/></g>
  ),};

export function DemoMark({ id }: { id?: string }): ReactElement | null {
  // An id from a pack is a plain string, so it may name nothing. That is the
  // supported case, not an error: a pack ships its steps before its pictures
  // are drawn, and an undrawn step renders its numeral and its words.
  const drawing = id ? (MARKS as Record<string, ReactElement | undefined>)[id] : undefined;
  if (!drawing) return null;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawing}
    </svg>
  );
}
