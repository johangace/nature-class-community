"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  PASSKEY_COPY,
  canSavePasskey,
  codeOf,
  endingOf,
  readPasskeyError,
  reportPasskeyCeremony,
} from "@/lib/passkey";

/**
 * The passkey offer previously shown on Today. Its render point was removed
 * in #1195; keep the enrolment flow here while that offer is paused.
 *
 * Three things were wrong with it, all reported as one symptom by Johan
 * ("the authentication with fingerprint doesnt seem to work", 2026-08-03):
 *
 *   1. Every failure was swallowed. `const { error } = await addPasskey(); if
 *      (error) setState("offer")` threw the error away, so the button said
 *      "Waiting…" and then flipped back as if nothing had happened. Now every
 *      outcome is read (lib/passkey.ts), a cancel returns quietly to the
 *      offer, and anything else says something true.
 *   2. It offered enrolment without knowing whether one already existed. The
 *      gate was `window.PublicKeyCredential` plus not-dismissed, so a teacher
 *      who turned it on during onboarding was offered it again; Better Auth
 *      sends the existing credentials as excludeCredentials, the browser
 *      refuses the duplicate, and fault 1 hid the refusal. Today now asks the
 *      server first and passes `alreadyEnrolled`, and the duplicate error is
 *      read honestly if one slips through anyway.
 *   3. The copy said "Face ID" on a device with a fingerprint reader. It now
 *      names the gesture, not the brand. See lib/passkey.ts.
 */
const DISMISS_KEY = "nc-passkey-strip-dismissed";

type State =
  | "hidden"
  | "offer"
  | "working"
  | "enrolled"
  | "already"
  | "unavailable"
  | "failed";

export function PasskeyStrip({
  alreadyEnrolled = false,
}: {
  /** Server-read: this teacher already has a passkey, so do not offer one. */
  alreadyEnrolled?: boolean;
}) {
  const [state, setState] = useState<State>("hidden");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (alreadyEnrolled) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    // Ask the platform whether it can actually save one before offering it.
    let live = true;
    void canSavePasskey().then((can) => {
      if (live && can) setState("offer");
    });
    return () => {
      live = false;
    };
  }, [alreadyEnrolled]);

  async function enroll() {
    setState("working");
    const { error } = await authClient.passkey.addPasskey();
    if (!error) {
      void reportPasskeyCeremony({
        surface: "today-strip",
        act: "enrol",
        outcome: "ok",
      });
      setState("enrolled");
      return;
    }
    const outcome = readPasskeyError(error);
    // Counted, including the cancels: a strip that is dismissed by everyone
    // who is offered it is a finding about the offer, not about the platform
    // (#650).
    void reportPasskeyCeremony({
      surface: "today-strip",
      act: "enrol",
      outcome: endingOf(outcome),
      code: codeOf(error),
      reason: outcome.kind === "failed" ? outcome.reason : null,
    });
    switch (outcome.kind) {
      case "already":
        setState("already");
        return;
      case "cancelled":
        // They backed out. That is a choice, not a fault: no message.
        setState("offer");
        return;
      case "unavailable":
        setState("unavailable");
        return;
      case "failed":
        setNote(
          outcome.reason === "wrong-host"
            ? PASSKEY_COPY.saveWrongHost
            : PASSKEY_COPY.saveFailed
        );
        setState("failed");
        return;
    }
  }

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setState("hidden");
  }

  if (state === "hidden") return null;

  if (state === "enrolled" || state === "already" || state === "unavailable") {
    return (
      <div className="passkey-strip">
        <p className="passkey-strip-line">
          {state === "enrolled"
            ? PASSKEY_COPY.set
            : state === "already"
              ? PASSKEY_COPY.already
              : PASSKEY_COPY.unavailable}
        </p>
      </div>
    );
  }

  return (
    <div className="passkey-strip">
      <span className="start-unlock" aria-hidden="true" />
      <p className="passkey-strip-line">
        {state === "failed" ? note : PASSKEY_COPY.offer}
      </p>
      <button
        type="button"
        className="passkey-strip-go"
        onClick={enroll}
        disabled={state === "working"}
      >
        {state === "working"
          ? "Waiting for this device…"
          : state === "failed"
            ? "Try again"
            : "Turn on"}
      </button>
      <button type="button" className="passkey-strip-dismiss" onClick={dismiss}>
        Not now
      </button>
    </div>
  );
}
