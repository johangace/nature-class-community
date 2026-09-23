import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";
import { emailOTP as emailOTPFromItsOwnPath } from "better-auth/plugins/email-otp";

/**
 * WAYS TO ENABLE `changeEmail` THAT A REGEX OVER SOURCE TEXT DOES NOT SEE.
 *
 * Every export below is a REAL better-auth instance with emailOTP's change-email
 * flow genuinely on or genuinely off — not a description of one. The retired
 * tripwire in tests/unit/e2e-reset.spec.ts,
 *
 *     /changeEmail:\s*\{[^}]*enabled:\s*true/
 *
 * reads all of the first six as "not enabled" (nc#993), because `[^}]*` stops
 * at the first nested `}` and because `changeEmail:` need not be followed by a
 * brace at all. The check in tests/support/auth-config.ts reads the evaluated
 * options object instead, so none of this matters to it — which is the whole
 * point, and why these variants are worth keeping: they are the shapes a
 * WIDER pattern would have had to think of, and now nobody has to.
 *
 * This file is under tests/fixtures rather than tests/unit so vitest never
 * collects it as a spec; the spec imports it through `loadAuthModule`.
 */

/** The options `emailOTP` accepts, as this better-auth version declares them. */
type EmailOtpOptions = Parameters<typeof emailOTP>[0];

const SECRET = "nature-class-nc993-fixture-secret-nature-class-nc993";

/** Every code this fixture's plugins "send", so a spec can drive a sign-in. */
export const sentCodes: string[] = [];

/** A fresh in-memory database per instance: no state crosses between variants. */
function freshDb() {
  return { user: [], session: [], account: [], verification: [] };
}

/** The parts of the options that are not what any variant is about. */
function base(): EmailOtpOptions {
  return {
    otpLength: 6,
    expiresIn: 60 * 10,
    sendVerificationOTP: async ({ otp }: { otp: string }) => {
      sentCodes.push(otp);
    },
  };
}

function build(plugin: ReturnType<typeof emailOTP>) {
  return betterAuth({
    baseURL: "http://localhost:3000",
    secret: SECRET,
    database: memoryAdapter(freshDb()),
    emailAndPassword: { enabled: false },
    logger: { disabled: true },
    plugins: [plugin],
  });
}

/**
 * THE SHAPE nc#993 WAS FILED ON, verbatim.
 *
 * `sendOnChange` is not a key better-auth 1.6.23 declares, so the literal is
 * widened here rather than altered — the text under test is the text the ticket
 * quotes, and its nested `() => {}` is exactly what ends the retired pattern's
 * `[^}]*` before it ever reaches `enabled`.
 */
export const theQuotedBypass = build(
  emailOTP({
    ...base(),
    changeEmail: { verifyCurrentEmail: false, sendOnChange: () => {}, enabled: true },
  } as unknown as EmailOtpOptions)
);

/** The same hole with no cast needed: a spread supplies the nested braces. */
export const spreadSuppliesTheBraces = build(
  emailOTP({
    ...base(),
    changeEmail: { ...{ verifyCurrentEmail: false }, enabled: true },
  })
);

/** `changeEmail:` is not followed by a brace at all, so the pattern never starts. */
const CHANGE_EMAIL_ON = { verifyCurrentEmail: false, enabled: true };
export const enabledByReference = build(
  emailOTP({
    ...base(),
    changeEmail: CHANGE_EMAIL_ON,
  })
);

/** `enabled` is not the literal `true`, which the pattern required. */
const TURNED_ON = true;
export const enabledIsNotTheLiteralTrue = build(
  emailOTP({
    ...base(),
    changeEmail: { enabled: TURNED_ON },
  })
);

/** A brace inside a COMMENT ends `[^}]*` just as well as a real one does. */
export const aCommentEndsThePattern = build(
  emailOTP({
    ...base(),
    changeEmail: {
      // On for the pilot. See the `{}` note in the rollout plan.
      enabled: true,
    },
  })
);

/**
 * Reached through the plugin's own export path rather than the barrel. Written
 * in the plain shape the retired pattern DID catch, because what this variant
 * proves is different: that the evaluated check still sees a construction made
 * through a second specifier, instead of quietly reporting "not enabled".
 */
export const builtFromTheDeepImport = build(
  emailOTPFromItsOwnPath({
    ...base(),
    changeEmail: { enabled: true },
  })
);

/** The control: the ordinary spelling, which every check should catch. */
export const plainlyEnabled = build(
  emailOTP({
    ...base(),
    changeEmail: {
      enabled: true,
    },
  })
);

/** Present and off. A check that cannot tell this from the ones above is useless. */
export const explicitlyDisabled = build(
  emailOTP({
    ...base(),
    changeEmail: { verifyCurrentEmail: false, enabled: false },
  })
);

/** Absent entirely — the shape lib/auth.ts ships. */
export const noChangeEmailAtAll = build(emailOTP({ ...base() }));
