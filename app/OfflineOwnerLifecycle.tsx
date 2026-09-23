"use client";

import { useEffect } from "react";
import { syncCurrentOfflineOwner } from "@/lib/offline/owner-sync";

/**
 * Refresh or clear the prepared-field owner proof around account lifecycle
 * transitions. FieldShell still awaits its own sync before a private read;
 * this global pass closes the gap where a teacher signs in or changes class,
 * closes the app, and later relaunches directly without signal.
 */
export function OfflineOwnerLifecycle() {
  useEffect(() => {
    const sync = () => {
      if (!navigator.onLine) return;
      void syncCurrentOfflineOwner();
    };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);

  return null;
}
