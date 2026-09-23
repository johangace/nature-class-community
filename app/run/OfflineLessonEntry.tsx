"use client";

import { OfflineLessonControl } from "./OfflineLessonControl";
import { useLessonConnection } from "./useLessonConnection";
import type { FieldHomeHref } from "@/lib/offline/field-location";

/** The same quiet lesson capability, usable before the teacher enters the runner. */
export function OfflineLessonEntry({
  homeHref = "/",
  sessionId,
}: {
  homeHref?: FieldHomeHref;
  sessionId: string;
}) {
  const connectionState = useLessonConnection(true);

  return (
    <OfflineLessonControl
      connectionState={connectionState}
      homeHref={homeHref}
      sessionId={sessionId}
    />
  );
}
