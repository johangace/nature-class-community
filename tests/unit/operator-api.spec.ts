import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  classFindMany: vi.fn(),
  completionFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: mocked.userFindMany,
      findFirst: mocked.userFindFirst,
    },
    class: { findMany: mocked.classFindMany },
    sessionCompletion: { findMany: mocked.completionFindMany },
  },
}));

// The duration policy has its own exhaustive unit contract in
// completion-minutes.spec.ts. Keep this route contract focused and light: the
// production module also loads the whole curriculum catalogue to find authored
// duration caps, which is unnecessary work during this mocked API test.
vi.mock("@/lib/teacher", () => ({
  sessionMinutes: () => new Map<string, number>(),
  completionMinutes: (row: { startedAt: Date; endedAt: Date; headcount: number }) =>
    Math.round(
      ((row.endedAt.getTime() - row.startedAt.getTime()) / 60_000) * row.headcount
    ),
}));

const BASE = "https://nature-class.test/api/v1/operator";
const AUTH = { authorization: "Bearer operator-test-secret" };

async function routes() {
  const [users, schools, pulse, metrics, health] = await Promise.all([
    import("@/app/api/v1/operator/users/route"),
    import("@/app/api/v1/operator/schools/route"),
    import("@/app/api/v1/operator/schools/pulse/route"),
    import("@/app/api/v1/operator/metrics/route"),
    import("@/app/api/v1/operator/health/route"),
  ]);
  return [
    { path: "users", GET: users.GET },
    { path: "schools", GET: schools.GET },
    { path: "schools/pulse?school=Oak%20Primary&window=7d", GET: pulse.GET },
    { path: "metrics?window=7d", GET: metrics.GET },
    { path: "health", GET: health.GET },
  ];
}

let allRoutes: Awaited<ReturnType<typeof routes>>;

beforeAll(async () => {
  allRoutes = await routes();
}, 20_000);

