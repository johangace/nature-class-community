export const AUTHORED_FIELD_OBSERVATION =
  "Look at the sky, feel the air and check the ground together.";

export const BASIC_OFFLINE_ASSET_URLS = [
  "/field",
  "/field/print",
  "/offline/core-v1.json",
] as const;

export type BasicOfflineReadinessStatus =
  | "checking"
  | "ready"
  | "unavailable";

export type BasicOfflineAvailability =
  | { status: "ready"; reason: null; missing: [] }
  | {
      status: "unavailable";
      reason:
        | "no-controller"
        | "controller-not-active"
        | "cache-unavailable"
        | "missing-assets";
      missing: string[];
    };

type OfflineCacheMatch = (
  input: RequestInfo | URL,
) => Promise<Response | undefined>;

export interface BasicOfflineCheckDependencies {
  getController?: () => Pick<ServiceWorker, "state"> | null;
  cacheMatch?: OfflineCacheMatch;
}

export type FieldPreparationStatus =
  | "not-prepared"
  | "preparing"
  | "ready"
  | "stale"
  | "failed";

export type FieldPreparationAction = "prepare" | "retry" | "refresh";

export interface OfflineReadinessInput {
  isOnline: boolean;
  /** Omitted while the browser-side cache proof is still running. */
  basicStatus?: BasicOfflineReadinessStatus;
  preparationStatus: FieldPreparationStatus;
  conditionsCapturedAt?: string | null;
  conditionsSummary?: string | null;
  now?: Date;
  /** Test seam and an explicit choice for shared devices that pin a locale. */
  timeZone?: string;
}

export interface OfflineReadiness {
  basic: {
    status: BasicOfflineReadinessStatus;
    label: string;
    detail: string;
  };
  field: {
    status: FieldPreparationStatus | "needs-wifi";
    label: string;
    detail: string;
    action: FieldPreparationAction | null;
    actionLabel: string | null;
  };
  conditions: {
    observation: string;
    receipt: { label: string; summary: string | null; stale: boolean } | null;
  };
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

function browserController(): Pick<ServiceWorker, "state"> | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  return navigator.serviceWorker.controller;
}

function browserCacheMatch(
  input: RequestInfo | URL,
): Promise<Response | undefined> {
  if (typeof caches === "undefined") return Promise.resolve(undefined);
  // Serwist/Workbox stores precache entries under revisioned request URLs
  // (`?__WB_REVISION__=…`). These are three fixed public paths, so ignoring
  // that generated query is the truthful way to prove the current response is
  // physically present without coupling the app to Workbox's cache-key format.
  return caches.match(input, { ignoreSearch: true });
}

/**
 * Prove that this page is controlled by the activated worker and that every
 * basic field asset can be read back from Cache Storage. Network state alone
 * is never treated as offline readiness.
 */
export async function checkBasicOfflineAvailability(
  dependencies: BasicOfflineCheckDependencies = {},
): Promise<BasicOfflineAvailability> {
  const controller = (dependencies.getController ?? browserController)();
  if (!controller) {
    return {
      status: "unavailable",
      reason: "no-controller",
      missing: [...BASIC_OFFLINE_ASSET_URLS],
    };
  }
  if (controller.state !== "activated") {
    return {
      status: "unavailable",
      reason: "controller-not-active",
      missing: [...BASIC_OFFLINE_ASSET_URLS],
    };
  }

  const cacheMatch = dependencies.cacheMatch ?? browserCacheMatch;
  if (typeof caches === "undefined" && !dependencies.cacheMatch) {
    return {
      status: "unavailable",
      reason: "cache-unavailable",
      missing: [...BASIC_OFFLINE_ASSET_URLS],
    };
  }

  const missing: string[] = [];
  for (const url of BASIC_OFFLINE_ASSET_URLS) {
    try {
      const cached = await cacheMatch(url);
      if (!cached?.ok) missing.push(url);
    } catch {
      missing.push(url);
    }
  }

  return missing.length === 0
    ? { status: "ready", reason: null, missing: [] }
    : { status: "unavailable", reason: "missing-assets", missing };
}

function basicReadiness(
  status: BasicOfflineReadinessStatus,
  isOnline: boolean,
): OfflineReadiness["basic"] {
  if (status === "ready") {
    return {
      status,
      label: "Basic lesson ready",
      detail: "Lesson text, general safety and field steps are on this device.",
    };
  }
  if (status === "unavailable") {
    return {
      status,
      label: "Basic lesson not saved",
      detail: isOnline
        ? "Keep Nature Class open while the basic field pages are saved on this device."
        : "Reconnect and open Nature Class once before relying on this device outside.",
    };
  }
  return {
    status,
    label: "Checking basic lesson",
    detail: "Nature Class is checking the saved lesson, safety and field pages on this device.",
  };
}

function receiptFor(
  capturedAt: string | null | undefined,
  summary: string | null | undefined,
  now: Date,
  timeZone?: string
): OfflineReadiness["conditions"]["receipt"] {
  if (!capturedAt) return null;
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) return null;

  return {
    label: `Checked at ${new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(captured)}`,
    summary: summary?.trim() || null,
    stale: now.getTime() - captured.getTime() >= THREE_HOURS_MS,
  };
}

function fieldReadiness(
  status: FieldPreparationStatus,
  isOnline: boolean
): OfflineReadiness["field"] {
  if (status === "ready") {
    return {
      status,
      label: "Field version ready",
      detail: "The selected field details were verified on this device.",
      action: null,
      actionLabel: null,
    };
  }

  if (status === "preparing") {
    return {
      status,
      label: "Preparing field version",
      detail: "Keep Nature Class open while the selected details are checked.",
      action: null,
      actionLabel: null,
    };
  }

  if (status === "stale") {
    return {
      status,
      label: "Field version is older, but usable",
      detail: isOnline
        ? "The saved version still works. Refresh it before leaving if you can."
        : "Use what was saved, then let what the class sees outside lead.",
      action: isOnline ? "refresh" : null,
      actionLabel: isOnline ? "Refresh field version" : null,
    };
  }

  if (status === "failed") {
    return {
      status,
      label: "Field version not ready",
      detail: isOnline
        ? "The last preparation did not finish. The basic lesson is still ready."
        : "Reconnect before trying again. The basic lesson is still ready.",
      action: isOnline ? "retry" : null,
      actionLabel: isOnline ? "Try preparing again" : null,
    };
  }

  if (!isOnline) {
    return {
      status: "needs-wifi",
      label: "Field version needs Wi-Fi",
      detail: "Prepare the local extras next time Nature Class is open online.",
      action: null,
      actionLabel: null,
    };
  }

  return {
    status,
    label: "Field version not prepared",
    detail: "Add the selected local details before the class goes outside.",
    action: "prepare",
    actionLabel: "Prepare field version",
  };
}

export function deriveOfflineReadiness(input: OfflineReadinessInput): OfflineReadiness {
  const now = input.now ?? new Date();
  return {
    basic: basicReadiness(input.basicStatus ?? "checking", input.isOnline),
    field: fieldReadiness(input.preparationStatus, input.isOnline),
    conditions: {
      observation: AUTHORED_FIELD_OBSERVATION,
      receipt: receiptFor(
        input.conditionsCapturedAt,
        input.conditionsSummary,
        now,
        input.timeZone,
      ),
    },
  };
}
