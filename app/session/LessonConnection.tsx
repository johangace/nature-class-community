"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { OfflineLessonControl } from "@/app/run/OfflineLessonControl";
import { useLessonConnection } from "@/app/run/useLessonConnection";
import { fieldPrintHref, type FieldHomeHref } from "@/lib/offline/field-location";
import { usesOfflineFallback } from "@/lib/offline/connection-state";

/**
 * One connection state, read once, for two places on the lesson page.
 *
 * Print and "Go offline" both answer to the signal, and after #870 they no
 * longer sit next to each other: Print stays with the preparation rows, and
 * the offline control moves up beside the door, because Johan asked for it
 * there — "Go offline should not be there, should be closer to the Run the
 * lesson outside". Saving the lesson to the device is something you do because
 * you are about to walk out of signal, not something you do while printing.
 *
 * They could each call `useLessonConnection` and would agree almost always.
 * Almost is the problem: two reducers with their own grace timers can disagree
 * for a second at exactly the moment the signal drops, which is the one moment
 * either control matters, and it would put Print on a network route while the
 * offline control says the signal is gone. So the state is read once here and
 * handed down, rather than sampled twice.
 */

const LessonConnectionContext = createContext<{
  offline: boolean;
  offlineAvailable: boolean;
  state: ReturnType<typeof useLessonConnection>;
} | null>(null);

function useLessonConnectionContext() {
  const value = useContext(LessonConnectionContext);
  if (!value) {
    throw new Error("Lesson connection controls need LessonConnectionProvider");
  }
  return value;
}

export function LessonConnectionProvider({
  children,
  offlineAvailable,
}: {
  children: ReactNode;
  offlineAvailable: boolean;
}) {
  const state = useLessonConnection(offlineAvailable);
  const offline = offlineAvailable && usesOfflineFallback(state);

  return (
    <LessonConnectionContext.Provider value={{ offline, offlineAvailable, state }}>
      {children}
    </LessonConnectionContext.Provider>
  );
}

/**
 * The runner's contract, kept: when the signal has been gone long enough to
 * switch to cached routes, Print points at the saved field copy rather than a
 * network route that would 404 in a hedgerow.
 */
export function SessionPrintLink({
  className,
  homeHref = "/",
  printHref,
  sessionId,
}: {
  className?: string;
  homeHref?: FieldHomeHref;
  printHref: string;
  sessionId: string;
}) {
  const { offline } = useLessonConnectionContext();

  return (
    <Link className={className} href={offline ? fieldPrintHref(sessionId, homeHref) : printHref}>
      Print
    </Link>
  );
}

/** Save this lesson to the device, beside the door it is needed on the far side of. */
export function SessionOfflineControl({
  homeHref = "/",
  rowClassName,
  sessionId,
}: {
  homeHref?: FieldHomeHref;
  rowClassName?: string;
  sessionId: string;
}) {
  const { offlineAvailable, state } = useLessonConnectionContext();
  if (!offlineAvailable) return null;

  return (
    <OfflineLessonControl
      connectionState={state}
      homeHref={homeHref}
      rowClassName={rowClassName}
      sessionId={sessionId}
    />
  );
}
