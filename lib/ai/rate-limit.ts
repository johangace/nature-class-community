import { prisma } from "@/lib/db";

/**
 * The one shared AI rate-limit gate, cross-instance (office#332).
 *
 * The gate this replaces was a module-level `Map<string, number[]>` sitting
 * in app/api/lesson-support/route.ts. That works within one process, but each
 * serverless instance holds its own memory: under any fan-out the effective
 * ceiling was 12 x however many instances happened to be warm, and a caller
 * who retried hard would simply be spread across them. It also protected
 * exactly one route — /api/conditions called the model with no gate of any
 * kind.
 *
 * This reads and writes one Postgres row per teacher (AiRateLimit), inside a
 * transaction that holds a row lock (`SELECT ... FOR UPDATE`) for the
 * duration of the check. Two requests from the same teacher, whether they
 * land on the same instance or two different ones, serialize on that lock
 * rather than both reading the same stale attempt list and both slipping
 * under the ceiling. Same sliding-window semantics as the old Map: only
 * attempts inside the last 60 seconds count, up to 12 of them.
 *
 * Every AI-calling route shares this one function. A route that calls the
 * model without going through it is exactly the bug this ticket fixes.
 */

const WINDOW_MS = 60_000;
/**
 * Raised from 12 with #378: a teacher mid-lesson can now take photographs
 * (species ID, the onboarding camera) alongside her helper taps, and three
 * photos plus a few taps against a 12-ceiling produced a 429 that surfaced as
 * "help is quiet just now" — a limit dressed as a breakage. Twenty in a
 * minute still costs under a cent and still stops a runaway loop.
 */
const MAX_ATTEMPTS = 20;

export async function withinTeacherLimit(
  teacherId: string,
  now: number = Date.now()
): Promise<boolean> {
  const windowStart = new Date(now - WINDOW_MS);
  const nowDate = new Date(now);

  return prisma.$transaction(async (tx) => {
    // Guarantee the row exists before locking it: a `SELECT ... FOR UPDATE`
    // against a row that isn't there yet locks nothing, so the very first
    // call for a teacher would race. This upsert is safe to run concurrently
    // — Postgres serializes two inserts racing on the same primary key — and
    // it never resets an existing row's attempts.
    await tx.$executeRaw`
      INSERT INTO "ai_rate_limit" ("teacherId", "attempts", "updatedAt")
      VALUES (${teacherId}, ARRAY[]::timestamp(3)[], now())
      ON CONFLICT ("teacherId") DO NOTHING
    `;

    const rows = await tx.$queryRaw<{ attempts: Date[] }[]>`
      SELECT "attempts" FROM "ai_rate_limit" WHERE "teacherId" = ${teacherId} FOR UPDATE
    `;
    const existing = rows[0]?.attempts ?? [];
    const recent = existing.filter((at) => at.getTime() > windowStart.getTime());

    if (recent.length >= MAX_ATTEMPTS) {
      // Still write the pruned list back, so a teacher who stops calling for
      // a while doesn't leave a growing, all-stale array behind.
      await tx.aiRateLimit.update({
        where: { teacherId },
        data: { attempts: recent },
      });
      return false;
    }

    await tx.aiRateLimit.update({
      where: { teacherId },
      data: { attempts: [...recent, nowDate] },
    });
    return true;
  });
}
