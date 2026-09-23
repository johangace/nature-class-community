/**
 * Types for `worktree-new.mjs`. Same arrangement, and same reason, as
 * `worktree-deps-gate.d.mts`: the script is `.mjs` so it can run with no build
 * step in a tree that has no install yet, and `tsconfig.json` sets
 * `allowJs: false`, so its spec needs a declaration to assert anything about
 * shape.
 */

export interface ParsedArgs {
  branch?: string;
  path?: string;
  from?: string;
  install?: boolean;
  /** Set when the arguments could not be read; nothing else is populated. */
  error?: string;
}

export interface Preconditions {
  root: string;
  branch: string;
  from: string;
  path: string;
  hasGit: boolean;
  hasNpm: boolean;
  insideRepo: boolean;
  lockExists: boolean;
  branchExists: boolean;
  startResolves: boolean;
  pathExists: boolean;
}

export interface Step {
  /** What is printed before the step runs. */
  label: string;
  argv: string[];
  /** Relative to the repository root, or null for the root itself. */
  cwd: string | null;
}

/** Probe a command: true when it exits 0. Injectable so a spec touches no machine. */
export type Probe = (argv: string[], cwd?: string) => boolean;

/** Run a step. Mirrors the part of `spawnSync`'s result this script reads. */
export type Runner = (argv: string[], cwd?: string) => { status: number | null };

export const WORKTREE_HOME: string;
export const DEFAULT_START: string;

export function parseArgs(argv: string[]): ParsedArgs;
export function defaultPath(branch: string): string;
export function checkPreconditions(facts: Preconditions): string[];
export function plan(input: {
  branch: string;
  path: string;
  from: string;
  install: boolean;
}): Step[];
export function gather(options: {
  branch: string;
  path: string;
  from: string;
  root?: string;
  probe?: Probe;
}): Preconditions;
export function main(options?: {
  argv?: string[];
  root?: string;
  run?: Runner;
  probe?: Probe;
  out?: (message: string) => void;
  err?: (message: string) => void;
}): number;