beforeEach(() => {
  vi.stubEnv("OPERATOR_SECRET", "operator-test-secret");
  vi.stubEnv("NATURE_CLASS_INTERNAL_EMAILS", "founder@example.com,@rewyld.earth");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "revision-test-sha");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));

  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.userFindMany.mockResolvedValue([]);
  mocked.userFindFirst.mockResolvedValue({ id: "db-ok" });
  mocked.classFindMany.mockResolvedValue([]);
  mocked.completionFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("operator route authentication", () => {
  it("returns 404 from every route when OPERATOR_SECRET is unset", async () => {
    vi.stubEnv("OPERATOR_SECRET", "");

    for (const route of allRoutes) {
      const response = await route.GET(new Request(`${BASE}/${route.path}`));
      expect(response.status, route.path).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "NOT_FOUND", message: "Not found." },
      });
    }
    expect(mocked.userFindMany).not.toHaveBeenCalled();
    expect(mocked.userFindFirst).not.toHaveBeenCalled();
    expect(mocked.classFindMany).not.toHaveBeenCalled();
    expect(mocked.completionFindMany).not.toHaveBeenCalled();
  });

  it("returns 401 from every route when the bearer token is missing or wrong", async () => {
    for (const route of allRoutes) {
      for (const authorization of [undefined, "Bearer wrong-secret"]) {
        const response = await route.GET(
          new Request(`${BASE}/${route.path}`, {
            headers: authorization ? { authorization } : undefined,
          })
        );
        expect(response.status, `${route.path}: ${authorization ?? "missing"}`).toBe(401);
        expect(response.headers.get("www-authenticate")).toBe("Bearer");
        expect(await response.json()).toEqual({
          error: { code: "UNAUTHORIZED", message: "Invalid bearer token." },
        });
      }
    }
    expect(mocked.userFindMany).not.toHaveBeenCalled();
    expect(mocked.userFindFirst).not.toHaveBeenCalled();
    expect(mocked.classFindMany).not.toHaveBeenCalled();
    expect(mocked.completionFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/operator/users", () => {
  it("returns bounded cursor-paginated adult accounts with class and completion facts", async () => {
    mocked.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        email: "teacher@school.test",
        name: "Teacher One",
        emailVerified: true,
        createdAt: new Date("2026-08-20T09:00:00.000Z"),
        classes: [
          { school: "Oak Primary", completions: [{ endedAt: new Date("2026-09-01T10:30:00.000Z") }] },
          { school: "Birch Academy", completions: [] },
          { school: "Oak Primary", completions: [] },
        ],
      },
      {
        id: "user-2",
        email: "founder@example.com",
        name: "Internal User",
        emailVerified: true,
        createdAt: new Date("2026-08-21T09:00:00.000Z"),
        classes: [],
      },
      {
        id: "user-3",
        email: "next@school.test",
        name: null,
        emailVerified: false,
        createdAt: new Date("2026-08-22T09:00:00.000Z"),
        classes: [],
      },
    ]);
    const { GET } = await import("@/app/api/v1/operator/users/route");

    const response = await GET(
      new Request(`${BASE}/users?since=2026-08-01T00:00:00.000Z&limit=2`, {
        headers: AUTH,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          id: "user-1",
          email: "teacher@school.test",
          name: "Teacher One",
          emailVerified: true,
          createdAt: "2026-08-20T09:00:00.000Z",
          classCount: 3,
          // Distinct, sorted, exactly as entered.
          schools: ["Birch Academy", "Oak Primary"],
          lastCompletionAt: "2026-09-01T10:30:00.000Z",
          internal: false,
        },
        {
          id: "user-2",
          email: "founder@example.com",
          name: "Internal User",
          emailVerified: true,
          createdAt: "2026-08-21T09:00:00.000Z",
          classCount: 0,
          schools: [],
          lastCompletionAt: null,
          internal: true,
        },
      ],
      pagination: { limit: 2, nextCursor: "user-2" },
    });
    expect(mocked.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: new Date("2026-08-01T00:00:00.000Z") } },
        orderBy: { id: "asc" },
        take: 3,
      })
    );
    // School labels come from the class row itself; nothing else is selected for them.
    const select = mocked.userFindMany.mock.calls[0]![0].select;
    expect(Object.keys(select.classes.select).sort()).toEqual(["completions", "school"]);
  });

  it("rejects malformed dates, cursors, and out-of-range limits", async () => {
    const { GET } = await import("@/app/api/v1/operator/users/route");
    for (const query of ["since=yesterday", "limit=0", "limit=101", `cursor=${"x".repeat(257)}`]) {
      const response = await GET(new Request(`${BASE}/users?${query}`, { headers: AUTH }));
      expect(response.status, query).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_QUERY");
    }
    expect(mocked.userFindMany).not.toHaveBeenCalled();
  });

  it("resumes after the supplied user cursor", async () => {
    const { GET } = await import("@/app/api/v1/operator/users/route");

    const response = await GET(
      new Request(`${BASE}/users?cursor=user-2&limit=25`, { headers: AUTH })
    );

    expect(response.status).toBe(200);
    expect(mocked.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "user-2" }, skip: 1, take: 26 })
    );
  });
});

