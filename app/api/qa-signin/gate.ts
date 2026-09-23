/**
 * The QA sign-in access decision, isolated with zero runtime imports so the
 * production guard is independently testable without booting the DB-backed
 * auth module. See route.ts for the full rationale.
 *
 * Returns the HTTP status the route must answer with:
 *   404 — the door does not exist (production env, or secret not configured).
 *         Both "does the door exist" gates yield 404, so a refusal on
 *         production leaks nothing about why.
 *   401 — the door exists but the caller did not present the secret.
 *   200 — proceed to mint the session.
 */
export function qaSigninGate(env: {
  vercelEnv: string | undefined;
  configuredSecret: string | undefined;
  presentedSecret: string | null;
}): 404 | 401 | 200 {
  // Gate 1 (structural): never answer on the production deployment.
  if (env.vercelEnv === "production") return 404;
  // Gate 2 (deliberate): the door only exists when the secret is configured.
  if (!env.configuredSecret) return 404;
  // Gate 3 (authenticated): the caller must present the secret.
  if (env.presentedSecret !== env.configuredSecret) return 401;
  return 200;
}
