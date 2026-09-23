#!/usr/bin/env node
/**
 * Migration order lint — the migration ledger is append-only, and new
 * migrations sort last (#892).
 *
 * WHY THIS EXISTS
 *
 * `prisma/migrations/` grew a `<n>_<name>` scheme that nobody enforced, and by
 * the time #892 was filed it had drifted three separate ways at once:
 *
 *   - `z_shared_grounds` is a PLACEHOLDER name, not a numbered one. It carries
 *     the reusable `Grounds` record and the class → grounds reference.
 *   - The numbers RUN OUT OF ORDER. `10_ai_rate_limit` and `11_passkey_ceremony`
 *     are applied before `2_reflection`.
 *   - The numbers are NOT EVEN UNIQUE. There are two `3_` migrations
 *     (`3_completion_idempotency`, `3_grounds`) and two `10_` migrations
 *     (`10_ai_rate_limit`, `10_world_facts`). The ticket named the ordering; the
 *     duplicates were found by running this check, which is the usual shape —
 *     whatever process missed the first missed the rest.
 *
 * WHAT PRISMA ACTUALLY DOES, MEASURED RATHER THAN ASSUMED
 *
 * #892 says the order breaks because `'1' < '_'` makes `11_passkey_ceremony`
 * sort before `1_auth` lexicographically. That is true of `LC_ALL=C sort` and
 * it is NOT what Prisma does. Applying this repo's own migrations to an empty
 * Postgres and reading `_prisma_migrations` back gives:
 *
 *   0_init, 1_auth, 10_ai_rate_limit, 10_world_facts, 11_passkey_ceremony,
 *   2_reflection, 3_completion_idempotency, 3_grounds, … 9_reflection_note,
 *   z_shared_grounds
 *
 * `1_auth` is applied SECOND. Prisma orders as if `_` sorted below every digit
 * and letter — equivalently, it compares the prefix before the first `_` and
 * then the remainder. So the ticket's mechanism is wrong and the ticket's
 * CONCLUSION is right anyway: the applied order is still not the numeric order
 * a reader assumes, because `10_` and `11_` really do run before `2_`.
 *
 * That distinction matters here because a check that encoded the ticket's
 * stated reason would assert an ordering Prisma does not use. Every comparison
 * below is therefore held under BOTH orderings — plain byte order and Prisma's
 * observed underscore-lowest order — and a name only counts as sorting after
 * another when both agree. A scheme that needs one particular comparator to be
 * true is a scheme that breaks when Prisma changes its sort.
 *
 * WHY THE HISTORY IS NOT RENAMED
 *
 * The obvious fix — renumber the directories so they read correctly — is a
 * production outage, and this was measured too rather than argued. Against a
 * database with all fifteen already applied, renaming `z_shared_grounds` to
 * `12_shared_grounds` and running `prisma migrate deploy`:
 *
 *   Applying migration `12_shared_grounds`
 *   Error: P3018 … Database error code: 42P07
 *   ERROR: relation "grounds" already exists
 *
 * Prisma matches `_prisma_migrations` rows by NAME. A renamed directory is a
 * migration it has never seen, so it re-runs it against a schema that already
 * has the table. Worse, the failure is recorded and PERSISTS: putting the old
 * name back does not heal it, because the failed row is still there.
 *
 *   Error: P3009 … migrate found failed migrations in the target database,
 *   new migrations will not be applied.
 *
 * `npm run vercel-build` runs `scripts/migrate-if-production.mjs`, which runs
 * `prisma migrate deploy` on production builds. So a rename does not fail in
 * review — it fails at deploy, takes every subsequent deploy with it, and needs
 * a hand-run `prisma migrate resolve` against the live teacher database to
 * clear. That is a founder-gated lane. Hence: the fourteen numbered directories
 * and `z_shared_grounds` stay exactly as they are, misordered, forever. What
 * this check protects is that they stay exactly as they are.
 *
 * WHY THE SCHEME IS `zz_<timestamp>_<name>` AND NOT PRISMA'S OWN DEFAULT
 *
 * Also measured. Three candidate names for "the next migration" were added to
 * this repo's real migration set and applied to an empty database:
 *
 *   12_next_number                  applied 6th  of 18 — before `2_reflection`
 *   20260903120000_plain_timestamp  applied 8th  of 18 — before `3_grounds`
 *   zz_20260903120000_era_prefixed  applied 18th of 18 — last
 *
 * So `12_…` lands in the middle, exactly as #892 predicted. And Prisma's OWN
 * default — `prisma migrate dev` emits `YYYYMMDDHHMMSS_name` — lands in the
 * middle too, because a name starting `2026` sorts between `2_reflection` and
 * `3_completion_idempotency`. Adopting the timestamp scheme unchanged would
 * have looked like the fix and would have made a new migration replay BEFORE
 * ten migrations that production applied before it.
 *
 * That gap is the whole hazard. Production applies a new migration last,
 * because the other fifteen are already recorded. A fresh database — CI, a
 * future preview database, a new developer — replays ALL of them in name order,
 * where the new one is eighth. Two different orders for the same set of
 * migrations. Today that surfaces loudly (CI runs `prisma migrate deploy`
 * against an empty Postgres, so a new migration that touches `grounds` fails
 * there immediately). What it does QUIETLY is data: a backfill that runs before
 * rather than after the thing it reads produces a different database on each
 * side, and both of them succeed.
 *
 * `zz_` is not pretty. It is the only prefix that sorts after `z_shared_grounds`
 * under both comparators, and it is honest about why it exists: the numbering
 * broke, `z_` took the ceiling, and this is the era after it. The timestamp
 * inside it is Prisma's own, so `prisma migrate dev --name add_thing` still
 * generates the body of the name and the builder adds one prefix.
 *
 * WHAT IT CHECKS
 *
 *   [recorded-but-missing]  a LEDGER entry with no directory — the rename or
 *                           delete that causes P3018 then P3009.
 *   [content-changed]       a directory whose migration.sql no longer hashes to
 *                           its ledger entry. Prisma stores exactly this sha256
 *                           in `_prisma_migrations.checksum` (verified: `0_init`
 *                           hashes to 561da6bd…, which is the value in the
 *                           table), and reports "was modified after it was
 *                           applied" when it disagrees.
 *   [unrecorded]            a directory with no ledger entry. Prints the line to
 *                           paste, so adding a migration records it.
 *   [scheme]                a non-legacy directory that is not
 *                           `zz_<14 digits>_<snake_name>`.
 *   [duplicate-timestamp]   two governed migrations claiming the same instant.
 *   [sorts-before]          a governed migration that does not sort after the
 *                           whole pre-scheme history, under both comparators.
 *                           This is the PROPERTY; the scheme above is only the
 *                           shape that guarantees it.
 *   [stale-legacy]          a legacy entry whose name now matches the scheme —
 *                           the grandfather list is allowed to shrink and not to
 *                           grow quietly, same posture as GRANDFATHERED in
 *                           register-lint.mjs and DIVERGENCES in
 *                           schema-mirror-lint.mjs.
 *   [legacy-grew]           a SIXTEENTH entry carrying `legacy: true`. The flag
 *                           is what exempts a migration from the scheme, so
 *                           without this the list could grow by one line and
 *                           wave a badly named migration through. FROZEN_LEGACY
 *                           holds the fifteen; it may shrink, not grow.
 *
 * WHAT IT DOES NOT ASSERT
 *
 * The DUPLICATE NUMBERS IN HISTORY are not guarded. Two `3_` and two `10_`
 * migrations were found by writing this check, and the check reports GREEN on
 * them: `duplicate-timestamp` applies to governed migrations only, because the
 * fifteen legacy directories cannot be fixed without the rename this file
 * exists to prevent. Future `zz_` migrations sharing an instant ARE caught.
 *
 * `[sorts-before]` CANNOT FIRE ON THE REAL TREE TODAY. Every name the SCHEME
 * admits begins `zz_`, and that sorts after all fifteen legacy names under both
 * comparators. It is defence in depth against a future SCHEME change, exercised
 * in the spec with a synthetic ledger given a name above every `zz_` one — not
 * a rule that is doing live work. Neither of these is ongoing protection; read
 * them as what they are.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not read a database. It cannot: production credentials are not a
 * thing CI has, and reading live teacher data to lint a filename would be worse
 * than the problem. LEDGER is a COMMITTED MIRROR of what `_prisma_migrations`
 * holds, and it is trustworthy for the same reason the table is — every row was
 * written by a deploy of a commit that passed this check.
 *
 * It also does not stop a migration from being wrong. A `zz_` name that drops a
 * column is as destructive as any other; ordering is the only thing asserted
 * here.
 *
 *   node scripts/migration-order-lint.mjs   (npm run lint:migration-order)
 *
 * SCOPE: NEITHER. It reads directory names and hashes SQL; it quotes no founder
 * prose and writes nothing. See `scripts/authorship.mjs` for why every check
 * here says so.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../prisma/migrations", import.meta.url));

/**
 * The shape every migration created from here must have.
 *
 * `zz_` is the era marker (see the header: it is the only prefix that sorts
 * after `z_shared_grounds`), then Prisma's own `YYYYMMDDHHMMSS`, then a
 * snake_case name. `prisma migrate dev --name add_thing` produces everything
 * after the prefix.
 */
