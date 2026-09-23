import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";

/**
 * A code that never sent must not answer "check your email".
 *
 * ## What went wrong
 *
 * Better Auth's emailOTP plugin runs our sender through
 * `ctx.context.runInBackgroundOrAwait(...)` and then returns
 * `ctx.json({ success: true })` whatever happened. With no
 * `advanced.backgroundTasks.handler` configured the send is genuinely awaited —
 * but the awaited promise is wrapped in a try/catch that only logs. Probed on
 * production: `POST /api/auth/email-otp/send-verification-otp` answered 200
 * while the same request's server log read
 *
 *     ERROR [Better Auth]: Failed to run background task:
 *     Error: Resend send failed (422) ... at async Object.sendVerificationOTP
 *
 * The browser saw the 200, the form moved her to the code step, and the page
 * told her to check her email. A teacher stands in a field waiting for six
 * digits that are not coming, and the only place the truth exists is a log she
 * cannot see. A bad key, an unverified sending domain and a provider outage all
 * look identical to her.
 *
 * There is no plugin option for this: `backgroundTasks.handler` only chooses
 * WHERE the deferred work runs, never whether its failure reaches the response.
 *
 * ## The shape taken
 *
 * The sender records what actually happened against the request it is serving;
 * an `after` hook on that one path reads the record and replaces the invented
 * success. The alternative — send from our own route and call Better Auth only
 * once the provider accepted — throws away the plugin's rate limiting, which
 * runs in the router before dispatch and so survives untouched here.
 *
 * ## Why a WeakMap is request-scoped here
 *
 * `dispatchAuthEndpoint` builds one fresh `internalContext.context` per
 * dispatch and hands that same object to the endpoint handler (which passes it
 * to our sender as `ctx.context`) and to the after hook. Keying on it is
 * therefore per-request by construction — no AsyncLocalStorage, no global
 * cursor two concurrent sign-ins could cross, and nothing to clean up: when the
 * request's context is collected, so is the entry.
 *
 * ## Fail closed
 *
 * A request that reaches the hook with no recorded send did not send. Saying
 * so is loud and instantly noticed; the opposite default is this bug again,
 * silent.
 *
 * ## Why the hook AWAITS the send rather than reading a finished result (#665)
 *
 * The first version of this file recorded a finished `{ sent: boolean }` and
 * the hook read it. That is only correct while Better Auth happens to await
 * our sender for us, which it does only when no
 * `advanced.backgroundTasks.handler` is configured (`runInBackgroundOrAwait`,
 * context/create-context.mjs:214 — with a handler it hands the promise off and
 * returns immediately, without awaiting either). Configure one and the hook
 * runs first, finds nothing, and refuses.
 *
 * The part that made this worth a structural fix rather than a warning is that
 * it was LATENCY-DEPENDENT, so no ordinary test would have caught it. Measured
 * against this endpoint with a handler configured, before this change:
 *
 *     sender resolving with no event-loop yield  ->  200  (right, by luck)
 *     sender with a single setTimeout(0)         ->  500  (wrong)
 *     sender taking 60ms, i.e. any real provider ->  500  (wrong)
 *     failing sender taking 250ms                ->  500 after 3ms — the
 *                                                    "right" answer arriving
 *                                                    before the send had failed
 *
 * The tolerance was about nineteen microtask hops and zero macrotask ticks:
 * fast enough for a stub, impossible for a network. A unit suite full of
 * instant stubs would have stayed green while every real teacher was refused.
 *
 * So the record is now the in-flight send itself, stored synchronously at the
 * moment the sender is called, and the hook awaits it. The answer no longer
 * depends on who wins a race, because there is no race: the response cannot be
 * written before the send has settled. The cost is stated plainly — with a
 * background handler configured, THIS endpoint still waits for the mail
 * provider, because there is no way to report an outcome without having one.
 * The rest of the deferral the handler buys is untouched.
 *
 * The wait is unbounded, exactly as it is today: with no handler configured
 * Better Auth already awaits this same promise, and `lib/email.ts` sets no
 * timeout on its fetch. This change does not add a way for a request to hang
 * that was not already there.
 *
 * This is the same rule `lib/email.ts` follows when it refuses to log a
 * live sign-in token in production rather than pretend the mail went out, and
 * the same instinct as `lib/passkey.ts`: a failure the person cannot see is
 * worse than an ugly one they can.
 *
 * The provider's own words never cross this line. Better Auth still logs the
 * cause server-side — we rethrow so it does — and the teacher is told the code
 * did not send, not what Resend replied.
 */

