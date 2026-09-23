"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { drainQueue } from "./LogSession";
import { completionClientKey } from "@/lib/run/completion-queue";
import { parseRunProgress, runProgressKey } from "@/lib/run/progress";

/**
 * Today is where an offline teacher returns. When signal comes back, drain
 * only this active class's queue and refresh the server-owned programme state
 * so the just-led lesson is not offered again.
 */
export function CompletionQueueDrain({ classId }: { classId: string }) {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    void drainQueue(classId).then(({ sent, accepted }) => {
      for (const draft of accepted) {
        const ownerScope = `class:${classId}`;
        const progressKey = runProgressKey(ownerScope, draft.sessionId);
        try {
          const progress = parseRunProgress(window.localStorage.getItem(progressKey), {
            ownerScope,
            sessionId: draft.sessionId,
          });
          if (
            progress &&
            completionClientKey(classId, draft.sessionId, progress.startedAt) ===
              draft.clientKey
          ) {
            window.localStorage.removeItem(progressKey);
          }
        } catch {
          // Refreshing programme state matters more than best-effort cleanup.
        }
      }
      if (mounted && sent > 0) router.refresh();
    });
    return () => {
      mounted = false;
    };
  }, [classId, router]);

  return null;
}
