/**
 * The reset that makes a Playwright retry an independent trial (nc#951).
 *
 * WHY THIS EXISTS
 *
 * `playwright.config.ts` sets `retries: process.env.CI ? 1 : 0`, and until this
 * file existed nothing put the database back between the failed attempt and the
 * retry. The retry is the one thing standing between a genuine flake and a red
 * board, so a retry that starts from wherever the first attempt stopped is worse
 * than no retry at all: a pass may be passing BECAUSE of the leftovers, and a
 * failure is not new information, because it was never an independent trial.
 *
 * The suite mostly got away with it. `seed.ts` gives every test a teacher with a
 * fresh random email and cascades the whole tree off that `User` row, and each
 * spec calls `cleanup()` from a `finally`. But a `finally` only runs if control
 * reached its `try`, and three of the six seed call sites do real database work
 * BEFORE theirs — `location-feedback.spec.ts` nulls the class's coordinates,
 * `shared-grounds.spec.ts` adds a second class, and `seed.ts` itself creates the
 * user before the class it might fail on. A throw in any of those windows leaks
 * the row into the next attempt, unowned by any `cleanup()`.
 *
 * WHAT THIS DOES
 *
 * Deletes everything this suite is capable of having created, before every
 * attempt, rather than trusting the previous one to have tidied up. The seeded
 * teacher's email is the discriminator: `seed.ts` writes
 * `pw-e2e-w<slot>-<uuid>@…` and nothing else in the product does. Deleting that
 * `User` cascades to `Class`, `Session`, `Grounds`, `WorldFact`,
 * `PointmoonRead`, `CastMember`, `SessionCompletion`, `AiRateLimit`, `Account`
 * and `Passkey` (all `onDelete: Cascade` in prisma/schema.prisma).
 * `Verification` is the one table that carries the address without cascading
 * off it, so it is swept by hand.
 *
 * TWO SWEEPS, AT TWO DIFFERENT SCOPES
 *
 * `resetE2EState(db, slot)` runs before EVERY ATTEMPT and claims only the
 * running worker's own parallel slot. That is what makes it parallel-safe.
 *
 * `sweepAllE2EState(db)` runs ONCE PER RUN, from `tests/e2e/global-setup.ts`,
 * before Playwright has started a single worker, and claims the whole
 * `pw-e2e-` family across every slot. See "WHY A RUN-LEVEL SWEEP" below.
 *
 * WHY THE ADDRESS CARRIES A WORKER SLOT (nc#978)
 *
 * The sweep is by predicate, not by id, so whatever the predicate matches, the
 * sweep deletes — including rows a DIFFERENT test is using right now. When the
 * discriminator was a bare `pw-e2e-` the only thing standing between that and a
 * sibling's teacher vanishing mid-test was `playwright.config.ts` happening to
 * say `workers: 1`, and nothing anywhere said so. Raising `workers` is the
 * ordinary way to speed up a 33-test suite, and the resulting failure would
 * have looked exactly like the flakiness this whole area exists to remove.
 *
 * So the config no longer holds the invariant; the address does. Playwright
 * gives every concurrently-running worker a distinct `parallelIndex` (its slot),
 * `seed.ts` writes that slot into the address, and the per-attempt sweep matches
 * only its OWN slot. Two workers can never match each other's rows, whatever
 * `workers` and `fullyParallel` are set to — the trap is gone rather than
 * documented.
 *
 * `parallelIndex` rather than `workerIndex` on purpose: when a worker process
 * dies mid-test Playwright starts a replacement in the SAME slot with a new
 * `workerIndex`, and it is the replacement that must inherit and sweep the
 * corpse's leftovers. Slots are what get reused, so slots are what own rows.
 *
 * WHY A RUN-LEVEL SWEEP AS WELL (nc#982)
 *
 * Slot-scoping bought parallel safety and cost the old guarantee: a slot only
 * ever cleans ITSELF, and `parallelIndex` only ranges over `0…workers-1`, so a
 * row left behind in a slot that no later run re-uses was swept by nothing at
 * all. A `--workers=4` run that dies leaves rows in slots 1-3; the configured
 * `workers: 1` default then re-uses only slot 0, and slots 1-3 are orphaned
 * permanently — together with the whole cascaded tree hanging off each teacher.
 *
 * The fix is scope, not scale: no wider timeout, no blanket delete, and no
 * arithmetic over "which slots might exist". `sweepAllE2EState` matches the
 * `pw-e2e-` FAMILY rather than enumerating slots, so there is no slot it can
 * fail to think of — including slots from a worker count this run has never
 * heard of. It is safe at exactly one moment, and that is when it runs:
 * Playwright's `globalSetup` executes before any worker process starts, so
 * there is no sibling whose rows it could delete out from under a running test.
 * The per-attempt sweep keeps the narrow slot scope for the rest of the run.
 *
 * KNOWN LIMIT, recorded rather than papered over: two Playwright runs sharing
 * one database still cannot overlap — the second run's `globalSetup` sweeps the
 * first run's rows. That was already true before slots existed (every sweep was
 * global then) and is not made worse here; a shared database wants a schema per
 * run, not a narrower predicate.
 *
 * WHY IT CAN GO RED
 *
 * A sweep nobody can prove ran is the same shape of empty green as nc#554's
 * `register-lint.mjs`: it exits 0 whether it works or not. So this does not
 * merely delete — it AUDITS afterwards and throws when anything it claims
 * ownership of survived. That turns the three ways a sweep silently rots — a
 * predicate that stopped matching, a client pointed at the wrong database, a
 * relation that stopped cascading — into a red attempt with the residue named in
 * the message, instead of a green one running on state it did not choose.
 *
 * THE AUDIT DOES NOT RE-USE THE DELETE PREDICATE (nc#977)
 *
 * It used to, and that made it blind in the one direction that costs anything.
 * A residue check phrased as "count the rows the delete predicate matches" can
 * only ever catch a delete that did not happen. It CANNOT catch a predicate that
 * stopped matching a row it should have matched, because the row it can no
 * longer see is also a row it can no longer count: the check agrees with the bug
 * and reports zero. That is the nc#951 leak wearing a green tick, and it is the
 * exact failure the first attempt at nc#977 would have shipped — an identifier
 * anchor on `sign-in:<email>`, a shape this app never writes.
 *
 * So the two halves are deliberately built by different means:
 *
 *   DELETE — SQL, left-anchored, narrow. An `OR` over
 *            `${type}-otp-${addressPrefix}` for every `type` the emailOTP
 *            plugin can write. Nothing that is not one of those shapes is
 *            deleted, which is what spares the near-miss addresses.
 *   AUDIT  — a deliberately WIDER read (`contains` the address prefix — the
 *            over-broad predicate this ticket removed from the delete side)
 *            whose rows are then classified in TypeScript by
 *            `isE2EVerificationIdentifier`. Read-only, so being wide costs
 *            nothing; and because the classification is string logic rather
 *            than the same SQL, a delete predicate that loses an arm still
 *            leaves a row the audit can both SEE and RECOGNISE. It throws.
 *
 * A row the audit sees and does NOT recognise is a near-miss the sweep was
 * right to spare. Those are counted into `spared` rather than thrown on, so
 * sparing them is a visible, asserted decision and not an accident.
 *
 * KNOWN LIMIT, recorded rather than papered over: `PasskeyCeremony` rows carry
 * nothing that identifies a teacher (deliberately — see its schema comment), so
 * no predicate here can tell an e2e row from a real one, and they are not swept.
 * No e2e spec writes one today; `tests/integration/passkey-ceremony.spec.ts`
 * does, and that suite is not what retries here.
 *
 * SCOPE: NEITHER. This reads no prose and writes none; it holds a rule about
 * test fixtures. See `scripts/authorship.mjs` for why every check says so.
 */

