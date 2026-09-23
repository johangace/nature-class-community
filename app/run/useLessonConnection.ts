"use client";

import { useEffect, useReducer } from "react";
import {
  OFFLINE_CONNECTION_GRACE_MS,
  RESTORED_CONNECTION_NOTICE_MS,
  reduceLessonConnection,
  type LessonConnectionState,
} from "@/lib/offline/connection-state";

export function useLessonConnection(enabled: boolean): LessonConnectionState {
  const [state, dispatch] = useReducer(reduceLessonConnection, "online");

  useEffect(() => {
    if (!enabled) return;

    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let restoredTimer: ReturnType<typeof setTimeout> | null = null;

    const clearGrace = () => {
      if (graceTimer !== null) clearTimeout(graceTimer);
      graceTimer = null;
    };
    const clearRestored = () => {
      if (restoredTimer !== null) clearTimeout(restoredTimer);
      restoredTimer = null;
    };
    const onSignalLost = () => {
      clearGrace();
      clearRestored();
      dispatch({ type: "signal-lost" });
      graceTimer = setTimeout(
        () => dispatch({ type: "grace-elapsed" }),
        OFFLINE_CONNECTION_GRACE_MS,
      );
    };
    const onSignalRestored = () => {
      clearGrace();
      clearRestored();
      dispatch({ type: "signal-restored" });
      restoredTimer = setTimeout(
        () => dispatch({ type: "notice-expired" }),
        RESTORED_CONNECTION_NOTICE_MS,
      );
    };

    window.addEventListener("offline", onSignalLost);
    window.addEventListener("online", onSignalRestored);
    if (!navigator.onLine) onSignalLost();

    return () => {
      clearGrace();
      clearRestored();
      window.removeEventListener("offline", onSignalLost);
      window.removeEventListener("online", onSignalRestored);
    };
  }, [enabled]);

  return state;
}
