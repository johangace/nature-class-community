/**
 * Types for `green-pr-sweep.mjs`.
 *
 * Same reason as `merge-pr.d.mts`: the script is `.mjs` so it runs as
 * `node scripts/…` with no build step, and `tsconfig.json` sets
 * `allowJs: false`, so without this file its spec would import `any` and
 * assert nothing about shape.
 */

import type { CheckRun, GateState } from "./merge-pr.mjs";

/** Hours of green after which an offerable PR is the reading jam, not a build cycle. */
export const STALE_GREEN_HOURS: number;
export const USAGE: string;
export const MERGEABILITY_RETRIES: number;
export const MERGEABILITY_RETRY_MS: number;
/** Absolute path to `merge-pr.mjs` — the gate this script spawns, never reimplements. */
export const MERGE_SCRIPT: string;

/** `offer` = the gate would merge it now; `settling` = time will tell; `refused` = someone must act. */
export type SweepStatus = "offer" | "settling" | "refused";

export interface SweepRow {
  number: number;
  title: string;
  headSha: string | null;
  headRef: string | null;
  url: string;
  status: SweepStatus;
  /** The gate's own refusal reason, or what it is waiting on. Null when offered. */
  reason: string | null;
  /** Ticket numbers this PR claims to close, as the content gate reads them (#823). */
  closes: number[];
  /** ISO timestamp of the moment the head became green, or null if it is not. */
  greenSince: string | null;
  /** Milliseconds this PR has been green and unmerged — the number #893 is about. */
  greenForMs: number | null;
  /** Offerable and green past the threshold. */
  stale: boolean;
}

export interface SweepResult {
  rows: SweepRow[];
  now: number;
  staleAfterMs: number;
}

export type GhApi = (args: string[]) => string;

/** Epoch ms when this head's required checks all concluded success, else null. */
/** `completed_at` of the oldest run in the success streak ending at the newest run. */
export function successStreakStart(
  checkRuns: CheckRun[] | undefined | null,
  name: string,
): number | null;
export function greenSince(checkRuns: CheckRun[] | undefined | null): number | null;

export function classifyPullRequest(
  facts: GateState,
  options?: { now?: number; staleAfterMs?: number },
): SweepRow;

/** Raw `GET /repos/:repo/pulls?state=open` payloads. */
export function listOpenPullRequests(options?: { api?: GhApi }): Array<Record<string, unknown>>;

export function collectFacts(
  pr: Record<string, unknown>,
  options?: { api?: GhApi; sleep?: (ms: number) => void },
): GateState;

export function sweep(options?: {
  api?: GhApi;
  now?: number;
  staleAfterMs?: number;
  sleep?: (ms: number) => void;
}): SweepResult;

/** "5d21h" / "4h30m" / "42m" — hours and days, which `formatDuration` does not do. */
export function formatAge(ms: number): string;
export function formatGreenFor(row: Pick<SweepRow, "greenForMs">): string;
export function formatReport(result: SweepResult): string;

/** Spawns `merge-pr.mjs` for one PR. The gate decides; this only asks. */
export function offerToGate(
  prNumber: number | string,
  options?: {
    spawn?: (
      command: string,
      args: string[],
      options: Record<string, unknown>,
    ) => { status: number | null; error?: Error };
    node?: string;
  },
): { number: number; merged: boolean; exitCode: number | null };

export interface SweepArgs {
  json?: boolean;
  merge?: boolean;
  staleAfterMs?: number;
  usageError?: boolean;
}

export function parseArgs(argv: string[]): SweepArgs;
