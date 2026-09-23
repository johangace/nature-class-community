/**
 * Types for `worktree-deps-gate.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — it has to run as
 * `node scripts/…` with no build step, from an npm lifecycle hook, in a tree
 * whose `node_modules` is missing or belongs to somebody else. That is the
 * whole point of it, so it can never import from `node_modules` itself.
 *
 * This file is how its spec still gets typechecked: `tsconfig.json` sets
 * `allowJs: false`, so without a declaration the import is an implicit `any`
 * and the test asserts nothing about shape. Same arrangement as
 * `primary-checkout-gate.d.mts`.
 */

/** A declared package installed at a version this tree's lock file does not pin. */
export interface VersionMismatch {
  name: string;
  /** What this working tree's `package-lock.json` pins. */
  want: string;
  /** What is actually on disk. */
  got: string;
}

/** Everything the decision is made from. Gathered once, then judged purely. */
export interface Facts {
  /** `git rev-parse --show-toplevel`, canonical; the cwd when there is no repository. */
  toplevel: string;
  /** True when this working tree is a linked worktree rather than a primary checkout or clone. */
  linked: boolean;
  /** `<toplevel>/node_modules` — the only install this tree may run against. */
  ownModules: string;
  /** Where node will actually resolve `node_modules` from `toplevel`, canonical. */
  modulesDir: string | null;
  /** Declared packages absent from the resolved install. Empty unless the install is this tree's. */
  missing: string[];
  /** Declared packages present at the wrong version. Empty unless the install is this tree's. */
  mismatched: VersionMismatch[];
  /** Is the escape hatch environment variable set? */
  bypass: boolean;
}

/**
 * `ok`      the install is this tree's own and matches its lock file
 * `none`    nothing is reachable
 * `foreign` the resolved install belongs to another checkout
 * `drift`   the right directory, the wrong contents
 */
export type Finding = "ok" | "none" | "foreign" | "drift";

export interface Verdict {
  refuse: boolean;
  /** True only when the escape hatch changed the outcome. */
  bypassed: boolean;
  kind: Finding;
  reason: string;
}

/** Injectable so a test can drive the gate without a real repository. */
export type GitRunner = (args: string[], cwd?: string) => string;

export const ESCAPE_HATCH: string;
export const FIX_COMMAND: string;
export const BOOTSTRAP_COMMAND: string;

export function canonical(path: string | null | undefined): string;
export function findModulesDir(
  start: string,
  options?: { exists?: (path: string) => boolean }
): string | null;
export function declaredDependencies(manifest: unknown): string[];
export function lockedVersions(lock: unknown): Map<string, string>;
export function compareInstall(input: {
  declared: string[];
  locked: Map<string, string>;
  readVersion: (name: string) => string | null | undefined;
}): { missing: string[]; mismatched: VersionMismatch[] };
export function decide(facts: Facts): Verdict;
export function formatRefusal(facts: Facts, verdict: Verdict): string;
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
