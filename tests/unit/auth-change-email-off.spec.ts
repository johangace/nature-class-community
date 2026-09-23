import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";
import {
  changeEmailIsEnabled,
  changeEmailIsEnabledIn,
  emailOtpOptionsOf,
  loadAuthModule,
  type EmailOtpOptions,
} from "../support/auth-config";
import { e2eEmailPrefix, isE2EVerificationIdentifier } from "../e2e/reset";

/**
 * nc#993. The e2e sweep's identifier anchors are safe only while emailOTP's
 * change-email flow is off, because that route is the one thing in the product
 * that writes an identifier carrying TWO addresses — a shape no left anchor
 * reaches and no parser can split, since `-` is legal in a local part and in a
 * domain alike (tests/e2e/reset.ts, "KNOWN LIMIT").
 *
 * That it is off used to be pinned by a regex over lib/auth.ts's source text,
 * and `[^}]*` in that regex stopped at the first nested `}`. So the pin was
 * walked past by ordinary formatting — the nc#554 shape in miniature: a guard
 * that looks like protection, produces the same green either way, and cannot
 * go red for the thing it is named after.
 *
 * The question is now put to the program. Everything below reads an EVALUATED
 * options object — the same object better-auth's route reads at
 * plugins/email-otp/routes.mjs:630 — so the way the config is written stopped
 * being part of the answer.
 */

/** The retired tripwire, kept exactly as it shipped so its hole can be shown. */
const RETIRED_SOURCE_PATTERN = /changeEmail:\s*\{[^}]*enabled:\s*true/;

/** The bypass nc#993 was filed on, character for character. */
const THE_QUOTED_BYPASS =
  "changeEmail: { verifyCurrentEmail: false, sendOnChange: () => {}, enabled: true }";

const VARIANTS_FILE = join(
  process.cwd(),
  "tests/fixtures/auth-change-email-variants.ts"
);

const loadVariants = () =>
  loadAuthModule(() => import("../fixtures/auth-change-email-variants"));

describe("emailOTP's change-email door", () => {
  it("is shut in the app that ships", async () => {
    const { auth } = await loadAuthModule(() => import("@/lib/auth"));

    expect(
      changeEmailIsEnabled(auth),
      "lib/auth.ts has enabled emailOTP's change-email flow. That route writes " +
        "`change-email-otp-<old>-<new>` — two addresses, the second one past " +
        "every anchor tests/e2e/reset.ts has — so the e2e sweep now leaks a " +
        "verification row it cannot recognise (nc#951, nc#993). Enabling it " +
        "means recording the identifiers the suite created rather than " +
        "deriving them from a pattern; it does not mean widening the sweep."
    ).toBe(false);
    // The answer came from the options object `emailOTP` was really handed —
    // not from anything about how lib/auth.ts happens to be laid out — so
    // `changeEmail: { enabled: false }`, written any way at all, would pass
    // here exactly as the absent block does.
  });

  it("is answered by evaluating the config, not by reading its source", async () => {
    const variants = await loadVariants();
    const expected: Record<string, boolean> = {
      theQuotedBypass: true,
      spreadSuppliesTheBraces: true,
      enabledByReference: true,
      enabledIsNotTheLiteralTrue: true,
      aCommentEndsThePattern: true,
      builtFromTheDeepImport: true,
      plainlyEnabled: true,
      explicitlyDisabled: false,
      noChangeEmailAtAll: false,
    };

    for (const [name, enabled] of Object.entries(expected)) {
      const auth = variants[name as keyof typeof variants];
      expect(changeEmailIsEnabled(auth as never), name).toBe(enabled);
    }
  });

  it("catches the shape the retired pattern read as harmless", async () => {
    // The hole, shown rather than described: the pattern that guarded this
    // says "nothing to see" about the exact line #993 quotes.
    expect(RETIRED_SOURCE_PATTERN.test(THE_QUOTED_BYPASS)).toBe(false);
    // ...and that line is really in the fixture, so the two cannot drift apart.
    expect(readFileSync(VARIANTS_FILE, "utf8")).toContain(THE_QUOTED_BYPASS);

    const { theQuotedBypass } = await loadVariants();
    expect(changeEmailIsEnabled(theQuotedBypass)).toBe(true);
  });

  it("is not fooled by a `changeEmail` with no brace after it", async () => {
    // The other half of why widening the pattern was never the fix. There is
    // no brace to reach past here at all, so no version of that regex — however
    // careful about nesting — could have found this one.
    const byReference = "changeEmail: CHANGE_EMAIL_ON,";
    expect(RETIRED_SOURCE_PATTERN.test(byReference)).toBe(false);
    expect(readFileSync(VARIANTS_FILE, "utf8")).toContain(byReference);

    const { enabledByReference } = await loadVariants();
    expect(changeEmailIsEnabled(enabledByReference)).toBe(true);
  });

  it("reads `enabled` the way the route reads it", () => {
    // better-auth's own test is `if (!opts.changeEmail?.enabled)` — truthiness,
    // not `=== true`. A check that insisted on the literal would call an open
    // door shut for every one of the first four.
    const open: unknown[] = [true, 1, "yes", {}, () => {}];
    for (const enabled of open) {
      expect(
        changeEmailIsEnabledIn({ changeEmail: { enabled } } as EmailOtpOptions),
        String(enabled)
      ).toBe(true);
    }

    const shut: unknown[] = [false, 0, "", null, undefined, Number.NaN];
    for (const enabled of shut) {
      expect(
        changeEmailIsEnabledIn({ changeEmail: { enabled } } as EmailOtpOptions),
        String(enabled)
      ).toBe(false);
    }
    expect(changeEmailIsEnabledIn({ changeEmail: {} })).toBe(false);
    expect(changeEmailIsEnabledIn({})).toBe(false);
  });

  it("refuses to answer when it never saw the plugin being built", async () => {
    // The one way an evaluated check could go quietly blind: a construction
    // through an import this check does not wrap. It must not read that as
    // "not enabled" — an unseen door is not a shut one.
    const actual = await vi.importActual<typeof import("better-auth/plugins")>(
      "better-auth/plugins"
    );
    const unseen = betterAuth({
      baseURL: "http://localhost:3000",
      secret: "nature-class-test-secret-nature-class-test-secret",
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      logger: { disabled: true },
      plugins: [
        actual.emailOTP({
          sendVerificationOTP: async () => {},
          changeEmail: { enabled: true },
        }),
      ],
    });

    expect(() => emailOtpOptionsOf(unseen)).toThrow(/never seen/);
    expect(() => changeEmailIsEnabled(unseen)).toThrow(/never seen/);
  });
});

