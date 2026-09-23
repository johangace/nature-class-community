import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: null as { inviteCohort: string | null } | null,
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { updateMany: db.updateMany, findUnique: db.findUnique } },
}));

import {
  ALLOWED_PROPERTIES,
  ALLOWED_TRAITS,
  ANALYTICS_EVENTS,
  isForbiddenKey,
  isInternalTeacher,
  sanitiseProperties,
  sanitiseTraits,
  teacherTraits,
} from "@/lib/analytics/events";
import { readInviteCohort } from "@/lib/join";
import {
  JOIN_PREFILL_TTL_MS,
  type PrefillStore,
  rememberJoinCohort,
  rememberJoinSchool,
  takeJoinCohort,
  takeJoinSchool,
} from "@/lib/join-prefill";
import { recordInviteCohort, teacherInviteCohort } from "@/lib/invite-cohort";

/**
 * Invited cohorts (#821): a teacher who arrives through an invite link can be
 * counted apart from organic sign-ups and from our own accounts, without
 * anyone knowing her address in advance, and without a school's name ever
 * reaching analytics.
 */

const NOW = 1_700_000_000_000;

function fakeStore(): PrefillStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

beforeEach(() => {
  db.row = null;
  db.updateMany.mockReset().mockImplementation(async ({ where, data }) => {
    // The same predicate Postgres applies: only an empty field is filled.
    if (db.row && where.inviteCohort === null && db.row.inviteCohort === null) {
      db.row.inviteCohort = data.inviteCohort;
      return { count: 1 };
    }
    return { count: 0 };
  });
  db.findUnique.mockReset().mockImplementation(async () => db.row);
});

describe("reading the cohort from the link", () => {
  it("accepts a short neutral code", () => {
    expect(readInviteCohort("autumn-a")).toBe("autumn-a");
    expect(readInviteCohort("c1")).toBe("c1");
    expect(readInviteCohort("x".repeat(32))).toBe("x".repeat(32));
  });

  it("lowercases and trims, the one forgiveness", () => {
    expect(readInviteCohort("  Autumn-A ")).toBe("autumn-a");
  });

  it("drops anything that is not the shape rather than repairing it", () => {
    expect(readInviteCohort("Oakfield Primary School")).toBeNull();
    expect(readInviteCohort("teacher@example.com")).toBeNull();
    expect(readInviteCohort("autumn_a")).toBeNull();
    expect(readInviteCohort("x".repeat(33))).toBeNull();
    expect(readInviteCohort("")).toBeNull();
    expect(readInviteCohort(undefined)).toBeNull();
    expect(readInviteCohort(42)).toBeNull();
  });

  it("takes the first of a repeated parameter", () => {
    expect(readInviteCohort(["autumn-a", "spring-b"])).toBe("autumn-a");
  });
});

describe("carrying it through sign-in", () => {
  it("survives the walk to the inbox, once, and independently of the school", () => {
    const store = fakeStore();
    rememberJoinCohort("autumn-a", NOW, store);
    expect(takeJoinSchool(NOW + 60_000, store)).toBeNull();
    expect(takeJoinCohort(NOW + 60_000, store)).toBe("autumn-a");
    expect(takeJoinCohort(NOW + 60_000, store)).toBeNull();
  });

  it("expires, so a shared iPad cannot hand it to the next teacher", () => {
    const store = fakeStore();
    rememberJoinCohort("autumn-a", NOW, store);
    expect(takeJoinCohort(NOW + JOIN_PREFILL_TTL_MS + 1, store)).toBeNull();
  });

  it("never stores a malformed code, and re-checks what it reads back", () => {
    const store = fakeStore();
    rememberJoinCohort("Oakfield Primary", NOW, store);
    expect(store.data.size).toBe(0);
    store.setItem(
      "nature-class.join.cohort",
      JSON.stringify({ cohort: "Oakfield Primary", at: NOW })
    );
    expect(takeJoinCohort(NOW, store)).toBeNull();
  });

  it("keeps the school and the cohort in separate entries", () => {
    const store = fakeStore();
    rememberJoinSchool("Oakfield Primary School", NOW, store);
    rememberJoinCohort("autumn-a", NOW, store);
    expect(takeJoinCohort(NOW, store)).toBe("autumn-a");
    expect(takeJoinSchool(NOW, store)).toBe("Oakfield Primary School");
  });
});

