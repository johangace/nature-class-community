import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isInternalTeacher } from "@/lib/analytics/events";
import { prisma } from "@/lib/db";
import { completionMinutes, sessionMinutes } from "@/lib/teacher";

const NO_STORE = { "cache-control": "no-store" };

export type OperatorWindow = "7d" | "30d";

export function operatorError(
  status: number,
  code: string,
  message: string,
  headers: HeadersInit = {}
): Response {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...NO_STORE, ...headers } }
  );
}

function secretsMatch(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

/** Return a response when access is denied, or null when the request may proceed. */
export function operatorAccessError(request: Request): Response | null {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret) {
    return operatorError(404, "NOT_FOUND", "Not found.");
  }

  const authorization = request.headers.get("authorization");
  const prefix = "Bearer ";
  const received = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : "";
  if (!received || !secretsMatch(received, secret)) {
    return operatorError(401, "UNAUTHORIZED", "Invalid bearer token.", {
      "www-authenticate": "Bearer",
    });
  }
  return null;
}

const usersQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function parseUsersQuery(request: Request):
  | { ok: true; since?: Date; cursor?: string; limit: number }
  | { ok: false; response: Response } {
  const search = new URL(request.url).searchParams;
  const parsed = usersQuerySchema.safeParse({
    since: search.get("since") ?? undefined,
    cursor: search.get("cursor") ?? undefined,
    limit: search.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      response: operatorError(400, "INVALID_QUERY", "Invalid query parameters."),
    };
  }
  return {
    ok: true,
    since: parsed.data.since ? new Date(parsed.data.since) : undefined,
    cursor: parsed.data.cursor,
    limit: parsed.data.limit,
  };
}

export async function listOperatorUsers(input: {
  since?: Date;
  cursor?: string;
  limit: number;
}) {
  const rows = await prisma.user.findMany({
    where: input.since ? { createdAt: { gte: input.since } } : {},
    orderBy: { id: "asc" },
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      classes: {
        select: {
          school: true,
          completions: {
            where: { endedAt: { not: null } },
            orderBy: { endedAt: "desc" },
            take: 1,
            select: { endedAt: true },
          },
        },
      },
    },
  });

  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return {
    data: page.map((row) => {
      const latest = row.classes.reduce<Date | null>((result, klass) => {
        const endedAt = klass.completions[0]?.endedAt ?? null;
        return endedAt && (!result || endedAt > result) ? endedAt : result;
      }, null);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        emailVerified: row.emailVerified,
        createdAt: row.createdAt.toISOString(),
        classCount: row.classes.length,
        // Distinct entered school labels, as typed. Not canonicalised: equal-
        // looking labels are the console's to match, exactly as on /schools.
        schools: [...new Set(row.classes.map((klass) => klass.school))].sort((a, b) =>
          a.localeCompare(b)
        ),
        lastCompletionAt: latest?.toISOString() ?? null,
        internal: isInternalTeacher(row.email),
      };
    }),
    pagination: {
      limit: input.limit,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    },
  };
}

