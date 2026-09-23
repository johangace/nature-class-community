"use client";

import { prepareFieldSession } from "./prepare-client";
import type { PreparedFieldState } from "./prepared-store";

/** Refresh only a verified owner's outdated language. Never turn an ownership
 * failure into a request to prepare another account's lesson. */
export async function refreshPreparedLanguage(input: {
  state: PreparedFieldState;
  online: boolean;
  sessionId: string;
  coreFingerprint: string;
}) {
  if (input.state.status !== "unavailable" || input.state.reason !== "content-mismatch") return null;
  if (!input.online) throw new Error("Connect to refresh the saved lesson language");
  return prepareFieldSession({ sessionId: input.sessionId, coreFingerprint: input.coreFingerprint });
}