/**
 * The family every seeded address belongs to. Nothing matches this that this
 * suite did not write — but it is deliberately NOT the PER-ATTEMPT sweep's
 * predicate, since one worker's sweep must not reach another worker's rows. Use
 * `e2eEmailPrefix(slot)` for that. It IS the run-level sweep's predicate, which
 * is safe only because that one runs before any worker exists (nc#982).
 */
export const E2E_EMAIL_PREFIX = "pw-e2e-";

/**
 * The local part `seed.ts` writes on every teacher it creates in Playwright
 * parallel slot `slot`. A `User` row matching it belongs to this suite, to this
 * slot, and to nothing else — which is what makes deleting one unconditionally
 * safe, both against a developer's own database and against a sibling worker's
 * test that is still running.
 *
 * `seed.ts` and `fixtures.ts` both go through this one function so the address
 * that is WRITTEN and the address that is SWEPT cannot drift apart;
 * `scripts/e2e-reset-lint.mjs` fails the build if either stops doing so.
 */
export function e2eEmailPrefix(slot: number): string {
  if (!Number.isInteger(slot) || slot < 0) {
    throw new Error(
      `e2eEmailPrefix needs a Playwright parallel slot (a non-negative integer), got ${slot}. ` +
        `It is testInfo.parallelIndex — the thing that keeps one worker's sweep off another ` +
        `worker's rows (nc#978). A missing slot is not a reason to fall back to sweeping every ` +
        `worker's teacher; that is the trap this argument exists to close.`
    );
  }
  return `${E2E_EMAIL_PREFIX}w${slot}-`;
}

