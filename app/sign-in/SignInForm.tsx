"use client";

import { useEffect, useState } from "react";
import { authClient, signIn } from "@/lib/auth-client";
import {
  PASSKEY_COPY,
  codeOf,
  endingOf,
  readPasskeyError,
  reportPasskeyCeremony,
} from "@/lib/passkey";
import type { SocialProviderId } from "@/lib/social-sign-in";

/**
 * Sign in, the editorial way: one field, no passwords, ever. Two passwordless
 * paths, in their real order of use — the saved passkey is the everyday tap;
 * the emailed link is first-time and recovery. The page stays two elements:
 * the line of prose and the one field, with the passkey offered quietly
 * beneath. Sentence case throughout.
 *
 * THE LINK IS THE DOOR, THE CODE IS THE SPARE KEY (#681). For a week this
 * sent a six-digit code instead, on the reasoning that school mail gateways
 * fetch links to scan them and a one-time link is spent by the fetch. That
 * hazard is real, but it was reasoned about rather than measured here, and
 * the cost was charged to every teacher on every sign-in: typing six digits
 * beats tapping a link only when the tap is broken. Johan, using it: "if
 * anything it introduced more friction than clicking a link."
 *
 * So the link is the button again, and the code is one tap away on the screen
 * that follows, where the two cases that need it actually surface — the link
 * that arrived dead, and the mail read on a different device from the one in
 * her hands. Nobody pays for the spare key until they reach for it.
 *
 * The passkey is never named after a brand of sensor here, and it is not
 * named after one anywhere else either: see lib/passkey.ts for why "the way
 * you unlock this device" is the only phrasing that is true on every device
 * a teacher might be holding.
 *
 * Above both sits the school door, when the operator has wired one: the
 * account the teacher's school already gave her. It is offered first because
 * it is the fastest first sign-in and the only one a district mail filter
 * cannot spend on her behalf. The page shows only the providers the server
 * says are configured, so there is never a button that opens onto an error.
 *
 * This page is the door from the public root into the teacher workspace. The
 * separately shareable lesson samples remain reachable without an account.
 */
/**
 * Says the one thing she cannot find out any other way: nothing was posted, so
 * there is nothing to wait for. The old line — "that didn't go through" — was
 * true of the request and silent about the inbox, and the server used to answer
 * 200 to a send that had thrown, so she was moved to the code step and told to
 * check her email anyway (#649, lib/sign-in-send.ts). Every failing branch of
 * this call means no code was sent, so one honest sentence covers all of them.
 */
const SEND_FAILED =
  "The code didn't send, so nothing is on its way. Try again in a moment.";
const CODE_REFUSED = "That code didn't work. Check it, or send a new one.";

/**
 * Named for the service, because that is the word the teacher is looking for
 * on the button. Nothing is added to explain what the button does; the school
 * she works for already taught her that.
 */
const SOCIAL_LABEL: Record<SocialProviderId, string> = {
  google: "Continue with Google",
  microsoft: "Continue with Microsoft",
};

const SOCIAL_FAILED = "That didn't go through. Try again, or use your email.";