/** The one endpoint this guard speaks for. */
export const SEND_VERIFICATION_OTP_PATH = "/email-otp/send-verification-otp";

/** The code the browser reads off the refusal. */
export const OTP_SEND_FAILED = "OTP_SEND_FAILED";

/**
 * The message on the wire. Deliberately free of provider detail: a status code
 * or a Resend body says nothing to a teacher and something to everyone else.
 */
export const OTP_SEND_FAILED_MESSAGE =
  "The sign-in code could not be sent. No code is on its way.";

/** Anything carrying the per-dispatch context object: sender ctx or hook ctx. */
interface HasRequestScope {
  context?: unknown;
}

/**
 * The send itself, not a verdict about it. `settled` resolves to whether the
 * mail was accepted and never rejects, so awaiting it is safe from anywhere;
 * the original rejection travels separately, to the caller, unchanged.
 */
type SendOutcome = { settled: Promise<boolean> };

const outcomes = new WeakMap<object, SendOutcome>();

/** The per-request key, or nothing if this was not called inside a dispatch. */
function scopeOf(ctx: HasRequestScope | undefined): object | undefined {
  const scope = ctx?.context;
  return typeof scope === "object" && scope !== null ? scope : undefined;
}

/**
 * Wrap a sender so the request it is serving can learn whether the mail was
 * actually accepted — by waiting for it, not by hoping it finished first.
 *
 * Deliberately NOT an `async` function: the record has to be in place before
 * this returns to Better Auth, because a configured `backgroundTasks.handler`
 * takes the promise and lets the route answer immediately (#665). Everything
 * before the first suspension point therefore runs synchronously with the
 * call, and the record is the in-flight send.
 *
 * The failure is passed on unchanged: Better Auth's own log line is the record
 * of the cause, and this only stops it being the ONLY record.
 */
export function recordingSendOutcome<Data>(
  send: (data: Data) => Promise<void>
): (data: Data, ctx?: HasRequestScope) => Promise<void> {
  return (data, ctx) => {
    const scope = scopeOf(ctx);
    // A sender that throws before returning a promise is still a failed send,
    // not a crash inside the plugin's call site.
    let attempt: Promise<void>;
    try {
      attempt = Promise.resolve(send(data));
    } catch (error) {
      attempt = Promise.reject(error);
    }
    if (scope) {
      outcomes.set(scope, {
        settled: attempt.then(
          () => true,
          () => false
        ),
      });
    }
    return attempt;
  };
}

/**
 * The `after` hook. It speaks only for the send endpoint, and only over an
 * invented success: when the endpoint has already refused for its own reason —
 * an unparseable address answers BAD_REQUEST — that refusal is the honest one
 * and is left exactly as it is.
 *
 * It AWAITS the recorded send. That is the whole of #665: reading a finished
 * verdict meant the answer depended on whether the mail provider beat the
 * response out of the door, which no mail provider does.
 */
export const sendOutcomeHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SEND_VERIFICATION_OTP_PATH) return;
  if (isAPIError(ctx.context.returned)) return;
  const scope = scopeOf(ctx as HasRequestScope);
  const outcome = scope ? outcomes.get(scope) : undefined;
  if (outcome && (await outcome.settled)) return;
  throw new APIError("INTERNAL_SERVER_ERROR", {
    message: OTP_SEND_FAILED_MESSAGE,
    code: OTP_SEND_FAILED,
  });
});
