/**
 * Layer 2 is a school-linked on-device store. It stays dark until the storage
 * inventory in ADR-0004 has explicit privacy approval. UI and API flags are
 * separate so exposing a button can never be the only server-side gate.
 */
export function isPreparedOfflineUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NATURE_CLASS_PREPARED_OFFLINE === "1";
}

export function isPreparedOfflineApiEnabled(): boolean {
  return process.env.NATURE_CLASS_PREPARED_OFFLINE === "1";
}