describe("GET /api/v1/operator/schools", () => {
  it("returns exact school groups with distinct teacher counts", async () => {
    mocked.classFindMany.mockResolvedValue([
      { school: "Oak Primary", teacherId: "teacher-1", createdAt: new Date("2026-07-01T00:00:00Z") },
      { school: "Oak Primary", teacherId: "teacher-1", createdAt: new Date("2026-07-03T00:00:00Z") },
      { school: "Oak Primary", teacherId: "teacher-2", createdAt: new Date("2026-07-02T00:00:00Z") },
      { school: "Fern School", teacherId: "teacher-3", createdAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const { GET } = await import("@/app/api/v1/operator/schools/route");

    const response = await GET(new Request(`${BASE}/schools`, { headers: AUTH }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        {
          school: "Fern School",
          teacherCount: 1,
          classCount: 1,
          firstSeenAt: "2026-08-01T00:00:00.000Z",
        },
        {
          school: "Oak Primary",
          teacherCount: 2,
          classCount: 3,
          firstSeenAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
  });
});

describe("GET /api/v1/operator/schools/pulse", () => {
  const teachers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `teacher-${i + 1}`,
      email: `teacher${i + 1}@school.test`,
      createdAt: new Date("2026-08-01T00:00:00Z"),
    }));
  const completion = (teacher: string, endedAt: string, headcount = 10) => ({
    sessionId: "operator-test-session",
    startedAt: new Date(new Date(endedAt).getTime() - 20 * 60_000),
    endedAt: new Date(endedAt),
    headcount,
    class: { teacherId: teacher },
  });

  it("publishes a school's window and lifetime aggregates once three teachers are active", async () => {
    mocked.userFindMany.mockResolvedValue([
      ...teachers(3),
      { id: "internal-1", email: "founder@example.com", createdAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    mocked.classFindMany.mockResolvedValue([
      { id: "class-1", teacherId: "teacher-1" },
      { id: "class-2", teacherId: "teacher-2" },
      { id: "class-3", teacherId: "teacher-3" },
      { id: "class-4", teacherId: "teacher-3" },
    ]);
    mocked.completionFindMany.mockResolvedValue([
      completion("teacher-1", "2026-09-01T10:20:00Z"),
      completion("teacher-2", "2026-08-30T10:20:00Z"),
      completion("teacher-3", "2026-08-28T10:20:00Z", 5),
      completion("teacher-1", "2026-08-20T10:20:00Z"), // previous window: teacher-1 returns
    ]);
    const { GET } = await import("@/app/api/v1/operator/schools/pulse/route");

    const response = await GET(
      new Request(`${BASE}/schools/pulse?school=Oak%20Primary&window=7d`, { headers: AUTH })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      school: "Oak Primary",
      window: {
        key: "7d",
        start: "2026-08-26T12:00:00.000Z",
        end: "2026-09-02T12:00:00.000Z",
        previousStart: "2026-08-19T12:00:00.000Z",
      },
      audience: "operator",
      threshold: 3,
      teacherCount: 3,
      classCount: 4,
      data: { activeTeachers: 3, returningTeachers: 1, sessionsLed: 3, minutesOutside: 60, childMinutes: 500 },
      totals: { activeTeachers: 3, sessionsLed: 4, minutesOutside: 80, childMinutes: 700 },
    });
    // Scoped to the school's classes, and internal accounts never reach the query.
    expect(mocked.classFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { school: "Oak Primary", teacherId: { in: ["teacher-1", "teacher-2", "teacher-3"] } },
      })
    );
    expect(mocked.completionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId: { in: ["class-1", "class-2", "class-3", "class-4"] }, endedAt: { not: null } },
      })
    );
  });

  it("withholds aggregates below the small-group threshold instead of rounding them", async () => {
    mocked.userFindMany.mockResolvedValue(teachers(2));
    mocked.classFindMany.mockResolvedValue([
      { id: "class-1", teacherId: "teacher-1" },
      { id: "class-2", teacherId: "teacher-2" },
    ]);
    mocked.completionFindMany.mockResolvedValue([
      completion("teacher-1", "2026-09-01T10:20:00Z"),
      completion("teacher-2", "2026-08-31T10:20:00Z"),
    ]);
    const { GET } = await import("@/app/api/v1/operator/schools/pulse/route");

    const body = await (
      await GET(new Request(`${BASE}/schools/pulse?school=Fern%20School&window=30d`, { headers: AUTH }))
    ).json();

    expect(body.threshold).toBe(3);
    expect(body.teacherCount).toBe(2);
    expect(body.data).toBeNull();
    expect(body.totals).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/teacher-\d|@school\.test/);
  });

  it("gives the school's own lead its aggregates with one or two teachers, and only on request", async () => {
    const seed = () => {
      mocked.userFindMany.mockResolvedValue(teachers(2));
      mocked.classFindMany.mockResolvedValue([
        { id: "class-1", teacherId: "teacher-1" },
        { id: "class-2", teacherId: "teacher-2" },
      ]);
      mocked.completionFindMany.mockResolvedValue([
        completion("teacher-1", "2026-09-01T10:20:00Z"),
        completion("teacher-1", "2026-08-20T10:20:00Z", 4), // previous window: returns
      ]);
    };
    const { GET } = await import("@/app/api/v1/operator/schools/pulse/route");

    seed();
    const lead = await (
      await GET(
        new Request(`${BASE}/schools/pulse?school=Fern%20School&window=7d&audience=school-lead`, {
          headers: AUTH,
        })
      )
    ).json();
    expect(lead).toMatchObject({
      school: "Fern School",
      audience: "school-lead",
      threshold: 0,
      teacherCount: 2,
      classCount: 2,
      data: { activeTeachers: 1, returningTeachers: 1, sessionsLed: 1, minutesOutside: 20, childMinutes: 200 },
      totals: { activeTeachers: 1, sessionsLed: 2, minutesOutside: 40, childMinutes: 280 },
    });
    // Still aggregates: no teacher identity in the body.
    expect(JSON.stringify(lead)).not.toMatch(/teacher-\d|@school\.test/);

    // The same school, same data, without the audience: suppressed as before.
    seed();
    const operator = await (
      await GET(new Request(`${BASE}/schools/pulse?school=Fern%20School&window=7d`, { headers: AUTH }))
    ).json();
    expect(operator).toMatchObject({ audience: "operator", threshold: 3, data: null, totals: null });
  });

  it("shows the lead zeros rather than nothing when no session has been led", async () => {
    mocked.userFindMany.mockResolvedValue(teachers(1));
    mocked.classFindMany.mockResolvedValue([{ id: "class-1", teacherId: "teacher-1" }]);
    const { getSchoolPulse } = await import("@/lib/operator-api");

    const body = await getSchoolPulse("Fern School", "30d", new Date(), "school-lead");

    expect(body.data).toEqual({
      activeTeachers: 0,
      returningTeachers: 0,
      sessionsLed: 0,
      minutesOutside: 0,
      childMinutes: 0,
    });
    expect(body.totals).toEqual({ activeTeachers: 0, sessionsLed: 0, minutesOutside: 0, childMinutes: 0 });
  });

  it("answers an unknown school honestly, with nothing to show and no query for completions", async () => {
    mocked.userFindMany.mockResolvedValue(teachers(1));
    mocked.classFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/v1/operator/schools/pulse/route");

    const body = await (
      await GET(new Request(`${BASE}/schools/pulse?school=Nowhere&window=7d`, { headers: AUTH }))
    ).json();

    expect(body.teacherCount).toBe(0);
    expect(body.data).toBeNull();
    expect(mocked.completionFindMany).not.toHaveBeenCalled();
  });

  it("requires a school label and a documented window", async () => {
    const { GET } = await import("@/app/api/v1/operator/schools/pulse/route");
    for (const query of [
      "",
      "?window=7d",
      "?school=Oak",
      "?school=Oak&window=1d",
      "?school=Oak&window=7d&audience=partner",
      "?school=Oak&window=7d&audience=",
    ]) {
      const response = await GET(new Request(`${BASE}/schools/pulse${query}`, { headers: AUTH }));
      expect(response.status, query || "missing").toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_QUERY");
    }
  });
});

