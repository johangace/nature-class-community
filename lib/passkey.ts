/**
 * What a passkey ceremony meant, and what we call it in front of a teacher.
 * One module, because the same offer appears in three places — onboarding
 * screen 6, the Today strip, and the sign-in page — and three copies of this
 * reading is how they drift apart again.
 *
 * ## Naming the sensor
 *
 * The copy used to say "Face ID" everywhere. Johan turned it on with a
 * fingerprint and reported that the fingerprint sign-in "doesn't seem to
 * work" — the words did not match the device in his hand. There is no honest
 * way to name the sensor from the platform: the same iPad model ships with
 * Touch ID or Face ID, Android is a fingerprint or a face, Windows Hello is
 * either plus a PIN, and the browser will not tell us which. So we name the
 * gesture the teacher already knows instead of the brand: whatever unlocks
 * this device is what signs them in. True on every device, no lookup table to
 * rot.
 *
 * ## Reading a failure
 *
 * `addPasskey()` used to be called as `const { error } = ...; if (error)
 * setState("offer")` — the error was thrown away entirely, so the button said
 * "Waiting…" and then flipped back as if nothing had happened, and no one
 * could tell why. The codes below all come from @simplewebauthn/browser via
 * the Better Auth passkey client, which flattens the WebAuthnError into
 * `{ code, message }` and drops the DOMException `cause`. The code is
 * therefore all we get, and it is enough to tell the four cases apart.
 */

/**
 * A ceremony's outcome, read from Better Auth's flattened error. This says
 * what happened, never what to print: saving a passkey and using one are
 * different sentences to a teacher, so each surface picks its own words from
 * PASSKEY_COPY below.
 */
export type PasskeyOutcome =
  /** The teacher already has one of these. Nothing failed; stop offering. */
  | { kind: "already" }
  /** They dismissed the sheet, or it timed out. Not an error, no message. */
  | { kind: "cancelled" }
  /** This device cannot do it at all. Say so and mean it. */
  | { kind: "unavailable" }
  /** Something genuinely went wrong. */
  | { kind: "failed"; reason: "wrong-host" | "unknown" };

/** The shape Better Auth hands back on a failed ceremony. */
export interface PasskeyError {
  code?: string | null;
  message?: string | null;
}

const ALREADY = "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";

// A cancel and a timeout are the same DOMException (NotAllowedError), which
// SimpleWebAuthn passes straight through. We only ever reach these codes
// after confirming a platform authenticator exists, so "the teacher backed
// out" is the honest reading rather than "the platform refused".
const CANCELLED = new Set([
  "ERROR_CEREMONY_ABORTED",
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
]);

// The device answered, and the answer was no: it cannot make a credential
// this server would accept.
const UNAVAILABLE = new Set([
  "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
  "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
  "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
]);

// The two codes that mean the passkey's relying party does not match the host
// serving the page. Today that cannot happen; the day we move to a custom
// domain it is the first thing that will. See the rpID note in lib/auth.ts.
const WRONG_HOST = new Set(["ERROR_INVALID_DOMAIN", "ERROR_INVALID_RP_ID"]);

export const PASSKEY_COPY = {
  /** The offer, on both surfaces that make one. Names the gesture, not a brand. */
  offer: "Never do the email dance again: sign in the way you unlock this device.",
  /** The second line, where a surface has room for one. */
  offerSub: "A glance or a touch next time, with no link to wait for.",
  /** Saved, just now. */
  set: "You're set. Next time, just unlock this device and you're in.",
  /** Saved before this attempt. */
  already: "This device is already set up. Nothing to do.",
  /** The platform cannot save one. */
  unavailable:
    "This device can't save a sign-in like that. The email link still works.",
  /** Saving failed, cause unknown, with a way forward. */
  saveFailed: "That didn't get saved. Try again, or carry on with the email link.",
  /** Using a saved one failed, cause unknown. */
  useFailed: "That sign-in didn't go through. Try the email link instead.",
  /**
   * The rpID landmine, firing. Different words on each surface because they
   * mean different things: nothing was saved, versus what was saved will not
   * open this address. See the note in lib/auth.ts.
   */
  saveWrongHost:
    "This address can't save a sign-in for this account. Use the email link for now.",
  useWrongHost:
    "This device's saved sign-in was made for a different address. Use the email link.",
} as const;

/**
 * Turn Better Auth's error into an outcome, and leave a trace someone can
 * actually debug. The console line is deliberately unconditional: a teacher
 * reporting "it doesn't seem to work" from an iPad is only diagnosable if the
 * cause survives to a remote inspector, and a code plus a library message
 * carries no personal data.
 *
 * A note on the sign-in path: Better Auth labels an unclassifiable failure
 * there `AUTH_CANCELLED`, which reads like a cancel and is not one. A real
 * cancel comes through as a passed-through NotAllowedError instead, which is
 * why that code is in CANCELLED above and `AUTH_CANCELLED` falls to "failed".
 * Calling it a cancel would put us straight back in the silent-failure hole
 * this whole module exists to climb out of.
 */
export function readPasskeyError(error: PasskeyError): PasskeyOutcome {
  const code = error.code ?? "NO_CODE";
  console.warn("[passkey] ceremony did not complete", {
    code,
    message: error.message ?? null,
  });

  if (code === ALREADY) return { kind: "already" };
  if (CANCELLED.has(code)) return { kind: "cancelled" };
  if (UNAVAILABLE.has(code)) return { kind: "unavailable" };
  if (WRONG_HOST.has(code)) return { kind: "failed", reason: "wrong-host" };
  return { kind: "failed", reason: "unknown" };
}

