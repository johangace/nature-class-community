import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";
import {
  OTP_SEND_FAILED,
  recordingSendOutcome,
  sendOutcomeHook,
} from "@/lib/sign-in-send";

/**
 * The latency spec (#665). Its companion,
 * tests/unit/sign-in-code-send-failure.spec.ts, proves the door tells the
 * truth about a failed send. This one proves the answer does not depend on how
 * fast the sender is — which is a different claim, and was false.
 *
 * Every case here configures `advanced.backgroundTasks.handler`, because that
 * is the switch that makes Better Auth stop awaiting our sender for us
 * (`runInBackgroundOrAwait`, context/create-context.mjs:214: with a handler it
 * hands the promise off and returns, without awaiting either). Nothing in the
 * app configures one today. This suite is here so that the day somebody does —
 * for a queue, for a serverless `waitUntil` — it is this file that goes red,
 * and not a teacher's sign-in.
 *
 * ## Why the delays are real timers and not instant stubs
 *
 * Before the fix, an instantly-resolving stub returned 200 and a sender with a
 * single `setTimeout(0)` returned 500. Measured on this endpoint: the tolerance
 * was about nineteen microtask hops and zero macrotask ticks. So a suite of
 * instant stubs went green over a door that refused every real teacher, and
 * the "500" a failing sender got was not a report of the failure at all — it
 * arrived ~3ms in, long before the 250ms send had failed. Any test written
 * with a convenient mock would have proved the wrong thing, which is why these
 * senders all yield to the event loop the way a network call does.
 */

const SECRET = "nature-class-test-secret-nature-class-test-secret";

/** A fresh in-memory database per instance: no state crosses between tests. */
function freshDb() {
  return { user: [], session: [], account: [], verification: [] };
}

/** The provider's refusal, in the shape production actually produced. */
const RESEND_REFUSAL = "Resend send failed (422): domain is not verified";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A promise together with its own resolver, so a case can wait for an EVENT
 * rather than for a guess about how long that event will take (#841).
 */
function barrier() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

/**
 * Hand the event loop `turns` complete turns, letting everything already
 * queued run.
 *
 * Counted in TURNS, never in milliseconds. A contended machine makes each turn
 * take longer in wall clock, but it cannot give the loop fewer of them, and
 * that is the one property a fixed `sleep` does not have: 50ms on a saturated
 * box is not a budget, it is whatever happened to fit inside it.
 *
 * Each turn spends a check-phase callback and a timer, so work queued in
 * either phase cannot hide behind the other, and awaiting drains the microtask
 * queue between them.
 */
async function eventLoopTurns(turns: number) {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await sleep(0);
  }
}

/**
 * How many turns count as "every chance to answer". Measured on this endpoint,
 * the design this file exists to keep dead answered within about nineteen
 * microtask hops and ZERO macrotask ticks (lib/sign-in-send.ts records the
 * numbers), so one turn already exposes it and twenty is twenty times that
 * margin. It is a count of chances given, not a deadline: nothing asserted
 * below gets a different answer because the machine was slow.
 */
const RACING_HOOK_TURNS = 20;

/**
 * The door as lib/auth.ts wires it, plus the background-task handler nobody
 * has added yet. The handler keeps the promise the way a real one would
 * (Vercel's `waitUntil` and a queue both do); it never awaits it, because the
 * point of a handler is that the route does not wait.
 */
function buildAuth(
  send: (data: { email: string; otp: string }) => Promise<void>
) {
  const deferred: Promise<unknown>[] = [];
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: SECRET,
    database: memoryAdapter(freshDb()),
    emailAndPassword: { enabled: false },
    // The cause is still logged by Better Auth in the real app; silenced here
    // so a deliberate failure does not read as a broken suite.
    logger: { disabled: true },
    hooks: { after: sendOutcomeHook },
    advanced: {
      backgroundTasks: {
        handler: (promise: Promise<unknown>) => {
          deferred.push(promise);
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendVerificationOTP: recordingSendOutcome(send),
      }),
    ],
  });
  return { auth, deferred };
}

