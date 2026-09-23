import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchFieldTruthArchivePayload } from "@/lib/outside/pointmoon";

/**
 * The nightly recording job: one Pointmoon read per active class location,
 * stored verbatim. The replay corpus (#172 workstream A, approved P0).
 *
 * WHY THIS EXISTS. Every rule the cast resolver applies is a judgement about a
 * payload — which species recurs, which is findable, which is strikingly
 * absent. Tuning those rules against whatever the API returns at the moment
 * someone happens to look is how a product gets calibrated on anecdote. The
 * corpus is what makes the alternative possible: replay the rule against the
 * nights that actually happened. It cannot be backfilled, which is why it is
 * built before the surfaces that will need it rather than after.
 *
 * WHAT IT STORES. The response as returned, not a distillation. A field nobody
 * reads today is exactly the field a future rule will want, and it is gone by
 * morning if it was not kept. Pointmoon's own schemaVersion travels with each
 * row so a corpus spanning a contract change stays readable.
 *
 * FAILURES ARE RECORDED. A read that fails writes a row with a null payload and
 * a reason. Silence is data: a location that goes quiet for a week is a finding
 * about coverage (exactly the Berkeley coverage cliff on #167), and a corpus
 * that kept only successes could never show it.
 *
 * DEDUPED BY LOCATION. Two classes at the same school share one fetch, and each
 * gets its own row pointing at the same reading — so the corpus stays per-class
 * (which is how it will be replayed) without hammering Pointmoon per class.
 *
 * AUTH. The caller sends a bearer token equal to CRON_SECRET; this route
 * requires it. Without the secret set the route refuses to run at all rather
 * than defaulting open, so an unprotected deployment records nothing instead of
 * exposing a fetch loop anyone can trigger.
 *
 * No UI reads this. No child data is anywhere near it: a class id, the school's
 * own coordinates, and what Pointmoon said about the wildlife near them.
 */

export const dynamic = "force-dynamic";
/** The sweep is a loop of network reads; give it room past the default. */
export const maxDuration = 300;

/** Coordinates keyed the same way the Pointmoon cache keys them (~100m). */
function locationKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means no job. Refusing is the safe default; running
  // openly is not.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Active means a class with somewhere to read. A class with no coordinates
  // has no location to record, and recording the demo default against it would
  // put a fact about London in a corpus row belonging to a school elsewhere.
  const classes = await prisma.class.findMany({
    where: { lat: { not: null }, lng: { not: null } },
    select: { id: true, lat: true, lng: true },
  });

  // One fetch per distinct location, shared by every class standing on it.
  const byLocation = new Map<string, { lat: number; lng: number; classIds: string[] }>();
  for (const klass of classes) {
    const { lat, lng } = klass;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const key = locationKey(lat, lng);
    const existing = byLocation.get(key);
    if (existing) existing.classIds.push(klass.id);
    else byLocation.set(key, { lat, lng, classIds: [klass.id] });
  }

  const takenAt = new Date();
  let recorded = 0;
  let failed = 0;

  for (const { lat, lng, classIds } of byLocation.values()) {
    let payload: unknown = null;
    let failureReason: string | null = null;

    try {
      payload = await fetchFieldTruthArchivePayload({ lat, lng });
      // The archive transport resolves null for an unreachable response.
      // That is a recordable outcome, not an error to swallow.
      if (payload === null) failureReason = "no facts returned";
    } catch (error) {
      payload = null;
      failureReason = error instanceof Error ? error.message.slice(0, 200) : "fetch failed";
    }

    const schemaVersion =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? ((payload as { schemaVersion?: unknown }).schemaVersion ?? null)
        : null;

    try {
      await prisma.pointmoonRead.createMany({
        data: classIds.map((classId) => ({
          classId,
          lat,
          lng,
          // Prisma writes JSON null rather than SQL NULL for a Json field given
          // `null`; passing undefined leaves the nullable column genuinely NULL,
          // which is what "this read failed" means in the corpus.
          payload: payload === null ? undefined : (payload as object),
          schemaVersion: typeof schemaVersion === "string" ? schemaVersion : null,
          failureReason,
          takenAt,
        })),
      });
      if (failureReason) failed += classIds.length;
      else recorded += classIds.length;
    } catch {
      // A row that cannot be written is the one failure the corpus cannot
      // record about itself. Keep sweeping: one bad write must not cost the
      // night's other locations.
      failed += classIds.length;
    }
  }

  return NextResponse.json(
    {
      locations: byLocation.size,
      classes: classes.length,
      recorded,
      failed,
      takenAt: takenAt.toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
