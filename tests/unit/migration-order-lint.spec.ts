import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FROZEN_LEGACY,
  LEDGER,
  SCHEME,
  findLedgerViolations,
  findViolations,
  readMigrations,
  sortsAfter,
} from "../../scripts/migration-order-lint.mjs";

/**
 * The migration order guard, held against fixtures (#892).
 *
 * Every ordering fact asserted here was MEASURED before it was written down:
 * the migrations in this repo were applied to a real empty Postgres and
 * `_prisma_migrations` read back, and candidate names for "the next migration"
 * were applied alongside them. The measured order is pinned in
 * `PRISMA_APPLY_ORDER` below, so if Prisma ever changes how it sorts, the
 * comparator this check reasons with fails here rather than in production.
 *
 * The fixtures are synthetic listings rather than directories on disk. The
 * guard's real subject — the tree — is exercised by the last block, and the
 * proof that it goes red in CI is `scripts/guard-mutation-check.mjs`.
 */

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** A ledger entry and its matching on-disk entry, so fixtures stay in step. */
function pair(name: string, sql: string, legacy = false) {
  return {
    entry: { name, sql },
    ledger: { name, sha256: sha256(sql), ...(legacy ? { legacy: true } : {}) },
  };
}

/** A minimal history in the shape this repo's really has: legacy, misordered. */
const legacy = [
  pair("0_init", "CREATE TABLE a();", true),
  pair("1_auth", "CREATE TABLE b();", true),
  pair("11_passkey_ceremony", "CREATE TABLE c();", true),
  pair("2_reflection", "CREATE TABLE d();", true),
  pair("z_shared_grounds", 'CREATE TABLE "grounds"();', true),
];
const LEGACY_ENTRIES = legacy.map((p) => p.entry);
const LEGACY_LEDGER = legacy.map((p) => p.ledger);

const GOOD_NAME = "zz_20260904090000_add_grounds_note";

describe("Prisma's actual apply order", () => {
  /**
   * Measured on 2026-09-02: this repo's fifteen migrations plus three candidate
   * names for the next one, applied to an empty Postgres 16, read back from
   * `_prisma_migrations` ordered by `started_at`.
   */
  const PRISMA_APPLY_ORDER = [
    "0_init",
    "1_auth",
    "10_ai_rate_limit",
    "10_world_facts",
    "11_passkey_ceremony",
    "12_next_number",
    "2_reflection",
    "20260903120000_plain_timestamp",
    "3_completion_idempotency",
    "3_grounds",
    "4_reflection_taps",
    "5_cast_and_reads",
    "6_cast_photo_provenance",
    "7_learner_context",
    "8_school_world",
    "9_reflection_note",
    "z_shared_grounds",
    "zz_20260903120000_era_prefixed",
  ];

  it("is not byte order, which is what #892 assumed", () => {
    // The ticket says `11_passkey_ceremony` sorts before `1_auth` because
    // `'1' < '_'`. That is true of LC_ALL=C sort and false of Prisma, which
    // applies `1_auth` second. The ticket's conclusion survives anyway: `10_`
    // and `11_` really do run before `2_`.
    expect([...PRISMA_APPLY_ORDER].sort()).not.toEqual(PRISMA_APPLY_ORDER);
    expect(PRISMA_APPLY_ORDER.indexOf("1_auth")).toBeLessThan(
      PRISMA_APPLY_ORDER.indexOf("11_passkey_ceremony"),
    );
    expect(PRISMA_APPLY_ORDER.indexOf("11_passkey_ceremony")).toBeLessThan(
      PRISMA_APPLY_ORDER.indexOf("2_reflection"),
    );
  });

  it("puts a plain `12_` or timestamped name in the MIDDLE, and the zz_ name last", () => {
    // This is why the scheme is not Prisma's own default. A `20260903…_name`
    // replays eighth on a fresh database and was applied last in production.
    const last = PRISMA_APPLY_ORDER.at(-1);
    expect(last).toBe("zz_20260903120000_era_prefixed");
    expect(PRISMA_APPLY_ORDER.indexOf("20260903120000_plain_timestamp")).toBeLessThan(
      PRISMA_APPLY_ORDER.indexOf("z_shared_grounds"),
    );
    expect(PRISMA_APPLY_ORDER.indexOf("12_next_number")).toBeLessThan(
      PRISMA_APPLY_ORDER.indexOf("2_reflection"),
    );
  });

  it("is the order `sortsAfter` agrees with", () => {
    // Each name sorts after the one before it under both comparators — except
    // where the measured order and byte order genuinely disagree, which is the
    // whole reason `sortsAfter` demands both. Only the zz_ tail is asserted to
    // clear everything, because that is the property the scheme guarantees.
    for (const name of PRISMA_APPLY_ORDER.slice(0, -1)) {
      expect(sortsAfter("zz_20260903120000_era_prefixed", name)).toBe(true);
    }
  });
});

