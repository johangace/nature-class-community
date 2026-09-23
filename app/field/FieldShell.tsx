"use client";

import { refreshPreparedLanguage } from "@/lib/offline/refresh-language";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { HybridJourney, type HybridJourneyNavigationHrefs } from "@/app/run/HybridJourney";
import { GroupNounProvider } from "@/app/run/GroupNoun";
import {
  parseCoreLessonReleaseV1,
  type CoreLessonReleaseV1,
  type CoreSession,
} from "@/lib/offline/contracts";
import { recheckPreparedFieldResources } from "@/lib/offline/prepare-client";
import {
  clearPreparedFieldEnvelope,
  readPreparedFieldState,
  type PreparedFieldState,
} from "@/lib/offline/prepared-store";
import type { PreparedFieldEnvelopeV1 } from "@/lib/offline/prepared-contracts";
import type { GroupNoun } from "@/lib/group-profile";
import type { LessonHazards } from "@/lib/lesson/hazards";
import {
  asFieldView,
  fieldHomeHref,
  fieldHref,
  fieldPrintHref,
  fieldRootHref,
  useFieldHashParams,
  type FieldHomeHref,
  type FieldView,
} from "@/lib/offline/field-location";
import { fieldRunOwnerScope } from "@/lib/offline/field-run-state";
import { syncCurrentOfflineOwner } from "@/lib/offline/owner-sync";
import {
  usesOfflineFallback,
  type LessonConnectionState,
} from "@/lib/offline/connection-state";
import { useLessonConnection } from "@/app/run/useLessonConnection";
import styles from "./field.module.css";

export function fieldNavigation(
  sessionId: string,
  connectionState: LessonConnectionState,
  homeHref: FieldHomeHref = "/",
): HybridJourneyNavigationHrefs {
  return {
    exit: usesOfflineFallback(connectionState) ? fieldRootHref(homeHref) : homeHref,
    preview: fieldHref(sessionId, "lesson", homeHref),
    primer: fieldHref(sessionId, "primer", homeHref),
    safety: fieldHref(sessionId, "safety", homeHref),
    print: fieldPrintHref(sessionId, homeHref),
  };
}

export function fieldShellHome(
  homeHref: FieldHomeHref,
  connectionState: LessonConnectionState,
): { href: string; label: string } {
  if (usesOfflineFallback(connectionState)) {
    return { href: fieldRootHref(homeHref), label: "Back to saved lessons" };
  }
  return {
    href: homeHref,
    label: homeHref === "/today" ? "Back to today" : "Back to Nature Class",
  };
}

function shelfSessions(release: CoreLessonReleaseV1): CoreSession[] {
  const seen = new Set<string>();
  const sessions: CoreSession[] = [];
  for (const row of release.shelf) {
    for (const id of row.sessionIds) {
      if (seen.has(id)) continue;
      const session = release.sessions[id];
      if (!session) continue;
      seen.add(id);
      sessions.push(session);
    }
  }
  return sessions;
}

function resolveSelectedId(
  wanted: string | null,
  release: CoreLessonReleaseV1,
  released: CoreSession[]
): string | null {
  if (!wanted) return released[0]?.id ?? null;
  const resolved = release.retiredSessionIds[wanted] ?? wanted;
  return released.some((session) => session.id === resolved)
    ? resolved
    : null;
}

