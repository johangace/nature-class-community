import {
  listOperatorUsers,
  operatorAccessError,
  operatorError,
  operatorJson,
  parseUsersQuery,
} from "@/lib/operator-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = operatorAccessError(request);
  if (denied) return denied;

  const query = parseUsersQuery(request);
  if (!query.ok) return query.response;

  try {
    return operatorJson(await listOperatorUsers(query));
  } catch {
    return operatorError(500, "INTERNAL_ERROR", "Unable to load users.");
  }
}
