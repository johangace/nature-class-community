/**
 * Types for `commit-identity-check.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/`: it runs as
 * `node scripts/…` with no build step, from a GitHub Actions step that has run
 * no `npm ci` and from a pre-push hook in a tree whose `node_modules` may be
 * missing. This file is how its spec still gets typechecked — `tsconfig.json`
 * sets `allowJs: false`, so without a declaration the import is an implicit
 * `any` and the test would assert nothing about shape.
 */

/** A git identity as a commit records it. */
export interface Identity {
  name: string;
  email: string;
}

/** One commit, however it was read: from `git log` or from GitHub's REST API. */
export interface CommitRecord {
  sha: string;
  author: Identity;
  committer?: Identity;
  message?: string;
  subject?: string;
}

/** One commit that claims an identity it is not entitled to. */
export interface Offence {
  sha: string;
  subject: string;
  claimed: string;
  committer: string | null;
  /** GitHub's Update-branch button made this merge commit; the remedy is a rebase (#958). */
  updateBranch: boolean;
  reasons: string[];
}

export interface ExcusedOffence extends Offence {
  excuse: string;
}

export interface RangeVerdict {
  branch: string;
  /** True for a recognised agent prefix, and for a branch that could not be named. */
  agentBranch: boolean;
  /** The caller could not say which branch this range belongs to (#851). */
  unknownBranch: boolean;
  /** Commits the BRANCH contributed — what was judged (#949). */
  inspected: number;
  /** Commits dropped because they are already reachable from the base (#949). */
  alreadyOnBase: number;
  offences: Offence[];
  excused: ExcusedOffence[];
}

/** Injectable so a test can drive the check against a scratch repository. */
export type GitRunner = (args: string[], options?: { cwd?: string }) => string;

export const FOUNDER_EMAILS: string[];
export const AGENT_BRANCH_PREFIXES: string[];
export const RECORDED_EXCEPTIONS: Map<string, string>;

export function isFounderIdentity(identity: Partial<Identity> | null | undefined): boolean;
export function isAgentBranch(ref: string | null | undefined): boolean;
export function isUnknownRef(ref: string | null | undefined): boolean;
export function declaresAgent(message: string | null | undefined): boolean;

/**
 * Is this the merge commit GitHub's "Update branch" button makes? Both halves
 * required: the `Merge branch 'x' into y` subject AND `GitHub
 * <noreply@github.com>` as committer (#958).
 */
export function isUpdateBranchMerge(
  commit: Partial<CommitRecord> | null | undefined,
): boolean;

/**
 * Split a range into what the branch contributed and what the base already
 * carries. `baseShas` absent or empty subtracts nothing (#949).
 */
export function partitionByBase(
  commits: CommitRecord[] | null | undefined,
  baseShas?: Iterable<string> | null,
): { contributed: CommitRecord[]; alreadyOnBase: CommitRecord[] };

/**
 * Refuse a `--base-sha` that is not a full commit SHA, by throwing (#976). It
 * names the set that gets SUBTRACTED, so a bad one narrows the guard instead of
 * failing it. Returns the trimmed SHA when it is one.
 */
export function assertBaseSha(value: unknown): string;

/** Every commit reachable from a ref, as full SHAs — the set to subtract (#949). */
export function shasReachableFrom(
  ref: string,
  options?: { cwd?: string; git?: GitRunner },
): string[];

export function inspectRange(input: {
  branch: string;
  commits: CommitRecord[];
  /** Commits already on the base; dropped before judgement (#949). */
  baseShas?: Iterable<string> | null;
}): RangeVerdict;
export function formatReport(result: RangeVerdict): string;
export function commitsFromGit(
  range: string,
  options?: { cwd?: string; git?: GitRunner },
): CommitRecord[];
export function commitsFromRestPayload(payload: unknown): CommitRecord[];
export function main(
  argv?: string[],
  options?: { cwd?: string; git?: GitRunner },
): number;
