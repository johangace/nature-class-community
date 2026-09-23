/**
 * Types for `variant-carry-lint.mjs`, so its spec is typechecked under
 * `allowJs: false`. Same pattern as `register-lint.d.mts`.
 */

export interface CarryBlock {
  type?: string;
  text?: string;
  nid?: string;
  [key: string]: unknown;
}

export interface CarryPhase {
  key?: string;
  blocks?: CarryBlock[];
  conditionVariants?: Array<{ when: string; nid?: string; phase: CarryPhase }>;
  [key: string]: unknown;
}

export interface CarrySession {
  id: string;
  phases?: CarryPhase[];
  [key: string]: unknown;
}

export interface CarryFinding {
  kind: "dropped" | "stale";
  session: string;
  /** Machine-formed address, never an authored sentence. */
  text: string;
  reason: string;
}

/** session id -> (base teacher-note nid -> ticket). */
export const CARRIED_NOTES: Record<string, Record<string, string>>;

export function carryFindings(
  sessions: CarrySession[],
  registry?: Record<string, Record<string, string>>
): CarryFinding[];

export function loadSessions(): Array<CarrySession & { __file: string }>;
