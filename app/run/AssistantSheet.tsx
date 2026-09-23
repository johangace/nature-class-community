"use client";

import { asLocale, localizeText } from "@/lib/localization";

import { useEffect, useRef, useState } from "react";
import { SpeciesLearning } from "@/app/species/SpeciesLearning";
import type { LessonSupportDraft } from "@/lib/ai/lesson-support-contract";
import type { LessonHazards } from "@/lib/lesson/hazards";
import type { SpeciesEvidence } from "@/lib/outside/species-allowlist";
import type { AbilityBand, Session } from "@/schema/pack";
import { useModalFocus } from "./useModalFocus";
import { useRunScope } from "./RunScope";
import { HAZARDS_UNCHECKED_CAPTION } from "@/lib/outside/captions";
import styles from "./journey.module.css";

/** Answers scroll above quick actions and an always-open bottom composer. */

type ThreadEntry =
  | { key: number; kind: "support"; label: string; draft: LessonSupportDraft }
  | { key: number; kind: "status"; label: string; text: string }
  | {
      key: number;
      kind: "id";
      photoUrl: string;
      state: "looking" | "named" | "unknown" | "quiet";
      message?: string;
      name?: string | null;
      scientificName?: string | null;
      evidence?: SpeciesEvidence | null;
      recentWindowDays?: number | null;
    }
  | { key: number; kind: "hazards" };

/**
 * WHAT THE RECORD ACTUALLY SUPPORTS, SAID IN WORDS (#401).
 *
 * One fixed sentence used to stand under every matched identification, so a
 * species Pointmoon has only seen in this region across past seasons was
 * described to a teacher as locally recorded. Three claims, three sentences,
 * and the tier decides which — never the model, and never this component.
 *
 * The recent line names the window only when the producer stated one. A
 * missing window leaves the sentence unbounded rather than inviting a number
 * we would be making up, which is the whole failure being fixed here.
 */
export function evidenceLine(
  evidence: SpeciesEvidence | null,
  recentWindowDays: number | null
): string {
  if (evidence === "recent") {
    // The guard lives here, with the sentence, rather than only at the
    // allowlist: this is exported and two specs call it directly, so a
    // number that cannot make a true claim must not be able to make one
    // from any caller. `within the last N days` is the wording the cast
    // surface already ships for this same producer field
    // (`lib/cast/member.ts`), so the product says one thing twice rather
    // than two things once.
    const days =
      typeof recentWindowDays === "number" &&
      Number.isInteger(recentWindowDays) &&
      recentWindowDays > 0
        ? recentWindowDays
        : null;
    return days
      ? `Possible match to a species recorded nearby within the last ${days} days.`
      : "Possible match to a species recorded nearby recently.";
  }
  if (evidence === "seasonal") {
    return "Possible match to a species recorded in this region at this time of year.";
  }
  return "Possible identification.";
}

/**
 * The shipped quiet-help sentence, verbatim — never a near-duplicate.
 *
 * Exported so the circle's "ask it another way" row says the same words when
 * its own draft misses (#390), rather than growing a fourth paraphrase of the
 * one sentence this product uses to admit the model is not answering.
 */
export const QUIET = "Help is quiet just now. The lesson is ready without it.";
// Covers the server’s 10s record lookup and 8s model call, plus transit.
const ID_TIMEOUT_MS = 25_000;

