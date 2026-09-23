"use client";

import {
  offlineOwnerLeaseV1Schema,
  preparedFieldEnvelopeV1Schema,
  type OfflineOwnerLeaseV1,
  type PreparedFieldEnvelopeV1,
} from "@/lib/offline/prepared-contracts";

const DATABASE_NAME = "nature-class-offline-v1";
const DATABASE_VERSION = 1;
const STATE_STORE = "state";
const PREPARED_FIELD_KEY = "prepared-field-v1";
const PREPARED_OWNER_KEY = "prepared-owner-v1";

export type PreparedFieldState =
  | {
      status: "ready" | "stale";
      reason?: "core-mismatch" | "age";
      value: PreparedFieldEnvelopeV1;
    }
  | {
      status: "unavailable";
      reason:
        | "missing"
        | "invalid"
        | "owner-missing"
        | "owner-invalid"
        | "owner-mismatch"
        | "owner-expired"
        | "lease-expired"
        | "session-mismatch"
        | "content-mismatch";
    };

export function parsePreparedFieldEnvelope(
  value: unknown,
): PreparedFieldEnvelopeV1 {
  return preparedFieldEnvelopeV1Schema.parse(value);
}

/**
 * Parse the separately persisted proof of the owner who most recently
 * prepared this device. The contract deliberately contains opaque ids and
 * lease timestamps only; names for a teacher, class, or school are rejected.
 */
export function parsePreparedOwnerContext(value: unknown): OfflineOwnerLeaseV1 {
  return offlineOwnerLeaseV1Schema.parse(value);
}

export function classifyPreparedFieldState(
  raw: unknown,
  input: {
    sessionId: string;
    coreFingerprint: string;
    expectedOwner: unknown;
    now?: Date;
  },
): PreparedFieldState {
  let value: PreparedFieldEnvelopeV1;
  try {
    value = parsePreparedFieldEnvelope(raw);
  } catch {
    return { status: "unavailable", reason: "invalid" };
  }

  if (input.expectedOwner === undefined || input.expectedOwner === null) {
    return { status: "unavailable", reason: "owner-missing" };
  }

  let expectedOwner: OfflineOwnerLeaseV1;
  try {
    expectedOwner = parsePreparedOwnerContext(input.expectedOwner);
  } catch {
    return { status: "unavailable", reason: "owner-invalid" };
  }

  if (
    value.lease.ownerScope !== value.overlay.ownerScope ||
    value.lease.leaseId !== value.overlay.ownerLeaseId ||
    value.lease.ownerScope !== expectedOwner.ownerScope ||
    value.lease.leaseId !== expectedOwner.leaseId
  ) {
    return { status: "unavailable", reason: "owner-mismatch" };
  }

  const now = input.now ?? new Date();
  if (now.getTime() >= new Date(value.lease.expiresAt).getTime()) {
    return { status: "unavailable", reason: "lease-expired" };
  }
  if (now.getTime() >= new Date(expectedOwner.expiresAt).getTime()) {
    return { status: "unavailable", reason: "owner-expired" };
  }
  if (value.overlay.sessionId !== input.sessionId) {
    return { status: "unavailable", reason: "session-mismatch" };
  }
  if (value.lease.contentRevision !== expectedOwner.contentRevision) {
    return { status: "unavailable", reason: "content-mismatch" };
  }
  if (value.overlay.coreFingerprint !== input.coreFingerprint) {
    return { status: "stale", reason: "core-mismatch", value };
  }
  if (now.getTime() >= new Date(value.overlay.staleAfter).getTime()) {
    return { status: "stale", reason: "age", value };
  }
  return { status: "ready", value };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline store failed"));
  });
}

function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Offline transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline transaction aborted"));
  });
}

function requestValue(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline read failed"));
  });
}