/**
 * THE SHAPES THIS APP CAN WRITE INTO `Verification.identifier` (nc#977).
 *
 * Read out of the code that writes them, not out of this suite's own fixtures —
 * the previous attempt at this ticket anchored on `sign-in:<email>`, which is
 * written nowhere in the product and existed only because a test helper and an
 * assertion had agreed with each other.
 *
 * `lib/auth.ts` installs three Better Auth plugins plus social sign-in. Of
 * everything they can store, only ONE family puts a teacher's address in the
 * identifier at all:
 *
 *   emailOTP    `${type}-otp-${email}`  — HYPHEN, not colon. The format is
 *               `toOTPIdentifier` in
 *               node_modules/better-auth/dist/plugins/email-otp/utils.mjs, and
 *               `type` is that plugin's own closed four-value list (its
 *               routes.mjs `types`), reproduced below. Every route in the
 *               plugin builds its identifier through that one function.
 *   magicLink   a bare random token — the email lives in the row's `value`,
 *               as JSON, and never in the identifier.
 *   passkey     a bare challenge token. No address.
 *   social      the OAuth `state`, a bare random string.
 *   qa-signin   `app/api/qa-signin/route.ts` writes a bare token by hand, for
 *               `qa-tester@example.invalid` — not an address this suite seeds.
 *
 * So: the only identifiers this sweep can own are emailOTP's, and they are
 * left-anchored on a known literal. That is what makes an anchored predicate
 * possible at all, and `tests/unit/e2e-reset.spec.ts` pins both halves of it
 * against the installed better-auth source so this list cannot drift from the
 * library on a version bump without something going red.
 *
 * `identifier` is stored PLAIN: hashing it is `verification.storeIdentifier`,
 * which `lib/auth.ts` does not set. (`storeOTP: "hashed"` hashes the row's
 * VALUE — the code itself — which is a different field and does not affect this.)
 */
export const OTP_IDENTIFIER_TYPES = [
  "email-verification",
  "sign-in",
  "forget-password",
  "change-email",
] as const;

/** What `toOTPIdentifier` puts between the type and the address. */
export const OTP_IDENTIFIER_INFIX = "-otp-";