describe("the naming scheme", () => {
  it("accepts a zz_ prefixed Prisma timestamp with a snake_case name", () => {
    expect(SCHEME.test(GOOD_NAME)).toBe(true);
    expect(SCHEME.test("zz_20260904090000_a")).toBe(true);
  });

  it("rejects the shapes this repo already shipped, and Prisma's bare default", () => {
    for (const bad of [
      "12_next_number", // the next number, which lands mid-history
      "20260904090000_plain", // Prisma's own default, which also lands mid-history
      "z_another_placeholder", // another placeholder, the #892 original sin
      "zz_2026090409_short", // truncated timestamp
      "zz_20260904090000_MixedCase",
      "zz_20260904090000_kebab-case",
      "zz_20260904090000_", // no name at all
      "zz_20260904090000__double",
    ]) {
      expect(SCHEME.test(bad), `${bad} should not match the scheme`).toBe(false);
    }
  });
});

describe("a clean tree", () => {
  it("passes with legacy history alone", () => {
    expect(findViolations(LEGACY_ENTRIES, LEGACY_LEDGER)).toEqual([]);
  });

  it("passes when a correctly named new migration is added AND recorded", () => {
    const added = pair(GOOD_NAME, "ALTER TABLE grounds ADD COLUMN note text;");
    expect(
      findViolations([...LEGACY_ENTRIES, added.entry], [...LEGACY_LEDGER, added.ledger]),
    ).toEqual([]);
  });

  it("passes with SEVERAL new migrations, without accusing the earlier of them", () => {
    // The first draft of the sorts-last rule compared every governed migration
    // against every ledger row, so the second one to land made the first look
    // out of order. Governed migrations carry a fixed-width timestamp at a
    // fixed offset, so their mutual order is structural and is not asserted.
    const first = pair("zz_20260904090000_add_note", "SELECT 1;");
    const second = pair("zz_20260905101500_add_index", "SELECT 2;");
    expect(
      findViolations(
        [...LEGACY_ENTRIES, first.entry, second.entry],
        [...LEGACY_LEDGER, first.ledger, second.ledger],
      ),
    ).toEqual([]);
  });
});

describe("the ledger is append-only", () => {
  it("catches a renamed applied migration — the production outage", () => {
    // The fixture that matters most: `z_shared_grounds` renamed to the number
    // it "should" have had. Measured against a real database, this makes
    // `prisma migrate deploy` re-run the SQL (P3018, relation already exists)
    // and then blocks every deploy after it (P3009), including the one that
    // puts the name back.
    const renamed = LEGACY_ENTRIES.map((e) =>
      e.name === "z_shared_grounds" ? { ...e, name: "12_shared_grounds" } : e,
    );
    const found = findViolations(renamed, LEGACY_LEDGER);
    const missing = found.filter((f) => f.rule === "recorded-but-missing");
    expect(missing).toHaveLength(1);
    expect(missing[0]?.name).toBe("z_shared_grounds");
    expect(missing[0]?.message).toMatch(/P3018[\s\S]*P3009/);
    // …and the new name is flagged too, rather than quietly accepted.
    expect(found.some((f) => f.rule === "unrecorded" && f.name === "12_shared_grounds")).toBe(true);
  });

  it("catches a deleted applied migration", () => {
    const deleted = LEGACY_ENTRIES.filter((e) => e.name !== "1_auth");
    const found = findViolations(deleted, LEGACY_LEDGER);
    expect(found.map((f) => [f.rule, f.name])).toEqual([["recorded-but-missing", "1_auth"]]);
  });

  it("catches an edit to SQL that has already run against production", () => {
    const edited = LEGACY_ENTRIES.map((e) =>
      e.name === "2_reflection" ? { ...e, sql: `${e.sql}\nALTER TABLE d ADD COLUMN sneaked int;` } : e,
    );
    const found = findViolations(edited, LEGACY_LEDGER);
    expect(found.map((f) => [f.rule, f.name])).toEqual([["content-changed", "2_reflection"]]);
    expect(found[0]?.message).toMatch(/_prisma_migrations\.checksum/);
  });

  it("catches a new migration nobody recorded, and prints the line to paste", () => {
    const added = pair(GOOD_NAME, "ALTER TABLE grounds ADD COLUMN note text;");
    const found = findViolations([...LEGACY_ENTRIES, added.entry], LEGACY_LEDGER);
    expect(found.map((f) => f.rule)).toEqual(["unrecorded"]);
    expect(found[0]?.message).toContain(`{ name: "${GOOD_NAME}", sha256: "${added.ledger.sha256}" }`);
  });

  it("catches a legacy flag left on a name that no longer needs grandfathering", () => {
    const good = pair(GOOD_NAME, "SELECT 1;", true);
    const found = findViolations([...LEGACY_ENTRIES, good.entry], [...LEGACY_LEDGER, good.ledger]);
    expect(found.map((f) => [f.rule, f.name])).toEqual([["stale-legacy", GOOD_NAME]]);
  });
});

