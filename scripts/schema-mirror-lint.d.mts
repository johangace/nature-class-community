/**
 * Types for `schema-mirror-lint.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/`, so CI can run it
 * with no build step. This file is how its spec still gets typechecked:
 * `tsconfig.json` sets `allowJs: false`, so without a declaration the import is
 * an implicit `any` and the test asserts nothing about shape. Same pattern as
 * `register-lint.d.mts` and `worktree-patrol.d.mts`.
 */

/** One disagreement between the mirror and zod, at the path it was found. */
export interface MirrorDrift {
  /** Dotted path from the pack root, e.g. `pack.sessions[].phases[].materialPurpose`. */
  path: string;
  /** Names the field and says which side is wrong. Read by a human, in CI output. */
  message: string;
}

/** A place the mirror is deliberately stricter than zod, and why. May shrink, not grow quietly. */
export interface MirrorDivergence {
  path: string;
  why: string;
}

export const DIVERGENCES: MirrorDivergence[];

/**
 * Walk both schemas and return every disagreement — recorded divergences
 * removed, and one STALE entry for any divergence that no longer exists.
 * Empty means the mirror says what zod says.
 */
export function findDrift(): MirrorDrift[];
