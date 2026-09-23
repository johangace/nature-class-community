/**
 * Types for `synthesize-lesson-preview.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — a maintainer runs
 * it as plain node with no build step, and it must keep working that way. This
 * file is how its spec still gets typechecked: `tsconfig.json` sets
 * `allowJs: false`, so without a declaration the import is an implicit `any`
 * and the test asserts nothing about shape. Same pattern as
 * `register-lint.d.mts` and `worktree-patrol.d.mts`.
 *
 * `clipKeyFor` is the one export the spec actually leans on, and the reason
 * this file is worth having: it is compared against `clipKey` in
 * `lib/lesson/preview-audio.ts` over the whole shipped corpus, and an `any`
 * there would let a signature change slide through the check that exists to
 * catch exactly that.
 */

/** One spoken run and the silence after it. Mirrors lib/lesson/preview.ts. */
export interface Segment {
  text: string;
  gapAfterMs: number;
  /** The shape-card part this segment names, for the drawer (nc#625). */
  part?: number;
}

export const MODEL_ID: string;
export const VOICE_ID: string;

/** The content address of a card's recording: words, silences, voice, tier. */
export function clipKeyFor(narration: Segment[]): string;

/** Trim, splice and master one card's segments in a single ffmpeg pass. */
export function spliceCard(
  buffers: Buffer[],
  gapsMs: number[]
): { buffer: Buffer; seconds: number; marks: number[] } | null;

/** Every card needing a recording, deduplicated by content address. */
export function collectCorpus(
  onlySession?: string | null
): Array<{ key: string; segments: Segment[]; says: string }>;