/**
 * The other end of the argument: what "enabled" actually costs the sweep. This
 * is a real better-auth instance over the memory adapter, signed into through
 * the real handler, so the identifier below is written by the product's own
 * code path rather than typed out by this spec.
 */
describe("the identifier an enabled change-email flow writes", () => {
  it("carries a seeded address where no anchor of the sweep reaches it", async () => {
    const store = { user: [], session: [], account: [], verification: [] } as {
      verification: { identifier: string }[];
      [key: string]: unknown[];
    };
    const codes: string[] = [];
    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      secret: "nature-class-test-secret-nature-class-test-secret",
      database: memoryAdapter(store),
      emailAndPassword: { enabled: false },
      logger: { disabled: true },
      plugins: [
        emailOTP({
          otpLength: 6,
          expiresIn: 60 * 10,
          sendVerificationOTP: async ({ otp }: { otp: string }) => {
            codes.push(otp);
          },
          changeEmail: { enabled: true },
        }),
      ],
    });

    const post = (path: string, body: unknown, cookie?: string) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        })
      );

    // The leak needs old = an address the sweep does not own and new = one it
    // does. That is the direction nc#993 records, and it is the ordinary one:
    // a teacher signed in already, moving to an address this suite seeded.
    const teacher = "miss.hall@example.school";
    const seeded = `${e2eEmailPrefix(0)}0000-1@example.test`;

    await post("/email-otp/send-verification-otp", {
      email: teacher,
      type: "sign-in",
    });
    const signedIn = await post("/sign-in/email-otp", {
      email: teacher,
      otp: codes.at(-1),
    });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .flatMap((header) => header.split(";"))
      .filter((part) => part.includes("session_token"))
      .join("; ");

    const changed = await post(
      "/email-otp/request-email-change",
      { newEmail: seeded },
      cookie
    );
    expect(changed.status).toBe(200);

    const written = store.verification.map((row) => row.identifier);
    expect(written).toContain(`change-email-otp-${teacher}-${seeded}`);

    // It names an address this suite seeded, and the sweep still cannot claim
    // it: the address sits at the END, behind another one that may itself
    // contain any number of hyphens. This is the row the sweep reports as
    // `spared` rather than deleting — correct, and still a leak.
    const identifier = written.find((id) => id.startsWith("change-email-otp-"))!;
    expect(identifier).toContain(e2eEmailPrefix(0));
    expect(isE2EVerificationIdentifier(identifier, e2eEmailPrefix(0))).toBe(false);
  });
});
