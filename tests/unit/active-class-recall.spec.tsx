import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE WORLD BUILDER CAME BACK EVERY MORNING (#653).
 *
 * Johan teaches with several classes, so he met this on every single sign-in:
 * the /start onboarding — world builder and all — instead of Today.
 *
 * The chain, and why each link is individually correct:
 *   1. signing out drops the active-class cookie on purpose, because a shared
 *      iPad must not carry one teacher's class into the next teacher's morning;
 *   2. `getActiveClass` then fell back to the teacher's class only when she had
 *      EXACTLY ONE, and answered `null` for two or more;
 *   3. `/` reads `null` as first run and sends her to /start;
 *   4. /start's own guard reads the same `null`, so it did not bounce her back
 *      out — and finishing the flow minted a DUPLICATE CLASS.
 *
 * So this file holds the property the fix is: with no cookie, the fallback is
 * the class she most recently touched, and `null` means only what `/` has
 * always thought it meant — she has no classes at all.
 *
 * Both halves are here, the helper and the screen, because the bug was only
 * visible on the screen. `getActiveClass` runs for real against a mocked
 * Prisma and a mocked cookie jar; `/` is rendered on top of it with its two
 * streamed reads stubbed out (renderToStaticMarkup cannot await an async
 * server component — the same trade tests/unit/today-primary-decision makes).
 */

const jar = vi.hoisted(() => new Map<string, string>());
const authApi = vi.hoisted(() => ({
  getSession: vi.fn(),
  listPasskeys: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: authApi } }));

vi.mock("@/lib/db", () => ({
  prisma: {
    class: { findFirst: vi.fn(), findMany: vi.fn() },
    sessionCompletion: { findMany: vi.fn() },
  },
}));

vi.mock("@/app/AppNav", async () => { const { AppNavClient } = await import("@/app/AppNavClient"); return { AppNav: AppNavClient }; });
vi.mock("@/app/TodayDay", () => ({
  TodayDay: () => null,
  TodayDoor: () => null,
}));
vi.mock("@/app/run/CompletionQueueDrain", () => ({
  CompletionQueueDrain: () => null,
}));

import TodayPage from "@/app/today/page";
import { prisma } from "@/lib/db";
import { ACTIVE_CLASS_COOKIE, getActiveClass } from "@/lib/teacher";
import { redirect } from "next/navigation";

/** A class row as the fallback query reads it: the class, plus the two stamps. */
function classRow(
  id: string,
  over: {
    updatedAt?: Date;
    ledAt?: Date;
    name?: string;
  } = {}
) {
  return {
    id,
    name: over.name ?? `${id} class`,
    yearGroup: "Year 1",
    school: "Hollow Lane Primary",
    lat: 51.56,
    lng: -0.13,
    climate: null,
    grounds: [] as string[],
    abilityBand: null,
    jurisdiction: null,
    sessionShape: null,
    updatedAt: over.updatedAt ?? new Date("2026-01-01T09:00:00Z"),
    completions: over.ledAt ? [{ startedAt: over.ledAt }] : [],
  };
}

/** The same row as the COOKIE query reads it: no picker stamps in that select. */
function cookieRow(id: string) {
  const { updatedAt, completions, ...rest } = classRow(id);
  return rest;
}

/** The teacher's classes, in the order the fallback query's `orderBy` returns. */
function teacherHas(...rows: ReturnType<typeof classRow>[]) {
  vi.mocked(prisma.class.findMany).mockResolvedValue(rows as never);
}

/**
 * The same row plus the two columns nothing SELECTS and the query still reads:
 * `createdAt`, the second tiebreak key, so a fixture that means to exercise the
 * tiebreak has to carry it — and `teacherId`, the column the query FILTERS on,
 * so a fixture can hold a row that is not this teacher's (#744).
 *
 * The owner defaults to the signed-in teacher, because that is what every
 * fixture in this file meant before the filter existed. A test that wants
 * somebody else's class in the table says whose it is.
 */
function classRowMadeAt(
  id: string,
  createdAt: Date,
  over: Parameters<typeof classRow>[1] & { teacherId?: string } = {}
) {
  return { ...classRow(id, over), createdAt, teacherId: over.teacherId ?? "teacher-1" };
}

