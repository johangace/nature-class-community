"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";
import { groundsPlaceForClass, groundsPlaceSelect } from "@/lib/grounds";
import { WORLD_FACT_KINDS } from "@/lib/ai/world-extract-contract";
import { classIdsSharingGrounds, RETIRED_STATUS } from "@/lib/world-memory";
import { setWorld } from "@/app/start/actions";

/**
 * Retiring one remembered fact (#509).
 *
 * "They mowed the wild corner" is the whole reason the strip has a control
 * beside each row: memory that cannot be corrected stops being memory and
 * becomes a wrong answer the product keeps repeating.
 *
 * IT WRITES THROUGH `setWorld`, NOT AROUND IT. The action re-reads the live
 * world from the class row, drops the one value, and hands the whole answer to
 * the write path that already exists — the same one the grounds page and the
 * chat both end at. A second write path here would be a second merge rule, and
 * the shared-Grounds mirroring, the closed vocabularies and the ownership
 * scope would each have to be remembered twice.
 *
 * NOTHING THE CALLER SENDS IS TRUSTED AS STATE. The caller names a kind and a
 * value; the list written back is composed here from what the database holds,
 * so a stale page cannot post an old world and quietly resurrect a fact she
 * retired a minute ago.
 *
 * THE LEDGER KEEPS WHAT SHE SAID, AND RECORDS THAT SHE CORRECTED IT. Only the
 * row's `status` moves, confirmed to `retired`; her words, the provenance, the
 * confidence and the date she decided all stay exactly as they were, because
 * the correction IS the history this ledger exists to hold.
 *
 * Leaving the row confirmed was the first build, on the reasoning that not
 * touching it preserved more. It preserved a bug: retire "a log pile" and add
 * it back by hand a month later, and the strip matched the value to the old
 * confirmed row and re-attributed her new answer to a sentence she had already
 * withdrawn, with that sentence's date beside it. A retired row is history; it
 * is not evidence about a fact added afterwards.
 *
 * The mark follows the same linkage the write does — every class sharing the
 * grounds — because that is the set `setWorld` just emptied the value from.
 *
 * IT REPORTS WHETHER IT WORKED. `setWorld` is deliberately silent on a
 * validation failure, and a class holding a value that is no longer in the
 * closed vocabulary would make the whole write a no-op. A control that
 * animates and changes nothing is the failure mode worth spending a read on,
 * so the result is verified against the database before it is claimed.
 */

const retireSchema = z.object({
  classId: z.string().min(1),
  kind: z.enum(WORLD_FACT_KINDS),
  value: z.string().min(1).max(200),
});

export type RetireResult =
  | { ok: true }
  | { ok: false; reason: "not-signed-in" | "not-found" | "not-written" };

async function liveWorld(teacherId: string, classId: string) {
  const row = await prisma.class.findFirst({
    where: { id: classId, teacherId },
    select: {
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
      groundsProfile: { select: groundsPlaceSelect },
    },
  });
  return row ? groundsPlaceForClass(row) : null;
}

/**
 * Mark the confirmed ledger rows behind a value as retired, best-effort.
 *
 * Best-effort on purpose, and the same posture `recordWorldFactDecisions`
 * already takes: the world column is the thing a lesson reads, and it is
 * already written by the time this runs. A ledger write failing costs the
 * provenance of a fact she might add back later; it must never turn a retire
 * that worked into one that reports failure.
 */
async function markLedgerRetired(
  teacherId: string,
  classId: string,
  groundsId: string | null,
  kind: string,
  value: string
): Promise<void> {
  try {
    await prisma.worldFact.updateMany({
      where: {
        classId: { in: await classIdsSharingGrounds(teacherId, classId, groundsId) },
        kind,
        value,
        status: "confirmed",
      },
      data: { status: RETIRED_STATUS },
    });
  } catch {
    // The world is written; the ledger's note about it is not worth a failure.
  }
}

export async function retireRememberedFact(input: {
  classId: string;
  kind: string;
  value: string;
}): Promise<RetireResult> {
  const teacher = await getTeacher();
  if (!teacher) return { ok: false, reason: "not-signed-in" };

  const parsed = retireSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "not-found" };
  const { classId, kind, value } = parsed.data;

  const before = await liveWorld(teacher.id, classId);
  if (!before) return { ok: false, reason: "not-found" };

  const next = {
    classId,
    features:
      kind === "feature"
        ? before.siteFeatures.filter((entry) => entry !== value)
        : before.siteFeatures,
    notes:
      kind === "note" ? before.siteNotes.filter((entry) => entry !== value) : before.siteNotes,
    reach: kind === "reach" && before.reach === value ? null : before.reach,
  };

  await setWorld(next);

  const after = await liveWorld(teacher.id, classId);
  if (!after) return { ok: false, reason: "not-found" };
  const stillThere =
    kind === "feature"
      ? after.siteFeatures.includes(value)
      : kind === "note"
        ? after.siteNotes.includes(value)
        : after.reach === value;
  if (stillThere) return { ok: false, reason: "not-written" };

  // Only after the value is really gone from the world. A ledger marked
  // retired against a write that did not land would describe a correction
  // nobody made.
  await markLedgerRetired(teacher.id, classId, before.id, kind, value);

  // Nothing is revalidated here on purpose. `setWorld` already revalidates the
  // surfaces it has always served, and the strip's own control is a form post
  // that ends in a full navigation, so the primer is re-rendered from scratch
  // rather than patched — there is no cached render of it to invalidate.
  return { ok: true };
}
