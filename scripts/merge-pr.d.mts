/**
 * Types for `merge-pr.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — it has to run as
 * `node scripts/…` with no build step, from a terminal and from a worker
 * session. This file is how its spec still gets typechecked: `tsconfig.json`
 * sets `allowJs: false`, so without a declaration the import is an implicit
 * `any` and the test asserts nothing about shape.
 */

export const REPO: string;
export const BUILD_CHECK: string;
export const MERGEABLE_CHECK: string;
/** The check-run `commit-identity.yml` publishes; required since #958. */
export const IDENTITY_CHECK: string;

/** Labels reserving a ticket's answer for Johan; a PR closing one is refused (#823). */
export const CONTENT_GATE_LABELS: string[];
export const POLL_INTERVAL_MS: number;
export const WAIT_TIMEOUT_MS: number;
export const USAGE: string;

/**
 * Absolute path of the REST transport this gate spawns instead of `gh`
 * (nc#1205), re-exported from `github-api.mjs` (nc#1261).
 *
 * The stdout allowance that goes with it (#837) is no longer declared here:
 * this gate's `GH_MAX_BUFFER` and the transport's `DEFAULT_MAX_BUFFER` were one
 * mechanism under two names, and had drifted to two values. Import
 * `DEFAULT_MAX_BUFFER` from `./github-api.mjs`.
 */
export const API_HELPER: string;

/** One entry of `GET /repos/:repo/commits/:sha/check-runs`, narrowed to what the gate reads. */
export interface CheckRun {
  name: string;
  status: string;
  conclusion?: string | null;
  started_at?: string;
  completed_at?: string;
  html_url?: string;
}

/** A failed run whose whole life fits inside this never ran a step (#679). */
export const REFUSAL_SIGNATURE_MS: number;

/**
 * The sentence naming an Actions-refusal red (#679), appended to the refusal
 * reason, or null for a run without the signature.
 */
export function refusalSignature(run: CheckRun | null | undefined): string | null;

/**
 * A ticket the PR claims to close, as far as the content gate is concerned.
 * `labels: null` means GitHub could not be asked — which refuses, because
 * absence of a label is not evidence of no gate (#823).
 */
export interface LinkedIssue {
  number: number;
  kind?: "issue" | "pull-request" | "missing" | "unreadable";
  title?: string;
  labels: string[] | null;
  error?: string;
}

/** Everything the gate judges, as read from GitHub. */
export interface GateState {
  prNumber: string | number;
  title?: string;
  /**
   * The PR body as read at merge time. The closing-set check reads THIS and
   * nothing stored, so a keyword left in prose cannot close a ticket (#983).
   */
  body?: string | null;
  prState: string;
  baseRef: string;
  /** The PR's head branch name, for the post-gate squash-coverage report (#550). */
  headRef?: string;
  draft?: boolean;
  headSha: string;
  mergeable: boolean | null;
  mergeableState?: string | null;
  behindBy?: number;
  /**
   * The PR's commits, in order. `null` means they could not be read, which
   * REFUSES: the squash message is composed from them, and GitHub closes
   * issues from a commit message exactly as it does from a body (#995).
   */
  commits?: PullRequestCommit[] | null;
  /** `pulls/:n`'s own commit count, to catch a truncated read (#995). */
  commitCount?: number | null;
  checkRuns?: CheckRun[];
  /** The tickets this PR closes, with their labels (#823). */
  linkedIssues?: LinkedIssue[];
  /** Ticket numbers named in --johan-cleared: waives the content gate on those only. */
  clearedTickets?: number[];
  /** --admin-override in use: waives the strict up-to-date rule only. */
  override?: boolean;
  /** --wait in use: waitable conditions hold instead of refusing. */
  wait?: boolean;
  /** The wait budget is spent; a hold becomes a refusal. */
  waitExpired?: boolean;
  waitBudgetMs?: number;
}

export type Verdict = "merge" | "wait" | "refuse";

export interface GateResult {
  verdict: Verdict;
  /** Present when the verdict is `refuse`: the message handed to the operator. */
  reason?: string;
  /** Present when the verdict is `wait`: what is being waited on, for the progress line. */
  waitingFor?: string;
  /**
   * Present when the verdict is `merge`: the exact squash commit to write, so
   * the merge names its message the way it names its sha (#995).
   */
  squash?: SquashPlan;
  notes: string[];
  warnings: string[];
}

export interface ParsedArgs {
  prNumber?: string;
  /** `null` when the flag is absent, `""` when present with no reason. */
  override?: string | null;
  /** --johan-cleared's written reason; same null/"" convention as `override` (#823). */
  cleared?: string | null;
  wait?: boolean;
  /**
   * --dry-run in use: the gates are judged in the usual order and nothing is
   * merged (#1242). The verdict short-circuits on the first refusal like any
   * other run, so it reports every gate only on the path that would merge.
   */
  dryRun?: boolean;
  usageError?: boolean;
  /**
   * The arguments this script does not know, when any were given — which is a
   * usage error rather than a silent no-op, because `--dry-run` was dropped on
   * the floor and merged #1238 for real (#1242).
   */
  unknown?: string[];
}