describe("GET /api/v1/operator/metrics", () => {
  it("returns database-derived window and all-time metrics without internal users", async () => {
    mocked.userFindMany.mockResolvedValue([
      { id: "teacher-1", email: "teacher@school.test", createdAt: new Date("2026-08-31T00:00:00Z") },
      { id: "internal-1", email: "founder@example.com", createdAt: new Date("2026-09-01T00:00:00Z") },
    ]);
    mocked.classFindMany.mockResolvedValue([
      { id: "class-1", teacherId: "teacher-1", school: "Oak Primary" },
    ]);
    mocked.completionFindMany.mockResolvedValue([
      {
        sessionId: "operator-test-session",
        startedAt: new Date("2026-09-01T10:00:00Z"),
        endedAt: new Date("2026-09-01T10:20:00Z"),
        headcount: 10,
        class: { teacherId: "teacher-1" },
      },
      {
        sessionId: "operator-test-session",
        startedAt: new Date("2026-08-24T10:00:00Z"),
        endedAt: new Date("2026-08-24T10:10:00Z"),
        headcount: 5,
        class: { teacherId: "teacher-1" },
      },
    ]);
    const { GET } = await import("@/app/api/v1/operator/metrics/route");

    const response = await GET(new Request(`${BASE}/metrics?window=7d`, { headers: AUTH }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      window: {
        key: "7d",
        start: "2026-08-26T12:00:00.000Z",
        end: "2026-09-02T12:00:00.000Z",
        previousStart: "2026-08-19T12:00:00.000Z",
      },
      data: {
        newUsers: 1,
        activeTeachers: 1,
        returningTeachers: 1,
        sessionsLed: 1,
        minutesOutside: 20,
        childMinutes: 200,
      },
      totals: {
        users: 1,
        schools: 1,
        classes: 1,
        teachersWithCompletions: 1,
        sessionsLed: 2,
        minutesOutside: 30,
        childMinutes: 250,
      },
    });
    expect(mocked.completionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: { teacherId: { in: ["teacher-1"] } }, endedAt: { not: null } },
      })
    );
  });

  it("accepts only the documented 7d and 30d windows", async () => {
    const { GET } = await import("@/app/api/v1/operator/metrics/route");
    for (const query of ["", "?window=1d", "?window=7days"]) {
      const response = await GET(new Request(`${BASE}/metrics${query}`, { headers: AUTH }));
      expect(response.status, query || "missing").toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_QUERY");
    }
  });
});