/**
 * Whether this device can actually make a passkey, rather than merely knowing
 * the word. `window.PublicKeyCredential` is present in every modern browser,
 * including a desktop Chrome with nothing to authenticate against, so the old
 * gate offered the teacher something the platform could not honour. This asks
 * the real question. Anything unexpected answers no: offering nothing is
 * always safer than offering a dead button.
 */
export async function canSavePasskey(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const ask = window.PublicKeyCredential
    .isUserVerifyingPlatformAuthenticatorAvailable;
  if (typeof ask !== "function") return false;
  try {
    return await ask.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
}


/* -------------------------------------------------------------------------
 * Counting the ceremonies (#650)
 *
 * The passkey has been reported broken three times since #45 — the wrong
 * sensor named, the offer that would not go away, the credentials the domain
 * move silently invalidated — and each fix was aimed at a symptom described
 * from memory, because the evidence lands in a console on a device we do not
 * hold. Johan's reading, 2026-08-28, is that it is still "not reliable".
 *
 * So before deciding whether to keep, demote, or retire this path, count what
 * devices actually do. Successes are reported alongside failures: a pile of
 * error codes without a denominator cannot tell a broken path from an unused
 * one, and the ratio is the whole finding.
 *
 * What is sent is deliberately thin: how the ceremony ended, the library's
 * own code, and the coarse device and browser family the codes have to be
 * read against. No user id, no email, no raw user-agent string. A row says
 * "an iPad on Safari cancelled at enrolment", never who was holding it.
 * ------------------------------------------------------------------------- */

/** Where the offer was made. */
export type PasskeySurface =
  | "sign-in"
  | "sign-in-autofill"
  | "today-strip"
  | "onboarding";

/** What was attempted. */
export type PasskeyAct = "use" | "enrol";

/** How it ended. `ok` is the denominator the failure codes are read against. */
export type PasskeyEnding =
  | "ok"
  | "already"
  | "cancelled"
  | "unavailable"
  | "failed";

export interface PasskeyClientFamily {
  platform: "ios" | "android" | "macos" | "windows" | "linux" | "other";
  browser: "safari" | "chrome" | "firefox" | "edge" | "other";
}

/**
 * The coarse families, read from a user-agent string and thrown away. Pure and
 * exported so the reading is testable without a browser: the whole value of
 * this field is that "every failure is an iPad on Safari" is a finding and
 * "every failure is a desktop Chrome with no sensor" is a different one.
 *
 * iPadOS lies about itself — Safari on an iPad has claimed to be a Macintosh
 * since iPadOS 13 — so a Mac that reports touch points is really an iPad.
 * Getting this wrong would put our most common school device in the wrong
 * bucket, which is the one distinction this field exists to make.
 */
export function readClientFamily(
  userAgent: string,
  touchPoints = 0
): PasskeyClientFamily {
  const ua = userAgent.toLowerCase();

  const platform: PasskeyClientFamily["platform"] = /iphone|ipad|ipod/.test(ua)
    ? "ios"
    : /android/.test(ua)
      ? "android"
      : /mac os x|macintosh/.test(ua)
        ? touchPoints > 1
          ? "ios" // an iPad wearing a Mac's user-agent
          : "macos"
        : /windows/.test(ua)
          ? "windows"
          : /linux|cros/.test(ua)
            ? "linux"
            : "other";

  // Order matters: every one of these strings contains the ones below it.
  const browser: PasskeyClientFamily["browser"] = /edg\//.test(ua)
    ? "edge"
    : /firefox|fxios/.test(ua)
      ? "firefox"
      : /chrome|crios|chromium/.test(ua)
        ? "chrome"
        : /safari/.test(ua)
          ? "safari"
          : "other";

  return { platform, browser };
}

/**
 * Post one ended ceremony. Never throws and never blocks: a report that fails
 * must not be able to break the sign-in it is only watching. `keepalive` so a
 * successful sign-in, which navigates immediately afterwards, still lands.
 */
export async function reportPasskeyCeremony(report: {
  surface: PasskeySurface;
  act: PasskeyAct;
  outcome: PasskeyEnding;
  code?: string | null;
  reason?: string | null;
  conditional?: boolean | null;
}): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const family = readClientFamily(
      window.navigator.userAgent,
      window.navigator.maxTouchPoints ?? 0
    );
    const canSave = await canSavePasskey();
    await fetch("/api/passkey-report", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: report.surface,
        act: report.act,
        outcome: report.outcome,
        code: report.code ?? null,
        reason: report.reason ?? null,
        platform: family.platform,
        browser: family.browser,
        canSave,
        conditional: report.conditional ?? null,
      }),
    });
  } catch {
    // Watching must never be able to break the thing it watches.
  }
}

/** The ending, read off an outcome, so every call site reports it the same. */
export function endingOf(outcome: PasskeyOutcome): PasskeyEnding {
  return outcome.kind === "failed" ? "failed" : outcome.kind;
}

/**
 * The library's code, read the same tolerant way `readPasskeyError` reads it.
 * Better Auth's error union has members without a `code` at all, so reaching
 * for the field directly at each call site does not typecheck and reaching
 * for it unsafely would put `undefined` in the one column that has to be
 * trustworthy.
 */
export function codeOf(error: PasskeyError): string | null {
  return error.code ?? null;
}