export const SCHEME = /^zz_(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)$/;

/**
 * THE LEDGER: every migration this repo has committed, and the sha256 of its
 * `migration.sql`.
 *
 * This is a mirror of `_prisma_migrations` — Prisma's `checksum` column is the
 * same sha256, byte for byte. Entries are APPEND-ONLY. A name here that has no
 * directory means somebody renamed or deleted an applied migration, which is
 * the P3018 → P3009 sequence in the header; a hash that no longer matches means
 * somebody edited SQL that has already run against the live database.
 *
 * `legacy: true` marks the fifteen that predate the scheme. They are
 * grandfathered from the naming rule because renaming them is the outage this
 * check exists to prevent. The list may SHRINK — if one is ever properly
 * reconciled with a `_prisma_migrations` plan — and may not grow: a new
 * migration is a new entry WITHOUT the flag, and has to satisfy the scheme.
 */
export const LEDGER = [
  { name: "0_init", sha256: "561da6bd42e31b3af638bab1820bbc82b901daa6d497e219506265f182db2db4", legacy: true },
  { name: "10_ai_rate_limit", sha256: "038a11476933c20f7cc9a2351aa38883d8ad466df7715b54cc35de06d2060188", legacy: true },
  { name: "10_world_facts", sha256: "b079280c586a4ea7976a7cd1f275e3d50505d7324f00ce11285193fa145bcea0", legacy: true },
  { name: "11_passkey_ceremony", sha256: "5ac96e8f2093bdfdbbc5b7851a5f918beaa783705230f139a6059d7ab1016146", legacy: true },
  { name: "1_auth", sha256: "c514328c7d8c04a30fee25e3d2f2b0464c1e9086241cf5d389d7cb543d2c56c3", legacy: true },
  { name: "2_reflection", sha256: "2bcfd3647285806f2a3ece6e793150200f64b26e73de6ccb6879c08ac970c038", legacy: true },
  { name: "3_completion_idempotency", sha256: "3d927d56e82886b7456438a5c9eb455498cda73ad21d7bd841b99cc9d02f95e9", legacy: true },
  { name: "3_grounds", sha256: "dd39de015dad9d426ca80b2e424c9dc532acbcc0fe628311564045b4481afbac", legacy: true },
  { name: "4_reflection_taps", sha256: "4700e2a40a745a1800d58c313a2670b48d370a9aa53eb6422491663b5f159106", legacy: true },
  { name: "5_cast_and_reads", sha256: "2f892fa395eabefd2ba7dcf01571b539435a6e7aae4aef7e0fa5f59d02644f69", legacy: true },
  { name: "6_cast_photo_provenance", sha256: "cdafe52b8284cd52aa2b96698edda890f56654573d654b833b8ecc225746f46f", legacy: true },
  { name: "7_learner_context", sha256: "d86172bae92b637ed6b9bfd5728076ffeb2181b56e706f528c2247d0e333b3fb", legacy: true },
  { name: "8_school_world", sha256: "690ca46820288edd02742fbef7f224632704409f42e877318f450efc5ef515f3", legacy: true },
  { name: "9_reflection_note", sha256: "9ec3a8135d9fe8b21e1169d2b9c3907e9fc629d196e1fa3d9ef5f88e490a2f93", legacy: true },
  { name: "z_shared_grounds", sha256: "ab93f76fa1b69afeffe5aaf2088cf2bda3a97461972c44c77263962ec794a7fe", legacy: true },
  { name: "zz_20260904174500_optional_completion_headcount", sha256: "aa1fc8a82711f8469481437a2d5fa7ad067fbc703ec94f2de990f2b543161181" },
  { name: "zz_20260907143000_class_english_locale", sha256: "41bc1079eb90c2a7f4c4d613e531416110a69177c416a63d1136bcaba51851ec" },
  { name: "zz_20260908160000_prepared_lesson", sha256: "1662915af582b5fdd4f42c4984b678b15816d915fd39e1c0e0a13237375e33dc" },
  { name: "zz_20260908170000_prepared_source_dependencies", sha256: "5e2c397cc13cadd9b97b97c67169a716c2c8adaae8cd857e7385d0255a9de025" },
  { name: "zz_20260908180000_preparation_decisions", sha256: "41b335109863881a17ae1db1c1daeac008e3fb1230a494f7932fccd97786bb58" },
  { name: "zz_20260912120000_onboarding_group_age", sha256: "0b64f926dea561bbdb08c4d0f723a273caac068401eb79766b3ee54453e14ee8" },
  { name: "zz_20260914120000_user_invite_cohort", sha256: "90f1025694729f510989945c70a342ae49533c2509af5e40d2d920a3b9caf285" },
];

