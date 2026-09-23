import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  E2E_EMAIL_PREFIX,
  OTP_IDENTIFIER_INFIX,
  OTP_IDENTIFIER_TYPES,
  e2eEmailPrefix,
  e2eVerificationPrefixes,
  isE2EVerificationIdentifier,
  resetE2EState,
  sweepAllE2EState,
  type E2EResetClient,
} from "../e2e/reset";

/**
 * The behavioural half of nc#951's promise.
 *
 * `scripts/e2e-reset-lint.mjs` proves the sweep is WIRED IN — every spec takes
 * the fixture, the fixture still calls it, the config still runs the run-level
 * sweep. Only running it can prove it BITES, and the cases that matter are the
 * ones no grep can see: a sweep that deletes nothing and reports success anyway,
 * a predicate that reaches further than it owns, and a predicate that stopped
 * reaching a row it does own. That last one is the expensive direction, because
 * a residue check phrased in the same predicate cannot see what the predicate
 * cannot see.
 *
 * These run against an in-memory stand-in rather than Postgres, on purpose: the
 * subject is the sweep's own logic — its predicates and its audit — and a spec
 * that needed a database would self-skip on exactly the machines where somebody
 * is about to weaken it. The one thing a stand-in cannot supply is what the
 * REAL identifier shapes are, so those are read out of the installed
 * better-auth in "the shapes are production's, not this spec's" below.
 */

type Row = { email?: string; identifier?: string };

type StartsWith = { identifier: { startsWith: string } };

/**
 * A minimal Prisma stand-in over two arrays.
 *
 * `deletesNothing` is what a rotted sweep looks like from the outside: the
 * delete reports a plausible count and the rows stay where they were.
 *
 * `blindTo` is the subtler one, and the reason this file exists in its current
 * shape (nc#977). It makes the DELETE skip rows the predicate should have
 * matched — a predicate that lost an arm, or anchored on a shape the app never
 * writes — while leaving everything else working. A residue check that re-asks
 * the database with the delete's own predicate is structurally incapable of
 * noticing; the audit has to see wider than the delete to catch it.
 */
function fakeDb(
  seedRows: { users: Row[]; verifications: Row[] },
  options: { deletesNothing?: boolean; blindTo?: (identifier: string) => boolean } = {}
): E2EResetClient & { rows: typeof seedRows } {
  const rows = {
    users: [...seedRows.users],
    verifications: [...seedRows.verifications],
  };

  const matchUsers = (prefix: string) =>
    rows.users.filter((r) => (r.email ?? "").startsWith(prefix));
  const matchVerifications = (where: { OR: StartsWith[] }) =>
    rows.verifications.filter((r) =>
      where.OR.some((arm) => (r.identifier ?? "").startsWith(arm.identifier.startsWith))
    );

  return {
    rows,
    user: {
      async count({ where }) {
        return matchUsers(where.email.startsWith).length;
      },
      async deleteMany({ where }) {
        const hit = matchUsers(where.email.startsWith);
        if (!options.deletesNothing) {
          rows.users = rows.users.filter((r) => !hit.includes(r));
        }
        return { count: hit.length };
      },
    },
    verification: {
      async count({ where }) {
        return matchVerifications(where).length;
      },
      async deleteMany({ where }) {
        const hit = matchVerifications(where).filter(
          (r) => !options.blindTo?.(r.identifier ?? "")
        );
        if (!options.deletesNothing) {
          rows.verifications = rows.verifications.filter((r) => !hit.includes(r));
        }
        return { count: hit.length };
      },
      // The audit's read. Deliberately a `contains` — wider than the delete —
      // so a row the delete predicate can no longer match is still visible to
      // something that can recognise it.
      async findMany({ where }) {
        return rows.verifications
          .filter((r) => (r.identifier ?? "").includes(where.identifier.contains))
          .map((r) => ({ identifier: r.identifier ?? "" }));
      },
    },
  };
}