/**
 * KNOWN LIMIT, recorded rather than papered over. One emailOTP route builds
 * `change-email-otp-${oldEmail}-${newEmail}` — two addresses, so a seeded
 * address can sit at the END of the identifier rather than at the front, where
 * no left anchor reaches it. It is not swept, and it cannot be: an email local
 * part may contain `-` and a domain may too (`a@my-school.org-pw-e2e-w0-…`), so
 * nothing can find the boundary between the two addresses from the string
 * alone. The reason that is acceptable is that the route is unreachable here —
 * it refuses unless the plugin is configured with `changeEmail: { enabled:
 * true }`, and `lib/auth.ts` does not configure it. If that ever changes, the
 * honest fix is to stop deriving the identifier from a pattern and record the
 * identifiers the suite created, not to widen this back into a `contains`.
 *
 * That "does not configure it" is held by
 * `tests/unit/auth-change-email-off.spec.ts`, which EVALUATES lib/auth.ts and
 * reads the options object `emailOTP` is really handed. It used to be a regex
 * over that file's source text, and a nested `}` walked past it (nc#993): the
 * question is about a value, so it is put to the program rather than to the
 * text that produces it.
 */

/**
 * The left anchors the delete predicate matches on: one per emailOTP type, each
 * pinning the type literal AND the seeded address prefix immediately after it.
 * Nothing else can match, which is what spares an address that merely CONTAINS
 * a seeded one — `x-pw-e2e-w0-y@example.school` is the case nc#977 was filed on.
 */
export function e2eVerificationPrefixes(addressPrefix: string): string[] {
  return OTP_IDENTIFIER_TYPES.map(
    (type) => `${type}${OTP_IDENTIFIER_INFIX}${addressPrefix}`
  );
}

/**
 * Does this identifier belong to an address this sweep owns?
 *
 * Deliberately written as string logic rather than as the SQL predicate above,
 * and deliberately called on a WIDER read than that predicate makes — see "THE
 * AUDIT DOES NOT RE-USE THE DELETE PREDICATE" in the header. Its job is to
 * disagree with the delete when the delete is wrong, which it cannot do if it
 * is the same expression twice.
 */
export function isE2EVerificationIdentifier(
  identifier: string,
  addressPrefix: string
): boolean {
  for (const type of OTP_IDENTIFIER_TYPES) {
    const head = `${type}${OTP_IDENTIFIER_INFIX}`;
    if (!identifier.startsWith(head)) continue;
    if (identifier.slice(head.length).startsWith(addressPrefix)) return true;
  }
  return false;
}

type DeleteResult = { count: number };

type UserWhere = { email: { startsWith: string } };

/** The narrow, left-anchored delete predicate. */
type VerificationWhere = { OR: { identifier: { startsWith: string } }[] };

/** The wider read the audit classifies. Read-only — it deletes nothing. */
type VerificationAuditWhere = { identifier: { contains: string } };

type Table<Where> = {
  deleteMany(args: { where: Where }): Promise<DeleteResult>;
  count(args: { where: Where }): Promise<number>;
};

/**
 * The slice of `PrismaClient` this needs, declared structurally so the sweep can
 * be exercised by `tests/unit/e2e-reset.spec.ts` without a Postgres to point at.
 */
export type E2EResetClient = {
  user: Table<UserWhere>;
  verification: Table<VerificationWhere> & {
    findMany(args: {
      where: VerificationAuditWhere;
      select: { identifier: true };
    }): Promise<{ identifier: string }[]>;
  };
};

export type E2EResetOutcome = {
  /** Rows found before the sweep. Above zero on a retry means the previous
   *  attempt leaked, which is exactly the condition nc#951 is about. */
  found: { users: number; verifications: number };
  /** Rows the sweep actually removed. */
  deleted: { users: number; verifications: number };
  /** Verification rows the audit's wider read saw and the sweep deliberately
   *  did NOT delete: identifiers that merely CONTAIN a seeded address rather
   *  than being one of the shapes this app writes for it. Sparing them is the
   *  point of nc#977, so it is reported rather than left to be inferred. */
  spared: { verifications: number };
};

