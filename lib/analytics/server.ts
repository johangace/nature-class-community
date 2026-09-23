import { after } from "next/server";
import { PostHog } from "posthog-node";

import {
  ANALYTICS_EVENTS,
  sanitiseProperties,
  teacherDistinctId,
} from "./events";

/**
 * The one event this product cannot afford to lose, sent from the server.
 *
 * WHY NOT FROM THE BROWSER, LIKE THE REST
 *
 * "A teacher took a class outside and logged it" is the number Nature Class
 * exists to move, and it is the number a browser is worst at reporting. School
 * networks filter aggressively, managed iPads carry content blockers a teacher
 * cannot see or disable, and analytics endpoints are among the first things
 * such filtering takes out. A completion recorded in our own database but
 * missing from the chart is not a small discrepancy — it is the headline
 * metric reading low by an unknown amount, which is worse than reading nothing,
 * because a number that is quietly wrong still gets acted on.
 *
 * The server has no such problem. It already receives every completion,
 * including the ones that sat in the device's offline queue for a day, and it
 * knows which teacher sent it. So the completion is reported from where the
 * write happens.
 *
 * `lesson_run_started` stays on the client, because only the browser knows the
 * teacher tapped forward. That asymmetry is deliberate and worth remembering
 * when reading the funnel: the top is best-effort, the bottom is not.
 *
 * SAME ALLOWLIST, DELIBERATELY
 *
 * This imports `sanitiseProperties` from events.ts rather than assembling its
 * own payload. A second surface with its own idea of what may be sent is how
 * an allowlist stops being one, and the server is the surface with the most to
 * leak: it is holding the teacher's note, her reflection taps and her class's
 * name at the moment it reports.
 *
 * SERVERLESS FLUSHING
 *
 * posthog-node batches, and a serverless function is frozen the instant it
 * responds — a captured-but-unflushed event simply disappears. Every call here
 * therefore shuts the client down and awaits it, and callers run this inside
 * `after()` so the teacher's finish screen never waits on our telemetry.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

/** How long a completion may lag before we call it a drained offline queue. */
const QUEUED_AFTER_MS = 5 * 60 * 1000;

export interface CompletedLesson {
  teacherId: string;
  lessonId: string;
  startedAt: Date;
  endedAt: Date;
  headcount: number | null;
  /** The teacher's invited cohort code (#821), or null for an organic sign-up. */
  inviteCohort?: string | null;
}

/**
 * Report one accepted completion. Never throws, never blocks: a class is
 * finishing a lesson and an analytics failure is not permitted to be their
 * problem, or the teacher's.
 *
 * Callers must only invoke this for a completion that was actually recorded
 * for the first time. The write is idempotent by `clientKey` so an offline
 * device may replay the same completion for days; firing on every replay would
 * inflate the one number this exists to protect.
 */
export async function recordLessonCompleted(lesson: CompletedLesson): Promise<void> {
  if (!KEY || !HOST) return;

  const properties = sanitiseProperties(ANALYTICS_EVENTS.LESSON_RUN_COMPLETED, {
    lesson_id: lesson.lessonId,
    duration_minutes: Math.max(
      0,
      Math.round((lesson.endedAt.getTime() - lesson.startedAt.getTime()) / 60_000)
    ),
    ...(lesson.headcount === null ? {} : { headcount: lesson.headcount }),
    // Derived from arrival lag rather than trusted from the client: the device
    // that queued this is the one whose clock and connection we are unsure of.
    from_queue: Date.now() - lesson.endedAt.getTime() > QUEUED_AFTER_MS,
    ...(lesson.inviteCohort ? { invite_cohort: lesson.inviteCohort } : {}),
  });
  if (!properties) return;

  const client = new PostHog(KEY, { host: HOST, flushAt: 1, flushInterval: 0 });
  try {
    client.capture({
      distinctId: teacherDistinctId(lesson.teacherId),
      event: ANALYTICS_EVENTS.LESSON_RUN_COMPLETED,
      properties,
    });
    await client.shutdown();
  } catch {
    // Deliberately silent, and deliberately not retried.
  }
}

/**
 * Run the report after the response, and never at the response's expense.
 *
 * `after` is the right tool — it keeps the work off the teacher's finish
 * screen and keeps the function alive long enough to flush — but it throws
 * outside a request scope. That is not a theoretical edge: it is what happens
 * the moment a unit test calls the route handler directly, and it would have
 * turned a logged lesson into a 500 for the teacher who logged it.
 *
 * So the fallback is a plain fire-and-forget. In a serverless runtime that may
 * not survive the freeze and the event may be lost, which is the correct thing
 * to trade: an analytics event is worth less than a teacher's completion, every
 * time.
 */
export function reportAfterResponse(work: Promise<void>): void {
  const swallow = () => {};
  try {
    after(work.catch(swallow));
  } catch {
    void work.catch(swallow);
  }
}