function sendCode(
  auth: ReturnType<typeof buildAuth>["auth"],
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

/** A sender that behaves like a mail provider: it yields, then answers. */
const takes = (ms: number) => async () => {
  await sleep(ms);
};
const failsAfter = (ms: number) => async () => {
  await sleep(ms);
  throw new Error(RESEND_REFUSAL);
};

describe("a deferred sign-in send, with a background-task handler configured", () => {
  /**
   * The matrix. 0ms is the instant stub that used to pass and prove nothing;
   * 60ms is the ticket's stand-in for any real provider; 150ms is a slow one.
   * The answer has to be the same shape at all three, or it is a stopwatch and
   * not a report.
   */
  for (const ms of [0, 60, 150]) {
    it(`says the code went out when a ${ms}ms send succeeds`, async () => {
      const { auth } = buildAuth(takes(ms));
      const res = await sendCode(auth);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it(`says the code did not go out when a ${ms}ms send fails`, async () => {
      const { auth } = buildAuth(failsAfter(ms));
      const res = await sendCode(auth);
      expect(res.ok).toBe(false);
      const body = (await res.json()) as { success?: boolean; code?: string };
      expect(body.success).toBeUndefined();
      expect(body.code).toBe(OTP_SEND_FAILED);
    });
  }

  it("gives the same answer to an instant stub and to a real-speed sender", async () => {
    // The assertion the old design could not make. A test suite is only worth
    // its stubs if a stub and a network agree; here they did not, and the
    // stubs were the ones being believed.
    const instant = await sendCode(buildAuth(takes(0)).auth);
    const realistic = await sendCode(buildAuth(takes(60)).auth);
    expect(realistic.status).toBe(instant.status);
    expect(await realistic.json()).toEqual(await instant.json());
  });

  it("does not answer before the send has settled", async () => {
    // The structural claim, timed rather than described: if the response can
    // be written while the send is still in flight, the answer is a guess. A
    // 150ms failure must take at least most of 150ms to be reported, because
    // the report is the send's own outcome and not the absence of one.
    const { auth } = buildAuth(failsAfter(150));
    const started = Date.now();
    const res = await sendCode(auth);
    const elapsed = Date.now() - started;
    expect(res.status).toBe(500);
    // Generous against a slow CI box; before the fix this arrived in ~3ms.
    expect(elapsed).toBeGreaterThanOrEqual(120);
  });

  it("hands the background handler a promise, so the deferral is real", async () => {
    // Guards the test itself: if a future Better Auth stopped routing the send
    // through the configured handler, every case above would quietly go back
    // to testing the awaited path and prove nothing about deferral.
    const { auth, deferred } = buildAuth(takes(60));
    await sendCode(auth);
    expect(deferred).toHaveLength(1);
  });

  it("keeps two teachers apart when both sends are slow", async () => {
    // Concurrency and latency at once: the failing send is the faster of the
    // two, so a shared cursor or a raced record would cross them.
    const { auth } = buildAuth(async ({ email }) => {
      if (email === "unlucky@school.org") {
        await sleep(30);
        throw new Error(RESEND_REFUSAL);
      }
      await sleep(120);
    });
    const [failed, sent] = await Promise.all([
      sendCode(auth, "unlucky@school.org"),
      sendCode(auth, "lucky@school.org"),
    ]);
    expect(failed.ok).toBe(false);
    expect(sent.status).toBe(200);
  });

  it("holds the response open while the send is still in flight", async () => {
    // The sharpest form of the claim, and the reason recordingSendOutcome is
    // not an `async` function: a configured handler lets the route answer the
    // instant the sender RETURNS, so the record has to exist by then, while
    // the send is still running. Here the send is pinned open, and the
    // response must not exist yet — not a 200, not a 500, nothing. The old
    // design answered 500 at this point, having decided on an outcome that had
    // not happened.
    //
    // Both waits below are on events, never on elapsed time (#841). The first
    // version spent a flat `await sleep(50)` and then asserted the sender had
    // already been entered, which is a precondition only an idle machine can
    // meet: under a saturated event loop the timer fired before Better Auth's
    // dispatch reached the sender at all, so the case died on its own setup
    // without once evaluating the claim it exists to make. Measured here, that
    // was 10 runs in 16 with the box oversubscribed eight to one. A longer
    // sleep only moves the threshold; waiting for the event removes it.
    const entered = barrier();
    let deliver: (() => void) | undefined;
    const { auth } = buildAuth(
      () =>
        new Promise<void>((resolve) => {
          deliver = resolve;
          entered.open();
        })
    );

    let answered: Response | undefined;
    const pending = sendCode(auth).then((res) => {
      answered = res;
      return res;
    });

    // Wait for the sender to be entered. Racing that against the response
    // keeps a real regression legible: a route that answers without ever
    // sending says so here in a sentence, instead of as a timeout.
    const first = await Promise.race([
      entered.opened.then(() => "the sender was entered" as const),
      // Observed either way. A route that rejects has still answered, and an
      // unwatched rejection would land as noise in some other file's run.
      pending.then(
        () => "the route answered first" as const,
        () => "the route answered first" as const
      ),
    ]);
    expect(first).toBe("the sender was entered");
    expect(deliver).toBeTypeOf("function");

    // Only now is "it has not answered" a statement about the route rather
    // than about how far the machine got. Give any racing hook every chance
    // first, counted in turns of the loop it would have to win.
    await eventLoopTurns(RACING_HOOK_TURNS);
    expect(answered).toBeUndefined();

    deliver?.();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("still passes a failed send's cause on to Better Auth's own log", async () => {
    // The wrapper stopped being `async`; the rejection still has to travel.
    const wrapped = recordingSendOutcome(failsAfter(10));
    await expect(
      wrapped({ email: "teacher@school.org", otp: "123456" })
    ).rejects.toThrow(RESEND_REFUSAL);
  });

  it("treats a sender that throws before returning a promise as a failed send", async () => {
    const wrapped = recordingSendOutcome((() => {
      throw new Error(RESEND_REFUSAL);
    }) as unknown as (data: { email: string; otp: string }) => Promise<void>);
    await expect(
      wrapped({ email: "teacher@school.org", otp: "123456" })
    ).rejects.toThrow(RESEND_REFUSAL);
  });
});
