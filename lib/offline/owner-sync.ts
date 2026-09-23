"use client";

import { offlineOwnerLeaseV1Schema, type OfflineOwnerLeaseV1 } from "./prepared-contracts";
import {
  clearPreparedFieldData,
  savePreparedOwnerContext,
} from "./prepared-store";

export type OfflineOwnerSyncResult =
  | { status: "verified"; lease: OfflineOwnerLeaseV1 }
  | { status: "unavailable" }
  | { status: "cleared" };

/**
 * Verify the current account/class before private offline state is read.
 * Network failure is fail-closed for the caller but preserves the last proof
 * for a genuinely offline start. A definitive signed-out/no-class response,
 * or an invalid successful response, clears private device state.
 */
export async function syncCurrentOfflineOwner(input?: {
  fetcher?: typeof fetch;
  saveOwner?: typeof savePreparedOwnerContext;
  clearData?: typeof clearPreparedFieldData;
}): Promise<OfflineOwnerSyncResult> {
  const fetcher = input?.fetcher ?? fetch;
  const saveOwner = input?.saveOwner ?? savePreparedOwnerContext;
  const clearData = input?.clearData ?? clearPreparedFieldData;

  let response: Response;
  try {
    response = await fetcher("/api/offline/owner", {
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return { status: "unavailable" };
  }

  // A 404 is the API feature gate saying this deployment does not permit the
  // private layer. Treat it as definitive too: preserving an older proof here
  // could make that data readable on a later offline launch if the public UI
  // flag was accidentally enabled on its own.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    await clearData();
    return { status: "cleared" };
  }
  if (!response.ok) return { status: "unavailable" };

  try {
    const body = (await response.json()) as { lease?: unknown };
    const lease = offlineOwnerLeaseV1Schema.parse(body.lease);
    await saveOwner(lease);
    return { status: "verified", lease };
  } catch {
    await clearData();
    return { status: "cleared" };
  }
}
