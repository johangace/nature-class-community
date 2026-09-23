/**
 * Types for `worktree-patrol.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — it has to run as
 * `node scripts/…` with no build step, from a launchd job and from a terminal,
 * including in a tree whose `node_modules` is missing or broken (which is
 * exactly the kind of tree it exists to find). This file is how its spec still
 * gets typechecked: `tsconfig.json` sets `allowJs: false`, so without a
 * declaration the import is an implicit `any` and the test asserts nothing
 * about shape.
 */

export type Verdict = "stranded" | "live" | "clean" | "missing";

export interface WorktreeEntry {
  path: string;
  branch: string | null;
  head: string | null;
  bare: boolean;
}

/** One line of `git status --porcelain=v1`: the two-letter code and the path. */
export interface Change {
  code: string;
  path: string;
}

/** What one tree looks like once git and the filesystem have been asked. */
export interface TreeFacts {
  path: string;
  branch?: string | null;
  head?: string | null;
  bare?: boolean;
  missing?: boolean;
  reason?: string;
  changes: Change[];
  newestMtimeMs: number | null;
}

export interface ClassifiedTree extends TreeFacts {
  verdict: Verdict;
  ageHours: number | null;
  dirty?: boolean;
  cold?: boolean;
}

export interface Findings {
  scanned: number;
  stranded: ClassifiedTree[];
  missing: ClassifiedTree[];
  live: ClassifiedTree[];
  clean: ClassifiedTree[];
}

/** Injectable so a test can drive the patrol without a real repo. */
export type GitRunner = (args: string[]) => string;

export const COLD_THRESHOLD_HOURS: number;
export const EXCLUDED_DIRS: string[];

export function parseWorktreeList(porcelain: string): WorktreeEntry[];
export function parseStatus(statusText: string): Change[];
export function isExcludedPath(path: string): boolean;
export function newestMtimeMs(dir: string, options?: { now?: number }): number | null;
export function classify(tree: TreeFacts, options?: { now?: number }): ClassifiedTree;
export function inspect(
  tree: WorktreeEntry,
  options?: { now?: number; git?: GitRunner },
): TreeFacts;
export function patrol(options?: { now?: number; git?: GitRunner }): Findings;
export function formatReport(findings: Findings): string;

/** Injectable so a test can drive the reporting without a network. */
export type GhRunner = (args: string[]) => string;

export const ISSUE_TITLE: string;
export const ISSUE_LABEL: string;
export const ISSUE_SEARCH_MAX_PAGES: number;
export const ISSUE_SEARCH_PER_PAGE: number;

/** The patrol's own open issue, by exact title, or null. */
export function findExistingIssue(repo: string, options?: { api?: GhRunner }): number | null;

/** Comment on that issue, or open it when there is none. Does nothing on a clean run. */
export function report(
  findings: Findings,
  repo: string,
  options?: { api?: GhRunner; log?: (line: string) => void },
): void;