type OrderClause = Record<string, "asc" | "desc">;

/** Sort by the query's `orderBy` clauses in order; ties keep arrival order. */
function inTheOrderTheQueryAsked(clauses: OrderClause[]) {
  return (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const clause of clauses) {
      for (const [key, direction] of Object.entries(clause)) {
        const left = (a[key] as Date).getTime();
        const right = (b[key] as Date).getTime();
        if (left !== right) return direction === "desc" ? right - left : left - right;
      }
    }
    return 0;
  };
}

/** Rows the query's `where` keeps: every clause in the filter has to match. */
function theRowsTheFilterKeeps(where: Record<string, unknown>) {
  return (row: Record<string, unknown>) =>
    Object.entries(where).every(([column, value]) => row[column] === value);
}

/**
 * A database that VOLUNTEERS NO ORDER (#666) AND HOLDS OTHER TEACHERS' CLASSES
 * TOO (#744).
 *
 * `teacherHas` above hands back a hand-ordered array whatever the query asked
 * for, which quietly supplies the ordering the code is supposed to guarantee:
 * with that mock the `orderBy` can be deleted from `getActiveClass` and all
 * eleven tests above stay green. The tiebreak was prose in a PR body.
 *
 * So this one answers the way a table does, on BOTH halves of the query. Rows
 * come back in the order it ASKED for, and — when it asked for nothing — in the
 * arbitrary order they happen to sit in, which is exactly what Postgres
 * promises about a SELECT with no ORDER BY. And only the rows its `where`
 * SELECTS come back at all, because a `class` table has every teacher's classes
 * in it and the query is the only thing standing between this teacher and the
 * rest of them.
 *
 * The filter half is #744, and it is the same lesson as the ordering half one
 * column over. A mock that hands back its whole fixture however it was asked
 * supplies the SCOPING the code is supposed to guarantee, just as the
 * hand-ordered array supplied the ordering: `where: { teacherId }` could be
 * deleted from the fallback query outright and every test in this file stayed
 * green. Three nights of work here had pinned which row wins; nothing pinned
 * which rows are candidates.
 *
 * Reading the filter off the call rather than assuming it also means a `where`
 * that is PRESENT and WRONG — scoped to the cookie's id, say, or to a variable
 * that is not the signed-in teacher — fails here exactly as a missing one does.
 *
 * `createdAt` and `teacherId` are stripped on the way out because the real
 * query selects neither: they order and scope the rows and are never read back.
 */
