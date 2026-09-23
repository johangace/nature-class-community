import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * The invited cohort against a real migrated Postgres (#821): the column the
 * `zz_20260914120000_user_invite_cohort` migration adds, and the set-once
 * write in lib/invite-cohort.ts, with no mocked Prisma client. Self-skips
 * without DATABASE_URL; CI provisions one. See tests/integration/README.md.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("invite cohort on the teacher record (real DB)", () => {
  const createdUserIds: string[] = [];

  async function makeTeacher() {
    const user = await prisma.user.create({
      data: { email: `cohort-${randomUUID()}@example.test`, name: "Test Teacher" },
    });
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

  it("starts empty for an organic sign-up", async () => {
    const { teacherInviteCohort } = await import("@/lib/invite-cohort");
    const teacher = await makeTeacher();
    expect(await teacherInviteCohort(teacher.id)).toBeNull();
  });

  it("is set once and never overwritten by a later link or visit", async () => {
    const { recordInviteCohort, teacherInviteCohort } = await import("@/lib/invite-cohort");
    const teacher = await makeTeacher();

    expect(await recordInviteCohort(teacher.id, "autumn-a")).toBe("autumn-a");
    expect(await recordInviteCohort(teacher.id, "spring-b")).toBe("autumn-a");
    expect(await recordInviteCohort(teacher.id, null)).toBe("autumn-a");

    const stored = await prisma.user.findUnique({
      where: { id: teacher.id },
      select: { inviteCohort: true },
    });
    expect(stored?.inviteCohort).toBe("autumn-a");
    expect(await teacherInviteCohort(teacher.id)).toBe("autumn-a");
  });

  it("stores nothing for a malformed code", async () => {
    const { recordInviteCohort } = await import("@/lib/invite-cohort");
    const teacher = await makeTeacher();
    expect(await recordInviteCohort(teacher.id, "Oakfield Primary School")).toBeNull();
    const stored = await prisma.user.findUnique({
      where: { id: teacher.id },
      select: { inviteCohort: true },
    });
    expect(stored?.inviteCohort).toBeNull();
  });
});