describe("new migrations sort last", () => {
  it("catches the next number, which lands in the middle of the history", () => {
    const next = pair("12_next_number", "SELECT 1;");
    const found = findViolations([...LEGACY_ENTRIES, next.entry], [...LEGACY_LEDGER, next.ledger]);
    expect(found.map((f) => f.rule)).toContain("scheme");
    expect(found.find((f) => f.rule === "scheme")?.name).toBe("12_next_number");
  });

  it("catches Prisma's own default name, which also lands in the middle", () => {
    // The trap this check exists for: adopting `YYYYMMDDHHMMSS_name` looks like
    // the fix and sorts BEFORE `z_shared_grounds`.
    const plain = pair("20260904090000_add_grounds_note", "SELECT 1;");
    const found = findViolations([...LEGACY_ENTRIES, plain.entry], [...LEGACY_LEDGER, plain.ledger]);
    expect(found.map((f) => f.rule)).toEqual(["scheme"]);
    expect(found[0]?.message).toMatch(/zz_/);
  });

  it("catches a scheme-shaped name that still sorts before the history", () => {
    // The scheme is the SHAPE; sorting last is the PROPERTY. Asserted
    // separately so a future scheme change cannot quietly lose the property:
    // here the ledger is given a name above every zz_ one.
    const ledgerWithCeiling = [...LEGACY_LEDGER, { name: "zzz_ceiling", sha256: sha256("x"), legacy: true }];
    const entriesWithCeiling = [...LEGACY_ENTRIES, { name: "zzz_ceiling", sql: "x" }];
    const added = pair(GOOD_NAME, "SELECT 1;");
    const found = findViolations(
      [...entriesWithCeiling, added.entry],
      [...ledgerWithCeiling, added.ledger],
    );
    expect(found.map((f) => [f.rule, f.name])).toEqual([["sorts-before", GOOD_NAME]]);
    expect(found[0]?.message).toContain("zzz_ceiling");
  });

  it("catches two migrations claiming the same instant", () => {
    // How the numbered scheme shipped two `3_` and two `10_` migrations.
    const a = pair("zz_20260904090000_one", "SELECT 1;");
    const b = pair("zz_20260904090000_two", "SELECT 2;");
    const found = findViolations(
      [...LEGACY_ENTRIES, a.entry, b.entry],
      [...LEGACY_LEDGER, a.ledger, b.ledger],
    );
    expect(found.map((f) => [f.rule, f.name])).toEqual([
      ["duplicate-timestamp", "zz_20260904090000_two"],
    ]);
  });
});

describe("the grandfather list is frozen", () => {
  // The flag is what exempts a migration from the scheme, so if the list can
  // grow, a badly named migration ships behind a one-line diff. The check used
  // to say "may not grow" in a comment and assert nothing.
  it("passes on the real ledger", () => {
    expect(findLedgerViolations()).toEqual([]);
    expect(LEDGER.filter((e) => e.legacy).map((e) => e.name).sort()).toEqual(
      [...FROZEN_LEGACY].sort(),
    );
  });

  it("catches a SIXTEENTH entry smuggled in with legacy: true", () => {
    const smuggled = { name: "13_next_number", sha256: sha256("SELECT 1;"), legacy: true };
    const found = findLedgerViolations([...LEDGER, smuggled]);
    expect(found.map((f) => [f.rule, f.name])).toEqual([["legacy-grew", "13_next_number"]]);
  });

  it("lets the list shrink, because reconciling one is real work", () => {
    expect(findLedgerViolations(LEDGER.filter((e) => e.name !== "z_shared_grounds"))).toEqual([]);
  });

  it("is not fooled by a scheme-shaped name carrying the flag", () => {
    const smuggled = { name: GOOD_NAME, sha256: sha256("SELECT 1;"), legacy: true };
    expect(findLedgerViolations([...LEDGER, smuggled]).map((f) => f.rule)).toEqual(["legacy-grew"]);
  });
});

describe("the real prisma/migrations tree", () => {
  const entries = readMigrations();

  it("is clean under the guard", () => {
    expect(findViolations(entries)).toEqual([]);
  });

  it("records every directory on disk, and every ledger row exists", () => {
    expect(entries.map((e) => e.name).sort()).toEqual(LEDGER.map((e) => e.name).sort());
  });

  it("still carries the drift #892 was filed about, because renaming it is the outage", () => {
    const names = LEDGER.map((e) => e.name);
    expect(names).toContain("z_shared_grounds");
    // Duplicate numbers — not in the ticket, found by running this check.
    expect(names.filter((n) => n.startsWith("3_"))).toHaveLength(2);
    expect(names.filter((n) => n.startsWith("10_"))).toHaveLength(2);
    // All fifteen historical names stay grandfathered and outside the scheme.
    // New migrations use it without pretending the old names were safe to rewrite.
    expect(LEDGER.filter((e) => e.legacy)).toHaveLength(15);
    expect(names.filter((n) => !SCHEME.test(n))).toEqual(
      LEDGER.filter((entry) => entry.legacy).map((entry) => entry.name)
    );
    expect(names.filter((n) => SCHEME.test(n))).toEqual(
      LEDGER.filter((entry) => !entry.legacy).map((entry) => entry.name)
    );
  });
});