describe("persisting it on the teacher", () => {
  it("sets the cohort once, at onboarding", async () => {
    db.row = { inviteCohort: null };
    expect(await recordInviteCohort("t1", "autumn-a")).toBe("autumn-a");
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", inviteCohort: null },
      data: { inviteCohort: "autumn-a" },
    });
  });

  it("is never overwritten by a later link or an organic visit", async () => {
    db.row = { inviteCohort: "autumn-a" };
    expect(await recordInviteCohort("t1", "spring-b")).toBe("autumn-a");
    expect(await recordInviteCohort("t1", null)).toBe("autumn-a");
    expect(db.row.inviteCohort).toBe("autumn-a");
  });

  it("writes nothing for a malformed code and answers what the record holds", async () => {
    db.row = { inviteCohort: null };
    expect(await recordInviteCohort("t1", "Oakfield Primary")).toBeNull();
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("never throws: a failed read or write counts her as organic", async () => {
    db.updateMany.mockRejectedValue(new Error("database down"));
    db.findUnique.mockRejectedValue(new Error("database down"));
    await expect(recordInviteCohort("t1", "autumn-a")).resolves.toBeNull();
    await expect(teacherInviteCohort("t1")).resolves.toBeNull();
  });
});

describe("what analytics may carry", () => {
  it("allows invite_cohort as a trait and on the two events that count teachers", () => {
    expect(ALLOWED_TRAITS).toContain("invite_cohort");
    expect(ALLOWED_PROPERTIES[ANALYTICS_EVENTS.START_FLOW_COMPLETED]).toEqual(["invite_cohort"]);
    expect(ALLOWED_PROPERTIES[ANALYTICS_EVENTS.LESSON_RUN_COMPLETED]).toContain("invite_cohort");
    expect(isForbiddenKey("invite_cohort")).toBe(false);
  });

  it("sends a well-shaped code and drops any other value under that key", () => {
    expect(
      sanitiseProperties(ANALYTICS_EVENTS.START_FLOW_COMPLETED, { invite_cohort: "autumn-a" })
    ).toMatchObject({ invite_cohort: "autumn-a" });
    for (const bad of ["Oakfield Primary School", "a@b.com", "x".repeat(33), 7, true]) {
      const clean = sanitiseProperties(ANALYTICS_EVENTS.LESSON_RUN_COMPLETED, {
        invite_cohort: bad,
      });
      expect(clean).not.toHaveProperty("invite_cohort");
      expect(sanitiseTraits({ invite_cohort: bad })).not.toHaveProperty("invite_cohort");
    }
  });

  it("never lets a school name through alongside it", () => {
    const clean = sanitiseProperties(ANALYTICS_EVENTS.START_FLOW_COMPLETED, {
      invite_cohort: "autumn-a",
      school: "Oakfield Primary School",
      school_name: "Oakfield Primary School",
    });
    expect(JSON.stringify(clean)).not.toContain("Oakfield");
  });
});

describe("staff exclusion wins", () => {
  it("an internal account that followed an invite is still internal", () => {
    const internal = isInternalTeacher("founder@example.org", "@example.org");
    const traits = sanitiseTraits(
      teacherTraits({ hasClass: true, internal, inviteCohort: "autumn-a" })
    );
    expect(traits.$internal_or_test_user).toBe(true);
    expect(traits.invite_cohort).toBe("autumn-a");
  });

  it("an invited teacher is marked not internal, and an organic one carries no cohort", () => {
    const invited = sanitiseTraits(teacherTraits({ internal: false, inviteCohort: "autumn-a" }));
    expect(invited).toMatchObject({ $internal_or_test_user: false, invite_cohort: "autumn-a" });
    const organic = sanitiseTraits(teacherTraits({ internal: false, inviteCohort: null }));
    expect(organic.$internal_or_test_user).toBe(false);
    expect(organic).not.toHaveProperty("invite_cohort");
  });
});
