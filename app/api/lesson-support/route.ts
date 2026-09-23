import { localizeDeep } from "@/lib/localization";
import { parseLessonSupportDraft } from "@/lib/ai/lesson-support-contract";
import { requestLocale } from "@/lib/request-locale";
import { z } from "zod";
import { draftLessonSupport, isModelAvailable } from "@/lib/ai/plate-draft";
import { lessonSupportTasks } from "@/lib/ai/lesson-support-contract";
import { guardAiRoute, privateJson } from "@/lib/ai/api-guard";
import { projectLessonJourney } from "@/lib/lesson/journey";
import { lessonSupportContext } from "@/lib/lesson/support-context";

import { getOutsideNow, isClimateGroup } from "@/lib/outside";
import { findSession } from "@/lib/pack";
import { allPhases } from "@/lib/resolve";
import { placeContextFor, sessionForPlace } from "@/lib/place-context";
import { getActiveClass } from "@/lib/teacher";
import { abilityBands } from "@/schema/pack";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    sessionId: z.string().min(1).max(120),
    task: z.enum(lessonSupportTasks),
    phaseKey: z.string().min(1).max(120).optional(),
    constraint: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine((value) => !/[<>]/.test(value) && !/https?:\/\//i.test(value))
      .optional(),
    ability: z.enum(abilityBands).optional(),
    locale: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

/** One authenticated, closed-context AI boundary for preparation and teaching. */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  const { teacher } = guard;
  if (!isModelAvailable()) return privateJson({ available: false, draft: null });

  let candidate: unknown;
  try {
    candidate = await request.json();
  } catch {
    return privateJson({ error: "invalid-json" }, 400);
  }
  const parsed = requestSchema.safeParse(candidate);
  if (!parsed.success) return privateJson({ error: "invalid-request" }, 400);

  const found = findSession(parsed.data.sessionId);
  if (!found) return privateJson({ error: "session-not-found" }, 404);
  if (
    parsed.data.phaseKey &&
    !allPhases(found.session).some((phase) => phase.key === parsed.data.phaseKey)
  ) {
    return privateJson({ error: "phase-not-found" }, 404);
  }

  const active = await getActiveClass(teacher.id);
  const location =
    active && typeof active.lat === "number" && typeof active.lng === "number"
      ? { lat: active.lat, lng: active.lng }
      : null;
  const locale = await requestLocale(parsed.data.locale, location, active?.englishLocale ?? null);
  // A signed-in but unlocated class must not inherit the public London demo
  // patch and hear it described as local to their own grounds.
  const outside = location
    ? await getOutsideNow({
        lat: location.lat,
        lng: location.lng,
        climate:
          typeof active?.climate === "string" && isClimateGroup(active.climate)
            ? active.climate
            : null,
        topicTags: found.session.topicTags,
        limit: 4,
        locale,
      }).catch(() => null)
    : null;
  // The assistant grounds on the session this school actually teaches, not on
  // London's. It does not read block text today, but grounding a model on an
  // instruction that is false where the class is standing is the invented-nature
  // hazard arriving by the back door, and the fix is one call (#207, #265).
  const placed = await sessionForPlace(
    found.session,
    placeContextFor({
      lat: active?.lat ?? null,
      lng: active?.lng ?? null,
      climate: active?.climate ?? null,
    })
  );
  const journey = projectLessonJourney(found.pack, placed);
  const context = lessonSupportContext({
    journey,
    session: placed,
    outside,
    phaseKey: parsed.data.phaseKey,
    ability: parsed.data.ability,
    classBand: active?.yearGroup,
  });

  const draft = await draftLessonSupport({
    task: parsed.data.task,
    context,
    constraint: parsed.data.constraint,
  });
  const names = [
    ...(outside?.sightings ?? []).map((sighting) => sighting.name),
    ...(outside?.usuallyAround ?? []).map((species) => species.name),
  ];
  // Re-validate the final displayed result: vocabulary changes can increase length.
  const localized = draft ? parseLessonSupportDraft(localizeDeep(draft, locale, names)) : null;
  return privateJson({ available: true, draft: localized });
}
