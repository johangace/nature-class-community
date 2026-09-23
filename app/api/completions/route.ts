import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  classMinutesOutside,
  completionMinutes,
  sessionMinutes,
} from "@/lib/teacher";
import { canonicalSessionId } from "@/lib/pack";
import {
  happeningKeys,
  moodKeys,
  moreOfKeys,
  timingKeys,
} from "@/lib/reflection";
import { NOTE_MAX, normaliseNote } from "@/lib/reflection-note";
import { recordLessonCompleted, reportAfterResponse } from "@/lib/analytics/server";
import { teacherInviteCohort } from "@/lib/invite-cohort";

/**
 * Log a led session. The runner posts here when the teacher taps "Log this
 * session" on the finish page (or when its offline queue drains). The record
 * is teacher-reported only — session id, class, timestamps, an optional headcount, and
 * the close's tap-only reflection — zero child PII by construction: there is
 * no field a child's name could even go in.
 *
 * The four TAP fields are closed vocabularies, not strings. Every accepted
 * token is enumerated in lib/reflection.ts, which is also what renders the
 * buttons, so the client and this validator cannot drift apart. Anything else
 * is a 400.
 *
 * `note` is the exception and the only open field (#347): "anything else?", in
 * the teacher's own words, bounded and trimmed by lib/reflection-note.ts. An
 * over-long note is refused rather than truncated, because silently dropping
 * the end of someone's sentence is worse than saying no.
 *
 * Trust boundaries: the session cookie names the teacher; the classId is
 * joined back to that teacher before anything is written; the sessionId must
 * exist on the shelf. Timestamps come from the runner's honest clock but are
 * clamped server-side so a tab left open for a week can't poison the tally.
 *
 * Idempotency: the runner sends a `clientKey` (one per logged completion,
 * stable across its offline retries). We upsert on it, so a completion that
 * committed on the server but whose response the client never received is
 * re-sent to the SAME row rather than counted twice — protecting the
 * minutes-outside north-star metric. `clientKey` is optional for older clients;
 * without one we fall back to a plain create.
 */

/**
 * A value that must be one of a closed vocabulary. The lists live in
 * lib/reflection.ts so the buttons and this validator read the same source;
 * anything not on the list is rejected rather than stored.
 */
const oneOf = (values: string[]) =>
  z.string().refine((value) => values.includes(value), {
    message: "not an accepted value",
  });

const bodySchema = z
  .object({
    sessionId: z.string().min(1),
    classId: z.string().min(1),
    startedAt: z.number().int().positive(),
    endedAt: z.number().int().positive(),
    headcount: z.number().int().min(1).max(40).optional(),
    // moodKeys carries the retired three words as well as the current five, so
    // a completion queued on an iPad before this shipped still drains cleanly.
    mood: oneOf(moodKeys).optional(),
    happenings: z.array(oneOf(happeningKeys)).max(happeningKeys.length).optional(),
    timing: oneOf(timingKeys).optional(),
    moreOf: oneOf(moreOfKeys).optional(),
    // Bounded generously and measured after trimming, matching the store.
    note: z.string().max(NOTE_MAX * 2).optional(),
    clientKey: z.string().min(8).max(64).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const body = parsed.data;

  const owned = await prisma.class.findFirst({
    where: { id: body.classId, teacherId: session.user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "not your class" }, { status: 403 });
  }

  // An iPad that queued a completion offline can still be holding a session id
  // that has since been renamed (#468). It gets accepted under the id it had,
  // and is stored under the id the session has now, so the tally and the
  // journal do not fork into two lessons.
  const sessionId = canonicalSessionId(body.sessionId);
  const plannedMin = sessionMinutes().get(sessionId);
  if (plannedMin === undefined) {
    return NextResponse.json({ error: "unknown session" }, { status: 400 });
  }

  // Clamp the reported window to something a real lesson can be: start no
  // earlier than 12 hours before the end, end no later than now (+ a minute
  // of clock skew).
  const now = Date.now();
  const endedAt = Math.min(body.endedAt, now + 60_000);
  const startedAt = Math.max(body.startedAt, endedAt - 12 * 60 * 60 * 1000);
  if (startedAt > endedAt) {
    return NextResponse.json({ error: "bad window" }, { status: 400 });
  }

  // Refuse rather than truncate: she should know her words did not all fit.
  const note = normaliseNote(body.note) ?? null;
  if (note !== null && note.length > NOTE_MAX) {
    return NextResponse.json({ error: "note too long" }, { status: 400 });
  }

  const data = {
    sessionId,
    classId: owned.id,
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    headcount: body.headcount ?? null,
    mood: body.mood ?? null,
    // Deduplicated: a double-tapped chip is one answer, not two.
    happenings: [...new Set(body.happenings ?? [])],
    timing: body.timing ?? null,
    moreOf: body.moreOf ?? null,
    note,
  };

  // Was this completion already on record? The upsert below cannot say, and
  // analytics needs to know: an offline iPad may replay the same completion
  // for days, and counting each replay would inflate the one number this
  // product exists to move. Minutes-outside is already safe from that — the
  // write is idempotent — so this lookup exists purely so the chart is too.
  const alreadyLogged = body.clientKey
    ? (await prisma.sessionCompletion.findUnique({
        where: { clientKey: body.clientKey },
        select: { id: true },
      })) !== null
    : false;

  if (body.clientKey) {
    // Idempotent write: a retry of an already-committed completion lands on the
    // same row (empty update), so minutes-outside is never double-counted.
    await prisma.sessionCompletion.upsert({
      where: { clientKey: body.clientKey },
      create: { ...data, clientKey: body.clientKey },
      update: {},
    });
  } else {
    // Older client without a key: fall back to a plain create.
    await prisma.sessionCompletion.create({ data });
  }

  // What this session actually added, by the same rule the class total is
  // summed with. A blank headcount contributes no invented child-minutes; the
  // session and reflection are still recorded honestly.
  const minutesAdded = completionMinutes(data, plannedMin);

  // A lesson was taught. Reported from here rather than the browser because
  // school networks filter analytics endpoints and this is the number that
  // must not read low by an unknown amount (lib/analytics/server.ts). `after`
  // keeps it off the teacher's finish screen: she waits on the tally, never on
  // our telemetry.
  if (!alreadyLogged) {
    const teacherId = session.user.id;
    reportAfterResponse(
      // The cohort is read here, after the response, so the teacher's tally
      // never waits on it. teacherInviteCohort never throws.
      teacherInviteCohort(teacherId).then((inviteCohort) =>
        recordLessonCompleted({
          teacherId,
          lessonId: sessionId,
          startedAt: data.startedAt,
          endedAt: data.endedAt,
          headcount: data.headcount,
          inviteCohort,
        })
      )
    );
  }

  const tally = await classMinutesOutside(owned.id);
  return NextResponse.json({
    minutesAdded,
    totalMinutes: tally.minutes,
    sessionsLed: tally.sessionsLed,
  });
}