/**
 * THE GRANDFATHER LIST, FROZEN.
 *
 * `legacy: true` is what exempts an entry from the naming scheme, and until this
 * list existed nothing stopped that flag from being added to a SIXTEENTH entry.
 * A new, badly named migration could be waved through with a one-line diff —
 * `legacy: true` — while the comment above claimed the list "may not grow".
 *
 * That is exactly the shape of nc#554: a guard asserting less than its prose
 * says it asserts. The claim is now enforced rather than written down. These
 * fifteen names are the complete set of directories that predate the scheme;
 * the list may SHRINK (if one is ever reconciled with a `_prisma_migrations`
 * plan) and may not GROW. Anything else carrying the flag is `legacy-grew`.
 */
export const FROZEN_LEGACY = [
  "0_init",
  "10_ai_rate_limit",
  "10_world_facts",
  "11_passkey_ceremony",
  "1_auth",
  "2_reflection",
  "3_completion_idempotency",
  "3_grounds",
  "4_reflection_taps",
  "5_cast_and_reads",
  "6_cast_photo_provenance",
  "7_learner_context",
  "8_school_world",
  "9_reflection_note",
  "z_shared_grounds",
];

/**
 * The ledger's own integrity, held against the frozen list above.
 *
 * This is about the LEDGER constant rather than about the tree, which is why it
 * is separate from `findViolations`: no listing on disk can prove or disprove
 * it. Exported for the spec.
 */
