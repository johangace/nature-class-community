import {
  getSchoolPulse,
  operatorAccessError,
  operatorError,
  operatorJson,
  parseSchoolPulseQuery,
} from "@/lib/operator-api";

export const dynamic = "force-dynamic";

/**
 * One school's pulse, by its exact entered label, for a 7d or 30d window.
 * Aggregates only, suppressed below the small-group threshold unless the
 * caller asks for `audience=school-lead` (the school's own lead). This is the
 * "second contract" the school administration console reads; it carries no
 * name, coordinate or free text, so it sits in the public protocol.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = operatorAccessError(request);
  if (denied) return denied;

  const query = parseSchoolPulseQuery(request);
  if (!query.ok) return query.response;

  try {
    return operatorJson(await getSchoolPulse(query.school, query.window, new Date(), query.audience));
  } catch {
    return operatorError(500, "INTERNAL_ERROR", "Unable to load the school pulse.");
  }
}