export function formatDuration(ms: number): string;
export function parseArgs(argv: string[]): ParsedArgs;

/** Every `#N` in a string, deduplicated, in order of appearance. */
export function ticketRefs(text: string | null | undefined): number[];

/**
 * A markdown string with its code removed — fenced blocks, indented blocks and
 * inline backtick spans — so a quoted closing keyword is not read as one (#942).
 *
 * Indented blocks and fence closers are judged against the innermost container's
 * content indent, so a list item's continuation prose is not read as code (#953).
 * Where that reading is uncertain the text is KEPT: stripping prose hides a real
 * closing reference, which is the expensive error under #823.
 */
export function stripCode(text: string | null | undefined): string;

/**
 * The tickets a PR claims to answer: every `#N` in the title (house convention)
 * plus GitHub's closing keywords in the body's prose. A bare `#N` in the body is
 * a citation, not a claim, and is deliberately not counted (#823); a keyword
 * inside code is a quotation, not a claim, and is not counted either (#942).
 */
export function closingTicketRefs(pr: { title?: string; body?: string | null }): number[];

/** A closing keyword used mid-clause: GitHub closes it, the body never claimed it (#983). */
export interface IncidentalClosing {
  number: number;
  /** The words the refusal quotes, so the author can find the sentence at once. */
  quote: string;
}

/**
 * What merging this body will CLOSE, split by whether it meant to say so (#983).
 *
 * `declared` is a closing directive that OPENS a clause — the author's claim.
 * `incidental` is the same keyword used as a verb mid-clause ("tried to fix
 * #977", "does not close #922"); GitHub closes those too and cannot be told
 * otherwise, so the gate refuses on them. Body only: a title never closes.
 */
export function bodyClosings(body?: string | null): {
  declared: number[];
  incidental: IncidentalClosing[];
};

/** One closing reference, as found in a string, with where and how it sits. */
export interface ClosingMatch {
  number: number;
  /** Offset of the match in the string it was found in. */
  index: number;
  /** The matched words, keyword and target together. */
  text: string;
  /** True for `owner/repo#N` or an issue URL — always THIS repository's (#991). */
  qualified: boolean;
  /** True when the keyword opens a clause, which is what makes it a claim (#983). */
  declared: boolean;
  /** The words around it, for a refusal or a warning to quote. */
  quote: string;
}

/**
 * Every closing reference in a string that would close a ticket in THIS
 * repository — bare, qualified, or as an issue URL, with or without a colon
 * (#991). A qualified reference to another repository closes nothing here and
 * is skipped. Code is not stripped; callers decide (a body is markdown, a
 * commit message is not).
 */
export function closingMatches(text: string | null | undefined): ClosingMatch[];

/** The separator that disarms a closing keyword without hiding it: `clos·es` (#942). */
export const CLOSING_SEPARATOR: string;

/** `closes` -> `clos·es`. Case and every other character are preserved. */
export function separateClosingKeyword(word: string): string;

/** One closing keyword disarmed in a composed squash message (#995). */
export interface SeparatedClosing {
  number: number;
  quote: string;
}

/**
 * `text` with every closing reference naming a ticket outside `declared`
 * disarmed by the separator, and the list of what was disarmed (#995).
 */
export function separateUndeclaredClosings(
  text: string | null | undefined,
  declared?: number[],
): { text: string; separated: SeparatedClosing[] };

/** One commit of a pull request, narrowed to what the squash message needs. */
export interface PullRequestCommit {
  sha?: string;
  message?: string;
}

/**
 * The squash commit GitHub's own settings would compose for this PR
 * (COMMIT_OR_PR_TITLE + COMMIT_MESSAGES), composed here so the gate can read it
 * before it lands (#995). The ` (#N)` suffix GitHub appends to a title it
 * composes is appended here, since supplying `commit_title` suppresses it.
 */
export function composeSquashMessage(input: {
  title?: string;
  prNumber: string | number;
  commits?: PullRequestCommit[];
}): { title: string; message: string };

/** The exact squash commit a merge will write, with its disarmed keywords listed. */
export interface SquashPlan {
  title: string;
  message: string;
  separated: SeparatedClosing[];
}

/**
 * `composeSquashMessage`, then every closing keyword the BODY did not declare
 * disarmed and a trailer added saying so (#995). The tickets a merge closes are
 * the tickets the body declares; a commit message only narrates them.
 */
export function squashPlan(input: {
  title?: string;
  prNumber: string | number;
  commits?: PullRequestCommit[];
  declared?: number[];
}): SquashPlan;

/**
 * The PR's commits over REST, or `null` when they could not be read — which
 * refuses, because the squash message is composed from them (#995).
 */
export function readPullRequestCommits(
  prNumber: string | number,
  options?: { api?: (args: string[]) => string },
): PullRequestCommit[] | null;

/**
 * How many commits main is ahead of `headSha`, asked for one field at a time so
 * a megabyte-scale comparison never crosses the pipe (#837). THROWS when the
 * answer carries no integer: `evaluateGates` reads a missing `behindBy` as
 * zero, so an unread comparison must never pass for an up-to-date head.
 */
