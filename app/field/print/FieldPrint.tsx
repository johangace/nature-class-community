"use client";

import { Wordmark } from "@/app/Wordmark";
import { refreshPreparedLanguage } from "@/lib/offline/refresh-language";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrintPhase } from "@/engine/print-phase";
import { renderChildSheet, sheetFolioLine } from "@/engine/sheet-templates";
import {
  parseCoreLessonReleaseV1,
  type CoreLessonReleaseV1,
  type CoreSession,
} from "@/lib/offline/contracts";
import {
  clearPreparedFieldEnvelope,
  readPreparedFieldState,
} from "@/lib/offline/prepared-store";
import { recheckPreparedFieldResources } from "@/lib/offline/prepare-client";
import { syncCurrentOfflineOwner } from "@/lib/offline/owner-sync";
import type { PreparedFieldEnvelopeV1 } from "@/lib/offline/prepared-contracts";
import type { HazardEntry } from "@/lib/lesson/hazards";
import {
  fieldHomeHref,
  fieldHref,
  useFieldHashParams,
  type FieldHomeHref,
} from "@/lib/offline/field-location";

function releasedSession(
  release: CoreLessonReleaseV1,
  wanted: string | null,
): CoreSession | null {
  const released = release.shelf.flatMap((row) => row.sessionIds);
  const resolved = wanted ? release.retiredSessionIds[wanted] ?? wanted : released[0];
  if (!resolved || !released.includes(resolved)) return null;
  return release.sessions[resolved] ?? null;
}

export function FieldPrint({
  initialRelease = null,
  initialSessionId,
  initialHomeHref,
  preparedEnabled = false,
}: {
  initialRelease?: CoreLessonReleaseV1 | null;
  initialSessionId?: string;
  initialHomeHref?: FieldHomeHref;
  preparedEnabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const hashParams = useFieldHashParams();
  const [release, setRelease] = useState(initialRelease);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedFieldEnvelopeV1 | null>(null);
  const [preparedLookupSettledFor, setPreparedLookupSettledFor] =
    useState<string | null>(null);
  const wanted =
    initialSessionId ?? hashParams.get("session") ?? searchParams.get("session");
  const homeHref =
    initialHomeHref ??
    fieldHomeHref(hashParams.get("home") ?? searchParams.get("home"));

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
      .catch(() => undefined);
    return () => controller.abort();
  }, [release]);

  const coreSession = useMemo(
    () => (release ? releasedSession(release, wanted) : null),
    [release, wanted],
  );

  useEffect(() => {
    if (!preparedEnabled || !release || !coreSession) return;
    let cancelled = false;
    const lookupKey = `${release.contentFingerprint}:${coreSession.id}`;
    setPrepared(null);
    setRefreshFailed(false);
    void (async () => {
      if (navigator.onLine) {
        const owner = await syncCurrentOfflineOwner();
        if (cancelled || owner.status !== "verified") return;
      }
      const state = await readPreparedFieldState({
        sessionId: coreSession.id,
        coreFingerprint: release.contentFingerprint,
      });
      if (cancelled) return;
      if (state.status === "unavailable" && state.reason === "content-mismatch") {
        try {
          const refreshed = await refreshPreparedLanguage({
            state,
            online: navigator.onLine,
            sessionId: coreSession.id,
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
        if (!cancelled) {
          setPrepared(verified);
        }
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPreparedLookupSettledFor(lookupKey);
      });
    return () => {
      cancelled = true;
    };
  }, [coreSession, preparedEnabled, release]);

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
    return <main className="print-page" role="alert">
      <p>The saved lesson needs a language update. Reconnect and refresh before using it offline.</p>
      <button type="button" onClick={() => window.location.reload()}>Refresh saved lesson</button>
    </main>;
  }

  if (!release || !coreSession) {
    return <main className="print-page">The saved print copy is not available yet.</main>;
  }

  if (
    preparedEnabled &&
    preparedLookupSettledFor !==
      `${release.contentFingerprint}:${coreSession.id}`
  ) {
    return <main className="print-page">Opening the saved print copy…</main>;
  }

  const active =
    preparedEnabled && prepared?.overlay.sessionId === coreSession.id
      ? prepared.overlay
      : null;
  const session = active?.session ?? coreSession;
  const shelf = release.shelf.find((row) => row.sessionIds.includes(coreSession.id));
  const position = shelf?.sessionIds.indexOf(coreSession.id) ?? -1;
  const hazards: HazardEntry[] = active?.hazards?.entries.length
    ? active.hazards.entries
    : release.universalSafety;

  return (
    <>
      <div className="print-toolbar">
        <button type="button" onClick={() => window.print()}>Print this lesson</button>
        <a href={fieldHref(coreSession.id, "lesson", homeHref)}>
          Back to field lesson
        </a>
      </div>

      <main className="print-page">
        <header>
          <div className="print-masthead">
            <Wordmark seed className="print-logo" />
            <span>Teacher’s field guide</span>
          </div>
          <h1>{session.title}</h1>
          <p className="print-meta">
            {shelf?.ageBand ? `ages ${shelf.ageBand} · ` : ""}
            {session.durationMin} min · skill: {session.namedSkill}
          </p>
          <p className="print-objective">{session.objective}</p>
          {session.topic && <p className="print-topic">{session.topic}</p>}
          <p className="p-conditions">
            Look at the sky, feel the air and check the ground together. What you see now leads.
          </p>
          {active?.conditions && (
            <p className="print-meta">
              Conditions receipt: {active.conditions.summary} · checked {new Date(
                active.conditions.capturedAt,
              ).toLocaleString("en-GB")}. Receipt only.
            </p>
          )}
        </header>

        <section className="print-kit">
          <h2>{active?.hazards?.entries.length ? "Selected safety" : "General safety"}</h2>
          <p>Your own risk assessment and what you see on the day lead.</p>
          <ul>
            {hazards.map((entry) => (
              <li key={entry.id}><strong>{entry.name}:</strong> {entry.note}</li>
            ))}
          </ul>
        </section>

        {session.phases.map((phase, index) => (
          <PrintPhase key={phase.key} phase={phase} ability={undefined} number={index + 1} />
        ))}

        <section className="print-phase">
          <h2>The children’s sheet</h2>
          <p>Print the following page for the children.</p>
        </section>
      </main>

      {renderChildSheet(session, {
        blocks: session.childSheet,
        ability: undefined,
        folio: {
          where: shelf ? sheetFolioLine(shelf.packTitle, position) : null,
        },
      })}
    </>
  );
}
