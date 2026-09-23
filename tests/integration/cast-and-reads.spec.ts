import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * Real-database integration tests for the two storage boundaries workstream A
 * introduces: a cast that stays single per class however many times it is
 * resolved, and a corpus that records a failed read as a row rather than
 * losing it.
 *
 * These exercise the exact query shapes lib/cast/index.ts and the nightly
 * recording route run — no mocked Prisma client, a real migrated Postgres.
 * See tests/integration/README.md for how to run this locally; CI provisions
 * DATABASE_URL itself.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("cast storage and the replay corpus (real DB)", () => {
  const prisma = new PrismaClient();
  const createdUserIds: string[] = [];

  async function makeTeacher(email: string) {
    const user = await prisma.user.create({ data: { email, name: "Test Teacher" } });
    createdUserIds.push(user.id);
    return user;
  }

  async function makeClass(teacherId: string, name: string) {
    return prisma.class.create({
      data: {
        name,
        yearGroup: "Year 1",
        school: "Test School",
        teacherId,
        lat: 37.871,
        lng: -122.272,
        climate: "mediterranean",
      },
    });
  }

  /** The exact transaction lib/cast/index.ts's storeCast runs. */
  async function storeCast(classId: string, names: string[]) {
    const resolvedAt = new Date();
    return prisma.$transaction([
      prisma.castMember.deleteMany({ where: { classId } }),
      prisma.castMember.createMany({
        data: names.map((commonName, sortRank) => ({
          classId,
          commonName,
          honestyTier: "recorded",
          sortRank,
          absent: false,
          resolvedAt,
        })),
      }),
    ]);
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

  it("resolving twice leaves ONE cast, not two", async () => {
    const teacher = await makeTeacher(`cast-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Idempotent class");

    await storeCast(klass.id, ["Monarch", "Western Gull", "Anise Swallowtail"]);
    // The reloaded onboarding step, the double-submitted action, the retry.
    await storeCast(klass.id, ["Monarch", "Western Gull", "Anise Swallowtail"]);

    const rows = await prisma.castMember.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(3); // <- not six
  });

  it("a refresh replaces the cast wholesale rather than merging two nights", async () => {
    const teacher = await makeTeacher(`refresh-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Refreshed class");

    await storeCast(klass.id, ["Monarch", "Western Gull"]);
    await storeCast(klass.id, ["Great Horned Owl"]);

    const rows = await prisma.castMember.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.commonName).toBe("Great Horned Owl");
    // One resolution, one generation: every member shares a resolvedAt.
    expect(new Set(rows.map((r) => r.resolvedAt.getTime())).size).toBe(1);
  });

  it("keeps absences alongside the cast, and queryable apart from it", async () => {
    const teacher = await makeTeacher(`absent-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Absence class");

    await prisma.castMember.createMany({
      data: [
        { classId: klass.id, commonName: "Monarch", honestyTier: "recorded", sortRank: 0 },
        {
          classId: klass.id,
          commonName: "Great Egret",
          honestyTier: "recorded",
          sortRank: 0,
          absent: true,
          yearsObserved: 3,
          historicalAvgCount: 40,
        },
      ],
    });

    // The finding surfaces ask for the present cast only.
    const present = await prisma.castMember.findMany({
      where: { classId: klass.id, absent: false },
    });
    expect(present).toHaveLength(1);
    expect(present[0]?.commonName).toBe("Monarch");

    // The closing line asks for what today did not hold, with the evidence
    // that makes the absence striking rather than merely a gap.
    const absences = await prisma.castMember.findMany({
      where: { classId: klass.id, absent: true },
    });
    expect(absences).toHaveLength(1);
    expect(absences[0]?.commonName).toBe("Great Egret");
    expect(absences[0]?.yearsObserved).toBe(3);
  });

  it("records a FAILED read as a row with a null payload: silence is data", async () => {
    const teacher = await makeTeacher(`corpus-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Corpus class");

    await prisma.pointmoonRead.create({
      data: {
        classId: klass.id,
        lat: 37.871,
        lng: -122.272,
        // No payload passed at all: the column stays genuinely NULL, which is
        // what distinguishes a failed read from one that returned empty JSON.
        failureReason: "no facts returned",
      },
    });

    const rows = await prisma.pointmoonRead.findMany({ where: { classId: klass.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toBeNull();
    expect(rows[0]?.failureReason).toBe("no facts returned");
  });

  it("stores a successful payload verbatim, with its schema version", async () => {
    const teacher = await makeTeacher(`verbatim-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Verbatim class");

    // A payload carrying a field nothing reads today: exactly the field a
    // future rule will want, and the reason the corpus stores it whole.
    const payload = {
      schemaVersion: "field-truth@1.1.0",
      facts: { fieldSnapshot: { observations: { nearby: [{ name: "Monarch", yearsObserved: 3 }] } } },
      somethingNobodyReadsYet: { deep: ["value"] },
    };

    await prisma.pointmoonRead.create({
      data: {
        classId: klass.id,
        lat: 37.871,
        lng: -122.272,
        payload,
        schemaVersion: "field-truth@1.1.0",
      },
    });

    const row = await prisma.pointmoonRead.findFirst({ where: { classId: klass.id } });
    expect(row?.schemaVersion).toBe("field-truth@1.1.0");
    // Verbatim: the unread branch survived the round trip intact.
    expect(row?.payload).toEqual(payload);
  });

  it("cascades reads and cast away with the class, taking nobody else's", async () => {
    const teacher = await makeTeacher(`cascade-${randomUUID()}@example.test`);
    const doomed = await makeClass(teacher.id, "Doomed class");
    const kept = await makeClass(teacher.id, "Kept class");

    await storeCast(doomed.id, ["Monarch"]);
    await storeCast(kept.id, ["Western Gull"]);
    await prisma.pointmoonRead.create({
      data: { classId: doomed.id, lat: 1, lng: 1, failureReason: "test" },
    });

    await prisma.class.delete({ where: { id: doomed.id } });

    expect(await prisma.castMember.count({ where: { classId: doomed.id } })).toBe(0);
    expect(await prisma.pointmoonRead.count({ where: { classId: doomed.id } })).toBe(0);
    // The other class kept its own.
    expect(await prisma.castMember.count({ where: { classId: kept.id } })).toBe(1);
  });

  it("supports the since-last-week seam: completions are already class-scoped and dated", async () => {
    // Stage 7 check: a later "what changed since last week" delta needs a
    // class-level marker of when this class last went outside. It exists
    // already — SessionCompletion carries classId and startedAt — so the cast
    // delta needs no schema change of its own. Asserted here so a refactor
    // that removed it would be caught by this workstream's own suite.
    const teacher = await makeTeacher(`marker-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Marker class");

    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    await prisma.sessionCompletion.create({
      data: {
        sessionId: "summer-w1-counting-life",
        classId: klass.id,
        startedAt: lastWeek,
        endedAt: lastWeek,
        headcount: 20,
        happenings: [],
      },
    });

    const since = await prisma.sessionCompletion.findMany({
      where: { classId: klass.id, startedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60_000) } },
      select: { startedAt: true },
    });
    expect(since).toHaveLength(1);
  });
});