function databaseHolds(...rows: ReturnType<typeof classRowMadeAt>[]) {
  vi.mocked(prisma.class.findMany).mockImplementation((async (args: {
    where?: Record<string, unknown>;
    orderBy?: OrderClause[];
  }) => {
    const kept = rows.filter(theRowsTheFilterKeeps(args?.where ?? {}));
    const ordered = kept.sort(inTheOrderTheQueryAsked(args?.orderBy ?? []));
    return ordered.map(({ createdAt, teacherId, ...row }) => row);
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  authApi.getSession.mockResolvedValue({
    user: { id: "teacher-1", email: "jo@hollowlane.sch.uk", name: "Jo" },
  });
  // Already enrolled, so the passkey strip stays off the rendered page.
  authApi.listPasskeys.mockResolvedValue([{ id: "passkey-1" }]);
  vi.mocked(prisma.class.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.sessionCompletion.findMany).mockResolvedValue([] as never);
  teacherHas();
});

describe("the class a teacher comes back to, with no cookie (#653)", () => {
  it("is the one she most recently edited, not nothing at all", async () => {
    teacherHas(
      classRow("recent", { updatedAt: new Date("2026-03-04T08:00:00Z") }),
      classRow("older", { updatedAt: new Date("2026-01-09T08:00:00Z") })
    );

    const active = await getActiveClass("teacher-1");

    // Before the fix this was `null` — two classes meant "no class", which /
    // reads as first run. Two classes is the ordinary case for a teacher who
    // takes more than one group outside.
    expect(active?.id).toBe("recent");
  });

  it("counts LEADING a class as touching it, not only editing it", async () => {
    // The class she edited most recently is not the class she has been
    // teaching: a name typed in September stays edited-in-September while the
    // sessions keep being led. `SessionCompletion` is the only row in the
    // schema written by USING a class, so it has to be able to win.
    teacherHas(
      classRow("edited-lately", { updatedAt: new Date("2026-02-01T08:00:00Z") }),
      classRow("led-lately", {
        updatedAt: new Date("2025-09-02T08:00:00Z"),
        ledAt: new Date("2026-03-11T09:30:00Z"),
      })
    );

    const active = await getActiveClass("teacher-1");

    expect(active?.id).toBe("led-lately");
  });

  it("answers null only when she has no classes at all", async () => {
    teacherHas();

    expect(await getActiveClass("teacher-1")).toBeNull();
  });

  it("still lands a teacher with exactly one class on it", async () => {
    teacherHas(classRow("only"));

    expect((await getActiveClass("teacher-1"))?.id).toBe("only");
  });

  it("hands on the class, not the stamps it chose with", async () => {
    // ActiveClass is the shape every surface reads. The picker needed two more
    // columns; the surfaces did not, and must not silently acquire them.
    teacherHas(classRow("a"), classRow("b", { ledAt: new Date("2026-04-01T09:00:00Z") }));

    const active = await getActiveClass("teacher-1");

    expect(active).not.toBeNull();
    expect(Object.keys(active ?? {})).not.toContain("updatedAt");
    expect(Object.keys(active ?? {})).not.toContain("completions");
  });
});

describe("two classes touched in the same instant (#666)", () => {
  /**
   * The tie is the whole case. `lastTouched` is a max over two stamps, so no
   * single `orderBy` expresses the answer and the pick happens in JS — which
   * means when two classes come out EQUAL on that max, nothing in the loop
   * decides between them: it keeps whichever row arrived first. The only thing
   * standing between that and "whatever order the database felt like" is the
   * query's `orderBy`, and until #666 nothing here made it prove that.
   *
   * A same-instant tie is not exotic. A teacher who sets up two groups in one
   * sitting has two rows whose `updatedAt` can land in the same tick, and
   * neither has been led yet.
   */
  const sameTick = new Date("2026-02-10T16:20:00Z");

  it("is decided by the query's ordering, not by the order the rows arrive in", async () => {
    // Tied on last-touched to the millisecond: same `updatedAt`, neither led.
    // `createdAt` is the second key, so the later-made class is the answer —
    // and the fixture arrives in the opposite order, so only the `orderBy` can
    // get there.
    databaseHolds(
      classRowMadeAt("made-first", new Date("2026-02-10T16:19:00Z"), {
        updatedAt: sameTick,
      }),
      classRowMadeAt("made-second", new Date("2026-02-10T16:19:30Z"), {
        updatedAt: sameTick,
      })
    );

    const active = await getActiveClass("teacher-1");

    expect(active?.id).toBe("made-second");
  });

  it("resolves the same class on every request, however the rows come back", async () => {
    // The property the tiebreak exists for, stated as the teacher meets it:
    // sign in twice and land in the same classroom both times. Two requests,
    // and between them the table hands the rows over in the opposite order —
    // which an unordered SELECT is entitled to do.
    const first = classRowMadeAt("made-first", new Date("2026-02-10T16:19:00Z"), {
      updatedAt: sameTick,
    });
    const second = classRowMadeAt("made-second", new Date("2026-02-10T16:19:30Z"), {
      updatedAt: sameTick,
    });

    databaseHolds(first, second);
    const morning = await getActiveClass("teacher-1");
    databaseHolds(second, first);
    const afternoon = await getActiveClass("teacher-1");

    expect(morning?.id).toBe(afternoon?.id);
    expect(morning?.id).toBe("made-second");
  });

  it("breaks a tie by the most recently EDITED class, not the most recently made (#736)", async () => {
    /**
     * The two cases above tie on one shared `updatedAt`, so `createdAt` decides
     * them whichever slot it sits in — which is why swapping the two keys to
     * `[{ createdAt }, { updatedAt }]` left all fourteen of them green (#736).
     * They pin that both keys are present and which way they point; nothing
     * pinned which one is asked FIRST.
     *
     * A tie does not need a shared `updatedAt`, because `lastTouched` is a max
     * over two stamps: one class EDITED at noon and another LED at noon are
     * tied on it while their `updatedAt` differ by weeks. That is the ordinary
     * afternoon — she renames one group and takes the other outside — and it is
     * the only fixture where the two orderings disagree, so it is the only one
     * that can see the precedence.
     *
     * Which answer is right is settled by the comment above the query: rows
     * tied on last-touched keep "the most recently edited, then the most
     * recently made". Edited beats made, so the class she just renamed wins.
     * Under the swap the tie is resolved by creation date instead, and she
     * lands in the other classroom.
     */
    const noon = new Date("2026-02-10T12:00:00Z");

    // Both touched at noon. `renamed-at-noon` was edited then and never led;
    // `led-at-noon` was led then and last edited in January — and it is the
    // NEWER row, so ordering by `createdAt` first puts it in front. The
    // fixture arrives in that same wrong order, so nothing but the query's
    // key precedence can get to the right answer.
    databaseHolds(
      classRowMadeAt("led-at-noon", new Date("2026-01-20T10:00:00Z"), {
        updatedAt: new Date("2026-01-20T10:00:00Z"),
        ledAt: noon,
      }),
      classRowMadeAt("renamed-at-noon", new Date("2025-09-01T10:00:00Z"), {
        updatedAt: noon,
      })
    );

    const active = await getActiveClass("teacher-1");

    expect(active?.id).toBe("renamed-at-noon");
  });

  it("counts a class edited today as touched today, though it was led long ago", async () => {
    // `lastTouched`'s other branch, said out loud: the later stamp wins, and
    // an old session must not drag a freshly edited class backwards.
    teacherHas(
      classRow("edited-today", {
        updatedAt: new Date("2026-03-01T08:00:00Z"),
        ledAt: new Date("2025-09-15T09:00:00Z"),
      }),
      classRow("quiet-since-february", { updatedAt: new Date("2026-02-01T08:00:00Z") })
    );

    expect((await getActiveClass("teacher-1"))?.id).toBe("edited-today");
  });
});

describe("whose classes the fallback may even consider (#744)", () => {
  /**
   * The other half of the fallback query, and the half no test could see.
   *
   * #666, #730 and #736 all pin WHICH ROW WINS — the ordering, its direction,
   * its key precedence, the JS picker's tie semantics. None of them pins WHICH
   * ROWS ARE CANDIDATES, and the two describe blocks above cannot: their
   * fixtures are this teacher's classes and nobody else's, so a query that read
   * the whole table would answer them all identically.
   *
   * This is the branch that runs on EVERY COOKIE-LESS SIGN-IN — the ordinary
   * morning, since sign-out drops the cookie on purpose (#653). Unscoped it
   * would read every class in the table and hand back the most recently touched
   * one GLOBALLY, which the caller returns as this teacher's active class. On a
   * shared iPad that is precisely the crossing #653's cookie-drop exists to
   * prevent, arriving through the fallback instead of through the cookie.
   *
   * The cookie branch's ownership scope has been pinned since #653 ("scopes the
   * cookie lookup to this teacher" below). This is that same property, said
   * about the branch that runs far more often.
   *
   * Both tests read as evidence rather than as shape: the table holds another
   * teacher's class, and what comes back is hers. A `where` that is missing and
   * a `where` that is present but names the wrong thing fail them the same way,
   * which an assertion on the call's arguments could not distinguish.
   */
  const hersButQuiet = () =>
    classRowMadeAt("hers", new Date("2026-01-05T08:00:00Z"), {
      name: "Willow class",
      updatedAt: new Date("2026-01-05T08:00:00Z"),
    });

  it("passes over another teacher's class, however recently it was touched", async () => {
    // The row most recently touched in the whole table is not hers. She has
    // one class, quiet since January; the teacher at the next desk led hers
    // this morning. Ordering, precedence and the picker all point at his row —
    // only the query's `where` keeps it out of the running.
    databaseHolds(
      classRowMadeAt("his", new Date("2026-03-01T08:00:00Z"), {
        name: "Hazel class",
        updatedAt: new Date("2026-02-01T08:00:00Z"),
        ledAt: new Date("2026-03-20T09:15:00Z"),
        teacherId: "teacher-2",
      }),
      hersButQuiet()
    );

    const active = await getActiveClass("teacher-1");

    expect(active?.id).toBe("hers");
  });

  it("answers null when every class in the table belongs to someone else", async () => {
    // The first-run case on a shared iPad, and the sharpest form of the
    // property: a teacher who has no classes must meet /start, not the class
    // of whoever used the device before her. `null` means she has none — not
    // "the table has none".
    databaseHolds(
      classRowMadeAt("his", new Date("2026-03-01T08:00:00Z"), {
        updatedAt: new Date("2026-03-20T08:00:00Z"),
        teacherId: "teacher-2",
      })
    );

    expect(await getActiveClass("teacher-1")).toBeNull();
  });
});

describe("the cookie stays authoritative", () => {
  it("uses the class the cookie names, without consulting recency at all", async () => {
    jar.set(ACTIVE_CLASS_COOKIE, "chosen");
    vi.mocked(prisma.class.findFirst).mockResolvedValue(cookieRow("chosen") as never);
    teacherHas(classRow("touched-later", { ledAt: new Date("2026-05-05T09:00:00Z") }));

    const active = await getActiveClass("teacher-1");

    expect(active?.id).toBe("chosen");
    // The switch a teacher made is a decision, not a guess to be second-guessed.
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  it("scopes the cookie lookup to this teacher, so a foreign id falls through", async () => {
    jar.set(ACTIVE_CLASS_COOKIE, "someone-elses");
    // findFirst is ownership-scoped and answers null for a class she does not
    // own or one she has since deleted; the fallback then does its work.
    teacherHas(classRow("hers"));

    const active = await getActiveClass("teacher-1");

    expect(prisma.class.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "someone-elses", teacherId: "teacher-1" },
      })
    );
    expect(active?.id).toBe("hers");
  });
});

describe("Today, on the morning after a sign-out", () => {
  async function renderToday() {
    return renderToStaticMarkup(
      await TodayPage({ searchParams: Promise.resolve({ locale: "uk" }) })
    );
  }

  it("opens on her most recent class instead of the world builder", async () => {
    teacherHas(
      classRow("hedgerow", {
        name: "Hedgerow class",
        updatedAt: new Date("2026-01-04T08:00:00Z"),
      }),
      classRow("willow", {
        name: "Willow class",
        updatedAt: new Date("2025-09-01T08:00:00Z"),
        ledAt: new Date("2026-03-19T09:15:00Z"),
      })
    );

    const markup = await renderToday();

    // The bug, stated as the screen: /start, every sign-in, for a teacher who
    // has classes already — and completing it would have made a third one.
    expect(redirect).not.toHaveBeenCalled();
    expect(markup).toContain("Willow class");
    expect(markup).toContain(">View session</span>");
  });

  it("still opens the first-run flow for a teacher with no classes", async () => {
    teacherHas();

    await expect(renderToday()).rejects.toThrow("redirect:/start");
    expect(redirect).toHaveBeenCalledWith("/start");
  });
});

describe("/start is first-run only, and can no longer mint a duplicate", () => {
  /**
   * The fourth link in the chain, closed at its source. /start's guard reads
   * the SAME `getActiveClass`, so while that answered `null` for a teacher
   * with two classes, the flow did not bounce her — it ran, and its location
   * step created a class she did not need. Nothing in /start changed; it stops
   * being reachable because `null` stopped being a lie.
   */
  it("bounces a teacher who already has classes and no cookie", async () => {
    const { default: StartPage } = await import("@/app/start/page");
    teacherHas(classRow("hedgerow"), classRow("willow"));

    await expect(StartPage({})).rejects.toThrow("redirect:/today");
    expect(prisma.class.findMany).toHaveBeenCalled();
  });

  it("still opens for a teacher who genuinely has none", async () => {
    const { default: StartPage } = await import("@/app/start/page");
    teacherHas();

    await expect(StartPage({})).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