export function SignInForm({ social = [] }: { social?: SocialProviderId[] }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Which of the two steps she is on. Kept apart from `status` on purpose: a
  // refused code is an error ON the code step, and deriving the step from the
  // status put her back at the email field holding a code she had just typed.
  // Three steps, held apart from `status` on purpose: a refused code is an
  // error ON the code step, and deriving the step from the status put her
  // back at the email field still holding the code she had just typed.
  const [step, setStep] = useState<"email" | "sent" | "code">("email");
  const [status, setStatus] = useState<
    "idle" | "sending" | "sending-code" | "verifying" | "error"
  >("idle");
  const [note, setNote] = useState(SEND_FAILED);

  // Passkey conditional UI: if the browser and a saved passkey are available,
  // offer it inline on the email field (autocomplete="username webauthn").
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential ||
      !PublicKeyCredential.isConditionalMediationAvailable
    ) {
      return;
    }
    let cancelled = false;
    PublicKeyCredential.isConditionalMediationAvailable().then((available) => {
      if (!available || cancelled) return;
      // The quietest ceremony in the app, and until #650 the least visible:
      // it runs on every page load, says nothing either way, and its failures
      // were the ones nobody could ever describe. Reported, not surfaced —
      // an autofill that finds nothing is not a fault to show a teacher.
      void signIn.passkey({ autoFill: true }).then((result) => {
        const error = result?.error;
        if (!error) {
          void reportPasskeyCeremony({
            surface: "sign-in-autofill",
            act: "use",
            outcome: "ok",
            conditional: true,
          });
          return;
        }
        const outcome = readPasskeyError(error);
        void reportPasskeyCeremony({
          surface: "sign-in-autofill",
          act: "use",
          outcome: endingOf(outcome),
          code: codeOf(error),
          reason: outcome.kind === "failed" ? outcome.reason : null,
          conditional: true,
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The everyday path: one field, one tap, a link in her inbox. */
  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    const { error } = await signIn.magicLink({ email, callbackURL: "/today" });
    if (error) {
      // The cause survives to a remote inspector, as it does on every other
      // door here. A teacher reporting "it doesn't seem to work" from an iPad
      // is only diagnosable if something more than the copy is written down.
      console.warn("[sign-in] link not sent", {
        code: error.code ?? "NO_CODE",
        message: error.message ?? "",
      });
      setNote(SEND_FAILED);
      setStatus("error");
      return;
    }
    setStatus("idle");
    setStep("sent");
  }

  /**
   * The spare key, asked for rather than imposed. Two cases reach for it: the
   * link that arrived dead (a mail gateway can fetch a one-time link and spend
   * it before she taps), and the mail that landed on a different screen from
   * the device in her hands, which a link cannot cross and six digits can.
   */
  async function onSendCode() {
    setStatus("sending-code");
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    if (error) {
      console.warn("[sign-in] code not sent", {
        code: error.code ?? "NO_CODE",
        message: error.message ?? "",
      });
      setNote(SEND_FAILED);
      setStatus("error");
      return;
    }
    setStatus("idle");
    setStep("code");
  }

  /**
   * Type the code in. A wrong code is the ordinary case — a transposed digit,
   * an older message — so it says what to do next rather than only that
   * something failed, and it leaves her on this step with the field intact.
   */
  async function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code) return;
    setStatus("verifying");
    const { error } = await signIn.emailOtp({ email, otp: code.trim() });
    if (!error) {
      window.location.assign("/today");
      return;
    }
    console.warn("[sign-in] code refused", {
      code: error.code ?? "NO_CODE",
      message: error.message ?? "",
    });
    setNote(CODE_REFUSED);
    setStatus("error");
  }

  /** Back to one field, with the address kept so she does not retype it. */
  function onStartOver() {
    setCode("");
    setNote(SEND_FAILED);
    setStatus("idle");
    setStep("email");
  }

  /**
   * Tapping "use a saved passkey" had the same swallowed-error shape as the
   * enrolment strip did, with the opposite tell: every failure, including
   * simply dismissing the sheet, showed the same flat "that didn't go
   * through". Backing out is a choice, so it says nothing; a real failure now
   * says something specific and lands in the console either way.
   */
  /**
   * Hand the browser to the school's own sign-in. Better Auth answers with a
   * redirect the client follows, so the success case never comes back here;
   * only a refusal does, and it says so rather than leaving a button that
   * looked pressed and did nothing.
   */
  async function onSocial(provider: SocialProviderId) {
    const { error } = await signIn.social({ provider, callbackURL: "/today" });
    if (!error) return;
    console.warn("[sign-in] social sign-in did not start", {
      provider,
      code: error.code ?? "NO_CODE",
      message: error.message ?? "",
    });
    setNote(SOCIAL_FAILED);
    setStatus("error");
  }

  async function onPasskey() {
    const { error } = await signIn.passkey();
    if (!error) {
      void reportPasskeyCeremony({
        surface: "sign-in",
        act: "use",
        outcome: "ok",
      });
      return;
    }
    const outcome = readPasskeyError(error);
    void reportPasskeyCeremony({
      surface: "sign-in",
      act: "use",
      outcome: endingOf(outcome),
      code: codeOf(error),
      reason: outcome.kind === "failed" ? outcome.reason : null,
    });
    if (outcome.kind === "cancelled") return;
    setNote(
      outcome.kind === "failed" && outcome.reason === "wrong-host"
        ? PASSKEY_COPY.useWrongHost
        : PASSKEY_COPY.useFailed
    );
    setStatus("error");
  }

  /**
   * The screen after the link is sent. In a teacher test this step was where
   * people stalled: the line was one sentence of prose sitting in open space,
   * so it read as a statement rather than as the instruction it is, it never
   * named the address the mail had gone to, and it never mentioned the junk
   * folder that a school mail filter routinely drops us into. It now says
   * what to do, where, and where else to look, on a plate that separates the
   * confirmation from the two ways out beneath it.
   *
   * Those two ways out are still here, because this is exactly where the two
   * failures show up: she is looking at a mail that never came, or looking at
   * it on the wrong device. The spare key is a button she can see rather than
   * a sentence-long underlined link, with the reason to reach for it beneath
   * it instead of inside it.
   */
  if (step === "sent") {
    return (
      <div className="signin-form">
        <div className="signin-plate">
          <p className="signin-sent">Check your email</p>
          <p className="signin-said">
            We sent a link to <strong className="signin-address">{email}</strong>
            . The link works once.
          </p>
          <p className="signin-junk">
            It usually arrives within a minute. If you do not see it, look in
            your junk or spam folder.
          </p>
        </div>
        <button
          type="button"
          className="signin-alt"
          onClick={() => void onSendCode()}
          disabled={status === "sending-code"}
        >
          {status === "sending-code" ? "Sending the code…" : "Send a code instead"}
        </button>
        <p className="signin-why">
          Use this if the link did not work, or if your email is open on another
          device.
        </p>
        <button type="button" className="signin-passkey" onClick={onStartOver}>
          Use a different email
        </button>
        {status === "error" && <p className="signin-error">{note}</p>}
      </div>
    );
  }

  /**
   * The spare key in use: she reads six digits off whatever screen the mail
   * landed on and types them into the device she is actually holding. A link
   * cannot cross that gap.
   */
  if (step === "code") {
    return (
      <form className="signin-form" onSubmit={onCodeSubmit}>
        <div className="signin-plate">
          <p className="signin-sent">Check your email for a code</p>
          <p className="signin-said">
            We sent six digits to <strong className="signin-address">{email}</strong>
            .
          </p>
          <p className="signin-junk">
            If you do not see it, look in your junk or spam folder.
          </p>
        </div>
        <label htmlFor="code" className="signin-label">
          Your code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="signin-input signin-code"
        />
        <button
          type="submit"
          className="signin-submit"
          disabled={status === "verifying"}
        >
          {status === "verifying" ? "Signing you in…" : "Sign in"}
        </button>
        <button type="button" className="signin-passkey" onClick={onStartOver}>
          Use a different email
        </button>
        {status === "error" && <p className="signin-error">{note}</p>}
      </form>
    );
  }

  return (
    <form className="signin-form" onSubmit={onEmailSubmit}>
      {social.length > 0 && (
        <>
          <div className="signin-social">
            {social.map((provider) => (
              <button
                key={provider}
                type="button"
                className="signin-social-button"
                onClick={() => void onSocial(provider)}
              >
                {SOCIAL_LABEL[provider]}
              </button>
            ))}
          </div>
          <p className="signin-or">or</p>
        </>
      )}

      <label htmlFor="email" className="signin-label">
        Your email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="username webauthn"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="signin-input"
      />
      <button type="submit" className="signin-submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending the link…" : "Email me a link"}
      </button>

      <button type="button" className="signin-passkey" onClick={onPasskey}>
        Use a saved passkey instead
      </button>

      {status === "error" && <p className="signin-error">{note}</p>}
    </form>
  );
}
