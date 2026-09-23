/**
 * Types for `github-api.mjs`.
 *
 * Same reason as `merge-pr.d.mts`: the script is `.mjs` so it runs with no
 * build step, and `tsconfig.json` sets `allowJs: false`, so without this file
 * its spec asserts nothing about shape.
 */

export const API_ROOT: string;
export const API_HOST: string;

/**
 * Whether NO_PROXY exempts this host, on this port (default 443), from the
 * configured proxy — by the rules Node's own `fetch` applies.
 */
export function bypassesProxy(host: string, env?: Env, port?: number): boolean;
export const REQUEST_TIMEOUT_MS: number;

/**
 * What one `gh api` argv means, once read. A field written `key[]=value`
 * arrives as an array, which is how a label reaches `POST /issues`.
 */
export interface GhRequest {
  method: string;
  path: string;
  fields: Record<string, string | string[]> | null;
  jq: string | null;
}

export function parseGhArgs(args: unknown): GhRequest;
export function selectField(body: string, jq: string | null | undefined): string;
/** Only the two token names are read, so the shape is a plain string map. */
export type Env = Record<string, string | undefined>;

export function readToken(env?: Env): string;

/**
 * Whether a proxy is configured and whether this `node` honours
 * `NODE_USE_ENV_PROXY` (Node 22.21+ / 24+). With no proxy, nothing depends on it.
 */
export function proxyUsable(options?: { version?: string; env?: Env }): {
  proxied: boolean;
  usable: boolean;
  version?: string;
};

export function callGitHub(
  spec: GhRequest,
  options?: { fetchImpl?: typeof fetch; env?: Env; version?: string },
): Promise<{ status: number; body: string }>;

export function errorSummary(status: number, body: string): string;

export const API_HELPER: string;
export const DEFAULT_MAX_BUFFER: number;

/**
 * One `gh api` call from a synchronous script, run in a child process with the
 * proxy switch and the raised stdout buffer both already set. Returns trimmed
 * stdout; a refusal throws with the child's stderr attached.
 */
export function ghApiSync(
  args: string[],
  options?: {
    helperPath?: string;
    maxBuffer?: number;
    env?: Env;
    [key: string]: unknown;
  },
): string;

export function run(options: {
  stdin: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env?: Env;
  fetchImpl?: typeof fetch;
}): Promise<number>;