/** A teacher this suite seeded in Playwright parallel slot `slot`. */
const seeded = (n: number, slot = 0): Row => ({
  email: `${e2eEmailPrefix(slot)}0000-${n}@example.test`,
});

/**
 * A verification identifier naming `email`, in the shape the app really writes
 * one: `lib/auth.ts` configures better-auth's `emailOTP`, whose identifier is
 * `<type>-otp-<email>` (node_modules/better-auth/…/email-otp/utils.mjs). Its
 * `magicLink` stores a bare token naming nobody, so it is not swept by address
 * at all. Nothing here produces `<scope>:<email>` — do not seed that shape.
 */
const signInOtp = (email: string): Row => ({
  identifier: `sign-in-otp-${email}`,
});

describe("resetE2EState", () => {
  it("removes the teachers a leaked attempt left behind", async () => {
    const db = fakeDb({
      users: [seeded(1), seeded(2)],
      verifications: [signInOtp(seeded(1).email!)],
    });

    const outcome = await resetE2EState(db, 0);

    expect(outcome.found).toEqual({ users: 2, verifications: 1 });
    expect(outcome.deleted).toEqual({ users: 2, verifications: 1 });
    expect(db.rows.users).toEqual([]);
    expect(db.rows.verifications).toEqual([]);
  });

  it("leaves rows that are not this suite's alone", async () => {
    // A developer running the e2e suite against their own database must not lose
    // their own teacher. The seed email prefix is the whole safety argument.
    const real = { email: "miss.hall@example.school" };
    const realVerification = signInOtp(real.email);
    const db = fakeDb({
      users: [real, seeded(1)],
      verifications: [realVerification],
    });

    await resetE2EState(db, 0);

    expect(db.rows.users).toEqual([real]);
    expect(db.rows.verifications).toEqual([realVerification]);
  });

  it("is quiet and honest when there is nothing to sweep", async () => {
    const db = fakeDb({ users: [], verifications: [] });

    await expect(resetE2EState(db, 0)).resolves.toEqual({
      found: { users: 0, verifications: 0 },
      deleted: { users: 0, verifications: 0 },
      spared: { verifications: 0 },
    });
  });

  /**
   * nc#978, the property that replaces `workers: 1`. The sweep is by predicate,
   * so before the slot went into the address it deleted EVERY `pw-e2e-…`
   * teacher — including one a concurrently running sibling worker was in the
   * middle of using, cascading away its class, session and grounds mid-test.
   * Nothing in the lint, the guards or playwright.config.ts pinned the worker
   * count that made that safe. This does: revert the address to a global shape
   * and slot 1's rows die under slot 0's sweep, right here.
   */
  it("never touches another worker slot's rows", async () => {
    const sibling = seeded(9, 1);
    const siblingVerification = signInOtp(sibling.email!);
    const db = fakeDb({
      users: [seeded(1), sibling],
      verifications: [signInOtp(seeded(1).email!), siblingVerification],
    });

    const outcome = await resetE2EState(db, 0);

    expect(outcome.found).toEqual({ users: 1, verifications: 1 });
    expect(outcome.deleted).toEqual({ users: 1, verifications: 1 });
    expect(db.rows.users).toEqual([sibling]);
    expect(db.rows.verifications).toEqual([siblingVerification]);
  });

  it("sweeps whichever slot it is told to, not slot 0", async () => {
    // The mirror image: slot 1's sweep must reach slot 1's rows. Without this,
    // a sweep hardcoded to slot 0 would pass the test above while resetting
    // nothing at all for every worker but the first.
    const db = fakeDb({ users: [seeded(1), seeded(9, 1)], verifications: [] });

    await resetE2EState(db, 1);

    expect(db.rows.users).toEqual([seeded(1)]);
  });

  it("refuses a slot that is not a Playwright parallel index", async () => {
    // A default would have been the easy thing here, and a default is exactly
    // the every-worker sweep coming back the first time a caller forgets.
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => e2eEmailPrefix(bad)).toThrow(/parallel slot/);
    }
    expect(e2eEmailPrefix(0)).toBe(`${E2E_EMAIL_PREFIX}w0-`);
    expect(e2eEmailPrefix(3)).toBe(`${E2E_EMAIL_PREFIX}w3-`);
  });

  it("THROWS when the sweep reports a delete that did not happen", async () => {
    // The nc#554 case. Without the residue re-count this returns
    // `{ deleted: { users: 1 } }` and the attempt proceeds on the previous
    // attempt's state, green all the way down.
    const db = fakeDb({ users: [seeded(1)], verifications: [] }, { deletesNothing: true });

    await expect(resetE2EState(db, 0)).rejects.toThrow(
      /did not reset[\s\S]*1 user row\(s\)/
    );
    expect(db.rows.users).toHaveLength(1);
  });

  it("THROWS on residue in a table whose relation stopped cascading", async () => {
    const db = fakeDb(
      {
        users: [],
        verifications: [signInOtp(seeded(9).email!)],
      },
      { deletesNothing: true }
    );

    await expect(resetE2EState(db, 0)).rejects.toThrow(/1 verification row\(s\)/);
  });
});

