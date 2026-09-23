import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * The record, against a real migrated Postgres. The hand-written migration in
 * `prisma/migrations/11_passkey_ceremony` and the model in the schema are two
 * separate descriptions of one table, and nothing but a real database can say
 * whether they agree. CI provisions DATABASE_URL; this self-skips without one
 * (see tests/integration/README.md).
 *
 * A drift here would fail silently in the worst possible way: reporting is
 * fire-and-forget by design, so a broken write would leave the passkey
 * question unanswerable while looking exactly like "nobody uses it".
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("the passkey ceremony record (real DB)", () => {
  const prisma = new PrismaClient();
  const written: string[] = [];

  afterAll(async () => {
    if (written.length > 0) {
      await prisma.passkeyCeremony.deleteMany({ where: { id: { in: written } } });
    }
    await prisma.$disconnect();
  });

  it("takes a full report and a bare one", async () => {
    const full = await prisma.passkeyCeremony.create({
      data: {
        surface: "onboarding",
        act: "enrol",
        outcome: "failed",
        code: "ERROR_INVALID_RP_ID",
        reason: "wrong-host",
        platform: "ios",
        browser: "safari",
        canSave: true,
        conditional: false,
      },
    });
    written.push(full.id);
    expect(full.createdAt).toBeInstanceOf(Date);
    expect(full.code).toBe("ERROR_INVALID_RP_ID");

    // A success carries no code, no reason, and on some surfaces nothing is
    // known about conditional mediation. Every one of those columns has to be
    // genuinely optional or the denominator cannot be written at all.
    const bare = await prisma.passkeyCeremony.create({
      data: {
        surface: "sign-in",
        act: "use",
        outcome: "ok",
        platform: "macos",
        browser: "chrome",
      },
    });
    written.push(bare.id);
    expect(bare.code).toBeNull();
    expect(bare.reason).toBeNull();
    expect(bare.canSave).toBeNull();
  });

  it("can be read the way the report script reads it", async () => {
    const rows = await prisma.passkeyCeremony.findMany({
      where: { id: { in: written } },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.length).toBe(2);
    expect(rows.filter((r) => r.outcome === "ok").length).toBe(1);
  });
});