function Primer({
  homeHref,
  session,
}: {
  homeHref: FieldHomeHref;
  session: CoreSession;
}) {
  return (
    <article className={styles.reading}>
      <a className={styles.quietLink} href={fieldHref(session.id, "lesson", homeHref)}>← Back to the lesson</a>
      <p className={styles.eyebrow}>Basic lesson · pre-reading</p>
      <h1>{session.title}</h1>
      {session.primer ? (
        <>
          <h2>Overview</h2>
          <p>{session.primer.summary}</p>
          {session.primer.why && (
            <>
              <h2>Learning benefits</h2>
              <p>{session.primer.why}</p>
            </>
          )}
          {(session.primer.glossary?.length ?? 0) > 0 && (
            <>
              <h2>Key words</h2>
              <dl>
                {session.primer.glossary?.map((entry) => (
                  <div key={entry.term}>
                    <dt>{entry.term}</dt>
                    <dd>{entry.forChildren ?? entry.definition}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </>
      ) : (
        <p>No additional pre-reading is authored for this lesson.</p>
      )}
    </article>
  );
}

function Safety({
  release,
  session,
  hazards,
  groupNoun,
  homeHref,
}: {
  release: CoreLessonReleaseV1;
  session: CoreSession;
  hazards: LessonHazards | null;
  groupNoun: GroupNoun;
  homeHref: FieldHomeHref;
}) {
  const entries = hazards?.entries.length ? hazards.entries : release.universalSafety;
  return (
    <article className={styles.reading}>
      <a className={styles.quietLink} href={fieldHref(session.id, "lesson", homeHref)}>← Back to the lesson</a>
      <p className={styles.eyebrow}>
        {hazards?.entries.length ? "Field version · selected safety" : "Basic lesson · general safety"}
      </p>
      <h1>Before you go out</h1>
      <p>
        {hazards?.entries.length
          ? `This selected list was prepared for your ${groupNoun}. It is still not a survey of the patch. `
          : "This is the universal outdoor check, not a survey of your patch. "}
        Your own risk assessment and what you see on the day lead.
      </p>
      <dl>
        {entries.map((entry) => (
          <div key={entry.id}>
            <dt>{entry.name}</dt>
            <dd>{entry.note}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function FieldRun({
  coreSession,
  preparedEnvelope,
  release,
  connectionState,
  homeHref,
}: {
  coreSession: CoreSession;
  preparedEnvelope: PreparedFieldEnvelopeV1 | null;
  release: CoreLessonReleaseV1;
  connectionState: LessonConnectionState;
  homeHref: FieldHomeHref;
}) {
  const activePrepared =
    preparedEnvelope?.overlay.sessionId === coreSession.id
      ? preparedEnvelope.overlay
      : null;
  // This lazy snapshot is the run boundary. IndexedDB, another tab, or a
  // parent re-render may change the available overlay later; a mounted class
  // never changes lesson text, safety or recordings underneath the teacher.
  const [snapshot] = useState(() => ({
    audio: activePrepared?.spokenAudio ?? {},
    // Her own word for the people in front of her, snapshotted with the rest;
    // it rides in the envelope because this surface has no server read, and a
    // missing one is the documented "class" (prepared-contracts.ts, #1266).
    groupNoun: (activePrepared?.groupNoun ?? "class") satisfies GroupNoun,
    hazards:
      activePrepared?.hazards ??
      (release.universalSafety.length
        ? { source: "starter" as const, entries: release.universalSafety }
        : null),
    ownerScope:
      activePrepared?.ownerScope ?? fieldRunOwnerScope(release.contentFingerprint),
    preparedLeaseId: activePrepared?.ownerLeaseId ?? null,
    session: activePrepared?.session ?? coreSession,
  }));
  const preparedWasRevoked =
    snapshot.preparedLeaseId !== null &&
    preparedEnvelope?.lease.leaseId !== snapshot.preparedLeaseId;

  if (preparedWasRevoked) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.notice} role="alert">
            <p className={styles.eyebrow}>Field version ended</p>
            <h1>This field preparation has expired.</h1>
            <p>
              Its selected lesson text, safety, recordings and conditions have been removed from
              this run. The public lesson is still on the device.
            </p>
            <a className={styles.primaryAction} href={fieldHref(coreSession.id, "lesson", homeHref)}>
              Continue with the basic lesson
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <GroupNounProvider noun={snapshot.groupNoun}>
      <HybridJourney
        assistEnabled={false}
        audio={snapshot.audio}
        cast={null}
        doorLine={null}
        hazards={snapshot.hazards}
        logTo={null}
        media={[]}
        navigationHrefs={fieldNavigation(snapshot.session.id, connectionState, homeHref)}
        ownerScope={snapshot.ownerScope}
        previewSeconds={null}
        session={snapshot.session}
      />
    </GroupNounProvider>
  );
}

export function FieldShell({
  initialRelease = null,
  initialSessionId,
  initialHomeHref,
  initialView,
  preparedEnabled = false,
}: {
  initialRelease?: CoreLessonReleaseV1 | null;
  initialSessionId?: string;
  initialHomeHref?: FieldHomeHref;
  initialView?: FieldView;
  preparedEnabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const hashParams = useFieldHashParams();
  const connectionState = useLessonConnection(true);
  const homeHref =
    initialHomeHref ??
    fieldHomeHref(hashParams.get("home") ?? searchParams.get("home"), pathname);
  const shellHome = fieldShellHome(homeHref, connectionState);
  const [release, setRelease] = useState<CoreLessonReleaseV1 | null>(initialRelease);
  const [releaseError, setReleaseError] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedFieldEnvelopeV1 | null>(null);
  const [preparedLookupSettledFor, setPreparedLookupSettledFor] =
    useState<string | null>(null);

  useEffect(() => {
    if (release) return;
    const controller = new AbortController();
    void fetch("/offline/core-v1.json", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Core release returned ${response.status}`);
        return response.json();
      })
      .then((value: unknown) => setRelease(parseCoreLessonReleaseV1(value)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setReleaseError(true);
      });
    return () => controller.abort();
  }, [release]);

  const released = useMemo(() => (release ? shelfSessions(release) : []), [release]);
  const wanted =
    initialSessionId ?? hashParams.get("session") ?? searchParams.get("session");
  const selectedId = release ? resolveSelectedId(wanted, release, released) : null;
  const selectedCore = selectedId && release ? release.sessions[selectedId] ?? null : null;
  const view = initialView ?? asFieldView(hashParams.get("view") ?? searchParams.get("view"));
  const selectedLookupKey =
    release && selectedId ? `${release.contentFingerprint}:${selectedId}` : null;

  useEffect(() => {
    if (!preparedEnabled || !release || !selectedId || !wanted) return;
    let cancelled = false;
    setPrepared(null);
    setRefreshFailed(false);
    void (async () => {
      // Online, the current account/class must be proved by the server before
      // one byte of a private overlay is read into React. Offline, the most
      // recent unexpired server proof in IndexedDB is the only available
      // authority and readPreparedFieldState validates against it.
      if (navigator.onLine) {
        const owner = await syncCurrentOfflineOwner();
        if (cancelled || owner.status !== "verified") return;
      }
      const state: PreparedFieldState = await readPreparedFieldState({
        sessionId: selectedId,
        coreFingerprint: release.contentFingerprint,
      });
      if (cancelled) return;
      if (state.status === "unavailable" && state.reason === "content-mismatch") {
        try {
          const refreshed = await refreshPreparedLanguage({
            state,
            online: navigator.onLine,
            sessionId: selectedId,
            coreFingerprint: release.contentFingerprint,
          });
          if (!cancelled) setPrepared(refreshed);
        } catch {
          if (!cancelled) setRefreshFailed(true);
        }
        return;
      }
      if (state.status === "ready" || state.status === "stale") {
        const verified = await recheckPreparedFieldResources(state.value);
        if (cancelled) return;
        setPrepared(verified);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setPreparedLookupSettledFor(
            `${release.contentFingerprint}:${selectedId}`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preparedEnabled, release, selectedId, wanted]);

  // Expiry is a live boundary, not something checked only on the next reload.
  // Long leases are re-armed in bounded timer spans to avoid the browser's
  // maximum timeout turning a 30-day lease into an immediate callback.
  useEffect(() => {
    if (!preparedEnabled || !prepared) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const leaseId = prepared.lease.leaseId;
    const expiresAt = new Date(prepared.lease.expiresAt).getTime();
    const checkExpiry = () => {
      if (cancelled) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setPrepared((current) =>
          current?.lease.leaseId === leaseId ? null : current,
        );
        void clearPreparedFieldEnvelope().catch(() => undefined);
        return;
      }
      timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_000_000));
    };
    checkExpiry();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [prepared, preparedEnabled]);

  if (refreshFailed) {
    return <main className={styles.shell} role="alert">
      <p>The saved lesson needs a language update. Reconnect and refresh before using it offline.</p>
      <button type="button" onClick={() => window.location.reload()}>Refresh saved lesson</button>
    </main>;
  }

  const activePrepared =
    preparedEnabled && prepared?.overlay.sessionId === selectedId ? prepared.overlay : null;
  const selected = activePrepared?.session ?? selectedCore;

  const opensSelectedLesson =
    view === "run" || (view === "lesson" && Boolean(wanted));

  if (release && selectedCore && opensSelectedLesson) {
    const lookupSettled =
      !preparedEnabled ||
      (selectedLookupKey !== null && preparedLookupSettledFor === selectedLookupKey);
    if (!lookupSettled) {
      return (
        <main className={styles.page}>
          <div className={styles.shell}>
            <div className={styles.notice} role="status" aria-busy="true">
              Opening the saved field version…
            </div>
          </div>
        </main>
      );
    }
    return (
      <FieldRun
        coreSession={selectedCore}
        preparedEnvelope={preparedEnabled ? prepared : null}
        release={release}
        connectionState={connectionState}
        homeHref={homeHref}
      />
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <a className={styles.brand} href={fieldRootHref(homeHref)}>Nature Class</a>
          <a className={styles.quietLink} href={shellHome.href}>
            {shellHome.label}
          </a>
        </header>

        {!release && !releaseError && (
          <div className={styles.notice} role="status" aria-busy="true">
            Opening the lessons saved with Nature Class…
          </div>
        )}

        {releaseError && !release && (
          <div className={styles.notice} role="alert">
            <h1>Basic lessons are not installed yet.</h1>
            <p>Open Nature Class once with Wi-Fi so the field lessons can be saved on this device.</p>
          </div>
        )}

        {release && released.length === 0 && (
          <div className={styles.notice} role="status">
            <h1>No open-core lessons are on this shelf yet.</h1>
          </div>
        )}

        {release && wanted && !selected && (
          <div className={styles.notice} role="alert">
            <h1>This lesson is not available offline.</h1>
            <p>Choose one of the lessons saved on this device.</p>
            <a className={styles.primaryAction} href={fieldRootHref(homeHref)}>
              Choose a saved lesson
            </a>
          </div>
        )}

        {release && selected && view === "primer" && (
          <Primer homeHref={homeHref} session={selected} />
        )}
        {release && selected && view === "safety" && (
          <Safety
            release={release}
            session={selected}
            hazards={activePrepared?.hazards ?? null}
            groupNoun={activePrepared?.groupNoun ?? "class"}
            homeHref={homeHref}
          />
        )}

        {release && selected && view === "lesson" && !wanted && (
          <section className={styles.shelf} aria-labelledby="field-shelf-title">
            <div className={styles.sectionHeading}>
              <h1 id="field-shelf-title">Choose a lesson</h1>
              <p>Basic lesson, safety, teaching steps and print.</p>
            </div>
            <ul className={styles.lessonList}>
              {released.map((session) => (
                <li key={session.id}>
                  <a
                    className={styles.lessonLink}
                    href={fieldHref(session.id, "run", homeHref)}
                  >
                    <span>{session.title}</span>
                    <span>{session.durationMin} min</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
