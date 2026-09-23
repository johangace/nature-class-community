"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordInviteCohort } from "@/lib/invite-cohort";
import { resolveClimate } from "@/lib/outside/climate";
import { bandForYearGroup } from "@/lib/ability";
import {
  ACTIVE_CLASS_COOKIE,
  START_FLOW_COOKIE,
  START_FLOW_MAX_AGE,
  getTeacher,
} from "@/lib/teacher";
import { TRY_PLACE_COOKIE } from "@/lib/try-place";
import { GROUNDS, REACH_IDS, SITE_FEATURES, YEAR_GROUPS, GROUP_TYPES, AGE_RANGES, GROUP_OPTIONS, type ReachId } from "./vocab";

/**
 * Server actions for first run and the permanent Grounds editor. The class row
 * is created once on the second and final setup screen, carrying the minimal
 * class profile and its required location. Richer Grounds answers are saved
 * later from /world.
 *
 * Everything re-checks the session server-side and scopes by teacherId — a
 * flow can only ever write the signed-in teacher's own class. Teacher-entered
 * fields and the school's own coordinates only; no child ever appears here.
 *
 * The classes surface's own createClass / chooseClass / renameClass /
 * deleteClass stay where they are for managing existing classes — these are
 * the flow's programmatic siblings that return an id and set the active class
 * without redirecting, so the client flow owns its own step navigation.
 */

// Both vocabularies now live in ./vocab, a plain module. They used to be
// exported from here, and this is a "use server" file, which may only export
// async functions: the client got server references instead of arrays and
// the class step threw "map is not a function". Same lists, imported by both sides,
// so the schemas below still validate exactly what the teacher was offered.
const yearGroups = YEAR_GROUPS;
const grounds = GROUNDS;

const groundSchema = z.enum(grounds);

const createSchema = z.object({
  // An optional draft id: if the teacher backs up from the location step to
  // the name step and forward again, the same row is reused — one create per
  // flow, never a junk second class row (spec: idempotency).
  classId: z.string().min(1).optional(),
  name: z.string().trim().max(80),
  yearGroup: z.union([z.enum(yearGroups), z.literal("")]),
  groupType: z.enum(GROUP_TYPES).optional(),
  ageRange: z.enum(AGE_RANGES).optional(),
  school: z.string().trim().min(1).max(120),
  // Nullable for old and non-onboarding callers. /start requires both values
  // before it calls this action.
  lat: z.coerce.number().gte(-90).lte(90).nullish(),
  lng: z.coerce.number().gte(-180).lte(180).nullish(),
  // The invite link's cohort code (#821). Loosely typed here on purpose: a
  // malformed code must not cost her the class, so recordInviteCohort checks
  // the shape and simply stores nothing when it is wrong.
  inviteCohort: z.string().max(64).nullish(),
});

export type CreateClassInput = {
  classId?: string;
  name: string;
  yearGroup: string;
  school: string;
  groupType?: (typeof GROUP_TYPES)[number];
  ageRange?: (typeof AGE_RANGES)[number];
  lat?: number | null;
  lng?: number | null;
  inviteCohort?: string | null;
};

/**
 * Create (or, with an existing draft id, update) the flow's class in one
 * write, and make it the active class. Coordinates are rounded to ~100m on the way
 * in — finer than weather varies, coarse enough to carry no more precision
 * than the job needs — exactly as the classes surface's location action does.
 */
