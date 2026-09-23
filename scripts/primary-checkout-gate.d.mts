/**
 * Types for `primary-checkout-gate.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — it has to run as
 * `node scripts/…` with no build step, from a git hook, in a tree whose
 * `node_modules` is missing or broken. This file is how its spec still gets
 * typechecked: `tsconfig.json` sets `allowJs: false`, so without a declaration
 * the import is an implicit `any` and the test asserts nothing about shape.
 */

/** Everything the decision is made from. Gathered once, then judged purely. */
export interface Facts {
  /** `git rev-parse --absolute-git-dir`. */
  gitDir: string;
  /** `git rev-parse --git-common-dir`, absolute. Equal to `gitDir` in a primary checkout. */
  commonDir: string;
  /** `git rev-parse --show-toplevel`, for the refusal message. */
  toplevel: string;
  /** True when this is a primary checkout — a clone's only tree, or a shared one. */
  primary: boolean;
  /** Working trees other than this repository's primary checkout. */
  linkedWorktrees: number;
  authorEmail: string;
  committerEmail: string;
  /** Is the escape hatch environment variable set? */
  bypass: boolean;
}

export interface Verdict {
  refuse: boolean;
  /** True only when the escape hatch changed the outcome. */
  bypassed: boolean;
  reason: string;
}

/** Injectable so a test can drive the gate without a real repository. */
export type GitRunner = (args: string[], cwd?: string) => string;

export const ESCAPE_HATCH: string;
export const AGENT_EMAIL_PATTERNS: RegExp[];

export function isAgentIdentity(email: string | null | undefined): boolean;
export function parseIdent(line: string | null | undefined): { name: string; email: string } | null;
export function countWorktrees(porcelain: string | null | undefined): number;
export function decide(facts: Facts): Verdict;
export function formatRefusal(facts: Facts): string;
export function gather(options?: {
  cwd?: string;
  git?: GitRunner;
  env?: NodeJS.ProcessEnv;
}): Facts;
export function main(options?: {
  cwd?: string;
  git?: GitRunner;
  env?: NodeJS.ProcessEnv;
  err?: (message: string) => void;
}): number;
