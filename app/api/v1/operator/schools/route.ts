import {
  listOperatorSchools,
  operatorAccessError,
  operatorError,
  operatorJson,
} from "@/lib/operator-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = operatorAccessError(request);
  if (denied) return denied;

  try {
    return operatorJson(await listOperatorSchools());
  } catch {
    return operatorError(500, "INTERNAL_ERROR", "Unable to load schools.");
  }
}
