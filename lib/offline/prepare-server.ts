import { LOCALIZATION_REVISION } from "@/lib/localization";
import { resolveLocale } from "@/lib/location-locale";
import "server-only";

import { canonicalSessionId } from "@/lib/pack";
import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import {
  composePreparedFieldOverlay,
  createOfflineOwnerLease,
} from "@/lib/offline/prepare";
import { getActiveClass } from "@/lib/teacher";
import { groupNoun } from "@/lib/group-profile";
import type { PreparedOverlayFeature } from "@/lib/offline/prepared-contracts";
import { activePlaceContext, sessionForPlace } from "@/lib/place-context";
import { localizeDeep } from "@/lib/localization";
import { asHabitatTags } from "@/lib/outside/grounds";
import { hazardsForClass } from "@/lib/lesson/class-hazards";
import { getOutsideNow } from "@/lib/outside";
import { primaryTopicOf } from "@/lib/lesson/door";
import { spokenAudioForSession } from "@/lib/lesson/spoken-audio";

export type OfflinePrepareErrorCode =
  | "NO_ACTIVE_CLASS"
  | "CORE_MISMATCH"
  | "UNKNOWN_SESSION"
  | "PREPARE_FAILED";

export class OfflinePrepareError extends Error {
  constructor(public readonly code: OfflinePrepareErrorCode) {
    super(code);
  }
}

type AuthSessionForOffline = {
  user: { id: string };
  session: { id: string; expiresAt: Date | string };
};

/**
 * Resolve one prepared field lesson from server-owned identity and curriculum.
 * The input deliberately has no class id, coordinates, year group, or locale:
 * those values are selected behind the authenticated boundary and only their
 * reviewed derived outputs may enter the returned overlay.
 */
export async function prepareFieldOverlayForSession(input: {
  authSession: AuthSessionForOffline;
  sessionId: string;
  coreFingerprint: string;
  overlayFeatures?: readonly PreparedOverlayFeature[];
}) {
  const core = buildCoreLessonRelease();
  if (input.coreFingerprint !== core.contentFingerprint) {
    throw new OfflinePrepareError("CORE_MISMATCH");
  }

  const sessionId = canonicalSessionId(input.sessionId);
  const coreSession = core.sessions[sessionId];
  if (!coreSession) {
    // This is also the premium/held-content boundary: if it is not in the
    // released open-core artifact, the public preparation endpoint cannot see
    // it, even when the full server catalogue can.
    throw new OfflinePrepareError("UNKNOWN_SESSION");
  }

  const active = await getActiveClass(input.authSession.user.id);
  if (!active) throw new OfflinePrepareError("NO_ACTIVE_CLASS");

  const preparedAt = new Date();
  const expiresAt = new Date(input.authSession.session.expiresAt);
  const lease = createOfflineOwnerLease({
    teacherId: input.authSession.user.id,
    classId: active.id,
    contentRevision: `${LOCALIZATION_REVISION}:${resolveLocale(active.englishLocale ?? undefined, active)}`,
    authSessionId: input.authSession.session.id,
    issuedAt: preparedAt,
    expiresAt,
  });

  const locale = resolveLocale(
    active.englishLocale ?? undefined,
    typeof active.lat === "number" && typeof active.lng === "number"
      ? { lat: active.lat, lng: active.lng }
      : null,
  );
  const place = await activePlaceContext();
  const session = localizeDeep(await sessionForPlace(coreSession, place), locale);
  const reachableTags = asHabitatTags(place.lookFor?.reachable ?? []);
  const reachable = reachableTags.length > 0 ? reachableTags : undefined;
  const [hazards, outside] = await Promise.all([
    hazardsForClass({
      pack: place.pack,
      habitats: reachableTags,
      lat: active.lat,
      lng: active.lng,
    }),
    getOutsideNow({
      lat: active.lat,
      lng: active.lng,
      habitats: reachable,
      topicTags: session.topicTags,
      primaryTopic: primaryTopicOf(session),
      limit: 0,
      locale,
    }).catch(() => null),
  ]);

  const overlay = composePreparedFieldOverlay({
    lease,
    coreFingerprint: core.contentFingerprint,
    session,
    hazards,
    spokenAudio: spokenAudioForSession(session),
    conditionsMeta: outside?.conditions.meta ?? null,
    conditionsSource: "Pointmoon",
    // The active class record is the only place the audience is stored, and
    // this is the last point that can read it: the field runner has no server
    // read at all (#1266). Emitted only to a caller that said it can parse the
    // key, because this response is parsed by whatever JavaScript the tab is
    // already running (PREPARED_OVERLAY_FEATURES).
    ...(input.overlayFeatures?.includes("group-noun")
      ? { groupNoun: groupNoun(active.groupType) }
      : {}),
    preparedAt,
  });

  return { lease, overlay };
}
