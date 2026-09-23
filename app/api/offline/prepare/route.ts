import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isPreparedOfflineApiEnabled } from "@/lib/offline/prepared-feature";
import { prepareFieldOverlayForSession } from "@/lib/offline/prepare-server";
import {
  PREPARED_OVERLAY_FEATURES_HEADER,
  parsePreparedOverlayFeatures,
} from "@/lib/offline/prepared-contracts";

const requestSchema = z
  .object({
    sessionId: z.string().min(1).max(160),
    coreFingerprint: z.string().min(8).max(128),
  })
  .strict();

/**
 * Prepare one private field overlay. Ownership comes only from the httpOnly
 * Better Auth session and the server-owned active class. The browser may name
 * curriculum and the public core fingerprint; it may never choose a class.
 */
export async function POST(request: Request) {
  if (!isPreparedOfflineApiEnabled()) {
    return NextResponse.json(
      { error: "PREPARED_OFFLINE_DISABLED" },
      { status: 404, headers: { "cache-control": "private, no-store" } },
    );
  }
  const authSession = await auth.api.getSession({ headers: request.headers });
  if (!authSession) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  try {
    const prepared = await prepareFieldOverlayForSession({
      authSession,
      sessionId: parsed.data.sessionId,
      coreFingerprint: parsed.data.coreFingerprint,
      // A header, not a body field: this schema is `.strict()`, so a body key
      // would 400 on the previous deployment after a rollback (#1266).
      overlayFeatures: parsePreparedOverlayFeatures(
        request.headers.get(PREPARED_OVERLAY_FEATURES_HEADER),
      ),
    });
    return NextResponse.json(prepared, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "PREPARE_FAILED";
    const status =
      code === "NO_ACTIVE_CLASS"
        ? 403
        : code === "CORE_MISMATCH"
          ? 409
          : code === "UNKNOWN_SESSION"
            ? 404
            : 503;
    return NextResponse.json({ error: code }, { status });
  }
}