describe("GET /api/v1/operator/health", () => {
  it("reports the deployed revision and database reachability", async () => {
    const { GET } = await import("@/app/api/v1/operator/health/route");

    const response = await GET(new Request(`${BASE}/health`, { headers: AUTH }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { revision: "revision-test-sha", db: "ok" },
    });
    expect(mocked.userFindFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it("returns a generic 503 without database error details", async () => {
    mocked.userFindFirst.mockRejectedValue(new Error("postgres://secret-host/database"));
    const { GET } = await import("@/app/api/v1/operator/health/route");

    const response = await GET(new Request(`${BASE}/health`, { headers: AUTH }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable." },
    });
  });
});

describe("operator query privacy boundary", () => {
  it("never selects reflection, note, coordinates, or grounds/place detail fields", async () => {
    const [{ GET: users }, { GET: schools }, { GET: metrics }] = await Promise.all([
      import("@/app/api/v1/operator/users/route"),
      import("@/app/api/v1/operator/schools/route"),
      import("@/app/api/v1/operator/metrics/route"),
    ]);

    await users(new Request(`${BASE}/users`, { headers: AUTH }));
    await schools(new Request(`${BASE}/schools`, { headers: AUTH }));
    await metrics(new Request(`${BASE}/metrics?window=30d`, { headers: AUTH }));

    const serializedQueries = JSON.stringify([
      ...mocked.userFindMany.mock.calls,
      ...mocked.classFindMany.mock.calls,
      ...mocked.completionFindMany.mock.calls,
    ]);
    for (const forbidden of [
      "note",
      "mood",
      "happenings",
      "timing",
      "moreOf",
      "lat",
      "lng",
      "grounds",
      "groundsProfile",
      "siteFeatures",
      "siteNotes",
      "reach",
      "placeRead",
      "placeReadAt",
    ]) {
      expect(serializedQueries).not.toContain(`\"${forbidden}\"`);
    }
  });
});
