import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reflectionPatchSchema } from "@/lib/reflection-schema";
import { NOTE_MAX, normaliseNote } from "@/lib/reflection-note";

/**
 * Write a reflection onto a session already logged (#327).
 *
 * The runner asks the four reflection questions once, at the finish, standing
 * outside with a class waiting to go in. Skip them there and they were gone:
 * the fellowship's evidence taps were only ever collected at the worst moment
 * to answer them. The journal can now ask again, later, indoors — this is the
 * route it writes through.
 *
 * WHAT THIS CAN CHANGE, and nothing else: mood, happenings, timing, moreOf,
 * and the free-text note. The five reflection columns. It cannot touch `headcount`, `startedAt`,
 * `endedAt`, `sessionId` or `classId`, so no amount of journal editing can
 * move child-minutes-outside — the north-star number stays a property of what
 * the runner recorded on the day, and the journal stays a record rather than a
 * lever. That is enforced by the field list of `data` below, not by intent:
 * the body schema is `.strict()`, so a payload carrying a headcount is a 400.
 *
 * THE TAPS STAY CLOSED. Every tapped value is a token from the same
 * vocabularies in lib/reflection.ts that the POST validates against and the
 * buttons render from — the schema (lib/reflection-schema.ts) reads those same
 * lists rather than declaring its own, so the two write paths cannot drift.
 * Those four are what the term summary counts, and counting needs fixed words.
 *
 * `note` is the one open field (#347), and it is open on purpose. It is never
 * counted or aggregated; lib/journal.ts does not read it. It is bounded and
 * trimmed by the same lib/reflection-note.ts the finish uses, so a note
 * written here and one written outdoors are stored identically.
 *
 * REPLACE, NOT MERGE. The journal's form is prefilled with what is stored and
 * sends its whole state, so an omitted field means "the teacher cleared this",
 * not "leave it alone". Send all four, or send fewer and the missing ones are
 * cleared — either way what is stored afterwards is exactly what the teacher
 * was looking at when she saved. A merge would make un-tapping impossible.
 *
 * Trust boundary: the session cookie names the teacher, and the completion is
 * joined back to that teacher through its class before anything is written. A
 * completion belonging to someone else answers 404, not 403 — a stranger's
 * completion id should not be confirmed to exist.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const parsed = reflectionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const body = parsed.data;

  // Ownership: the completion's class must belong to the signed-in teacher.
  // Refuse rather than truncate, exactly as the finish does.
  const note = normaliseNote(body.note) ?? null;
  if (note !== null && note.length > NOTE_MAX) {
    return NextResponse.json({ error: "note too long" }, { status: 400 });
  }

  const owned = await prisma.sessionCompletion.findFirst({
    where: { id, class: { teacherId: session.user.id } },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "no such session" }, { status: 404 });
  }

  const updated = await prisma.sessionCompletion.update({
    where: { id: owned.id },
    data: {
      mood: body.mood ?? null,
      // Deduplicated, like the POST: a double-tapped chip is one answer.
      happenings: [...new Set(body.happenings ?? [])],
      timing: body.timing ?? null,
      moreOf: body.moreOf ?? null,
      note,
    },
    select: {
      mood: true,
      happenings: true,
      timing: true,
      moreOf: true,
      note: true,
    },
  });

  return NextResponse.json(updated);
}
