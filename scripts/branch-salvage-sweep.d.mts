/**
 * Types for `branch-salvage-sweep.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/`: it has to run as
 * `node scripts/…` with no build step, from a merge command and from a
 * terminal, in a worktree whose `node_modules` may be missing. `tsconfig.json`
 * sets `allowJs: false`, so without this file the spec's import is an implicit
 * `any` and the test asserts nothing about shape. Same arrangement as
 * `worktree-patrol.d.mts`.
 */

/** How one file on a branch relates to main. */
export type FileState =
  | "never-landed"
  | "dropped-in-branch"
  | "divergent"
  | "superseded-by-deletion"
  | "overtaken"
  | "landed";

/** What the sweep concludes about a whole branch. There is deliberately no "unknown". */
export type Verdict =
  | "stranded"
  | "divergent"
  | "unmerged"
  | "superseded"
  | "in-flight"
  | "landed"
  | "empty";

export interface FileFinding {
  path: string;
  blob: string;
  state: FileState;
  /** "tip" if the branch still carries it; "dropped" if only its history did. */
  origin: "tip" | "dropped";
  /** Paths on main's tip sharing this file's basename — the rename hint. */
  sameNameOnMain?: string[];
}

/** Every version of every file main has ever held, plus its current tip. */
export interface MainIndex {
  blobs: Set<string>;
  paths: Set<string>;
  tip: Set<string>;
  byBasename: Map<string, string[]>;
}

export interface BranchFindings {
  branch: string;
  head: string;
  lastCommitISO: string;
  lastAuthor: string;
  subject: string;
  base: string;
  ahead: number;
  behind: number;
  ageHours: number | null;
  files: FileFinding[];
  counts: Record<FileState, number>;
  verdict: Verdict;
  /** Some of this branch's content is on main and some of it is nowhere. The #436 shape. */
  partialLanding: boolean;
  /** No merge base with main at all. */
  orphan?: boolean;
}

export interface SweepResult {
  mainRef: string;
  /** Remote branches that exist. */
  total: number;
  /** Remote branches classified. Equal to `total` unless `only` was given. */
  scanned: number;
  results: BranchFindings[];
}

export interface GateResult {
  branch: string;
  mainRef: string;
  base: string;
  authored: number;
  lost: FileFinding[];
}

/** Injectable so a spec can drive the sweep against a scratch repository. */
export type GitRunner = (args: string[]) => string;

export const COLD_THRESHOLD_HOURS: number;
export const FILE_STATES: FileState[];
export const VERDICTS: Verdict[];

export function assertDeepClone(mainRef?: string, git?: GitRunner): void;
export function shallowBoundaries(git?: GitRunner): string[];
/** Throws when a shallow boundary is reached by HEAD or any ref, not only by main. */
export function assertHistoryComplete(git?: GitRunner): void;
export function mainContentIndex(mainRef?: string, git?: GitRunner): MainIndex;
export function treeBlobs(ref: string, git?: GitRunner): Map<string, string>;
export function classifyFile(input: {
  path: string;
  blob: string;
  index: MainIndex;
  mainTouchedSince: boolean;
  mainDeletedSince: boolean;
}): FileState;
export function sweepBranch(
  branch: string,
  options?: { mainRef?: string; index?: MainIndex; now?: number; git?: GitRunner },
): BranchFindings;
export function verdictFor(
  result: Pick<BranchFindings, "counts" | "files" | "ageHours">,
  options?: { coldThresholdHours?: number },
): Verdict;
export function sweep(options?: {
  mainRef?: string;
  now?: number;
  git?: GitRunner;
  only?: string | null;
}): SweepResult;
export function gateBranch(
  branch: string,
  options?: { mainRef?: string; git?: GitRunner },
): GateResult;
export function formatGate(gate: GateResult): string;
export function formatReport(
  sweepResult: SweepResult,
  options?: { coldThresholdHours?: number },
): string;

/* --------------------------------------------------------------------------
 * nc#885: committed work that was never seen. Same unit, different question.
 * ------------------------------------------------------------------------ */

/** Where one branch stands with respect to having been LOOKED at. */
export type UnseenState =
  | "unpushed"
  | "ahead-of-origin"
  | "never-reviewed"
  | "moved-since-review"
  | "review-unknown"
  | "open-pr"
  | "reviewed"
  | "level";

