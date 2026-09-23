import { getTeacher, type Teacher } from "@/lib/teacher";
import { withinTeacherLimit } from "./rate-limit";

/**
 * The one shared AI-route boundary, factored out of `/api/lesson-support`
 * (#280) so a second AI-calling route can reuse it exactly rather than
 * reopening a second door with its own, slightly different, checks.
 *
 * Every route that calls the model runs this first: cross-site blocked,
 * JSON-only, signed-in only, and rate-limited per teacher through the same
 * cross-instance Postgres gate every AI route already shares
 * (`withinTeacherLimit`, office#332). A route that calls the model without
 * going through this is exactly the bug office#332 fixed once already.
 */

/** Every AI response is `private, no-store` — never cached, never shared. */
export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export type AiRouteGuard =
  | { ok: true; teacher: Teacher }
  | { ok: false; response: Response };

export async function guardAiRoute(request: Request): Promise<AiRouteGuard> {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return { ok: false, response: privateJson({ error: "forbidden" }, 403) };
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: privateJson({ error: "invalid-content-type" }, 415) };
  }

  const teacher = await getTeacher();
  if (!teacher) return { ok: false, response: privateJson({ error: "sign-in-required" }, 401) };
  if (!(await withinTeacherLimit(teacher.id))) {
    return { ok: false, response: privateJson({ error: "try-again-later" }, 429) };
  }

  return { ok: true, teacher };
}
