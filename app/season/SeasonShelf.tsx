"use client";

import type { Locale } from "@/lib/localization";
import type { LessonConnectionState } from "@/lib/offline/connection-state";
import { usesOfflineFallback } from "@/lib/offline/connection-state";
import type { ShelfTier } from "@/lib/pack";
import type { FieldHomeHref } from "@/lib/offline/field-location";
import { useLessonConnection } from "@/app/run/useLessonConnection";
import {
  SeasonPackSection,
  type SeasonPackView,
} from "./SeasonPackSection";

export type SeasonShelfEntry = {
  pack: SeasonPackView;
  tier: ShelfTier;
  /**
   * False for a season that has not come round yet: its sessions are listed
   * by title and nothing in it opens. Absent means open, so a caller that
   * knows nothing about seasons (a test, the offline shelf) gets the old
   * behaviour.
   */
  open?: boolean;
  /** The month a closed season unlocks, "December"; shown beside its title. */
  opensIn?: string;
  /** Titles a closed season will carry once written; listed after its sessions. */
  planned?: readonly string[];
};

const SIGNAL_COPY: Partial<Record<LessonConnectionState, string>> = {
  checking: "Signal lost. Checking saved lessons…",
  offline: "Offline. Saved lessons open here.",
  restored: "Back online",
};

export function SeasonShelfContent({
  connectionState,
  entries,
  homeHref = "/",
  ledIds,
  nextUp,
  openOnly = null,
  locale,
}: {
  locale?: Locale;
  connectionState: LessonConnectionState;
  entries: readonly SeasonShelfEntry[];
  homeHref?: FieldHomeHref;
  ledIds: readonly string[];
  nextUp: string | null;
  /**
   * Signed out (#877): the one session id that opens; every other included
   * session links to sign-in instead. Null means everything included opens.
   */
  openOnly?: string | null;
}) {
  const led = new Set(ledIds);
  const offline = usesOfflineFallback(connectionState);
  const signalCopy = SIGNAL_COPY[connectionState];

  return (
    <>
      {signalCopy ? (
        <p className="season-signal" role="status">
          {signalCopy}
        </p>
      ) : null}
      {entries.map(({ pack, tier, open = true, opensIn, planned }) => (
        <SeasonPackSection
          key={pack.id}
          pack={pack}
          locale={locale}
          homeHref={homeHref}
          tier={tier}
          led={led}
          nextUp={nextUp}
          offline={offline}
          openOnly={openOnly}
          open={open}
          opensIn={opensIn ?? null}
          planned={planned ?? []}
        />
      ))}
    </>
  );
}

export function SeasonShelf({
  entries,
  homeHref,
  ledIds,
  nextUp,
  openOnly,
  locale,
}: Omit<Parameters<typeof SeasonShelfContent>[0], "connectionState">) {
  const connectionState = useLessonConnection(true);

  return (
    <SeasonShelfContent
      connectionState={connectionState}
      entries={entries}
      locale={locale}
      homeHref={homeHref}
      ledIds={ledIds}
      nextUp={nextUp}
      openOnly={openOnly}
    />
  );
}
