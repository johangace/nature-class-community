"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveClimate } from "@/lib/outside/climate";
import { ACTIVE_CLASS_COOKIE, getTeacher } from "@/lib/teacher";
import { bandForYearGroup } from "@/lib/ability";
import { AGE_RANGES, GROUP_TYPES, GROUP_OPTIONS } from "@/lib/group-profile";

/**
 * Group management: create a group and choose the active one.
 * Every action re-checks the session server-side and scopes by teacherId —
 * the form can't act for anyone but the signed-in teacher. Teacher-entered
 * fields only (group profile and place): no child ever
 * appears here, by design.
 */

const yearGroups = ["Reception", "Year 1", "Year 2"] as const;

const newClassSchema = z
  .object({
    name: z.string().trim().max(80),
    yearGroup: z.union([z.enum(yearGroups), z.literal("")]),
    groupType: z.enum(GROUP_TYPES).optional(),
    ageRange: z.enum(AGE_RANGES).optional(),
    school: z.string().trim().max(120).default(""),
    // An existing place to go out to (#913). "new" or absent means the
    // school named below becomes a place of its own, as before.
    groundsId: z.string().trim().default("new"),
  })
  .refine((v) => v.groundsId !== "new" || v.school.length > 0, {
    message: "a new place needs a name",
    path: ["school"],
  });

