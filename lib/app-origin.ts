/**
 * Where this app is, as far as this app is allowed to believe (nc#955).
 *
 * Two write endpoints — `app/world/place/route.ts` and
 * `app/api/passkey-report/route.ts` — have to answer "did this request come
 * from us?" themselves, because a route handler gets none of the origin
 * checking a server action gets for free. Both answered it the same way, in
 * two verbatim copies:
 *
 *     new URL(origin).host === new URL(request.url).host
 *
 * That is right on Vercel and right in dev, and wrong under `next start`
 * behind a reverse proxy. Next builds `request.url` from the address the
 * server BOUND to, not from the Host header:
 *
 *     const initUrl = this.fetchHostname && this.port
 *       ? `${protocol}://${this.fetchHostname}:${this.port}${req.url}`
 *       : ...
 *
 * `next start` always sets both, so a self-hoster terminating TLS at nginx
 * gets `request.url` = `http://127.0.0.1:3000/...` while the browser sends
 * `Origin: https://nature.school.example`. Measured against the merged build:
 * `Host: teachers.example.com` answered 403, `Host: localhost:3512` answered
 * 303. Every "choose another place" POST failed, silently, with an empty body
 * — and had the check passed, the 303's `Location` would have named the
 * proxy's own loopback and walked the teacher off her own site.
 *
 * WHAT THIS DOES NOT DO: trust the Host header. Next's own server actions do
 * (`parseHostHeader`), and Next offers `experimental.trustHostHeader` for the
 * proxy case, but taking a request's word for which site it is addressed to
 * turns the same-origin guard into a formality — the attacker's page controls
 * neither header, but only because the browser sets both, and a non-browser
 * client sets whichever it likes. This repo sets no such flag.
 *
 * WHAT IT DOES INSTEAD: an origin is ours when it matches something we
 * configured or something the platform gave us. Exactly two sources, in this
 * order, and neither is attacker-supplied:
 *
 *   1. `BETTER_AUTH_URL` — the public origin this deployment already has to
 *      name for sign-in to work at all. Better Auth refuses any request whose
 *      Origin is neither its base URL nor a listed trusted origin, which is
 *      precisely why sign-in ALREADY works behind a proxy while changing a
 *      place did not. Reusing it means a self-hoster configures one origin,
 *      not two, and cannot configure them inconsistently.
 *   2. `request.url`'s own origin — the bind address under `next start`, the
 *      real public host on Vercel. This is the behaviour that shipped, kept so
 *      that local dev, CI, preview deployments, and the vercel.app host that
 *      every deploy is verified against all keep working with nothing set.
 *
 * Hosts are compared, not full origins, which means `http://host` is accepted
 * for an `https://host` deployment. Next's own check has the same property.
 * Noted here so nobody finds it later and reads it as new.
 */

/**
 * Just the field we read, so a test can hand these functions a plain object
 * instead of mutating the process. The index signature is what lets the real
 * `process.env` (`ProcessEnv extends Dict<string>`) be passed as the default.
 */
export type OriginEnv = {
  BETTER_AUTH_URL?: string | undefined;
  [key: string]: string | undefined;
};

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/**
 * The public origin this deployment was configured with, or null when it was
 * left to the platform (Vercel, local dev, CI).
 */
export function configuredOrigin(env: OriginEnv = process.env): string | null {
  return originOf(env.BETTER_AUTH_URL?.trim());
}

/** Every host a request may claim to have come from and still be ours. */
export function appHosts(request: Request, env: OriginEnv = process.env): string[] {
  const hosts = [hostOf(configuredOrigin(env)), hostOf(request.url)];
  return hosts.filter((host): host is string => host !== null);
}

/**
 * Same-origin only: these endpoints write, so a cross-site POST is refused.
 * A request with no Origin header at all is refused too — a browser sends one
 * on every POST, so its absence is not a case worth guessing about.
 */
export function sameOrigin(request: Request, env: OriginEnv = process.env): boolean {
  const host = hostOf(request.headers.get("origin"));
  if (!host) return false;
  return appHosts(request, env).includes(host);
}

/**
 * The absolute base a `Location` header should be built against.
 *
 * Once `sameOrigin` has accepted it, the request's Origin is provably one of
 * ours, and it is the one the teacher is actually looking at — so a redirect
 * back to it keeps her on her own host rather than moving her to whichever of
 * our hosts happens to be canonical. It falls back to the configured origin,
 * then to the request's own URL, for the paths that answer before the guard.
 */
export function appOrigin(request: Request, env: OriginEnv = process.env): string {
  if (sameOrigin(request, env)) {
    const origin = originOf(request.headers.get("origin"));
    if (origin) return origin;
  }
  return configuredOrigin(env) ?? new URL(request.url).origin;
}
