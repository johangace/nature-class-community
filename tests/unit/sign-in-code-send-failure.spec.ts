import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";
import {
  OTP_SEND_FAILED,
  recordingSendOutcome,
  sendOutcomeHook,
} from "@/lib/sign-in-send";

/**
 * The forced-failure spec. A bad Resend key, an unverified sending domain and
 * a provider outage are all the ordinary case, and they were identical to a
 * teacher: the plugin returns `{ success: true }` whether our sender threw or
 * not, so the form moved her to the code step and told her to check an inbox
 * nothing had been posted to.
 *
 * Everything here runs a REAL Better Auth instance over the memory adapter with
 * the real pieces from lib/sign-in-send.ts, driven through `auth.handler` — the
 * same entry point app/api/auth/[...all]/route.ts mounts — because the whole
 * bug lived in what that pipeline does with a thrown sender, and a stub of it
 * would have reproduced the wrong thing.
 */

const SECRET = "nature-class-test-secret-nature-class-test-secret";

/** A fresh in-memory database per instance: no state crosses between tests. */
function freshDb() {
  return { user: [], session: [], account: [], verification: [] };
}

/** The provider's refusal, in the shape production actually produced. */
const RESEND_REFUSAL = "Resend send failed (422): domain is not verified";

/**
 * The door as it is wired in lib/auth.ts: the sender records its outcome, the
 * after hook reads it. `wired: false` is the shape that shipped — the plain
 * sender, no hook — kept so the bug can be shown rather than described.
 */
function buildAuth({
  wired,
  send,
}: {
  wired: boolean;
  send: (data: { email: string; otp: string }) => Promise<void>;
}) {
  return betterAuth({
    baseURL: "http://localhost:3000",
    secret: SECRET,
    database: memoryAdapter(freshDb()),
    emailAndPassword: { enabled: false },
    // The cause is still logged by Better Auth in the real app; silenced here
    // so a deliberate failure does not read as a broken suite.
    logger: { disabled: true },
    ...(wired ? { hooks: { after: sendOutcomeHook } } : {}),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOTP: wired ? recordingSendOutcome(send) : send,
      }),
    ],
  });
}

function sendCode(
  auth: ReturnType<typeof buildAuth>,
  email = "teacher@school.org"
) {
  return auth.handler(
    new Request(
      "http://localhost:3000/api/auth/email-otp/send-verification-otp",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ email, type: "sign-in" }),
      }
    )
  );
}

const alwaysFails = async () => {
  throw new Error(RESEND_REFUSAL);
};
const alwaysSends = async () => {};

describe("a sign-in code that never sent", () => {
  it("is what the plugin alone reports as a success", async () => {
    // The bug, shown. Better Auth hands the sender to
    // `runInBackgroundOrAwait`, which awaits it inside a try/catch that only
    // logs, and then answers `{ success: true }` regardless. This is why the
    // fix cannot be a line in the sender.
    const auth = buildAuth({ wired: false, send: alwaysFails });
    const res = await sendCode(auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("tells the teacher, instead of moving her to a code step", async () => {
    const auth = buildAuth({ wired: true, send: alwaysFails });
    const res = await sendCode(auth);

    // Not a success: the browser cannot read this as "sent" and advance.
    expect(res.ok).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { success?: boolean; code?: string };
    expect(body.success).toBeUndefined();
    expect(body.code).toBe(OTP_SEND_FAILED);
  });

  it("says nothing is coming, and nothing about the provider", async () => {
    const auth = buildAuth({ wired: true, send: alwaysFails });
    const res = await sendCode(auth);
    const text = await res.text();

    // She is told the code did not send...
    expect(text).toMatch(/could not be sent/i);
    // ...and not what Resend replied. A status code and a provider's body say
    // nothing to a teacher and something to everyone else.
    expect(text).not.toContain("422");
    expect(text).not.toMatch(/resend/i);
    expect(text).not.toMatch(/domain is not verified/i);
  });

  it("still succeeds, and still moves her on, when the code really sends", async () => {
    const auth = buildAuth({ wired: true, send: alwaysSends });
    const res = await sendCode(auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("leaves an address the endpoint itself refuses exactly as it was", async () => {
    // An unparseable address is answered BAD_REQUEST before any send is
    // attempted. That refusal is the honest one; reporting it as a failed send
    // would be a new lie in place of the old one.
    const auth = buildAuth({ wired: true, send: alwaysSends });
    const res = await auth.handler(
      new Request(
        "http://localhost:3000/api/auth/email-otp/send-verification-otp",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body: JSON.stringify({ email: "not-an-email", type: "sign-in" }),
        }
      )
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INVALID_EMAIL");
  });

  it("keeps two teachers' requests apart", async () => {
    // The outcome is keyed on the per-dispatch context object rather than a
    // module-level cursor, so one teacher's failed send cannot answer for
    // another's that worked — or the reverse, which is the same bug wearing a
    // different hat.
    const auth = buildAuth({
      wired: true,
      send: async ({ email }) => {
        if (email === "unlucky@school.org") throw new Error(RESEND_REFUSAL);
      },
    });
    const [failed, sent] = await Promise.all([
      sendCode(auth, "unlucky@school.org"),
      sendCode(auth, "lucky@school.org"),
    ]);
    expect(failed.ok).toBe(false);
    expect(sent.status).toBe(200);
  });

  it("rethrows so the cause is still written down server-side", async () => {
    // Better Auth's own error log is what let this be diagnosed at all. The
    // wrapper adds a second record; it does not replace the first.
    const wrapped = recordingSendOutcome(alwaysFails);
    await expect(
      wrapped({ email: "teacher@school.org", otp: "123456" })
    ).rejects.toThrow(RESEND_REFUSAL);
  });

  it("is wired into the real door, not only into this spec", async () => {
    // The pieces above are the shipped ones, but a spec that builds its own
    // instance cannot see lib/auth.ts dropping them. This can.
    const source = readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8");
    expect(source).toContain("recordingSendOutcome");
    expect(source).toContain("after: sendOutcomeHook");
  });
});
