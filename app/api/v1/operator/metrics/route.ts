import {
  getOperatorMetrics,
  operatorAccessError,
  operatorError,
  operatorJson,
  parseMetricsWindow,
} from "@/lib/operator-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = operatorAccessError(request);
  if (denied) return denied;

  const query = parseMetricsWindow(request);
  if (!query.ok) return query.response;

  try {
    return operatorJson(await getOperatorMetrics(query.window));
  } catch {
    return operatorError(500, "INTERNAL_ERROR", "Unable to load metrics.");
  }
}
