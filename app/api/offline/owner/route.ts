import { resolveLocale } from "@/lib/location-locale";
import { LOCALIZATION_REVISION } from "@/lib/localization";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOfflineOwnerLease } from "@/lib/offline/prepare";
import { isPreparedOfflineApiEnabled } from "@/lib/offline/prepared-feature";
import { getActiveClass } from "@/lib/teacher";

const NO_STORE = { "cache-control": "private, no-store" };

/**
 * Refresh the opaque local owner proof from the live authenticated account.
 * The field shell uses this before reading private device state whenever the
 * network is available, so sign-out purge is defence in depth rather than the
 * only boundary between two teachers on one iPad.
 */
export async function GET(request: Request) {
  if (!isPreparedOfflineApiEnabled()) {
    return NextResponse.json(
      { error: "PREPARED_OFFLINE_DISABLED" },
      { status: 404, headers: NO_STORE },
    );
  }
  const authSession = await auth.api.getSession({ headers: request.headers });
  if (!authSession) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401, headers: NO_STORE });
  }

  const active = await getActiveClass(authSession.user.id);
  if (!active) {
    return NextResponse.json({ error: "NO_ACTIVE_CLASS" }, { status: 403, headers: NO_STORE });
  }

  const issuedAt = new Date();
  const lease = createOfflineOwnerLease({
    teacherId: authSession.user.id,
    classId: active.id,
    contentRevision: `${LOCALIZATION_REVISION}:${resolveLocale(active.englishLocale ?? undefined, active)}`,
    authSessionId: authSession.session.id,
    issuedAt,
    expiresAt: new Date(authSession.session.expiresAt),
  });

  return NextResponse.json({ lease }, { headers: NO_STORE });
}
