/**
 * Types for `cla-identity-gate.mjs`.
 *
 * Same reason as `primary-checkout-gate.d.mts`: the script is `.mjs` so it can
 * run from a git hook with no build step and no `node_modules`, and
 * `tsconfig.json` sets `allowJs: false`, so without this declaration the spec's
 * import is an implicit `any` and asserts nothing about shape.
 */

/** Which half of the identity a refusal is about. */
export interface Offender {
  role: "author" | "committer";
  email: string;
}

/** Everything the decision is made from. Gathered once, then judged purely. */
export interface Facts {
  /** From `git var GIT_AUTHOR_IDENT` — the environment, then the config. */
  authorEmail: string;
  /** From `git var GIT_COMMITTER_IDENT`. Can differ from the author's. */
  committerEmail: string;
  /** Logins from `.github/workflows/cla.yml`. Empty means "could not read". */
  allowlist: string[];
  /**
   * Which ref answered — `<remote>/main` for a remote whose URL names the base
   * repository — or `unread`. Never a worktree copy: a branch can edit that
   * and `pull_request_target` will not read it.
   */
  allowlistSource: string;
  /** The base remote, when one exists, so a warning can name the real fetch. */
  baseRemote: string | null;
  /** Is the escape hatch environment variable set? */
  bypass: boolean;
}

export interface Verdict {
  refuse: boolean;
  /** True only when the escape hatch changed the outcome. */
  bypassed: boolean;
  /**
   * Blind rather than clear: an agent is committing and the deciding allowlist
   * could not be read. Allows the commit and says so, with the fetch that
   * restores the check.
   */
  warn?: boolean;
  /** The half that would fail the check, when there is one. */
  offender: Offender | null;
  reason: string;
}

/** Injectable so a test can drive the gate without a real repository. */
export type GitRunner = (args: string[], cwd?: string) => string;

export const ESCAPE_HATCH: string;
export const CLA_WORKFLOW: string;
export const CLA_WORKFLOW_PATH: string;
export const BASE_BRANCH: string;
export const BASE_REPOSITORY: string;
export const BASE_HOSTS: Set<string>;
export const CANONICAL_CLAUDE_IDENTITY: { name: string; email: string };
export const PROVIDER_LOGINS: Map<string, string>;

export function parseAllowlist(yaml: string | null | undefined): string[];
export function parseRemoteUrl(
  url: string | null | undefined
): { host: string; path: string } | null;
export function namesBaseRepository(url: string | null | undefined): boolean;
export function shellQuote(value: string | null | undefined): string;
export function baseRemotes(options?: { cwd?: string; git?: GitRunner }): string[];
export function readAllowlistSource(options?: {
  cwd?: string;
  git?: GitRunner;
}): { yaml: string; source: string };
export function loginForEmail(email: string | null | undefined): string | null;
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
