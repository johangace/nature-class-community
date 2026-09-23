"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fieldHref, type FieldHomeHref } from "@/lib/offline/field-location";
import {
  checkBasicOfflineAvailability,
  type BasicOfflineReadinessStatus,
} from "@/lib/offline/readiness";
import type { LessonConnectionState } from "@/lib/offline/connection-state";
import { useModalFocus } from "./useModalFocus";
import styles from "./journey.module.css";

function connectionLabel(
  connectionState: Exclude<LessonConnectionState, "online">,
  readiness: BasicOfflineReadinessStatus,
) {
  if (connectionState === "checking") {
    return "Signal lost. Checking saved lesson…";
  }
  if (connectionState === "restored") return "Back online";
  if (readiness === "ready") return "Offline. Saved lesson ready.";
  if (readiness === "unavailable") {
    return "Offline. Reconnect to save this lesson.";
  }
  return "Offline. Checking saved lesson…";
}

export function OfflineLessonControl({
  connectionState,
  homeHref = "/",
  initialReadiness = "checking",
  rowClassName,
  sessionId,
}: {
  connectionState: LessonConnectionState;
  homeHref?: FieldHomeHref;
  /** Deterministic render seam for the cache-proven state. */
  initialReadiness?: BasicOfflineReadinessStatus;
  /**
   * Extra class on the control's own row, for a surface that stands it beside
   * something else. The lesson page pairs it with the door (#870) and needs the
   * runner's leading space gone; the runner's own usages pass nothing and are
   * unchanged.
   */
  rowClassName?: string;
  sessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] =
    useState<BasicOfflineReadinessStatus>(initialReadiness);
  const [proofAttempt, setProofAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useModalFocus(open, dialogRef, close);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const prove = () => {
      if (cancelled) return;
      if (retry !== null) clearTimeout(retry);
      setReadiness("checking");
      void checkBasicOfflineAvailability()
        .then((result) => {
          if (cancelled) return;
          if (result.status === "ready") {
            setReadiness("ready");
            return;
          }
          // Registration, precache and controller hand-off do not finish in
          // one tick on a device's first visit. Keep checking briefly while
          // online; a bounded failure becomes an honest unavailable state.
          if (navigator.onLine && attempt < 40) {
            attempt += 1;
            retry = setTimeout(prove, 125);
            return;
          }
          setReadiness("unavailable");
        })
        .catch(() => {
          if (!cancelled) setReadiness("unavailable");
        });
    };

    const restart = () => {
      attempt = 0;
      prove();
    };
    const serviceWorker =
      "serviceWorker" in navigator ? navigator.serviceWorker : null;
    restart();
    void serviceWorker?.ready.then(restart).catch(() => undefined);
    serviceWorker?.addEventListener("controllerchange", restart);
    window.addEventListener("online", restart);

    return () => {
      cancelled = true;
      if (retry !== null) clearTimeout(retry);
      serviceWorker?.removeEventListener("controllerchange", restart);
      window.removeEventListener("online", restart);
    };
  }, [proofAttempt]);

  const isOnline = connectionState === "online" || connectionState === "restored";

  return (
    <div className={styles.offlineControlScope}>
      <div
        className={
          rowClassName
            ? `${styles.offlineControlRow} ${rowClassName}`
            : styles.offlineControlRow
        }
      >
        <button
          type="button"
          className={styles.offlineControl}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          Go offline
        </button>
        {connectionState !== "online" && (
          <span className={styles.connectionNotice} role="status">
            {connectionLabel(connectionState, readiness)}
          </span>
        )}
      </div>

      {open && (
        <button
          type="button"
          className={styles.sheetScrim}
          aria-label="Close offline details"
          onClick={close}
        />
      )}
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`offline-title-${sessionId}`}
        hidden={!open}
        tabIndex={-1}
      >
        <div className={styles.sheetInner}>
          <p className={styles.tSect} id={`offline-title-${sessionId}`}>
            Go offline with this lesson
          </p>
          <p className={styles.tBody}>
            {readiness === "ready"
              ? "Lesson, safety, teaching steps and print are saved on this device."
              : readiness === "checking"
                ? "Checking whether this lesson is saved on this device."
                : isOnline
                  ? "Keep Nature Class open briefly, then check again."
                  : "Reconnect once to save this lesson for offline use."}
          </p>
          {readiness === "ready" && (
            <a className={styles.cta} href={fieldHref(sessionId, "run", homeHref)}>
              Open offline lesson
            </a>
          )}
          {readiness === "unavailable" && isOnline && (
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setProofAttempt((attempt) => attempt + 1)}
            >
              Check again
            </button>
          )}
          <button type="button" className={styles.quiet} onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