export async function createClassFromFlow(
  input: CreateClassInput
): Promise<{ classId: string; inviteCohort: string | null }> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Those class details didn't look right. Please try again.");
  }

  const { classId, yearGroup, school, lat, lng, groupType, ageRange } = parsed.data;
  const name = parsed.data.name || GROUP_OPTIONS.find((option) => option.value === groupType)?.defaultName || "My class";
  const profile = { groupType, ageRange };
  const abilityBand = bandForYearGroup(yearGroup);
  // The climate tag is derived in the same breath as the coordinates, from the
  // same coordinates, so a class can never hold a location and a climate that
  // disagree. No coordinates means no climate: every reader then falls back to
  // deriving one, rather than carrying a stale tag for a place we do not know.
  const coords =
    typeof lat === "number" && typeof lng === "number"
      ? {
          lat: Math.round(lat * 1000) / 1000,
          lng: Math.round(lng * 1000) / 1000,
          climate: resolveClimate(lat, lng),
        }
      : { lat: null, lng: null, climate: null };

  let id: string;
  if (classId) {
    // Reuse the flow's held draft. Ownership-scoped: only this teacher's row.
    const owned = await prisma.class.findFirst({
      where: { id: classId, teacherId: teacher.id },
      select: { id: true, groundsId: true },
    });
    if (owned) {
      const classUpdate = prisma.class.update({
        where: { id: owned.id },
        data: { name, yearGroup, abilityBand, school, ...profile, ...coords },
      });
      if (owned.groundsId) {
        await prisma.$transaction([
          classUpdate,
          prisma.grounds.updateMany({
            where: { id: owned.groundsId, teacherId: teacher.id },
            data: { school, ...coords },
          }),
          prisma.class.updateMany({
            where: { groundsId: owned.groundsId, teacherId: teacher.id },
            data: coords,
          }),
        ]);
      } else {
        await classUpdate;
      }
      id = owned.id;
    } else {
      const made = await prisma.class.create({
        data: {
          name,
          yearGroup,
          ...profile,
          abilityBand,
          school,
          ...coords,
          teacher: { connect: { id: teacher.id } },
          groundsProfile: {
            create: {
              name: school,
              school,
              ...coords,
              teacher: { connect: { id: teacher.id } },
            },
          },
        },
        select: { id: true },
      });
      id = made.id;
    }
  } else {
    const made = await prisma.class.create({
      data: {
        name,
        yearGroup,
        ...profile,
        abilityBand,
        school,
        ...coords,
        teacher: { connect: { id: teacher.id } },
        groundsProfile: {
          create: {
            name: school,
            school,
            ...coords,
            teacher: { connect: { id: teacher.id } },
          },
        },
      },
      select: { id: true },
    });
    id = made.id;
  }

  // No cast is resolved here any more (#284). The location step used to write a
  // species list that then never changed, which is how a class onboarded on a
  // photographless night kept faceless cards forever. The coordinates are the
  // only thing worth keeping; every surface resolves the cast from the current
  // read when it needs one, so onboarding is also one Pointmoon call shorter.

  // A class you just made in the flow is the class you mean to teach.
  const jar = await cookies();
  jar.set(ACTIVE_CLASS_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  // Written in the same breath as the class, deliberately: the moment this
  // action returns, revalidatePath refreshes /start underneath the teacher and
  // its guard reads the class we just made. The marker travels with that same
  // response, so there is no instant where the class exists and /start cannot
  // tell the flow made it (#94).
  jar.set(START_FLOW_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: START_FLOW_MAX_AGE,
    path: "/start",
  });

  revalidatePath("/today");
  revalidatePath("/classes");

  // Set once (#821): fills her record only if it is empty, and answers what
  // the record holds, so the completion event reports the cohort she first
  // arrived with. Never throws; a failure here is counted as organic.
  const inviteCohort = await recordInviteCohort(teacher.id, parsed.data.inviteCohort);
  return { classId: id, inviteCohort };
}

/**
 * The flow is over: the teacher saved the required location. Drops
 * the mid-flow marker so /start is a first-run surface again, and hands them
 * to Today on a real navigation rather than a client push, so the page they
 * land on is rendered fresh with their new class rather than from a router
 * cache that predates it.
 *
 * Safe to call whatever happened before it: clearing a marker that is already
 * gone is a no-op, so an abandoned or repeated finish costs nothing.
 */
export async function finishStartFlow(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: START_FLOW_COOKIE, path: "/start" });
  // The spot she chose before signing in has done its job: the class row now
  // holds the place of record (#877).
  jar.delete({ name: TRY_PLACE_COOKIE, path: "/" });
  revalidatePath("/today");
  redirect("/today");
}

const setGroundsSchema = z.object({
  classId: z.string().min(1),
  grounds: z.array(groundSchema).max(grounds.length),
});

