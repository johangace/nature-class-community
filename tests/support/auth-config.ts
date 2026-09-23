import { vi } from "vitest";

/**
 * IS THE CHANGE-EMAIL DOOR OPEN? PUT THE QUESTION TO THE PROGRAM (nc#993).
 *
 * WHY THIS EXISTS
 *
 * `tests/e2e/reset.ts` sweeps the e2e suite's leftovers by ANCHORING on the
 * verification identifiers `lib/auth.ts` can write: `${type}-otp-${email}`,
 * left-anchored on the type literal and the seeded address prefix. Exactly one
 * better-auth identifier defeats that, and it cannot be fixed by widening the
 * anchor: `requestEmailChangeEmailOTP` writes
 * `change-email-otp-${oldEmail}-${newEmail}` — TWO addresses, with the second
 * one at the end where no left anchor reaches, and no parser can find the join
 * because `-` is legal in both a local part and a domain.
 *
 * The reason that is survivable is that the route refuses before it writes:
 *
 *     if (!opts.changeEmail?.enabled) { ... throw ... }
 *     ...
 *     identifier: toOTPIdentifier("change-email", `${email}-${newEmail}`)
 *
 * (node_modules/better-auth/dist/plugins/email-otp/routes.mjs:630 and :651.)
 * `lib/auth.ts` does not enable it, so the shape is unreachable — a landmine
 * with a tripwire.
 *
 * THE TRIPWIRE USED TO BE A REGEX OVER SOURCE TEXT, AND HAD A HOLE
 *
 * It was `/changeEmail:\s*\{[^}]*enabled:\s*true/` read off `lib/auth.ts`.
 * `[^}]*` stops at the first nested `}`, so an ordinary formatting walks
 * straight past it —
 *
 *     changeEmail: { verifyCurrentEmail: false, sendOnChange: () => {}, enabled: true }
 *
 * — and so does `changeEmail: { ...{ verifyCurrentEmail: false }, enabled: true }`,
 * and `changeEmail: CHANGE_EMAIL`, and `enabled: TURNED_ON`, and a comment
 * containing a brace. Widening the pattern only moves the hole: a regex is
 * answering a question about a VALUE by looking at the TEXT that produces it,
 * and there is always another way to write the text.
 *
 * WHAT THIS DOES INSTEAD
 *
 * It evaluates the module and reads the options object that actually reaches
 * `emailOTP(...)` — the very object better-auth's route later tests. Formatting
 * is not part of the answer, because nothing here reads source at all.
 *
 * `betterAuth` runs for real, `emailOTP` runs for real; the factory is wrapped
 * only to remember which options produced which plugin object. The pairing is
 * by object identity, so it cannot be confused by ordering or by a module that
 * builds several instances.
 *
 * IT FAILS CLOSED
 *
 * The one way this could go quietly blind is a plugin constructed through an
 * import specifier the wrapper does not cover. So `emailOtpOptionsOf` does not
 * answer "not enabled" when it has seen nothing: it counts the `email-otp`
 * plugins better-auth was actually handed, and THROWS when it cannot account
 * for one of them. An unseen construction goes red, never green.
 */

/**
 * better-auth's `changeEmail` block. `enabled` is `unknown` on purpose: the
 * route tests it for truthiness (`!opts.changeEmail?.enabled`), not for
 * `=== true`, so `enabled: 1` is an open door and this type must not pretend
 * otherwise.
 */
export interface ChangeEmailConfig {
  enabled?: unknown;
  [key: string]: unknown;
}

/** The options object handed to `emailOTP(...)`, as evaluated. */
export interface EmailOtpOptions {
  changeEmail?: ChangeEmailConfig;
  [key: string]: unknown;
}

/** As much of a better-auth instance as this file needs. */
export interface AuthLike {
  options?: { plugins?: unknown[] } | undefined;
}

/** The `id` better-auth's emailOTP plugin carries on the instance. */
export const EMAIL_OTP_PLUGIN_ID = "email-otp";

/** The import specifiers `emailOTP` can be reached through. */
const EMAIL_OTP_SPECIFIERS = [
  "better-auth/plugins",
  "better-auth/plugins/email-otp",
] as const;

/** plugin object → the options object its factory was called with. */
const constructedWith = new WeakMap<object, EmailOtpOptions>();

type EmailOtpFactory = (options: EmailOtpOptions) => unknown;

function recording(actual: { emailOTP: EmailOtpFactory }): EmailOtpFactory {
  return (options) => {
    // The REAL factory runs. This wrapper adds a memory, not a behaviour.
    const plugin = actual.emailOTP(options);
    if (plugin !== null && typeof plugin === "object") {
      constructedWith.set(plugin, options ?? {});
    }
    return plugin;
  };
}

let armed = false;

function arm(): void {
  if (armed) return;
  armed = true;
  for (const specifier of EMAIL_OTP_SPECIFIERS) {
    vi.doMock(specifier, async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>;
      return {
        ...actual,
        emailOTP: recording(actual as unknown as { emailOTP: EmailOtpFactory }),
      };
    });
  }
}

/**
 * Import a module that builds a better-auth instance, remembering the options
 * every `emailOTP(...)` inside it was constructed with.
 *
 * Pass a loader rather than a specifier so the import stays statically
 * analysable, and call it for EVERY auth module under test — a module imported
 * around this function is one `emailOtpOptionsOf` will refuse to answer for.
 */
export async function loadAuthModule<T>(load: () => Promise<T>): Promise<T> {
  arm();
  return load();
}

/** The options `lib/auth.ts` (or a fixture) really handed to `emailOTP`. */
export function emailOtpOptionsOf(auth: AuthLike): EmailOtpOptions {
  const plugins = auth?.options?.plugins ?? [];
  const installed = plugins.filter(
    (plugin): plugin is object =>
      plugin !== null &&
      typeof plugin === "object" &&
      (plugin as { id?: unknown }).id === EMAIL_OTP_PLUGIN_ID
  );

  if (installed.length !== 1) {
    throw new Error(
      `expected exactly one "${EMAIL_OTP_PLUGIN_ID}" plugin on this auth ` +
        `instance and found ${installed.length}. The e2e sweep's identifier ` +
        `anchors are derived from that plugin (tests/e2e/reset.ts); if it is ` +
        `gone, or installed twice, the anchors describe a door the app no ` +
        `longer has.`
    );
  }

  const options = constructedWith.get(installed[0]!);
  if (!options) {
    throw new Error(
      "this auth instance's emailOTP plugin was not constructed through " +
        "loadAuthModule(), so the options it was given were never seen. " +
        "Refusing to report the change-email door as shut on evidence this " +
        "check does not have: either load the module through loadAuthModule, " +
        "or add the import specifier emailOTP was reached through to " +
        `EMAIL_OTP_SPECIFIERS (${EMAIL_OTP_SPECIFIERS.join(", ")}).`
    );
  }
  return options;
}

/**
 * The predicate, spelled exactly as better-auth spells it at routes.mjs:630 —
 * truthiness, not `=== true`. Kept separate from the lookup above so it can be
 * held against that line directly.
 */
export function changeEmailIsEnabledIn(options: EmailOtpOptions): boolean {
  return !!options.changeEmail?.enabled;
}

/** Is emailOTP's change-email flow enabled on this auth instance? */
export function changeEmailIsEnabled(auth: AuthLike): boolean {
  return changeEmailIsEnabledIn(emailOtpOptionsOf(auth));
}