export async function savePreparedFieldEnvelope(raw: unknown): Promise<void> {
  const value = parsePreparedFieldEnvelope(raw);
  if (typeof indexedDB === "undefined") throw new Error("Offline store unavailable");
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STATE_STORE, "readwrite");
    const store = transaction.objectStore(STATE_STORE);
    // The owner proof is a distinct record. A reader will never trust the
    // owner and lease values embedded in the downloadable envelope alone.
    store.put(value.lease, PREPARED_OWNER_KEY);
    store.put(value, PREPARED_FIELD_KEY);
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
}

/**
 * Replace the current opaque owner proof without downloading an overlay.
 * Auth/class lifecycle code may use this when it establishes the current
 * owner separately. Preparation already writes the same proof atomically with
 * the envelope through savePreparedFieldEnvelope.
 */
export async function savePreparedOwnerContext(raw: unknown): Promise<void> {
  const value = parsePreparedOwnerContext(raw);
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline store unavailable");
  }
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STATE_STORE, "readwrite");
    transaction.objectStore(STATE_STORE).put(value, PREPARED_OWNER_KEY);
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
}

export async function readPreparedOwnerContext(input?: {
  now?: Date;
}): Promise<OfflineOwnerLeaseV1 | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  let raw: unknown;
  try {
    const transaction = database.transaction(STATE_STORE, "readonly");
    raw = await requestValue(
      transaction.objectStore(STATE_STORE).get(PREPARED_OWNER_KEY),
    );
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
  if (raw === undefined) return null;
  try {
    const value = parsePreparedOwnerContext(raw);
    const now = input?.now ?? new Date();
    if (now.getTime() < new Date(value.expiresAt).getTime()) return value;
  } catch {
    // Invalid owner context is treated as absent and purged below.
  }
  await clearPreparedOwnerContext();
  return null;
}

export async function readPreparedFieldState(input: {
  sessionId: string;
  coreFingerprint: string;
  now?: Date;
}): Promise<PreparedFieldState> {
  if (typeof indexedDB === "undefined") {
    return { status: "unavailable", reason: "missing" };
  }
  const database = await openDatabase();
  let raw: unknown;
  let expectedOwner: unknown;
  try {
    const transaction = database.transaction(STATE_STORE, "readonly");
    const store = transaction.objectStore(STATE_STORE);
    [raw, expectedOwner] = await Promise.all([
      requestValue(store.get(PREPARED_FIELD_KEY)),
      requestValue(store.get(PREPARED_OWNER_KEY)),
    ]);
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
  if (raw === undefined) return { status: "unavailable", reason: "missing" };

  const state = classifyPreparedFieldState(raw, { ...input, expectedOwner });
  if (
    state.status === "unavailable" &&
    [
      "invalid",
      "owner-missing",
      "owner-invalid",
      "owner-mismatch",
      "owner-expired",
      "lease-expired",
    ].includes(state.reason)
  ) {
    // Do not leave an unreadable private overlay waiting for a later identity
    // transition. Keep a valid current-owner proof on mismatch; it may belong
    // to a freshly signed-in owner and is useful for a subsequent preparation.
    await clearPreparedFieldEnvelope();
    if (
      state.reason === "owner-invalid" ||
      state.reason === "owner-expired" ||
      state.reason === "lease-expired"
    ) {
      await clearPreparedOwnerContext();
    }
  }
  return state;
}

async function deletePreparedKeys(keys: string[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STATE_STORE, "readwrite");
    const store = transaction.objectStore(STATE_STORE);
    for (const key of keys) store.delete(key);
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
}

export async function clearPreparedFieldEnvelope(): Promise<void> {
  await deletePreparedKeys([PREPARED_FIELD_KEY]);
}

export async function clearPreparedOwnerContext(): Promise<void> {
  await deletePreparedKeys([PREPARED_OWNER_KEY]);
}

/** Purge both the private overlay and its current-owner proof. */
export async function clearPreparedFieldData(): Promise<void> {
  await deletePreparedKeys([PREPARED_FIELD_KEY, PREPARED_OWNER_KEY]);
}
