/**
 * Types for `guard-mutation-check.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — CI runs it as
 * `node scripts/guard-mutation-check.mjs` with no build step. This file is how
 * its spec still gets typechecked: `tsconfig.json` sets `allowJs: false`, so
 * without a declaration the import is an implicit `any` and the test asserts
 * nothing about shape. Same pattern as `register-lint.d.mts`.
 */

/** One planted violation and what it is expected to do to a guard. */
export interface Mutation {
  /** Stable identifier, `guard/what-was-broken`. */
  id: string;
  /** The `- name:` of the ci.yml step this proves. */
  step: string;
  /** What is being violated, in the guard's own terms. */
  why: string;
  /** argv, or a function of the sandbox that returns argv. */
  run: string[] | ((ctx: { sandbox: string }) => string[]);
  /**
   * "red"   the guard must exit non-zero and print `evidence`.
   * "green" a recorded blind spot: the guard must exit 0, and if it stops
   *         doing so the entry must be deleted.
   */
  expect: "red" | "green";
  /** Required when `expect` is "red": what the guard's own output must say. */
  evidence?: RegExp;
  /** Excluded from the default tier (tsc, the test suite, next build). */
  slow?: boolean;
}

/** ci.yml step name -> why no honest mutation can be written for it. */
export const NOT_A_GUARD: Map<string, string>;

export const MUTATIONS: Mutation[];

/** Every `- name:` step in `.github/workflows/ci.yml`, in order. */
export function ciStepNames(): string[];

/** Steps with no mutation and no NOT_A_GUARD entry, and stale entries either way. */
export function coverageProblems(names: string[]): string[];

/**
 * register-lint shape rules with no red fixture. `Register lint` is a single
 * CI step over a list of guards, so step-level coverage cannot see a rule
 * added without a mutation (#1146).
 */
export function shapeRuleProblems(): string[];

/**
 * The prompt file for the first registry prompt on the wanted side of the eval
 * split — `true` for one with an adapter in `scripts/prompt-eval.mjs`, `false`
 * for one without — resolved inside `cwd`.
 *
 * Reads the imported registry, never a parse of its source (#1218): the regex
 * this replaced required a trailing comma, and would have aborted the whole
 * harness once the final property was the last unmeasured prompt.
 */
export function firstPromptFileWhere(cwd: string, measured: boolean): string;
