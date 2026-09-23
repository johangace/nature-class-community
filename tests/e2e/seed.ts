import { PrismaClient } from "@prisma/client";
import { test, type Page } from "@playwright/test";
import { randomUUID, createHmac } from "node:crypto";
import { e2eEmailPrefix } from "./reset";

/**
 * Playwright's session-seeding helper: creates a teacher, a class, and a live
 * Better Auth session ROW directly via Prisma, then hands back the cookie a
 * browser context needs to be "signed in" as that teacher — no magic-link
 * email, no inbox, no UI click-through.
 *
 * This is the standard pattern for testing an app whose only sign-in path is
 * passwordless (magic link / passkey): driving the real email or WebAuthn
 * ceremony in a test is either impossible (passkey, no virtual authenticator
 * wired up here) or slow and flaky (scraping a logged magic-link URL from
 * server stdout). Seeding the session row is not a mock of auth — Better
 * Auth's own cookie/session-lookup code (lib/auth.ts, session_token cookie,
 * `better-auth.session_token` per its cookie module) reads this exact row
 * the same way it would read one created by a real magic-link exchange.
 *
 * THE COOKIE VALUE IS SIGNED, not the raw token. Better Call (the framework
 * under Better Auth) writes the session cookie via `setSignedCookie`, whose
 * format is `${token}.${base64(HMAC-SHA256(token, AUTH_SECRET))}`, URL-encoded
 * (node_modules/better-call/dist/crypto.mjs, `signCookieValue`). A cookie
 * holding the bare token fails verification and the request resolves
 * signed-out. `signSessionToken` below reproduces that exact signature so
 * this fixture keeps working across a better-auth/better-call bump without
 * needing to import their internals.
 *
 * Requires DATABASE_URL and AUTH_SECRET (must match the running server's).
 * The server itself also needs BETTER_AUTH_URL=http://localhost:3512 (the
 * PORT playwright.config.ts's webServer boots on, not .env.example's
 * dev-server default of 3500) — without it, Better Auth logs "Base URL is
 * not set" and a client-side session check bounces an already-authenticated
 * page back to /sign-in, which looks like this fixture is broken when it
 * isn't.
 * Callers must call cleanup() to remove what they made.
 */
function signSessionToken(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/** Shared by both seed helpers below: create the user row, sign a live
 * session for it, and hand back a cookie the browser context can carry.
 *
 * The address carries this test's Playwright parallel slot, because it is what
 * `tests/e2e/reset.ts` sweeps on: a slot only ever deletes its own rows, so the
 * sweep stays correct however many workers the config runs (nc#978). Both sides
 * take the prefix from `e2eEmailPrefix` so the written address and the swept
 * address cannot drift; `scripts/e2e-reset-lint.mjs` holds that. */
async function seedSignedInUser(prisma: PrismaClient, page: Page) {
  const email = `${e2eEmailPrefix(test.info().parallelIndex)}${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: { email, name: "Playwright Teacher", emailVerified: true },
  });

  const token = randomUUID();
  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "seedSignedInTeacher requires AUTH_SECRET (or BETTER_AUTH_SECRET) set to the SAME value the running server uses, to sign the session cookie the way better-call's setSignedCookie does."
    );
  }

  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: signSessionToken(token, secret),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    },
  ]);

  return { user, email };
}

export async function seedSignedInTeacher(page: Page) {
  const prisma = new PrismaClient();
  const { user, email } = await seedSignedInUser(prisma, page);

  const klass = await prisma.class.create({
    data: {
      name: "Willow Class",
      yearGroup: "Y1",
      school: "Test Primary",
      teacherId: user.id,
      lat: 51.546,
      lng: -0.105,
    },
  });

  return {
    userId: user.id,
    classId: klass.id,
    email,
    async addClass(name: string, yearGroup = "Y2") {
      return prisma.class.create({
        data: {
          name,
          yearGroup,
          school: "Test Primary",
          teacherId: user.id,
          lat: 51.546,
          lng: -0.105,
        },
      });
    },
    async cleanup() {
      // Class and Session both cascade off User (schema: onDelete: Cascade).
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    },
  };
}

/**
 * A signed-in teacher with NO active class — the one state `/start`'s guard
 * (app/start/page.tsx) actually lets through to the flow itself. Every other
 * seeded teacher in this suite arrives already holding a class, which bounces
 * `/start` straight to `/` before its form ever renders.
 */
export async function seedSignedInTeacherNoClass(page: Page) {
  const prisma = new PrismaClient();
  const { user, email } = await seedSignedInUser(prisma, page);

  return {
    userId: user.id,
    email,
    async cleanup() {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    },
  };
}