/**
 * nc#977. The verification predicate used to be `contains: prefix` — a
 * substring match, so it also deleted rows belonging to an address that merely
 * CONTAINED a seeded one. Two things had to be true of the replacement, and
 * they pull in opposite directions: it has to spare the near misses, and it has
 * to keep matching every shape the app actually writes. The first attempt at
 * this ticket got the second half wrong — it anchored on `sign-in:<email>`,
 * which is written nowhere in the product — and that is the failure these
 * assert against.
 */
describe("resetE2EState's verification predicate", () => {
  const prefix = e2eEmailPrefix(0);

  it("sweeps every OTP type the app can write for a seeded address", async () => {
    // The half the over-narrow anchor of PR #981 would have broken. Each of
    // these is a real identifier `toOTPIdentifier` can produce for a teacher
    // this suite seeded; missing any one of them is the nc#951 leak, not a
    // tidy-up, and it is worse than the over-match it was replacing.
    const email = seeded(1).email!;
    const db = fakeDb({
      users: [seeded(1)],
      verifications: OTP_IDENTIFIER_TYPES.map((type) => ({
        identifier: `${type}${OTP_IDENTIFIER_INFIX}${email}`,
      })),
    });

    const outcome = await resetE2EState(db, 0);

    expect(outcome.found.verifications).toBe(OTP_IDENTIFIER_TYPES.length);
    expect(outcome.deleted.verifications).toBe(OTP_IDENTIFIER_TYPES.length);
    expect(db.rows.verifications).toEqual([]);
  });

  it("spares an address that merely contains a seeded one", async () => {
    // The two rows nc#977 was filed on, reproduced against a real Postgres in
    // that ticket: both users correctly survived and both their verification
    // rows were deleted anyway. `a<prefix>x@…` defeats a left anchor on the
    // address; `x-<prefix>y@…` defeats a naive anchor on the separator before
    // it, because the seed prefix itself begins with `pw-`.
    const nearMisses = [
      signInOtp(`a${prefix}x@example.school`),
      signInOtp(`x-${prefix}y@example.school`),
      // Case matters: identifiers store the address better-auth lowercased.
      signInOtp(`${prefix.toUpperCase()}shouty@example.school`),
    ];
    const db = fakeDb({
      users: [],
      verifications: [...nearMisses, signInOtp(seeded(1).email!)],
    });

    const outcome = await resetE2EState(db, 0);

    expect(outcome.deleted.verifications).toBe(1);
    expect(db.rows.verifications).toEqual(nearMisses);
    // Sparing them is a decision, so it is reported rather than inferred.
    expect(outcome.spared.verifications).toBe(2);
  });

  it("does not sweep an identifier shape the app cannot write", async () => {
    // `sign-in:<email>` is the shape PR #981 anchored on. It exists in nothing
    // but an old test helper, so a row carrying it is not this suite's to
    // delete — and pinning that here is what stops the fixture drifting back
    // into agreeing with an assertion instead of with production.
    const fictional = { identifier: `sign-in:${seeded(1).email!}` };
    const db = fakeDb({ users: [], verifications: [fictional] });

    const outcome = await resetE2EState(db, 0);

    expect(db.rows.verifications).toEqual([fictional]);
    expect(outcome.spared.verifications).toBe(1);
  });

  /**
   * THE POINT OF THE WHOLE TICKET.
   *
   * The audit that follows the delete used to re-ask the database with the
   * delete's own predicate, which made it blind in the only direction that
   * costs anything: a predicate that stops matching a real shape leaves a row
   * the residue count also cannot see, so it counts zero and agrees with the
   * bug. `blindTo` plants exactly that — the delete quietly skips the
   * `email-verification-otp-` rows, as an anchor on the wrong literal would —
   * and the sweep has to notice anyway, because the audit reads wider than the
   * delete and classifies what it finds in TypeScript rather than in SQL.
   */
  it("THROWS when the delete predicate stops matching a shape it owns", async () => {
    const email = seeded(1).email!;
    const missed = `email-verification${OTP_IDENTIFIER_INFIX}${email}`;
    const db = fakeDb(
      {
        users: [],
        verifications: [{ identifier: missed }, signInOtp(email)],
      },
      { blindTo: (identifier) => identifier.startsWith("email-verification") }
    );

    await expect(resetE2EState(db, 0)).rejects.toThrow(
      new RegExp(`1 verification row\\(s\\)[\\s\\S]*${missed}`)
    );
    // And it names the survivor, so the next reader is told which shape drifted
    // rather than being sent to diff two predicates.
    expect(db.rows.verifications).toEqual([{ identifier: missed }]);
  });

  it("classifies identifiers the same way the anchors do", () => {
    const owned = OTP_IDENTIFIER_TYPES.map(
      (type) => `${type}${OTP_IDENTIFIER_INFIX}${prefix}0000@example.test`
    );
    for (const identifier of owned) {
      expect(isE2EVerificationIdentifier(identifier, prefix)).toBe(true);
      expect(
        e2eVerificationPrefixes(prefix).some((p) => identifier.startsWith(p))
      ).toBe(true);
    }

    for (const identifier of [
      `sign-in-otp-a${prefix}x@example.school`,
      `sign-in-otp-x-${prefix}y@example.school`,
      `sign-in:${prefix}0000@example.test`,
      // magicLink, passkey and the qa-signin route all store a bare token.
      "b7f3c2a1d9e84f0c",
      // A slot that is not ours.
      `sign-in-otp-${e2eEmailPrefix(1)}0000@example.test`,
    ]) {
      expect(isE2EVerificationIdentifier(identifier, prefix)).toBe(false);
      expect(
        e2eVerificationPrefixes(prefix).some((p) => identifier.startsWith(p))
      ).toBe(false);
    }
  });

  /**
   * The fixture cannot be allowed to agree with itself. Everything above builds
   * identifiers out of this repo's own constants; if those constants were
   * invented — as `sign-in:<email>` was — every test would pass and the sweep
   * would still miss every real row. So the constants are held against the
   * library that writes the rows, and against lib/auth.ts for which plugins are
   * installed at all. A better-auth bump that changes either goes red HERE,
   * with an explanation, rather than silently in a suite that has stopped
   * resetting.
   */
  it("takes its shapes from production, not from this spec", () => {
    const require = createRequire(import.meta.url);
    const emailOtpDir = dirname(
      require.resolve("better-auth/plugins/email-otp", { paths: [process.cwd()] })
    );

    const utils = readFileSync(join(emailOtpDir, "utils.mjs"), "utf8");
    expect(
      utils,
      "better-auth's toOTPIdentifier no longer builds `<type>-otp-<email>`. " +
        "tests/e2e/reset.ts's anchors are derived from that format; re-read it " +
        "and update OTP_IDENTIFIER_INFIX before trusting the sweep again."
    ).toContain("return `${type}" + OTP_IDENTIFIER_INFIX + "${email}`;");

    const routes = readFileSync(join(emailOtpDir, "routes.mjs"), "utf8");
    const declared = routes.match(/const types = \[([\s\S]*?)\];/)?.[1];
    expect(declared, "better-auth's emailOTP type list moved").toBeTypeOf("string");
    const types = [...(declared ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(
      types.sort(),
      "better-auth's emailOTP writes a `type` tests/e2e/reset.ts does not " +
        "anchor on. Every missing type is a verification row the sweep leaves " +
        "for the next attempt (nc#951)."
    ).toEqual([...OTP_IDENTIFIER_TYPES].sort());

    // And the plugin has to actually be installed, or the anchors are guarding
    // a door the app no longer has.
    const auth = readFileSync(join(process.cwd(), "lib/auth.ts"), "utf8");
    expect(auth).toMatch(/\bemailOTP\(/);
    // magicLink and passkey identifiers are bare tokens carrying no address, so
    // there is deliberately nothing to anchor for them. If that stops being
    // true the header's enumeration is wrong, not just incomplete.
    expect(auth).toMatch(/\bmagicLink\(/);
    // The third pin that used to live here — that emailOTP's change-email flow
    // stays off, because its identifier is the one shape no anchor can reach —
    // was a regex over this same source text, and `[^}]*` stopped at the first
    // nested `}`. Ordinary formatting walked past it (nc#993). It now asks the
    // evaluated config instead of the file, in
    // tests/unit/auth-change-email-off.spec.ts.
  });
});

/**
 * nc#982. The per-attempt sweep is scoped to the running worker's parallel slot,
 * which is what keeps it off a sibling's rows — and which also means a slot only
 * ever cleans itself. `parallelIndex` ranges over `0…workers-1`, so a row left
 * in a slot no later run enters was swept by nothing at all: a `--workers=4`
 * run that dies orphans slots 1-3 permanently under the configured `workers: 1`.
 */
describe("sweepAllE2EState", () => {
  it("reaches a slot no run will ever re-enter", async () => {
    // The exact case reproduced in nc#982 against a real Postgres: an orphan in
    // slot 3, and a run configured with one worker, which enters only slot 0.
    const orphan = { email: `${e2eEmailPrefix(3)}orphan@example.test` };
    const db = fakeDb({
      users: [seeded(1), orphan],
      verifications: [signInOtp(orphan.email)],
    });

    await resetE2EState(db, 0);
    expect(db.rows.users).toEqual([orphan]);

    const outcome = await sweepAllE2EState(db);

    expect(outcome.deleted).toEqual({ users: 1, verifications: 1 });
    expect(db.rows.users).toEqual([]);
    expect(db.rows.verifications).toEqual([]);
  });

  it("claims the family rather than a list of slots", async () => {
    // The reason this is a fix and not a wider net: it never enumerates slots,
    // so there is no slot it can fail to think of — including one written by a
    // worker count this run has never heard of.
    const users = [0, 1, 7, 31, 4096].map((slot) => ({
      email: `${e2eEmailPrefix(slot)}x@example.test`,
    }));
    const db = fakeDb({ users, verifications: [] });

    const outcome = await sweepAllE2EState(db);

    expect(outcome.deleted.users).toBe(users.length);
    expect(db.rows.users).toEqual([]);
  });

  it("still spares a developer's own rows", async () => {
    // Widening the scope to every slot must not widen it past the family.
    const real = { email: "miss.hall@example.school" };
    const nearMiss = signInOtp(`x-${E2E_EMAIL_PREFIX}w0-y@example.school`);
    const db = fakeDb({
      users: [real, seeded(1, 2)],
      verifications: [nearMiss],
    });

    const outcome = await sweepAllE2EState(db);

    expect(db.rows.users).toEqual([real]);
    expect(db.rows.verifications).toEqual([nearMiss]);
    expect(outcome.spared.verifications).toBe(1);
  });
});