export async function listOperatorSchools() {
  const rows = await prisma.class.findMany({
    select: { school: true, teacherId: true, createdAt: true },
  });
  const schools = new Map<
    string,
    { teachers: Set<string>; classCount: number; firstSeenAt: Date }
  >();

  for (const row of rows) {
    const current = schools.get(row.school);
    if (current) {
      current.teachers.add(row.teacherId);
      current.classCount += 1;
      if (row.createdAt < current.firstSeenAt) current.firstSeenAt = row.createdAt;
    } else {
      schools.set(row.school, {
        teachers: new Set([row.teacherId]),
        classCount: 1,
        firstSeenAt: row.createdAt,
      });
    }
  }

  return {
    data: [...schools.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([school, aggregate]) => ({
        school,
        teacherCount: aggregate.teachers.size,
        classCount: aggregate.classCount,
        firstSeenAt: aggregate.firstSeenAt.toISOString(),
      })),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseMetricsWindow(request: Request):
  | { ok: true; window: OperatorWindow }
  | { ok: false; response: Response } {
  const value = new URL(request.url).searchParams.get("window");
  if (value !== "7d" && value !== "30d") {
    return {
      ok: false,
      response: operatorError(400, "INVALID_QUERY", "Window must be 7d or 30d."),
    };
  }
  return { ok: true, window: value };
}

export async function getOperatorMetrics(window: OperatorWindow, now = new Date()) {
  const days = window === "7d" ? 7 : 30;
  const end = now;
  const start = new Date(end.getTime() - days * DAY_MS);
  const previousStart = new Date(start.getTime() - days * DAY_MS);

  const users = await prisma.user.findMany({
    select: { id: true, email: true, createdAt: true },
  });
  const externalUsers = users.filter((user) => !isInternalTeacher(user.email));
  const externalTeacherIds = externalUsers.map((user) => user.id);

  const [classes, completions] = await Promise.all([
    prisma.class.findMany({
      where: { teacherId: { in: externalTeacherIds } },
      select: { id: true, teacherId: true, school: true },
    }),
    prisma.sessionCompletion.findMany({
      where: {
        class: { teacherId: { in: externalTeacherIds } },
        endedAt: { not: null },
      },
      select: {
        sessionId: true,
        startedAt: true,
        endedAt: true,
        headcount: true,
        class: { select: { teacherId: true } },
      },
    }),
  ]);

  const plannedBySession = sessionMinutes();
  const inRange = (date: Date, from: Date, to: Date) => date >= from && date < to;
  const current = completions.filter(
    (row) => row.endedAt && inRange(row.endedAt, start, end)
  );
  const previous = completions.filter(
    (row) => row.endedAt && inRange(row.endedAt, previousStart, start)
  );
  const currentTeachers = new Set(current.map((row) => row.class.teacherId));
  const previousTeachers = new Set(previous.map((row) => row.class.teacherId));

  const sumDuration = (rows: typeof completions, headcount: number | "stored") =>
    rows.reduce(
      (sum, row) =>
        sum +
        completionMinutes(
          {
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            headcount: headcount === "stored" ? row.headcount : headcount,
          },
          plannedBySession.get(row.sessionId)
        ),
      0
    );

  return {
    window: {
      key: window,
      start: start.toISOString(),
      end: end.toISOString(),
      previousStart: previousStart.toISOString(),
    },
    data: {
      newUsers: externalUsers.filter((user) => inRange(user.createdAt, start, end)).length,
      activeTeachers: currentTeachers.size,
      returningTeachers: [...currentTeachers].filter((id) => previousTeachers.has(id)).length,
      sessionsLed: current.length,
      minutesOutside: sumDuration(current, 1),
      childMinutes: sumDuration(current, "stored"),
    },
    totals: {
      users: externalUsers.length,
      schools: new Set(classes.map((row) => row.school)).size,
      classes: classes.length,
      teachersWithCompletions: new Set(completions.map((row) => row.class.teacherId)).size,
      sessionsLed: completions.length,
      minutesOutside: sumDuration(completions, 1),
      childMinutes: sumDuration(completions, "stored"),
    },
  };
}

/**
 * Small-group suppression for the per-school pulse. Aggregates over fewer
 * teachers than this are one person's numbers wearing a school's name, so they
 * are withheld rather than rounded: a head must never be able to read one
 * teacher's minutes off a school page.
 */
export const SCHOOL_PULSE_THRESHOLD = 3;

/**
 * Who the pulse is for. `operator` (the default) is any view that is not the
 * school's own: suppressed below SCHOOL_PULSE_THRESHOLD. `school-lead` is the
 * school's own lead reading their own school, who is entitled to its numbers
 * however few teachers there are, so nothing is withheld. The caller decides
 * who is that school's lead; this route cannot, and says so in the docs.
 */
export type SchoolPulseAudience = "operator" | "school-lead";

export function parseSchoolPulseQuery(request: Request):
  | { ok: true; school: string; window: OperatorWindow; audience: SchoolPulseAudience }
  | { ok: false; response: Response } {
  const params = new URL(request.url).searchParams;
  const school = params.get("school")?.trim() ?? "";
  if (!school || school.length > 200) {
    return {
      ok: false,
      response: operatorError(400, "INVALID_QUERY", "school is required (1..200 characters)."),
    };
  }
  const audience = params.get("audience") ?? "operator";
  if (audience !== "operator" && audience !== "school-lead") {
    return {
      ok: false,
      response: operatorError(400, "INVALID_QUERY", "audience must be operator or school-lead."),
    };
  }
  const window = parseMetricsWindow(request);
  if (!window.ok) return window;
  return { ok: true, school, window: window.window, audience };
}

/**
 * The pulse of one school, by its exact entered label, over one window: how
 * many teachers, how many active, how much time outside. The same definitions
 * and the same duration policy as /metrics, scoped to the classes whose
 * `school` equals the label, and suppressed below SCHOOL_PULSE_THRESHOLD
 * active teachers. No names, no coordinates, no free text leave here.
 */
export async function getSchoolPulse(
  school: string,
  window: OperatorWindow,
  now = new Date(),
  audience: SchoolPulseAudience = "operator"
) {
  const threshold = audience === "school-lead" ? 0 : SCHOOL_PULSE_THRESHOLD;
  const days = window === "7d" ? 7 : 30;
  const end = now;
  const start = new Date(end.getTime() - days * DAY_MS);
  const previousStart = new Date(start.getTime() - days * DAY_MS);

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const externalTeacherIds = users.filter((u) => !isInternalTeacher(u.email)).map((u) => u.id);

  const classes = await prisma.class.findMany({
    where: { school, teacherId: { in: externalTeacherIds } },
    select: { id: true, teacherId: true },
  });
  const classIds = classes.map((c) => c.id);
  const completions = classIds.length
    ? await prisma.sessionCompletion.findMany({
        where: { classId: { in: classIds }, endedAt: { not: null } },
        select: {
          sessionId: true,
          startedAt: true,
          endedAt: true,
          headcount: true,
          class: { select: { teacherId: true } },
        },
      })
    : [];

  const plannedBySession = sessionMinutes();
  const inRange = (date: Date, from: Date, to: Date) => date >= from && date < to;
  const current = completions.filter((row) => row.endedAt && inRange(row.endedAt, start, end));
  const previous = completions.filter((row) => row.endedAt && inRange(row.endedAt, previousStart, start));
  const currentTeachers = new Set(current.map((row) => row.class.teacherId));
  const previousTeachers = new Set(previous.map((row) => row.class.teacherId));
  const lifetimeTeachers = new Set(completions.map((row) => row.class.teacherId));

  const sumDuration = (rows: typeof completions, headcount: number | "stored") =>
    rows.reduce(
      (sum, row) =>
        sum +
        completionMinutes(
          {
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            headcount: headcount === "stored" ? row.headcount : headcount,
          },
          plannedBySession.get(row.sessionId)
        ),
      0
    );

  const aggregate = (rows: typeof completions, teachers: Set<string>, returning: number | null) =>
    teachers.size < threshold
      ? null
      : {
          activeTeachers: teachers.size,
          ...(returning === null ? {} : { returningTeachers: returning }),
          sessionsLed: rows.length,
          minutesOutside: sumDuration(rows, 1),
          childMinutes: sumDuration(rows, "stored"),
        };

  return {
    school,
    window: {
      key: window,
      start: start.toISOString(),
      end: end.toISOString(),
      previousStart: previousStart.toISOString(),
    },
    audience,
    threshold,
    teacherCount: new Set(classes.map((c) => c.teacherId)).size,
    classCount: classes.length,
    data: aggregate(current, currentTeachers, [...currentTeachers].filter((id) => previousTeachers.has(id)).length),
    totals: aggregate(completions, lifetimeTeachers, null),
  };
}

export function operatorJson(body: unknown): Response {
  return NextResponse.json(body, { headers: NO_STORE });
}
