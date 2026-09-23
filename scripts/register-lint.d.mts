/**
 * Types for `register-lint.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/` — CI runs it as
 * `node scripts/register-lint.mjs` with no build step, and it must keep
 * working that way. This file is how its spec still gets typechecked:
 * `tsconfig.json` sets `allowJs: false`, so without a declaration the import
 * is an implicit `any` and the test asserts nothing about shape. Same pattern
 * as `worktree-patrol.d.mts`.
 */

/** The minimum of a session this check reads. Packs carry far more. */
export interface LintSession {
  id: string;
  kit?: unknown;
  /**
   * The warm close (`schema/pack.ts`). `named-outcome` reads presence of the
   * headline and nothing else — never its wording.
   */
  celebration?: {
    headline?: string;
    emoji?: string;
    keepsake?: string;
    nextWeekTease?: string;
  };
  phases?: Array<{
    key?: string;
    durationMin?: number;
    blocks?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** What a rule reports when a session violates it. */
export interface RuleHit {
  /** Provenance is judged on this, so it is the authored string where there is one. */
  text: string;
  reason: string;
}

export interface ShapeRule {
  id: string;
  /** The content ticket an exception for this rule is filed against. */
  ticket: string;
  describe: string;
  check(session: LintSession): RuleHit | null;
}

export interface ShapeFinding extends RuleHit {
  rule: string;
  ticket: string;
}

/** One stale entry in GRANDFATHERED: an exception that no longer describes anything. */
export interface StaleException {
  rule: string;
  session: string;
  ticket: string;
  why: string;
}

export const SHAPE_RULES: ShapeRule[];

/** rule id -> (session id -> ticket). May only shrink; see auditGrandfathered. */
export const GRANDFATHERED: Record<string, Record<string, string>>;

export function shapeFindings(session: LintSession): ShapeFinding[];

export function auditGrandfathered(sessions: LintSession[]): StaleException[];

export function loadSessions(): Array<LintSession & { __file: string }>;