/** Enough of a pull request to answer "has anyone seen this tip". */
export interface PullRequestLike {
  state: string;
  sha: string;
  number?: number;
  ref?: string;
  merged?: boolean;
}

export interface PullRequestRecord extends PullRequestLike {
  number: number;
  ref: string;
  merged: boolean;
}

/** What the board says about the ticket a branch name carries. */
export interface TicketFacts {
  ticket: number;
  state: string;
  title: string;
  labels: string[];
  /** "p0" | "p1" | "p2", or null when the ticket carries no priority label. */
  priority: string | null;
  /** `johan-gated` or `johan-decision` — it cannot pass its gate while invisible. */
  gated: boolean;
}

/** Facts about a branch before any judgement is attached. */
export interface UnseenFacts {
  branch: string;
  head: string;
  ref?: string;
  local?: boolean;
  onOrigin?: boolean;
  worktree?: string | null;
  ahead: number | null;
  behind?: number | null;
  ageHours: number | null;
  lastCommitISO?: string;
  /** No measurable position against main. Never called stranded. */
  orphan?: boolean;
}

export interface UnseenRecord extends UnseenFacts {
  state: UnseenState;
  cold: boolean;
  stranded: boolean;
  pullRequests: PullRequestLike[];
  ticket?: number | null;
  ticketFacts?: TicketFacts | null;
}

/** The fields ranking reads. Kept narrow so a fixture can rank without a repo. */
export interface UnseenRank {
  branch: string;
  state: UnseenState;
  ageHours: number | null;
  ticketFacts?: TicketFacts | null;
}

export interface UnseenScanResult {
  mainRef: string;
  coldThresholdHours: number;
  /** False when the pull request list could not be read; nothing is called unreviewed then. */
  pullRequestsKnown: boolean;
  shallow: boolean;
  scanned: number;
  localScanned: number;
  worktreesSeen: number;
  /** Committed, ahead of main, and origin does not have it. */
  unpushed: UnseenRecord[];
  /** On origin, ahead, and no pull request ever carried this tip. */
  unreviewed: UnseenRecord[];
  /** Reported-shaped but warm, plus everything with an open pull request. */
  inFlight: UnseenRecord[];
  aheadWithNoOpenPr: number;
  reviewed: number;
  level: number;
  results: UnseenRecord[];
}

/** Injectable so a spec can drive the board lookups without a network. */
export type GhRunner = (args: string[]) => string;

export const UNSEEN_STATES: UnseenState[];
export const UNSEEN_REPORTED: Set<UnseenState>;
export const PRIORITY_LABELS: string[];

export function ticketFromBranch(branch: string): number | null;
export function priorityRank(priority: string | null | undefined): number;
export function fetchPullRequests(options: {
  repo: string;
  gh?: GhRunner;
  perPage?: number;
  maxPages?: number;
}): PullRequestRecord[];
export function indexPullRequests(
  pullRequests: PullRequestRecord[],
): Map<string, PullRequestRecord[]>;
export function makeTicketLookup(options: {
  repo: string;
  gh?: GhRunner;
  cache?: Map<number, TicketFacts | null>;
}): (ticket: number | null | undefined) => TicketFacts | null;
export function localBranchRecords(git?: GitRunner): UnseenFacts[];
export function remoteBranchRecords(git?: GitRunner, mainRef?: string): UnseenFacts[];
export function branchPosition(
  record: UnseenFacts,
  options?: { mainRef?: string; git?: GitRunner; now?: number },
): UnseenFacts;
export function classifyUnseen(
  facts: UnseenFacts,
  options?: {
    coldThresholdHours?: number;
    originHasTip?: boolean | null;
    pullRequests?: PullRequestLike[];
    pullRequestsKnown?: boolean;
  },
): UnseenRecord;
export function triageBand(record: UnseenRank): number;
export function rankUnseen(a: UnseenRank, b: UnseenRank): number;
export function unseenScan(options?: {
  mainRef?: string;
  git?: GitRunner;
  now?: number;
  pullRequests?: PullRequestRecord[];
  ticketLookup?: (ticket: number | null | undefined) => TicketFacts | null;
  coldThresholdHours?: number;
  includeRemote?: boolean;
  pullRequestsKnown?: boolean;
}): UnseenScanResult;
export function formatUnseenReport(
  scan: UnseenScanResult,
  options?: { all?: boolean },
): string;