/**
 * Screen 5: update the class's grounds. Skippable and idempotent — an empty
 * array is valid and leaves look-fors on their region defaults. Ownership-
 * scoped; never blocks the flow (a failed write is swallowed so the teacher
 * still reaches Today).
 */
export async function setGrounds(
  classId: string,
  chosen: string[]
): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = setGroundsSchema.safeParse({ classId, grounds: chosen });
  if (!parsed.success) return;

  const owned = await prisma.class.findFirst({
    where: { id: parsed.data.classId, teacherId: teacher.id },
    select: { id: true, groundsId: true },
  });
  if (!owned) return;
  if (owned.groundsId) {
    await prisma.$transaction([
      prisma.grounds.updateMany({
        where: { id: owned.groundsId, teacherId: teacher.id },
        data: { habitats: parsed.data.grounds },
      }),
      prisma.class.updateMany({
        where: { groundsId: owned.groundsId, teacherId: teacher.id },
        data: { grounds: parsed.data.grounds },
      }),
    ]);
  } else {
    await prisma.class.updateMany({
      where: { id: owned.id, teacherId: teacher.id },
      data: { grounds: parsed.data.grounds },
    });
  }

  revalidatePath("/today");
  revalidatePath("/classes");
}

/**
 * Save the school's own world: the features inside the grounds, her own words
 * for anything our vocabulary has no box for, and how far a class can get
 * (#277).
 *
 * Validated against the closed vocabularies in ./vocab, exactly as `setGrounds`
 * is, so nothing reaches the column that was not offered. `notes` is the one
 * open field and it is bounded hard: short, few, no markup and no links.
 *
 * WHY THE NOTES FIELD IS SAFE HERE AND NOWHERE ELSE. This product has no
 * free-text field anywhere near a lesson, on purpose: the reflection taps are a
 * closed vocabulary so there is nothing a child's name can be typed into, and
 * that is the zero-child-PII boundary held by construction. This field is a
 * fact about the PLACE and lives on the class row, never on a completion, so
 * it cannot attach to a child even indirectly. The bound and the placement are
 * both load-bearing; widening either is a decision, not a tweak.
 */
const setWorldSchema = z.object({
  classId: z.string().min(1),
  features: z.array(z.enum(SITE_FEATURES)).max(SITE_FEATURES.length),
  notes: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(120)
        .refine((v) => !/[<>]/.test(v) && !/https?:\/\//i.test(v))
    )
    .max(6),
  reach: z.enum(REACH_IDS as [ReachId, ...ReachId[]]).nullable(),
});

export async function setWorld(input: {
  classId: string;
  features: string[];
  notes: string[];
  reach: string | null;
}): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = setWorldSchema.safeParse(input);
  if (!parsed.success) return;

  const owned = await prisma.class.findFirst({
    where: { id: parsed.data.classId, teacherId: teacher.id },
    select: { id: true, groundsId: true },
  });
  if (!owned) return;
  const shared = {
    siteFeatures: parsed.data.features,
    siteNotes: parsed.data.notes,
    reach: parsed.data.reach,
  };
  if (owned.groundsId) {
    await prisma.$transaction([
      prisma.grounds.updateMany({
        where: { id: owned.groundsId, teacherId: teacher.id },
        data: shared,
      }),
      prisma.class.updateMany({
        where: { groundsId: owned.groundsId, teacherId: teacher.id },
        data: shared,
      }),
    ]);
  } else {
    await prisma.class.updateMany({
      where: { id: owned.id, teacherId: teacher.id },
      data: shared,
    });
  }

  // `/world` is here because the page this action is usually called FROM has
  // to be one of them (nc#1286). It used to be missing, and `WorldForm` made
  // up the difference with `router.refresh()` — a second request for the same
  // tree, racing the one the action already answers with. Measured over 100
  // hydrated clicks on a probe with this exact shape, 11 of them never reached
  // the page, with the write committed every time. The same write with the
  // refresh removed and the current path revalidated here landed 80 out of 80.
  // The full table, including the shapes that are fine, is on nc#1286; the
  // lint that holds this rule is `scripts/action-refresh-lint.mjs` (nc#1291).
  revalidatePath("/world");
  revalidatePath("/today");
  revalidatePath("/classes");
  revalidatePath("/season");
}