export async function createClass(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = newClassSchema.safeParse({
    name: formData.get("name"),
    yearGroup: formData.get("yearGroup") ?? "",
    groupType: formData.get("groupType") ?? undefined,
    ageRange: formData.get("ageRange") ?? undefined,
    school: formData.get("school") ?? "",
    groundsId: formData.get("groundsId") ?? "new",
  });
  if (!parsed.success) redirect("/classes?bad=1");
  const { yearGroup, school, groundsId, groupType, ageRange } = parsed.data;
  const name = parsed.data.name || GROUP_OPTIONS.find((option) => option.value === groupType)?.defaultName || "My class";

  // Joining an existing place: the class takes that place's school and its
  // saved position, so Today reads the same spot for every class there.
  const existing =
    groundsId === "new"
      ? null
      : await prisma.grounds.findFirst({
          where: { id: groundsId, teacherId: teacher.id },
          select: { id: true, school: true, lat: true, lng: true, climate: true },
        });
  if (groundsId !== "new" && !existing) redirect("/classes?bad=1");

  const made = await prisma.class.create({
    data: {
      name,
      yearGroup,
      groupType,
      ageRange,
      school: existing ? existing.school : school,
      abilityBand: bandForYearGroup(yearGroup),
      teacher: { connect: { id: teacher.id } },
      ...(existing
        ? {
            lat: existing.lat,
            lng: existing.lng,
            climate: existing.climate,
            groundsProfile: { connect: { id: existing.id } },
          }
        : {
            groundsProfile: {
              create: {
                name: school,
                school,
                teacher: { connect: { id: teacher.id } },
              },
            },
          }),
    },
    select: { id: true },
  });

  // A class you just made is the class you mean to teach: make it active.
  const jar = await cookies();
  jar.set(ACTIVE_CLASS_COOKIE, made.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  revalidatePath("/classes");
  revalidatePath("/today");
  redirect("/classes");
}

async function rememberOwnedClass(formData: FormData): Promise<boolean> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const id = z.string().min(1).safeParse(formData.get("classId"));
  if (!id.success) return false;

  // Only a class this teacher owns can become active.
  const owned = await prisma.class.findFirst({
    where: { id: id.data, teacherId: teacher.id },
    select: { id: true },
  });
  if (!owned) return false;

  const jar = await cookies();
  jar.set(ACTIVE_CLASS_COOKIE, owned.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return true;
}

export async function chooseClass(formData: FormData): Promise<void> {
  if (!(await rememberOwnedClass(formData))) redirect("/classes");

  revalidatePath("/classes");
  revalidatePath("/today");
  redirect("/classes");
}

/**
 * Open the Grounds profile used by a class card without changing which class
 * is active. The posted id is joined back to the signed-in teacher before it
 * reaches the URL, so it cannot open another teacher's class.
 */
export async function openClassGrounds(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const id = z.string().min(1).safeParse(formData.get("classId"));
  if (!id.success) redirect("/classes");
  const owned = await prisma.class.findFirst({
    where: { id: id.data, teacherId: teacher.id },
    select: { id: true },
  });
  if (!owned) redirect("/classes");

  revalidatePath("/world");
  redirect(`/world?classId=${encodeURIComponent(owned.id)}`);
}

/**
 * Set a class's location from the iPad's own geolocation — the teacher taps
 * "use this school's location" standing in the playground, and today's
 * conditions ground to this spot instead of a fixed demo point. The stored
 * coordinates are the school's, never a child's; they are rounded to ~100m
 * on the way in, which is finer than weather varies and coarse enough to
 * carry no more precision than the job needs.
 */
const locationSchema = z.object({
  classId: z.string().min(1),
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  returnTo: z.enum(["/today", "/classes"]).default("/classes"),
});

export async function setClassLocation(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = locationSchema.safeParse({
    classId: formData.get("classId"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    returnTo: formData.get("returnTo") ?? undefined,
  });
  if (!parsed.success) redirect("/classes");

  const lat = Math.round(parsed.data.lat * 1000) / 1000;
  const lng = Math.round(parsed.data.lng * 1000) / 1000;

  const owned = await prisma.class.findFirst({
    where: { id: parsed.data.classId, teacherId: teacher.id },
    select: { id: true, groundsId: true },
  });
  if (!owned) redirect("/classes");
  const data = { lat, lng, climate: resolveClimate(lat, lng) };

  if (owned.groundsId) {
    await prisma.$transaction([
      prisma.grounds.updateMany({
        where: { id: owned.groundsId, teacherId: teacher.id },
        data,
      }),
      // Expand-phase mirror: old readers and rollback see the same place for
      // every class sharing this Grounds record.
      prisma.class.updateMany({
        where: { groundsId: owned.groundsId, teacherId: teacher.id },
        data,
      }),
    ]);
  } else {
    await prisma.class.updateMany({
      where: { id: owned.id, teacherId: teacher.id },
      data,
    });
  }

  // No cast is resolved here any more (#284). Setting a location used to write
  // a species list that then never changed; the cast is now read from the
  // current Pointmoon payload every time a surface asks for it, so moving the
  // pin is simply a new place to read, and tomorrow is simply tomorrow.

  revalidatePath("/classes");
  revalidatePath("/today");
  redirect(parsed.data.returnTo);
}

/** Rename a class. Ownership-scoped; teacher-entered text only. */
const renameSchema = z.object({
  classId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});

export async function renameClass(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = renameSchema.safeParse({
    classId: formData.get("classId"),
    name: formData.get("name"),
  });
  if (!parsed.success) redirect("/classes");

  await prisma.class.updateMany({
    where: { id: parsed.data.classId, teacherId: teacher.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/classes");
  revalidatePath("/today");
  redirect("/classes");
}

/**
 * Drop the active-class cookie. Called on sign-out, once the session itself
 * has gone: that cookie is ours rather than Better Auth's, so nothing else
 * clears it, and a shared iPad would otherwise carry the last teacher's class
 * id into the next teacher's first page. Deliberately takes no session check —
 * by the time it runs there is no session left to check, and forgetting a
 * cookie on your own device needs no authorising. It reads nothing and
 * returns nothing, so it can tell no caller anything either.
 */
export async function forgetActiveClass(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_CLASS_COOKIE);
  revalidatePath("/today", "layout");
}

/**
 * Remove a class. Ownership-scoped. Its logged sessions cascade away with it
 * (the schema's onDelete: Cascade) — a class you delete takes its own history,
 * nobody else's. If it was the active class, the cookie is cleared so the next
 * page doesn't point at a class that's gone.
 */
export async function deleteClass(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const id = z.string().min(1).safeParse(formData.get("classId"));
  if (!id.success) redirect("/classes");

  await prisma.class.deleteMany({
    where: { id: id.data, teacherId: teacher.id },
  });

  const jar = await cookies();
  if (jar.get(ACTIVE_CLASS_COOKIE)?.value === id.data) {
    jar.delete(ACTIVE_CLASS_COOKIE);
  }

  revalidatePath("/classes");
  revalidatePath("/today");
  redirect("/classes");
}

/** Language belongs to this teacher's class, never to a shared browser. */
export async function setClassEnglishLocale(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");
  const parsed = z.object({ classId: z.string().min(1), locale: z.enum(["auto", "us", "uk"]) }).safeParse({
    classId: formData.get("classId"), locale: formData.get("locale"),
  });
  if (!parsed.success) redirect("/classes");
  await prisma.class.updateMany({
    where: { id: parsed.data.classId, teacherId: teacher.id },
    data: { englishLocale: parsed.data.locale === "auto" ? null : parsed.data.locale },
  });
  revalidatePath("/", "layout");
  redirect("/classes");
}
