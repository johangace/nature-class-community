/**
 * The two writes behind "change this class's place" (#827), and the only
 * place they live.
 *
 * They were server-action bodies in app/classes/grounds-actions.ts until
 * nc#949. The ownership rules, the lossless copy and the destination are
 * unchanged and still asserted by tests/unit/shared-grounds-actions.spec.ts;
 * what moved is WHO calls them — a route handler that answers a plain form
 * POST with a real HTTP 303, rather than a server action whose redirect the
 * client router is free to drop. See app/world/place/route.ts for why.
 *
 * Each function returns the path to send the teacher to. A validation or
 * ownership failure returns "/classes" rather than throwing, so a forged or
 * stale form tells the caller nothing about what exists.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const assignmentSchema = z.object({
  classId: z.string().min(1),
  groundsId: z.string().min(1),
});

const creationSchema = z.object({
  classId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => !/[<>]/.test(value) && !/https?:\/\//i.test(value)),
});

const placeSelect = {
  id: true,
  school: true,
  lat: true,
  lng: true,
  climate: true,
  habitats: true,
  siteFeatures: true,
  siteNotes: true,
  reach: true,
  placeRead: true,
  placeReadAt: true,
} as const;

/** Where a teacher lands once the write has happened. */
export function worldRedirect(classId: string, groundsId: string): string {
  return `/world?classId=${encodeURIComponent(classId)}&groundsId=${encodeURIComponent(groundsId)}`;
}

function legacyMirror(place: {
  lat: number | null;
  lng: number | null;
  climate: string | null;
  habitats: string[];
  siteFeatures: string[];
  siteNotes: string[];
  reach: string | null;
  placeRead: Prisma.JsonValue;
  placeReadAt: Date | null;
}) {
  return {
    lat: place.lat,
    lng: place.lng,
    climate: place.climate,
    grounds: place.habitats,
    siteFeatures: place.siteFeatures,
    siteNotes: place.siteNotes,
    reach: place.reach,
    placeRead: place.placeRead === null ? Prisma.DbNull : place.placeRead,
    placeReadAt: place.placeReadAt,
  };
}

/** Assign an existing, owned Grounds profile to one owned class. */
export async function assignGroundsForTeacher(
  teacherId: string,
  formData: FormData
): Promise<string> {
  const parsed = assignmentSchema.safeParse({
    classId: formData.get("classId"),
    groundsId: formData.get("groundsId"),
  });
  if (!parsed.success) return "/classes";

  const [ownedClass, ownedGrounds] = await Promise.all([
    prisma.class.findFirst({
      where: { id: parsed.data.classId, teacherId },
      select: { id: true },
    }),
    prisma.grounds.findFirst({
      where: { id: parsed.data.groundsId, teacherId },
      select: placeSelect,
    }),
  ]);
  if (!ownedClass || !ownedGrounds) return "/classes";

  await prisma.class.updateMany({
    where: { id: ownedClass.id, teacherId },
    data: {
      groundsId: ownedGrounds.id,
      ...legacyMirror(ownedGrounds),
    },
  });

  return worldRedirect(ownedClass.id, ownedGrounds.id);
}

/**
 * Create an independent Grounds profile from the class's current place data,
 * then assign only that class to it. Copying first makes separation lossless.
 */
export async function createGroundsForTeacher(
  teacherId: string,
  formData: FormData
): Promise<string> {
  const parsed = creationSchema.safeParse({
    classId: formData.get("classId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return "/classes";

  const ownedClass = await prisma.class.findFirst({
    where: { id: parsed.data.classId, teacherId },
    select: {
      id: true,
      school: true,
      lat: true,
      lng: true,
      climate: true,
      grounds: true,
      siteFeatures: true,
      siteNotes: true,
      reach: true,
      placeRead: true,
      placeReadAt: true,
      groundsProfile: { select: placeSelect },
    },
  });
  if (!ownedClass) return "/classes";

  const current = ownedClass.groundsProfile ?? {
    id: "legacy",
    school: ownedClass.school,
    lat: ownedClass.lat,
    lng: ownedClass.lng,
    climate: ownedClass.climate,
    habitats: ownedClass.grounds,
    siteFeatures: ownedClass.siteFeatures,
    siteNotes: ownedClass.siteNotes,
    reach: ownedClass.reach,
    placeRead: ownedClass.placeRead,
    placeReadAt: ownedClass.placeReadAt,
  };
  const groundsId = randomUUID();
  const mirror = legacyMirror(current);

  await prisma.$transaction([
    prisma.grounds.create({
      data: {
        id: groundsId,
        name: parsed.data.name,
        school: current.school,
        teacherId,
        lat: current.lat,
        lng: current.lng,
        climate: current.climate,
        habitats: current.habitats,
        siteFeatures: current.siteFeatures,
        siteNotes: current.siteNotes,
        reach: current.reach,
        placeRead: current.placeRead ?? undefined,
        placeReadAt: current.placeReadAt,
      },
      select: { id: true },
    }),
    prisma.class.updateMany({
      where: { id: ownedClass.id, teacherId },
      data: { groundsId, ...mirror },
    }),
  ]);

  return worldRedirect(ownedClass.id, groundsId);
}