export function AssistantSheet({
  ability,
  hazards,
  locale,
  onClose,
  open,
  phaseKey,
  session,
}: {
  /** The class's band, or undefined when nobody knows it (#860). */
  ability: AbilityBand | undefined;
  hazards: LessonHazards | null;
  locale?: string;
  onClose: () => void;
  open: boolean;
  phaseKey: string;
  session: Session;
}) {
  const t = (text: string) => localizeText(text, asLocale(locale));
  // Whose patch this sheet may speak about (#370).
  const scope = useRunScope();
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [exploring, setExploring] = useState<number | null>(null);
  const [questionText, setQuestionText] = useState("");
  const photoUrls = useRef<string[]>([]);
  const keyRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  useModalFocus(open, dialogRef, onClose);

  // New answers land off-screen in a filling sheet; keep the latest in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread]);

  // Mobile keyboards resize the visual viewport, not always the layout
  // viewport. Keep the input dock above the keyboard in either browser model.
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      dialogRef.current?.style.setProperty("--assist-viewport-height", `${viewport.height}px`);
      dialogRef.current?.style.setProperty("--assist-viewport-top", `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [open]);

  // Her photographs are object URLs; give them back when the sheet unmounts.
  useEffect(() => {
    return () => {
      photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function nextKey(): number {
    keyRef.current += 1;
    return keyRef.current;
  }

  // Distributive by hand: Omit over the whole union would collapse it.
  type Appendable = ThreadEntry extends infer T
    ? T extends ThreadEntry
      ? Omit<T, "key">
      : never
    : never;

  function append(entry: Appendable) {
    setThread((current) => [...current, { ...entry, key: nextKey() } as ThreadEntry]);
  }

  /** One lesson-support turn: the same route and the same draft shape the
   * preparation surface uses, landing as a thread entry instead of a panel. */
  async function askSupport(label: string, task: "simpler" | "child-question", constraint?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/lesson-support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          task,
          phaseKey,
          ability,
          locale,
          constraint: constraint?.trim() || undefined,
        }),
      });
      const body = (await response.json()) as {
        available?: boolean;
        draft?: LessonSupportDraft | null;
      };
      if (!response.ok || !body.available || !body.draft) {
        append({ kind: "status", label, text: QUIET });
        return;
      }
      append({ kind: "support", label, draft: body.draft });
    } catch {
      append({ kind: "status", label, text: QUIET });
    } finally {
      setBusy(false);
    }
  }

  /** Resize on-device and show the photograph while identification runs. */
  async function identify(file: File) {
    if (busy) return;
    setBusy(true);
    const photoUrl = URL.createObjectURL(file);
    photoUrls.current.push(photoUrl);
    const key = nextKey();
    setThread((current) => [...current, { key, kind: "id", photoUrl, state: "looking" }]);
    const settle = (patch: Partial<Extract<ThreadEntry, { kind: "id" }>>) =>
      setThread((current) =>
        current.map((entry) =>
          entry.key === key && entry.kind === "id" ? { ...entry, ...patch } : entry
        )
      );
    try {
      // The image element also supports browsers without createImageBitmap.
      const bitmap = new Image();
      bitmap.src = photoUrl;
      await bitmap.decode();
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no-canvas");
      context.drawImage(bitmap, 0, 0, width, height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      if (!base64) throw new Error("no-image");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ID_TIMEOUT_MS);
      try {
        const response = await fetch("/api/species-id", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mediaType: "image/jpeg", image: base64 }),
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          available?: boolean;
          answer?: {
            name: string | null;
            scientificName: string | null;
            note: string;
            evidence: SpeciesEvidence | null;
            recentWindowDays: number | null;
          } | null;
        };
        if (!response.ok || !body.available || !body.answer) {
          const message = response.status === 401
            ? "Sign in again to identify a photo."
            : response.status === 429
              ? "You have reached the photo limit for now. Try again later."
              : "The photo could not be identified just now. Try again with a clear close-up.";
          settle({ state: "quiet", message });
          return;
        }
        if (body.answer.name) {
          settle({
            state: "named",
            name: body.answer.name,
            scientificName: body.answer.scientificName,
            message: body.answer.note,
            evidence: body.answer.evidence,
            recentWindowDays: body.answer.recentWindowDays,
          });
        } else {
          settle({
            state: "unknown",
            message: body.answer.note,
          });
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      settle({ state: "quiet", message: "The photo could not be read or the request timed out. Try a clear JPG or PNG photo." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className={styles.sheetScrim}
        aria-label="Back to the lesson"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={styles.assistSheet}
        role="dialog"
        aria-modal="true"
        aria-label="Teacher's assistant"
      >
        <div className={`${styles.sheetInner} ${styles.assistInner}`}>
          <div className={styles.assistSheetHead}>
            <p className={styles.tSect}>Teacher&rsquo;s assistant</p>
            <button
              type="button"
              className={styles.assistClose}
              aria-label="Back to the lesson"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void identify(file);
            }}
          />

          <div className={styles.assistThread} aria-live="polite" aria-relevant="additions text">
            {thread.length === 0 && !busy && (
              <p className={styles.assistEmpty}>Ask about this lesson or something the children noticed.</p>
            )}
            {busy && !thread.some((e) => e.kind === "id" && e.state === "looking") && (
              <p className={styles.assistStatus} role="status">
                Thinking…
              </p>
            )}
            {thread.map((entry) => {
              if (entry.kind === "status") {
                return (
                  <div key={entry.key} className={styles.assistEntry}>
                    <p className={styles.assistLabel}>{entry.label}</p>
                    <p className={styles.assistBody}>{entry.text}</p>
                  </div>
                );
              }
              if (entry.kind === "support") {
                return (
                  <div key={entry.key} className={styles.assistEntry}>
                    <p className={styles.assistLabel}>{entry.label}</p>
                    <p className={styles.assistBody}>
                      <strong>{entry.draft.headline}</strong>
                    </p>
                    {entry.draft.sayAloud && (
                      <div className={styles.assistSay}>
                        <p className={styles.assistLabel}>Say this to the children</p>
                        <blockquote className={styles.assistSpoken}>
                          {entry.draft.sayAloud}
                        </blockquote>
                      </div>
                    )}
                    <p className={styles.assistBody}>{entry.draft.teacherNote}</p>
                  </div>
                );
              }
              if (entry.kind === "id") {
                return (
                  <div key={entry.key} className={styles.assistEntry}>
                    <p className={styles.assistLabel}>Photo identification</p>
                    {/* Her own photograph, at once, so the wait has something
                        in it. Never one of ours beside it: she should not
                        have to reconcile two pictures. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.assistPhoto} src={entry.photoUrl} alt="" />
                    {entry.state === "looking" && (
                      <p className={styles.assistBody} role="status">
                        Looking…
                      </p>
                    )}
                    {entry.state === "named" && (
                      <>
                        <p className={styles.assistBody}>
                          <strong>{entry.name}</strong>
                          {entry.scientificName && <em> · {entry.scientificName}</em>}
                        </p>
                        <p className={styles.assistTier}>
                          {evidenceLine(entry.evidence ?? null, entry.recentWindowDays ?? null)}
                        </p>
                        <p className={styles.assistBody}>{entry.message}</p>
                        {exploring === entry.key ? (
                          <SpeciesLearning key={entry.key} commonName={entry.name!} scientificName={entry.scientificName ?? null} />
                        ) : (
                          <button type="button" className={styles.speciesExplore} onClick={() => setExploring(entry.key)}>Explore this possible match</button>
                        )}
                        <p className={styles.assistHandoff}>
                          For handling guidance, choose Check outdoor hazards.
                        </p>
                      </>
                    )}
                    {entry.state === "unknown" && (
                      <p className={styles.assistBody}>
                        {entry.message}
                      </p>
                    )}
                    {entry.state === "quiet" && (
                      <p className={styles.assistBody}>{entry.message ?? QUIET}</p>
                    )}
                  </div>
                );
              }
              // hazards
              return (
                <div key={entry.key} className={styles.assistEntry}>
                  <p className={styles.assistLabel}>Outdoor hazards</p>
                  {hazards ? (
                    <>
                      {hazards.entries.map((hazard) => (
                        <p key={hazard.id} className={styles.assistBody}>
                          <strong>{hazard.name}.</strong> {hazard.note}
                          {/* The receipt is the product: a regional entry
                              says which recorded species put it here, so a
                              specific warning never reads as a general one. */}
                          {hazard.recordedAs && (
                            <em className={styles.assistWhence}>
                              {" "}
                              On the record for your area ({hazard.recordedAs}).
                            </em>
                          )}
                        </p>
                      ))}
                      <p className={styles.assistTier}>
                        {hazards.source === "pack"
                          ? "Written for your region."
                          : t("A general list for grounds like yours, not a survey of your patch.")}{" "}
                        Your own risk assessment leads.
                      </p>
                    </>
                  ) : (
                    <p className={styles.assistBody}>
                      {/* Whose patch we have not checked (#370). */}
                      {t(HAZARDS_UNCHECKED_CAPTION[scope])}
                    </p>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className={styles.assistDock}>
            <div className={styles.assistOptions} role="group" aria-label="Quick actions">
              <button type="button" disabled={busy} onClick={() => photoInputRef.current?.click()}>
                Identify a plant or animal
              </button>
              <button type="button" disabled={busy} onClick={() => void askSupport("Simpler explanation", "simpler")}>
                Explain this more simply
              </button>
              <button type="button" disabled={busy} onClick={() => append({ kind: "hazards" })}>
                Check outdoor hazards
              </button>
            </div>

            <form
              className={styles.assistQuestion}
              onSubmit={(event) => {
                event.preventDefault();
                if (!questionText.trim() || busy) return;
                void askSupport("Question", "child-question", questionText);
                setQuestionText("");
              }}
            >
              <label htmlFor="assist-question">Ask a question</label>
              <div className={styles.assistComposer}>
                <textarea
                  id="assist-question"
                  value={questionText}
                  maxLength={240}
                  rows={2}
                  placeholder="Ask about the lesson or something a child noticed…"
                  aria-describedby="assist-privacy"
                  onChange={(event) => setQuestionText(event.target.value)}
                />
                <button type="submit" disabled={!questionText.trim() || busy}>
                  {busy ? "Working…" : "Ask"}
                </button>
              </div>
              <p id="assist-privacy" className={styles.assistHandoff}>Leave out children’s names and personal details.</p>
            </form>

          </div>
        </div>
      </div>
    </>
  );
}
