import {
  operatorAccessError,
  operatorError,
  operatorJson,
} from "@/lib/operator-api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = operatorAccessError(request);
  if (denied) return denied;

  try {
    await prisma.user.findFirst({ select: { id: true } });
    return operatorJson({
      data: {
        revision:
          process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local",
        db: "ok",
      },
    });
  } catch {
    return operatorError(
      503,
      "DATABASE_UNAVAILABLE",
      "Database unavailable."
    );
  }
}
