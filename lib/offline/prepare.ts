import "server-only";

import { createHash } from "node:crypto";
import type { Session } from "@/schema/pack";
import type { LessonHazards } from "@/lib/lesson/hazards";
import type { SpokenAudio } from "@/lib/lesson/spoken-audio";
import type { GroupNoun } from "@/lib/group-profile";
import type {
  OfflineOwnerLeaseV1,
  PreparedFieldOverlayV1,
} from "@/lib/offline/prepared-contracts";

export type {
  OfflineOwnerLeaseV1,
  PreparedFieldOverlayV1,
  PreparedFieldResourceV1,
} from "@/lib/offline/prepared-contracts";

const OVERLAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function opaqueId(prefix: "ofs" | "ofl", value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

/**
 * An offline lease prevents one account on a shared iPad from reading the
 * previous account's prepared field data. It is deliberately an opaque,
 * one-way projection: no email, teacher id, class id, or human name travels to
 * the browser. Equality plus expiry is the local boundary; sign-out purge is
 * defence in depth.
 */
export function createOfflineOwnerLease(input: {
  contentRevision?: string;
  teacherId: string;
  classId: string;
  authSessionId: string;
  issuedAt: Date;
  expiresAt: Date;
}): OfflineOwnerLeaseV1 {
  if (
    !input.teacherId ||
    !input.classId ||
    !input.authSessionId ||
    !Number.isFinite(input.issuedAt.getTime()) ||
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt <= input.issuedAt
  ) {
    throw new Error("A valid signed-in owner lease is required");
  }

  const ownerScope = opaqueId(
    "ofs",
    `nature-class:offline-owner:v1:${input.teacherId}:${input.classId}`,
  );
  return {
    version: 1,
    ownerScope,
    leaseId: opaqueId(
      "ofl",
      `nature-class:offline-lease:v1:${input.authSessionId}:${ownerScope}`,
    ),
    ...(input.contentRevision ? { contentRevision: input.contentRevision } : {}),
    issuedAt: input.issuedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
  };
}

/**
 * Seal the private half of one field lesson. This function receives already
 * resolved, reviewed values and intentionally has no slots for class, school,
 * ability, coordinates, teacher notes, child data, or raw provider payloads.
 * The authored conditions blocks stay inside `session`; the downloaded
 * instrument row is a timestamped receipt beside them, never a replacement.
 *
 * `groupNoun` is the one audience value that travels, and it is a word rather
 * than a record: "class" | "family" | "group", the same three-value projection
 * of `groupType` that `/world`, `/account`, `/classes` and the online runner
 * already render. It names nobody — a class id, school name or group name
 * still has no slot here (#1266).
 */
export function composePreparedFieldOverlay(input: {
  lease: OfflineOwnerLeaseV1;
  coreFingerprint: string;
  session: Session;
  hazards: LessonHazards | null;
  spokenAudio: SpokenAudio;
  conditionsMeta: string | null;
  conditionsSource: string;
  groupNoun?: GroupNoun;
  preparedAt: Date;
}): PreparedFieldOverlayV1 {
  if (!input.coreFingerprint.trim() || !Number.isFinite(input.preparedAt.getTime())) {
    throw new Error("A valid core fingerprint and preparation time are required");
  }

  const resources = Array.from(
    new Set(Object.values(input.spokenAudio).map((clip) => clip.src)),
  ).map((url) => ({ kind: "audio" as const, url, required: false }));

  return {
    version: 1,
    ownerScope: input.lease.ownerScope,
    ownerLeaseId: input.lease.leaseId,
    sessionId: input.session.id,
    coreFingerprint: input.coreFingerprint,
    preparedAt: input.preparedAt.toISOString(),
    staleAfter: new Date(input.preparedAt.getTime() + OVERLAY_MAX_AGE_MS).toISOString(),
    ...(input.groupNoun ? { groupNoun: input.groupNoun } : {}),
    session: input.session,
    hazards: input.hazards,
    spokenAudio: input.spokenAudio,
    conditions: input.conditionsMeta?.trim()
      ? {
          summary: input.conditionsMeta.trim(),
          capturedAt: input.preparedAt.toISOString(),
          source: input.conditionsSource.trim() || "conditions provider",
        }
      : null,
    resources,
  };
}
