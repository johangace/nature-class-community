/**
 * Types for `prompt-eval.mjs`.
 *
 * The harness is `.mjs` so it can be run with no build step. This file is how
 * `tests/unit/eval-coverage.spec.ts` gets a typechecked view of `ADAPTERS` —
 * `tsconfig.json` sets `allowJs: false`, so without a declaration the import is
 * an implicit `any` and the spec would assert nothing about shape. Same pattern
 * as `migration-order-lint.d.mts` and its siblings.
 */

/**
 * One prompt's eval adapter: how to render the user half from a committed
 * fixture, and how to judge the draft that comes back.
 */
export interface EvalAdapter {
  /** The real `maxTokens` the drafter uses. Part of the bar, not a knob. */
  maxTokens: number;
  /** The JSON field the draft arrives in. */
  field: string;
  /** Renders the user half of the call from one fixture. */
  user: (fixture: never) => Promise<string>;
  /** The guard that answers "is this true", for one draft against its fixture. */
  check: (draft: string, fixture: never) => Promise<{ ok: boolean; reason?: string }>;
}

/** Where a prompt's committed fixture set lives, relative to the repo root. */
export const FIXTURE_DIR: string;

/**
 * The executable the harness must be started with. `node` cannot resolve the
 * TypeScript chain the adapters load, so the documented command is rendered
 * from this rather than written out by hand (#1218).
 */
export const RUNNER: string;

/** The package.json script that puts `RUNNER` on PATH and starts the harness. */
export const NPM_SCRIPT: string;

/**
 * The one place the documented invocation is spelled. The coverage check both
 * prints this and runs it (at `runs: 0`), so the doc cannot advertise a command
 * nobody has executed.
 */
export function evalCommand(id: string, runs?: number): string;

/**
 * The prompts the documented 30-run bar can actually be run on. Read by
 * `scripts/eval-coverage-lint.mjs`, which is what keeps
 * `docs/PROMPT_TEMPLATE.md` honest about the ones missing from it (#1213).
 */
export const ADAPTERS: Record<string, EvalAdapter>;
