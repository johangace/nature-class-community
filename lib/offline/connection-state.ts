export const OFFLINE_CONNECTION_GRACE_MS = 2_500;
export const RESTORED_CONNECTION_NOTICE_MS = 1_800;

export type LessonConnectionState =
  | "online"
  | "checking"
  | "offline"
  | "restored";

export type LessonConnectionEvent =
  | { type: "signal-lost" }
  | { type: "grace-elapsed" }
  | { type: "signal-restored" }
  | { type: "notice-expired" };

/** A navigation started in either loss state must use the saved lesson shell. */
export function usesOfflineFallback(state: LessonConnectionState): boolean {
  return state === "checking" || state === "offline";
}

/**
 * Connection changes are presentation state, not a navigation command. A
 * lesson that is already open stays mounted throughout every transition.
 */
export function reduceLessonConnection(
  state: LessonConnectionState,
  event: LessonConnectionEvent,
): LessonConnectionState {
  switch (event.type) {
    case "signal-lost":
      return state === "offline" ? "offline" : "checking";
    case "grace-elapsed":
      return state === "checking" ? "offline" : state;
    case "signal-restored":
      return state === "checking" || state === "offline" ? "restored" : state;
    case "notice-expired":
      return state === "restored" ? "online" : state;
  }
}
