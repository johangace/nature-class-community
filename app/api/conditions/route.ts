import { requestLocale } from "@/lib/request-locale";
import { getGroundedConditions } from "@/lib/grounding";
import { withinTeacherLimit } from "@/lib/ai/rate-limit";
import { findSession } from "@/lib/pack";

import { getActiveClassLocation, getTeacher } from "@/lib/teacher";

/**
 * The conditions surface the runner reads:
 * `{ line, suggestedCondition }`.
 *
 * `line` is the best grounded sentence available for this place today —
 * model-composed and tied to the session's topic when a signed-in teacher,
 * a session and a key are all present (#126); the deterministic weather-plus-
 * sightings sentence otherwise; null when the read was thin or the API
 * unreachable — the client then keeps the block's authored fallbackText.
 *
 * `suggestedCondition` is the day's wet/dry/windy/cold shape, offered so the
 * runner can seed its variant toggle's default (#145); it decides nothing by
 * itself.
 *
 * A signed-in teacher with a located active class grounds to that school's
 * own coordinates. Signed out (the cold-URL demo), the route returns
 * `{ line: null }` and the client keeps its authored text: there is no place
 * to ground to and this surface cannot name one (#1234). The model is never
 * called either way. Pointmoon and the model key live server-side only.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const [teacher, here] = await Promise.all([getTeacher(), getActiveClassLocation()]);

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  // The run's live line is read ALOUD to a class, so it must agree with every
  // other surface about the scale. Without this it composed in the product's
  // native UK voice regardless of where the school is.
  const locale = await requestLocale(url.searchParams.get("locale") ?? undefined, here);
  const found = sessionId ? findSession(sessionId) : null;

  // getGroundedConditions only ever spends the model when both a signed-in
  // teacher and a session id are present (its own `wantModel` gate) —
  // otherwise this call resolves entirely from the deterministic weather
  // sentence and costs nothing. Mirror that same gate here, so the limiter
  // protects exactly the calls that reach the model and the signed-out demo
  // path (the cold URL, no teacher, no session) stays ungated (office#332).
  if (teacher && found && !(await withinTeacherLimit(teacher.id))) {
    return Response.json(
      { error: "try-again-later" },
      { status: 429, headers: { "cache-control": "private, no-store" } }
    );
  }

  const grounded = await getGroundedConditions({
    lat: here?.lat,
    lng: here?.lng,
    sessionId: found ? found.session.id : undefined,
    topic: found?.session.topic,
    objective: found?.session.objective,
    topicTags: found?.session.topicTags,
    teacher: Boolean(teacher),
    locale,
  });

  return Response.json(grounded, {
    headers: { "cache-control": "private, no-store" },
  });
}
