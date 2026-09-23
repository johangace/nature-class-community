/**
 * Types for `migration-order-lint.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/`, so CI can run it
 * with no build step. This file is how its spec still gets typechecked:
 * `tsconfig.json` sets `allowJs: false`, so without a declaration the import is
 * an implicit `any` and the test asserts nothing about shape. Same pattern as
 * `schema-mirror-lint.d.mts`, `register-lint.d.mts` and `worktree-patrol.d.mts`.
 */

/** One migration directory, as the check sees it: its name and its SQL. */
export interface MigrationEntry {
  /** The directory name — the thing Prisma orders by and records by. */
  name: string;
  /** The full text of its `migration.sql`, which is what gets hashed. */
  sql: string;
}

/** A row of the committed mirror of `_prisma_migrations`. */
export interface LedgerEntry {
  name: string;
  /** sha256 of `migration.sql` — the same value Prisma stores as `checksum`. */
  sha256: string;
  /** Set on the fifteen that predate the scheme and cannot be safely renamed. */
  legacy?: boolean;
}

/** One violation, named by the rule that found it and the migration it is about. */
export interface MigrationViolation {
  rule:
    | "recorded-but-missing"
    | "content-changed"
    | "unrecorded"
    | "scheme"
    | "duplicate-timestamp"
    | "sorts-before"
    | "stale-legacy"
    | "legacy-grew";
  name: string;
  /** Says what is wrong and what to do instead. Read by a human, in CI output. */
  message: string;
}

/** `zz_<YYYYMMDDHHMMSS>_<snake_name>` — the shape every new migration takes. */
export const SCHEME: RegExp;

/** Every migration this repo has committed, append-only, hashed. */
export const LEDGER: LedgerEntry[];

/**
 * The fifteen directory names that predate the scheme, frozen. `legacy: true`
 * on anything else is what `findLedgerViolations` refuses: the flag is the
 * exemption from the naming scheme, so the list may shrink and may not grow.
 */
export const FROZEN_LEGACY: string[];

/**
 * The ledger's own integrity — that no SIXTEENTH entry has claimed
 * grandfathered status. About the LEDGER constant, not about the tree, which is
 * why it is separate from `findViolations`.
 */
export function findLedgerViolations(
  ledger?: LedgerEntry[],
  frozen?: string[],
): MigrationViolation[];

/**
 * Does `later` sort after `earlier` under BOTH plain byte order and Prisma's
 * observed underscore-lowest order? Both, deliberately — see the script header.
 */
export function sortsAfter(later: string, earlier: string): boolean;

/** Every violation in this listing. Empty means the ledger and the scheme hold. */
export function findViolations(
  entries: MigrationEntry[],
  ledger?: LedgerEntry[],
): MigrationViolation[];

/** Read `prisma/migrations/` (or another directory) into entries. */
export function readMigrations(dir?: string): MigrationEntry[];