async function sweep(
  db: E2EResetClient,
  addressPrefix: string,
  scope: string
): Promise<E2EResetOutcome> {
  const userWhere: UserWhere = { email: { startsWith: addressPrefix } };
  const verificationWhere: VerificationWhere = {
    OR: e2eVerificationPrefixes(addressPrefix).map((prefix) => ({
      identifier: { startsWith: prefix },
    })),
  };

  const found = {
    users: await db.user.count({ where: userWhere }),
    verifications: await db.verification.count({ where: verificationWhere }),
  };

  const deleted = {
    users: (await db.user.deleteMany({ where: userWhere })).count,
    verifications: (
      await db.verification.deleteMany({ where: verificationWhere })
    ).count,
  };

  // The audit. Wider than the delete on purpose, and classified in TypeScript
  // rather than re-asked of the database, so a delete predicate that stopped
  // matching a real shape leaves something this can still see AND recognise.
  const survivors = await db.verification.findMany({
    where: { identifier: { contains: addressPrefix } },
    select: { identifier: true },
  });
  const leaked = survivors
    .map((row) => row.identifier)
    .filter((identifier) => isE2EVerificationIdentifier(identifier, addressPrefix));

  const residue = {
    users: await db.user.count({ where: userWhere }),
    verifications: leaked.length,
  };

  if (residue.users > 0 || residue.verifications > 0) {
    throw new Error(
      `The e2e database reset did not reset (${scope}). After deleting, ` +
        `${residue.users} user row(s) with a ${addressPrefix}… address and ` +
        `${residue.verifications} verification row(s) naming one are still there ` +
        `(found ${found.users}/${found.verifications} before, deleted ` +
        `${deleted.users}/${deleted.verifications})` +
        (leaked.length > 0 ? `. Surviving identifiers: ${leaked.join(", ")}` : "") +
        `.\nThis attempt would have started from another attempt's leftovers, which ` +
        `is the thing tests/e2e/reset.ts exists to make impossible. Do not delete ` +
        `this assertion to get green: a sweep that cannot fail is worth exactly ` +
        `what nc#554's empty lint was worth. Likely causes are a changed seed ` +
        `email, a relation that stopped cascading off User, a client pointed ` +
        `at a different database than the server under test, or — for the ` +
        `verification rows specifically — a delete predicate that no longer ` +
        `covers a shape lib/auth.ts still writes (nc#977). The audit above is ` +
        `deliberately wider than that predicate so this last case can be seen ` +
        `at all; check e2eVerificationPrefixes against better-auth's ` +
        `toOTPIdentifier before widening anything.`
    );
  }

  return {
    found,
    deleted,
    spared: { verifications: survivors.length - leaked.length },
  };
}

/**
 * Put the database back to the state a first attempt would have found, for THIS
 * WORKER'S SLOT, and prove it. Throws when anything this suite owns survives the
 * delete — see "WHY IT CAN GO RED" above.
 *
 * `slot` is `testInfo.parallelIndex`. It is required rather than defaulted: a
 * default would quietly restore the every-worker sweep nc#978 is about.
 */
export async function resetE2EState(
  db: E2EResetClient,
  slot: number
): Promise<E2EResetOutcome> {
  return sweep(db, e2eEmailPrefix(slot), `parallel slot ${slot}`);
}

/**
 * Sweep EVERY slot's leftovers, once, before the run starts (nc#982).
 *
 * The per-attempt sweep is slot-scoped, so a row in a slot no later run
 * re-uses is swept by nothing. This claims the whole `pw-e2e-` family instead
 * of enumerating slots, so there is no slot it can fail to think of — the
 * orphan case is structurally absent rather than fenced off by a worker-count
 * calculation that would be wrong the first time somebody changed `workers`.
 *
 * ONLY safe from `tests/e2e/global-setup.ts`, which Playwright runs before it
 * starts a single worker process: with no sibling running, a family-wide
 * predicate cannot delete a row out from under a live test. Calling this from
 * anywhere a test can be running restores exactly the every-worker delete
 * nc#978 closed.
 */
export async function sweepAllE2EState(
  db: E2EResetClient
): Promise<E2EResetOutcome> {
  return sweep(db, E2E_EMAIL_PREFIX, "every parallel slot, before the run");
}
