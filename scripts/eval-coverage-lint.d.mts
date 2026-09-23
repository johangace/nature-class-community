/**
 * Types for `eval-coverage-lint.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/`, so CI can run it
 * with no build step. This file is how its spec still gets typechecked:
 * `tsconfig.json` sets `allowJs: false`, so without a declaration the import is
 * an implicit `any` and the test asserts nothing about shape. Same pattern as
 * `migration-order-lint.d.mts`, `register-lint.d.mts` and `worktree-patrol.d.mts`.
 */

// The adapter type comes from the harness that owns it. Declaring a second
// copy here would be a hand-maintained mirror of the very map this check exists
// to read from the code — the ticket's own defect, in a type.
import type { EvalAdapter } from "./prompt-eval.d.mts";

export type { EvalAdapter };

/** One prompt, as the coverage table records it. */
export interface CoverageRow {
  /** The registry's id for the prompt, e.g. `door-line`. */
  id: string;
  /** The version in the prompt's own frontmatter when the row was written. */
  version: number;
  /** Has an adapter in `scripts/prompt-eval.mjs` AND a committed fixture set. */
  measured: boolean;
}

export const DOC: string;
export const REGISTRY: string;
export const HARNESS: string;
export const WRITE_COMMAND: string;
export const START: string;
export const END: string;

/** `tests/eval/fixtures/<id>.json`, as the doc and the failures print it. */
export function fixtureFile(id: string): string;

/**
 * The prompt ids and files the registry's exported `PROMPT_FILES` names, in its
 * order. No `root`: it is the imported object, not a read of the file.
 */
export function registryEntries(): { id: string; file: string }[];

/** A prompt's declared version, read from its own frontmatter. */
export function promptVersion(file: string, root?: string): number;

/**
 * One row per registered prompt, in registry order. Async because `measured` is
 * the verdict of a real dry run, not a prediction about one.
 */
export function currentRows(
  root?: string,
  adapters?: Record<string, EvalAdapter>,
): Promise<CoverageRow[]>;

/**
 * Drive `id`'s real adapter over its real fixtures — shape, `user`, `check`,
 * the prompt itself — stopping before the model call. Returns why it could not
 * be run, or null when it can. This is what "measurable" means here.
 */
export function dryRunFault(
  id: string,
  root?: string,
  adapters?: Record<string, EvalAdapter>,
): Promise<string | null>;

/**
 * Why `id`'s fixture set cannot be run — missing, unparseable, not an array, or
 * empty — or null when it can. Existence alone is not runnability.
 */
export function fixtureFault(id: string, root?: string): string | null;

/** Adapters naming an unknown prompt, or that the dry run could not drive. */
export function instrumentProblems(
  root?: string,
  adapters?: Record<string, EvalAdapter>,
): Promise<string[]>;

/**
 * The package.json script the doc's command names must exist and must start the
 * harness with its declared runner.
 */
export function runnerProblems(root?: string): string[];

/**
 * Execute the command the table prints, at `--runs 0` so no model is called.
 * Returns why it failed, or null. This is what makes the printed line a fact
 * rather than a claim.
 */
export function runCommandFault(id: string, root?: string): string | null;

/** Anywhere in the doc the harness is invoked with something other than RUNNER. */
export function docCommandProblems(doc: string): string[];

/** The order the table prints rows in: measured first, registry order within. */
export function tableRows(rows: CoverageRow[]): CoverageRow[];

/** The doc's generated block, rendered from rows. The doc holds no other copy. */
export function renderBlock(rows: CoverageRow[]): string;

/**
 * Markers missing, duplicated, or inverted in the doc. Exactly one pair, or the
 * check has two answers to the one question it exists to answer.
 */
export function markerProblems(doc: string): string[];

/** The rows the doc records, or null when `markerProblems` has anything to say. */
export function parseBlock(doc: string): { block: string; rows: CoverageRow[] } | null;

/**
 * What moved between the recorded table and the code, in the doc's own terms.
 * The unmeasurable-bump message is the one this whole check exists for.
 */
export function driftProblems(
  recorded: CoverageRow[],
  current: CoverageRow[],
  adapters?: Record<string, EvalAdapter>,
): string[];

/** Every problem with the tree at `root`. Empty means the doc tells the truth. */
export function checkProblems(
  root?: string,
  adapters?: Record<string, EvalAdapter>,
): Promise<string[]>;
