import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { qaSigninGate } from "./gate";

/**
 * DEV/PREVIEW-ONLY QA sign-in. Mints a real signed-in session for one known
 * test teacher so an automated QA pass can finally reach the surfaces that live
 * behind auth (Today, /start, the runner's log step, /classes). Root cause of
 * the 2026-08-04 bug wave was that no agent had a mailbox to receive a magic
 * link, so every "verified" report tested the app signed OUT (#114).
 *
 * STRUCTURALLY INCAPABLE OF EXISTING IN PRODUCTION — belt and braces:
 *
 *   1. The route 404s unless `process.env.VERCEL_ENV !== "production"`. On
 *      Vercel, VERCEL_ENV is "production" for the production deployment and
 *      "preview"/"development" everywhere else, so this path simply does not
 *      answer on the live site. This is the structural gate — it does not
 *      depend on a secret being unset.
 *   2. It also 404s unless `QA_SIGNIN_SECRET` is set. So even on a preview
 *      deployment the door only exists when someone has deliberately opened it.
 *   3. And it 401s unless the caller presents that same secret (header
 *      `x-qa-signin-secret`, or `?secret=` on the URL). So a preview build that
 *      happens to carry the env var is still not drivable by an anonymous
 *      request that stumbles onto the path.
 *
 * Any ONE of the first two failing yields a 404 that is indistinguishable from
 * the route not existing. There is no configuration in which this mints a
 * session in production.
 *
 * HOW IT MINTS THE SESSION. It uses the real Better Auth magic-link machinery
 * rather than reinventing session/cookie crypto. It writes the same
 * verification value `signInMagicLink` would (email + name, keyed by a plain
 * token — our magic-link plugin stores tokens plain, see lib/auth.ts), then
 * drives Better Auth's own `/api/auth/magic-link/verify` endpoint through
 * `auth.handler`. That endpoint creates the user on first run, creates the
 * session, and sets the session cookie exactly as a real teacher's first
 * sign-in does. We forward its Set-Cookie back to the caller.
 *
 * There is no schema change and no migration: the QA teacher is created
 * through the ordinary user-create path, the same as any teacher.
 *
 * USAGE — see docs/qa-signin.md. In short, on localhost or a preview URL with
 * QA_SIGNIN_SECRET set:
 *   curl -i -X POST "$BASE/api/qa-signin" -H "x-qa-signin-secret: $SECRET"
 * then reuse the returned session cookie on subsequent requests.
 */

// The reserved-forever test identity. `.invalid` is reserved by RFC 6761 and
// can never resolve to a real mailbox, so this address cannot collide with a
// real teacher and cannot receive real mail.
const QA_TEACHER_EMAIL = "qa-tester@example.invalid";
const QA_TEACHER_NAME = "QA Tester";

/** How long the minted verification token stays valid before use. Seconds. */
const TOKEN_TTL_SECONDS = 60;

function notFound(): NextResponse {
  // A bare 404 — indistinguishable from the route not existing at all, so the
  // production gate leaks nothing about why it refused.
  return new NextResponse("Not found", { status: 404 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const secret = process.env.QA_SIGNIN_SECRET;
  const presented =
    request.headers.get("x-qa-signin-secret") ??
    url.searchParams.get("secret");

  const decision = qaSigninGate({
    vercelEnv: process.env.VERCEL_ENV,
    configuredSecret: secret,
    presentedSecret: presented,
  });
  if (decision === 404) return notFound();
  if (decision === 401) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const ctx = await auth.$context;

  // Write the same verification value signInMagicLink writes, keyed by a plain
  // token (our plugin stores tokens plain). This is the only glue we replicate;
  // the verify endpoint below does everything else — user, session, cookie.
  const token = crypto.randomUUID().replace(/-/g, "");
  await ctx.internalAdapter.createVerificationValue({
    identifier: token,
    value: JSON.stringify({ email: QA_TEACHER_EMAIL, name: QA_TEACHER_NAME }),
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
  });

  // Drive Better Auth's real verify endpoint. We deliberately omit callbackURL:
  // without it the endpoint returns JSON (with the session cookie set) instead
  // of a redirect, which is what we want to forward to the caller.
  const origin = ctx.baseURL
    ? new URL(ctx.baseURL).origin
    : url.origin;
  const verifyUrl = new URL("/api/auth/magic-link/verify", origin);
  verifyUrl.searchParams.set("token", token);

  const incoming = await headers();
  const verifyRes = await auth.handler(
    new Request(verifyUrl.toString(), {
      method: "GET",
      headers: {
        // Better Auth's endpoints requireHeaders; carry the caller's cookies
        // and host so origin/base resolution matches the deployment.
        cookie: incoming.get("cookie") ?? "",
        host: incoming.get("host") ?? new URL(origin).host,
      },
    })
  );

  if (!verifyRes.ok) {
    const detail = await verifyRes.text().catch(() => "");
    return NextResponse.json(
      {
        ok: false,
        error: "qa sign-in verify failed",
        status: verifyRes.status,
        detail: detail.slice(0, 300),
      },
      { status: 502 }
    );
  }

  // Forward the session cookie(s) Better Auth just set to the caller.
  const out = NextResponse.json({
    ok: true,
    signedInAs: QA_TEACHER_EMAIL,
    note: "Session cookie set. Reuse it on subsequent requests.",
  });
  const setCookie = verifyRes.headers.get("set-cookie");
  if (setCookie) out.headers.set("set-cookie", setCookie);
  return out;
}