export function findLedgerViolations(ledger = LEDGER, frozen = FROZEN_LEGACY) {
  const allowed = new Set(frozen);
  return ledger
    .filter((entry) => entry.legacy && !allowed.has(entry.name))
    .map((entry) => ({
      rule: "legacy-grew",
      name: entry.name,
      message:
        `carries \`legacy: true\` but is not one of the ${frozen.length} directories that predate ` +
        `the scheme (FROZEN_LEGACY). The grandfather flag is what exempts a migration from the ` +
        `naming scheme, so adding it to a new entry waves a badly named migration through with a ` +
        `one-line diff. A new migration is a new entry WITHOUT the flag, and has to satisfy ` +
        `\`zz_<YYYYMMDDHHMMSS>_<snake_name>\`. The list may shrink; it may not grow.`,
    }));
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Prisma's observed order: `_` compares below every other character it sees in
 * a migration name. Measured, not read off the source — `1_auth` is applied
 * second in this repo, which plain byte order does not produce.
 */
function underscoreLowest(a, b) {
  const key = (s) => s.replace(/_/g, " ");
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Plain byte order — what `LC_ALL=C sort` does, and what #892 assumed. */
function byteOrder(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Does `later` sort after `earlier` under BOTH orderings?
 *
 * Requiring both is the point. A scheme that only holds under the comparator
 * Prisma happens to use today is a scheme with a dependency nobody wrote down,
 * and the next Prisma major is free to change it.
 */
export function sortsAfter(later, earlier) {
  return byteOrder(later, earlier) > 0 && underscoreLowest(later, earlier) > 0;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Every violation, over a listing rather than a directory, so the spec can hand
 * it a tree that does not exist on disk.
 *
 * @param entries  [{ name, sql }] — one per migration directory found.
 * @param ledger   defaults to LEDGER.
 */
export function findViolations(entries, ledger = LEDGER) {
  const findings = [];
  const report = (rule, name, message) => findings.push({ rule, name, message });

  const byName = new Map(entries.map((e) => [e.name, e]));
  const recorded = new Map(ledger.map((e) => [e.name, e]));

  // ── The ledger is append-only ────────────────────────────────────────────
  for (const entry of ledger) {
    const found = byName.get(entry.name);
    if (!found) {
      report(
        "recorded-but-missing",
        entry.name,
        `recorded in the ledger and there is no such directory. If this is a RENAME, undo it: ` +
          `Prisma matches _prisma_migrations rows by name, so the new name is a migration it has ` +
          `never seen and it re-runs the SQL against a schema that already has the tables — ` +
          `P3018 on the production deploy, then P3009 on every deploy after it, including the one ` +
          `that puts the name back. Clearing that needs \`prisma migrate resolve\` run by hand ` +
          `against the live teacher database. Reconciling these names is real work with a ` +
          `_prisma_migrations plan (#892), not a rename.`
      );
      continue;
    }
    const actual = sha256(found.sql);
    if (actual !== entry.sha256) {
      report(
        "content-changed",
        entry.name,
        `migration.sql has been edited. Its sha256 is now ${actual}, the ledger says ` +
          `${entry.sha256} — and that is the same value Prisma stores in ` +
          `_prisma_migrations.checksum, so production reports "was modified after it was ` +
          `applied" rather than silently accepting it. A migration that has run is history: ` +
          `change the schema with a NEW migration.`
      );
    }
    if (entry.legacy && SCHEME.test(entry.name)) {
      report(
        "stale-legacy",
        entry.name,
        `carries \`legacy: true\` and matches the scheme, so it is not being grandfathered ` +
          `from anything. Drop the flag. The grandfather list is allowed to shrink and not to ` +
          `grow quietly.`
      );
    }
  }

  // ── Anything on disk is recorded ─────────────────────────────────────────
  for (const entry of entries) {
    if (recorded.has(entry.name)) continue;
    report(
      "unrecorded",
      entry.name,
      `is not in the ledger in scripts/migration-order-lint.mjs. Add it, in the same commit as ` +
        `the migration, so a later rename or edit of it is caught too:\n` +
        `      { name: "${entry.name}", sha256: "${sha256(entry.sql)}" },`
    );
  }

  // ── New migrations follow the scheme, and sort last ──────────────────────
  const governed = entries.filter((e) => !recorded.get(e.name)?.legacy);
  const stamps = new Map();

  for (const entry of governed) {
    const match = SCHEME.exec(entry.name);
    if (!match) {
      report(
        "scheme",
        entry.name,
        `does not match the migration naming scheme \`zz_<YYYYMMDDHHMMSS>_<snake_name>\`. ` +
          `Run \`npx prisma migrate dev --name ${suggestName(entry.name)}\`, which writes ` +
          `\`<timestamp>_${suggestName(entry.name)}\`, then prefix the directory with \`zz_\` ` +
          `before committing — renaming a migration that has never been applied anywhere but ` +
          `your own machine is safe, and is the only moment renaming one ever is. See README ` +
          `"Database setup" for why the prefix is there.`
      );
      continue;
    }
    const stamp = match[1];
    if (stamps.has(stamp)) {
      report(
        "duplicate-timestamp",
        entry.name,
        `claims the same instant (${stamp}) as \`${stamps.get(stamp)}\`, so which of the two ` +
          `runs first is decided by the rest of the name rather than by when it was written. ` +
          `The numbered scheme this replaced shipped two \`3_\` and two \`10_\` migrations ` +
          `exactly this way.`
      );
    } else {
      stamps.set(stamp, entry.name);
    }
  }

  // The property the scheme exists to guarantee, asserted directly: a new
  // migration must sort after the whole pre-scheme history. Production applies
  // it last — those fifteen are already recorded — while a fresh database
  // replays the entire set in name order. The two orders agree only if this
  // holds.
  //
  // Governed migrations are NOT compared against each other, because their
  // mutual order is already structural: the timestamp sits at fixed positions
  // in a fixed-width prefix of digits, so name order IS timestamp order, and
  // two of them cannot share an instant (see duplicate-timestamp above). The
  // first draft of this loop compared every pair and reported the EARLIER of
  // two perfectly good migrations as sorting before the later one.
  const history = ledger.filter((e) => e.legacy);
  for (const entry of governed) {
    if (!SCHEME.test(entry.name)) continue; // already reported, and unorderable
    for (const other of history) {
      if (other.name === entry.name) continue;
      if (sortsAfter(entry.name, other.name)) continue;
      report(
        "sorts-before",
        entry.name,
        `sorts BEFORE \`${other.name}\`, which is already in the ledger. Production will apply ` +
          `this migration last — the others are already recorded there — while a fresh database ` +
          `(CI, a new preview database, a new laptop) replays the set in name order and runs it ` +
          `${ordinalGap(entry.name, history)}. Same migrations, two different orders, and the ` +
          `difference only shows up as data.`
      );
      break;
    }
  }

  return findings;
}

/** How many ledger migrations a name would jump ahead of, for the message. */
function ordinalGap(name, ledger) {
  const jumped = ledger.filter((e) => e.name !== name && !sortsAfter(name, e.name)).length;
  return jumped === 1 ? "one migration earlier" : `${jumped} migrations earlier`;
}

/** A plausible `--name` to put in the fix-it line, from whatever they wrote. */
function suggestName(name) {
  const stripped = name.replace(/^z*_?\d*_?/, "").replace(/[^a-z0-9]+/gi, "_");
  return (stripped || "describe_the_change").toLowerCase().replace(/^_+|_+$/g, "");
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Read the real tree. A directory with no `migration.sql` is not a migration. */
export function readMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, sqlPath: join(dir, d.name, "migration.sql") }))
    .filter((d) => existsSync(d.sqlPath))
    .map((d) => ({ name: d.name, sql: readFileSync(d.sqlPath, "utf8") }));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main() {
  const entries = readMigrations();

  if (entries.length === 0) {
    console.error(
      "migration-order-lint: no migration directories found under prisma/migrations. " +
        "A check that cannot read its own subject must not report green."
    );
    return 1;
  }

  const findings = [...findLedgerViolations(), ...findViolations(entries)];

  if (findings.length === 0) {
    const governed = entries.length - LEDGER.filter((e) => e.legacy).length;
    console.log(
      `migration-order-lint passed: ${entries.length} migration(s), ledger intact, ` +
        `${governed} on the zz_<timestamp>_<name> scheme, ` +
        `${LEDGER.filter((e) => e.legacy).length} grandfathered (#892).`
    );
    return 0;
  }

  console.error(
    `migration-order-lint FAILED: ${findings.length} ` +
      `${findings.length === 1 ? "violation" : "violations"} in prisma/migrations.\n`
  );
  for (const { rule, name, message } of findings) {
    console.error(`  [${rule}] ${name}\n    ${message}\n`);
  }
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main());
}
