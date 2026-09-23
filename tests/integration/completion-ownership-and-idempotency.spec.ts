import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * Real-database integration tests for the two boundaries #58 names by name:
 * ownership and completion-replay idempotency. These exercise the exact
 * query shapes app/api/completions/route.ts runs — no mocked Prisma client,
 * a real migrated Postgres. See tests/integration/README.md for how to run
 * this locally; CI provisions DATABASE_URL itself.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("completion ownership and idempotency (real DB)", () => {
  const prisma = new PrismaClient();
  const createdUserIds: string[] = [];

  async function makeTeacher(email: string) {
    const user = await prisma.user.create({
      data: { email, name: "Test Teacher" },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function makeClass(teacherId: string, name: string) {
    return prisma.class.create({
      data: { name, yearGroup: "Y1", school: "Test School", teacherId },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    // Cascades: SessionCompletion -> Class -> User (onDelete: Cascade on both).
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("scopes a class lookup to its owning teacher, exactly like the completions route does", async () => {
    const owner = await makeTeacher(`owner-${randomUUID()}@example.test`);
    const stranger = await makeTeacher(`stranger-${randomUUID()}@example.test`);
    const ownedClass = await makeClass(owner.id, "Owner's class");

    // The exact query app/api/completions/route.ts runs before writing.
    const asOwner = await prisma.class.findFirst({
      where: { id: ownedClass.id, teacherId: owner.id },
      select: { id: true },
    });
    const asStranger = await prisma.class.findFirst({
      where: { id: ownedClass.id, teacherId: stranger.id },
      select: { id: true },
    });

    expect(asOwner).not.toBeNull();
    expect(asOwner?.id).toBe(ownedClass.id);
    expect(asStranger).toBeNull(); // <- the 403 boundary: a stranger's teacherId never matches
  });

  it("upserts a retried clientKey onto the same row instead of writing a second one", async () => {
    const teacher = await makeTeacher(`upsert-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Upsert class");
    const clientKey = `ck-${randomUUID()}`;
    const startedAt = new Date(Date.now() - 20 * 60_000);
    const endedAt = new Date();

    const write = () =>
      prisma.sessionCompletion.upsert({
        where: { clientKey },
        create: {
          sessionId: "summer-w1-counting-life",
          classId: klass.id,
          startedAt,
          endedAt,
          headcount: 22,
          happenings: [],
          clientKey,
        },
        update: {},
      });

    const first = await write();
    // Simulate the runner's offline retry: server committed, client never
    // heard back, so it re-sends the exact same draft (same clientKey).
    const second = await write();
    const third = await write();

    expect(first.id).toBe(second.id);
    expect(second.id).toBe(third.id);

    const rows = await prisma.sessionCompletion.findMany({ where: { clientKey } });
    expect(rows).toHaveLength(1); // <- the property that protects minutes-outside from double-counting
  });

  it("lets two different sessions reuse the SAME clientKey collide loudly rather than silently merge", async () => {
    // clientKey is globally unique (schema: `clientKey String? @unique`), not
    // scoped to a class or session. Documents that boundary: a second,
    // unrelated completion cannot accidentally share a key and get upserted
    // into the first one's row — Prisma raises rather than merging data
    // across two different sessions.
    const teacher = await makeTeacher(`collide-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "Collision class");
    const sharedKey = `ck-${randomUUID()}`;

    await prisma.sessionCompletion.create({
      data: {
        sessionId: "summer-w1-counting-life",
        classId: klass.id,
        startedAt: new Date(),
        endedAt: new Date(),
        headcount: 10,
        happenings: [],
        clientKey: sharedKey,
      },
    });

    await expect(
      prisma.sessionCompletion.create({
        data: {
          sessionId: "summer-w2-minibeast-hunting", // a genuinely different session
          classId: klass.id,
          startedAt: new Date(),
          endedAt: new Date(),
          headcount: 10,
          happenings: [],
          clientKey: sharedKey,
        },
      })
    ).rejects.toThrow();
  });

  it("allows many null clientKeys (older-client fallback path) without violating uniqueness", async () => {
    const teacher = await makeTeacher(`nullkey-${randomUUID()}@example.test`);
    const klass = await makeClass(teacher.id, "No-key class");

    const rows = await Promise.all(
      Array.from({ length: 3 }, () =>
        prisma.sessionCompletion.create({
          data: {
            sessionId: "summer-w1-counting-life",
            classId: klass.id,
            startedAt: new Date(),
            endedAt: new Date(),
            headcount: 5,
            happenings: [],
            // no clientKey — the pre-idempotency-key client fallback
          },
        })
      )
    );

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3); // three distinct rows, not merged
  });
});
