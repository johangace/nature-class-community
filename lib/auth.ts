import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { prisma } from "@/lib/db";
import { sendMagicLinkEmail, sendSignInCodeEmail } from "@/lib/email";
import { recordingSendOutcome, sendOutcomeHook } from "@/lib/sign-in-send";
import { socialProviderConfig } from "@/lib/social-sign-in";

/**
 * The account layer's auth. Better Auth over our Postgres models (from the
 * Prisma bootstrap) — teachers hate passwords, so there are none: two ways in,
 * both passwordless.
 *
 *   passkey    — the everyday path. Face ID / Touch ID on the iPad at the gate.
 *   school     — Google or Microsoft, the account the school already issued.
 *                The fastest first sign-in, and the one school mail filters
 *                cannot spend on her behalf.
 *   code       — the email path a school mail scanner cannot spend. Six
 *                digits, typed. It also crosses devices: read on a phone, it
 *                signs in the iPad she is holding.
 *   magic link — the same door, still open for anyone holding a link already
 *                sent, and for the tap-it-and-go case on a personal device.
 *
 * Sessions are deliberately long-lived (30 days, refreshed weekly): a teacher
 * standing in a field must never be logged out mid-session. Cookie caching
 * keeps that cheap — the session is read from a short signed cookie, not the
 * DB, on every request.
 *
 * The organizations plugin (Better Auth ships one) is the future school /
 * district path — a teacher's classes rolling up to a school account. Not
 * installed now; flagged so the seam is known.
 *
 * `/` uses this session only to offer the right landing action; `/today`
 * guards the teacher home. The deliberately shareable lesson samples (`/run`, `/print`, and
 * `/api/conditions`) remain public; classes, completions, and Today belong to
 * the signed-in teacher workspace.
 */
/**
 * Every host this app is allowed to be signed in from.
 *
 * Better Auth checks the request's Origin against its own base URL and this
 * list, and refuses anything else before it does any work. That check is what
 * broke sign-in the day natureclass.education became canonical (#568): the
 * base URL still named the old vercel.app host, so every magic-link request
 * from the real domain came back "Invalid origin" and the teacher saw a flat
 * "that didn't go through".
 *
 * The list lives here, in the tree, rather than being implied by one
 * environment variable that nobody remembers on the next domain move. The
 * redirecting hosts (www, .co, .co.uk) never post from their own origin — the
 * browser follows the 308 first — so only the hosts that actually serve the
 * app belong here.
 */
const TRUSTED_ORIGINS = [
  "https://natureclass.education",
  "https://www.natureclass.education",
  "https://nature-class-iota.vercel.app",
];

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // No passwords anywhere — the plugins below and the school accounts above
  // are the only ways in.
  emailAndPassword: {
    enabled: false,
  },
  // Sign in with the account the school already gave her. Empty until the
  // OAuth credentials exist in the environment; see lib/social-sign-in.ts.
  socialProviders: socialProviderConfig(),
  session: {
    // A teacher must never be logged out standing at the gate.
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24 * 7, // refresh weekly
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min signed-cookie cache to spare the DB
    },
  },
  trustedOrigins: TRUSTED_ORIGINS,
  /**
   * The code path answers honestly about whether the code was actually sent.
   * The emailOTP plugin returns `{ success: true }` whether our sender threw or
   * not, so the send's outcome would otherwise exist only in a server log —
   * and the form, reading a 200, would move a teacher to the code step and tell
   * her to check an inbox nothing was posted to. See lib/sign-in-send.ts.
   */
  hooks: {
    after: sendOutcomeHook,
  },
  plugins: [
    /**
     * The code path, and the reason it exists: a district mail gateway fetches
     * the links in a message to scan them, and a one-time link is spent by the
     * fetch. Nothing about a six-digit code can be spent by a fetch.
     *
     * Ten minutes is long enough to walk indoors and find the message, short
     * enough that a code left open on a shared staffroom screen goes stale on
     * its own. Five attempts, then the code is dead: enough for a mistyped
     * digit, not enough to guess one of a million.
     *
     * Signing in with a code that belongs to no account creates the account,
     * exactly as the link always has. That is the whole first-time story here
     * and it stays one field.
     */
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      // The stored value is hashed, so a snapshot of the verification table is
      // not a drawer full of live sign-in tokens.
      storeOTP: "hashed",
      // Wrapped so a refused send reaches the response rather than only the
      // log: the wrapper records the outcome against this request and the
      // `after` hook above rewrites the plugin's invented success.
      sendVerificationOTP: recordingSendOutcome(
        async ({ email, otp }: { email: string; otp: string }) => {
          await sendSignInCodeEmail({ email, code: otp });
        }
      ),
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // sendMagicLinkEmail sends via Resend when RESEND_API_KEY is set, and
        // otherwise logs the link to the server console so local sign-in works
        // with no email service at all.
        await sendMagicLinkEmail({ email, url });
      },
    }),
    passkey({
      rpName: "Nature Class",
      // rpID and origin default to the request host, which is correct for
      // both localhost and the deployed domain. BETTER_AUTH_URL pins them in
      // production, and it now names the canonical domain.
      //
      // THE LANDMINE FIRED, and this is the record of it. A passkey is bound
      // to the rpID it was created under, and that rpID is whatever host
      // served the page. When the app moved to natureclass.education (#472),
      // every passkey enrolled on the old vercel.app host stopped being
      // findable — silently, from the teacher's side, on the path they would
      // otherwise use daily. The decision taken (#568) is the second of the
      // two the note above offered: keep the registrable domain we intend to
      // keep, accept the invalidation, and have anyone affected turn the
      // passkey on again. Pre-pilot, that is test accounts.
      //
      // lib/passkey.ts reads ERROR_INVALID_RP_ID and ERROR_INVALID_DOMAIN out
      // of the failure and says something honest, so a stale credential does
      // not read as another silent "doesn't seem to work" (#45).
    }),
  ],
});
