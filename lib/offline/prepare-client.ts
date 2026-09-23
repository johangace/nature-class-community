"use client";

import {
  parsePreparedFieldEnvelope,
  savePreparedFieldEnvelope,
} from "@/lib/offline/prepared-store";
import {
  PREPARED_OVERLAY_FEATURES,
  PREPARED_OVERLAY_FEATURES_HEADER,
  type PreparedFieldEnvelopeV1,
} from "@/lib/offline/prepared-contracts";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type OfflineCacheMatch = (
  input: RequestInfo | URL,
) => Promise<Response | undefined>;

export const DEFAULT_PREPARATION_TIMEOUT_MS = 30_000;
const MAX_PREPARATION_TIMEOUT_MS = 120_000;

export class OfflinePreparationTimeoutError extends Error {
  readonly code = "OFFLINE_PREPARATION_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`Preparation timed out after ${timeoutMs}ms`);
    this.name = "OfflinePreparationTimeoutError";
  }
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return new Error(body.error);
  } catch {
    // Fall through to the status: the endpoint may have failed before JSON.
  }
  return new Error(`Preparation failed (${response.status})`);
}

function browserCacheMatch(
  input: RequestInfo | URL,
): Promise<Response | undefined> {
  if (typeof caches === "undefined") return Promise.resolve(undefined);
  return caches.match(input);
}

async function cachedResourceIsAvailable(
  url: string,
  cacheMatch: OfflineCacheMatch,
): Promise<boolean> {
  try {
    return Boolean((await cacheMatch(url))?.ok);
  } catch {
    return false;
  }
}

/**
 * Re-read a prepared overlay's resources from Cache Storage. This is exported
 * so a field lesson reopened later can prove the same offline claims again
 * without making a network request.
 */
export async function recheckPreparedFieldResources(
  raw: unknown,
  dependencies: { cacheMatch?: OfflineCacheMatch } = {},
): Promise<PreparedFieldEnvelopeV1> {
  const envelope = parsePreparedFieldEnvelope(raw);
  const cacheMatch = dependencies.cacheMatch ?? browserCacheMatch;
  const checks = await Promise.all(
    envelope.overlay.resources.map(async (resource) => ({
      resource,
      available: await cachedResourceIsAvailable(resource.url, cacheMatch),
    })),
  );

  const missingRequired = checks.find(
    (check) => check.resource.required && !check.available,
  );
  if (missingRequired) {
    throw new Error(
      `Required resource ${missingRequired.resource.url} is not available in the offline cache`,
    );
  }

  const available = new Set(
    checks.filter((check) => check.available).map((check) => check.resource.url),
  );
  const resources = envelope.overlay.resources.filter((resource) =>
    available.has(resource.url),
  );
  const spokenAudio = Object.fromEntries(
    Object.entries(envelope.overlay.spokenAudio).filter(([, clip]) =>
      available.has(clip.src),
    ),
  );

  return parsePreparedFieldEnvelope({
    ...envelope,
    overlay: { ...envelope.overlay, resources, spokenAudio },
  });
}

async function warmAndVerifyResources(
  envelope: PreparedFieldEnvelopeV1,
  fetcher: Fetcher,
  cacheMatch: OfflineCacheMatch,
  signal: AbortSignal,
): Promise<PreparedFieldEnvelopeV1> {
  await Promise.all(
    envelope.overlay.resources.map(async (resource) => {
      try {
        await fetcher(resource.url, { method: "GET", signal });
      } catch {
        // Cache readback below is authoritative. A previous content-addressed
        // response may already be safely available even if this warm-up fails.
      }
    }),
  );
  signal.throwIfAborted();
  return recheckPreparedFieldResources(envelope, { cacheMatch });
}

function boundedTimeout(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_PREPARATION_TIMEOUT_MS;
  return Math.min(
    MAX_PREPARATION_TIMEOUT_MS,
    Math.max(1, Math.trunc(timeoutMs ?? DEFAULT_PREPARATION_TIMEOUT_MS)),
  );
}

async function prepareWithinSignal(input: {
  sessionId: string;
  coreFingerprint: string;
  fetcher: Fetcher;
  cacheMatch: OfflineCacheMatch;
  save: (value: PreparedFieldEnvelopeV1) => Promise<void>;
  signal: AbortSignal;
}): Promise<PreparedFieldEnvelopeV1> {
  const response = await input.fetcher("/api/offline/prepare", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // This bundle's own schema, declared so the server never answers with a
      // key it cannot parse. A header rather than a body field, so a rolled-back
      // endpoint that does not read it simply ignores it (#1266).
      [PREPARED_OVERLAY_FEATURES_HEADER]: PREPARED_OVERLAY_FEATURES.join(","),
    },
    body: JSON.stringify({
      sessionId: input.sessionId,
      coreFingerprint: input.coreFingerprint,
    }),
    signal: input.signal,
  });
  if (!response.ok) throw await responseError(response);

  const payload = (await response.json()) as unknown;
  const envelope = parsePreparedFieldEnvelope({
    version: 1,
    ...(typeof payload === "object" && payload !== null ? payload : {}),
  });
  const verified = await warmAndVerifyResources(
    envelope,
    input.fetcher,
    input.cacheMatch,
    input.signal,
  );
  input.signal.throwIfAborted();
  await input.save(verified);
  return verified;
}

/**
 * Prepare and atomically commit one field overlay. Optional resources that do
 * not verify are removed before the only storage write, so a "ready" receipt
 * never promises an audio/image URL that failed during preparation.
 */
export async function prepareFieldSession(input: {
  sessionId: string;
  coreFingerprint: string;
  fetcher?: Fetcher;
  cacheMatch?: OfflineCacheMatch;
  save?: (value: PreparedFieldEnvelopeV1) => Promise<void>;
  timeoutMs?: number;
}): Promise<PreparedFieldEnvelopeV1> {
  const fetcher = input.fetcher ?? fetch;
  const cacheMatch = input.cacheMatch ?? browserCacheMatch;
  const controller = new AbortController();
  const timeoutMs = boundedTimeout(input.timeoutMs);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new OfflinePreparationTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      prepareWithinSignal({
        sessionId: input.sessionId,
        coreFingerprint: input.coreFingerprint,
        fetcher,
        cacheMatch,
        save: input.save ?? savePreparedFieldEnvelope,
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
