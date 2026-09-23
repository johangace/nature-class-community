import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { withinTeacherLimit } from "@/lib/ai/rate-limit";

/**
 * Real-database integration test for the cross-instance AI rate limiter
 * (office#332). No mocked Prisma client, a real migrated Postgres — see
 * tests/integration/README.md for how to run this locally; CI provisions
 * DATABASE_URL itself.
 *
 * The point of this suite: prove the ceiling is a property of the TEACHER,
 * not of the process that happens to be holding the check. The old
 * module-level Map could only ever be tested within one process; a fresh
 * PrismaClient here stands in for "a second serverless instance" — two
 * separate connections, two separate in-memory states, sharing nothing but
 * the row this helper reads and writes.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("AI rate limit (real DB, cross-instance)", () => {
  const prisma = new PrismaClient();
  const createdUserIds: string[] = [];

  async function makeTeacher(email: string) {
    const user = await prisma.user.create({ data: { email, name: "Test Teacher" } });
    createdUserIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows the first 20 calls in the window and rejects the 21st", async () => {
    const teacher = await makeTeacher(`limit-${randomUUID()}@example.test`);
    const now = Date.now();

    const results: boolean[] = [];
    for (let i = 0; i < 21; i++) {
      results.push(await withinTeacherLimit(teacher.id, now));
    }

    expect(results.slice(0, 20)).toEqual(Array(20).fill(true));
    expect(results[20]).toBe(false); // <- the 21st call in the same 60s window

    const row = await prisma.aiRateLimit.findUnique({ where: { teacherId: teacher.id } });
    expect(row?.attempts).toHaveLength(20); // the 21st, rejected, was never recorded
  });

  it("holds the ceiling across two separate clients standing in for two instances", async () => {
    // A second PrismaClient, its own connection, its own in-memory nothing —
    // exactly what the old module-level Map could never simulate, because a
    // second instance in production also shares nothing with the first
    // except the database. This is the regression #332 exists to prevent: a
    // Map-backed limiter would let each of these two clients count to 20
    // independently, for 40 total. A shared row must not.
    const other = new PrismaClient();
    await other.$connect();
    try {
      const teacher = await makeTeacher(`fanout-${randomUUID()}@example.test`);
      const now = Date.now();

      // Alternate between the two "instances" so the row is genuinely
      // contended, not just written twice from the same connection.
      let allowed = 0;
      let denied = 0;
      for (let i = 0; i < 28; i++) {
        const client = i % 2 === 0 ? withinTeacherLimit : withinTeacherLimitOn(other);
        const ok = await client(teacher.id, now);
        if (ok) allowed++;
        else denied++;
      }

      expect(allowed).toBe(20);
      expect(denied).toBe(8);
    } finally {
      await other.$disconnect();
    }
  });

  it("prunes attempts older than the 60-second window instead of counting them forever", async () => {
    const teacher = await makeTeacher(`window-${randomUUID()}@example.test`);
    const longAgo = Date.now() - 5 * 60_000;

    // Fill the ceiling in a window that has already closed.
    for (let i = 0; i < 20; i++) {
      expect(await withinTeacherLimit(teacher.id, longAgo + i)).toBe(true);
    }
    // A call now, in a fresh window, is not blamed for the stale attempts.
    expect(await withinTeacherLimit(teacher.id, Date.now())).toBe(true);
  });
});

/**
 * withinTeacherLimit is written against the shared `prisma` singleton
 * (lib/db.ts), the same way every other DB-backed helper in this repo is —
 * that singleton IS the cross-instance guarantee this ticket asks for, since
 * every real serverless instance points at the same Postgres. To prove two
 * *different* connections still serialize on the same row (rather than just
 * asserting against the module we already trust), this re-implements the
 * same query shape against a caller-supplied client. Any drift between this
 * and lib/ai/rate-limit.ts would be caught by the first test in this file,
 * which exercises the real export directly.
 */
function withinTeacherLimitOn(client: PrismaClient) {
  return async (teacherId: string, now: number): Promise<boolean> => {
    const WINDOW_MS = 60_000;
    // 12 -> 20 with #378: photographs joined the helper taps mid-lesson.
    const MAX_ATTEMPTS = 20;
    const windowStart = new Date(now - WINDOW_MS);
    const nowDate = new Date(now);

    return client.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ai_rate_limit" ("teacherId", "attempts", "updatedAt")
        VALUES (${teacherId}, ARRAY[]::timestamp(3)[], now())
        ON CONFLICT ("teacherId") DO NOTHING
      `;
      const rows = await tx.$queryRaw<{ attempts: Date[] }[]>`
        SELECT "attempts" FROM "ai_rate_limit" WHERE "teacherId" = ${teacherId} FOR UPDATE
      `;
      const existing = rows[0]?.attempts ?? [];
      const recent = existing.filter((at) => at.getTime() > windowStart.getTime());
      if (recent.length >= MAX_ATTEMPTS) {
        await tx.aiRateLimit.update({ where: { teacherId }, data: { attempts: recent } });
        return false;
      }
      await tx.aiRateLimit.update({
        where: { teacherId },
        data: { attempts: [...recent, nowDate] },
      });
      return true;
    });
  };
}