export function readBehindBy(
  headSha: string,
  options?: { api?: (args: string[]) => string },
): number;

/**
 * Everything the gate judges, read fresh from GitHub. `api`, `sleep` and `log`
 * are injectable so the fact-READING is testable without a network — #837 is
 * the reading going wrong on a green pull request (`spawnSync gh ENOBUFS`).
 */
export function collectFacts(
  prNumber: string | number,
  options?: {
    api?: (args: string[]) => string;
    sleep?: (ms: number) => void;
    log?: (line: string) => void;
  },
): GateState & { headRef?: string; linkedIssues: LinkedIssue[] };

/** One referenced ticket's labels, or `labels: null` when GitHub could not be asked. */
export function readTicket(
  number: number,
  options?: { api?: (args: string[]) => string },
): LinkedIssue;
export function latestCheckRun(checkRuns: CheckRun[] | undefined, name: string): CheckRun | null;
export function evaluateGates(state: GateState): GateResult;

/** How long the script will wait for `pulls/:n` to catch up with the branch tip (#859). */
export const HEAD_SETTLE_ATTEMPTS: number;
export const HEAD_SETTLE_INTERVAL_MS: number;

/** A pull request as GitHub's REST API returns it, narrowed to what the settle reads. */
export interface PullRequestHead {
  head?: { sha?: string; ref?: string; repo?: { full_name?: string } | null };
  [key: string]: unknown;
}

/**
 * The head branch's actual tip, or `null` when it cannot be read — which costs
 * the settle and never a refusal (#859).
 */
export function branchTip(
  pr: PullRequestHead | null | undefined,
  options?: { api?: (args: string[]) => string },
): string | null;

/**
 * The pull request, re-read while GitHub's copy of it lags the head branch's
 * tip — the stale head a merge invoked straight after a push used to judge (#859).
 */
export function readPullRequest(
  prNumber: string | number,
  options?: {
    api?: (args: string[]) => string;
    sleep?: (ms: number) => void;
    log?: (line: string) => void;
  },
): PullRequestHead;

/**
 * The outcome of the REST merge call (#859). `merged: false` is a fact about
 * the PR — the head moved, or GitHub declined — never a broken tool: an
 * unrecognised failure throws instead.
 */
export interface MergeOutcome {
  merged: boolean;
  /** The squash commit GitHub created, when it merged. */
  sha?: string;
  /** GitHub's own message, surfaced in place of what `gh pr merge` used to print. */
  message?: string;
  /** The head moved between the gate and the merge call; GitHub refused (409). */
  stale?: boolean;
  /** Present when `merged` is false: the message handed to the operator. */
  reason?: string;
}

/**
 * Squash-merge over REST, asserting `sha` is the head the gate evaluated
 * (#859). REST because `gh pr merge` is GraphQL and 403s in the sessions where
 * merges are actually run; `sha` because the merge must be authorised for one
 * commit, so GitHub itself refuses a head that moved underneath the gate.
 *
 * `squash` is required for the same reason as `sha` (#995): without it GitHub
 * composes the commit message out of the branch, and a commit message closes
 * issues on its own authority.
 */
export function mergePullRequest(
  prNumber: string | number,
  headSha: string,
  options?: { squash?: SquashPlan; api?: (args: string[]) => string },
): MergeOutcome;

/**
 * The squash-coverage report printed immediately before the merge (#550/#436):
 * does the squash carry everything this branch's history authored? Returns the
 * text to print, or `null` when there is no head ref. Never throws, and never
 * refuses a merge — see the comment on it in `merge-pr.mjs`.
 */
export function squashCoverageLine(
  headRef: string | undefined | null,
  options?: {
    /** Runs `git` in the checkout to answer about; defaults to this process's. */
    git?: (args: string[]) => string;
    gate?: (branch: string) => import("./branch-salvage-sweep.mjs").GateResult;
    fetch?: (headRef: string) => void;
  },
): string | null;

/** Prefix of the line printed when the coverage question could not be answered. */
export const SQUASH_COVERAGE_NOT_CHECKED: string;

/**
 * Where a coverage line belongs: `log` for an answer, `warn` for the absence of
 * one, with the sentences that go beside it. `null` when there is nothing to say.
 */
export function squashCoverageReport(
  line: string | null | undefined,
): { stream: "log" | "warn"; lines: string[] } | null;

/** Whether a failure is the shallow-clone one that a deeper clone would answer. */
export function isShallowRefusal(error: unknown): boolean;

/**
 * Completes a shallow clone once, before any gate is read, so the multi-second
 * fetch cannot sit between the gate's last fact and the merge call. Never throws.
 */
export function completeCloneIfShallow(options?: {
  /** Runs `git` in the checkout to repair; defaults to this process's. */
  git?: (args: string[]) => string;
  hasMain?: () => boolean;
  fetchMain?: () => void;
  /** Throws a "shallow" refusal when any history the clone holds is truncated. */
  check?: () => void;
  deepen?: () => void;
}): { fetchedMain: boolean; deepened: boolean; reason?: string };
