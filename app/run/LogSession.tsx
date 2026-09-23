"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGroupNoun } from "./GroupNoun";
import {
  completionClientKey,
  completionQueueKey,
  enqueueCompletion,
  isTerminalCompletionStatus,
  parseCompletionQueue,
  removeCompletionKeys,
  type CompletionDraft,
} from "@/lib/run/completion-queue";

export type { CompletionDraft } from "@/lib/run/completion-queue";

import {
  happeningOptions,
  moodOptions,
  moreOfOptions,
  timingOptions,
} from "@/lib/reflection";
import { NOTE_MAX } from "@/lib/reflection-note";
import { ReflectionRow } from "../ReflectionTaps";

function readQueue(classId: string): CompletionDraft[] {
  try {
    return parseCompletionQueue(
      window.localStorage.getItem(completionQueueKey(classId)),
      { classId }
    );
  } catch {
    return [];
  }
}

/** True only when the queue can be read back from the device. */
function writeQueue(classId: string, queue: readonly CompletionDraft[]): boolean {
  try {
    const key = completionQueueKey(classId);
    if (queue.length === 0) {
      window.localStorage.removeItem(key);
      return window.localStorage.getItem(key) === null;
    }
    window.localStorage.setItem(key, JSON.stringify(queue));
    const saved = parseCompletionQueue(window.localStorage.getItem(key), { classId });
    return (
      saved.length === queue.length &&
      saved.every((draft, index) => draft.clientKey === queue[index]?.clientKey)
    );
  } catch {
    return false;
  }
}

type PostResult =
  | { at: "sent"; minutesAdded: number; totalMinutes: number }
  | { at: "rejected" }
  | { at: "unreachable" };

async function post(draft: CompletionDraft): Promise<PostResult> {
  const payload = {
    sessionId: draft.sessionId,
    classId: draft.classId,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    ...(draft.headcount === undefined ? {} : { headcount: draft.headcount }),
    mood: draft.mood,
    happenings: draft.happenings,
    timing: draft.timing,
    moreOf: draft.moreOf,
    note: draft.note,
    clientKey: draft.clientKey,
  };
  try {
    const res = await fetch("/api/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        minutesAdded: number;
        totalMinutes: number;
      };
      return {
        at: "sent",
        minutesAdded: data.minutesAdded,
        totalMinutes: data.totalMinutes,
      };
    }
    return isTerminalCompletionStatus(res.status)
      ? { at: "rejected" }
      : { at: "unreachable" };
  } catch {
    return { at: "unreachable" };
  }
}

/** Drain only the active class's queue and report the drafts the server accepted. */
export interface CompletionDrainResult {
  sent: number;
  accepted: CompletionDraft[];
}

export async function drainQueue(classId: string): Promise<CompletionDrainResult> {
  const queue = readQueue(classId);
  if (queue.length === 0) {
    // Physically clear malformed or all-invalid storage, not only its parsed view.
    writeQueue(classId, []);
    return { sent: 0, accepted: [] };
  }
  const settledKeys = new Set<string>();
  const accepted: CompletionDraft[] = [];
  let sent = 0;
  for (const draft of queue) {
    const result = await post(draft);
    if (result.at === "sent") {
      sent += 1;
      accepted.push(draft);
      settledKeys.add(draft.clientKey);
    } else if (result.at === "rejected") {
      // Terminal 4xx: this class/session request will not improve by retrying.
      settledKeys.add(draft.clientKey);
    }
  }
  // Re-read after the awaits so a completion added during this drain survives.
  writeQueue(
    classId,
    removeCompletionKeys(readQueue(classId), settledKeys)
  );
  return { sent, accepted };
}

/*
 * The finish used to be counted from here, in three places: the live send, the
 * queue drain at mount, and a `lesson_run_queued_offline` for the send that
 * could not go out.
 *
 * All three are gone, and the completion is now reported by the server that
 * accepts it (lib/analytics/server.ts). A browser on a school network is the
 * worst available witness to the number this product exists to move, and the
 * offline event was close to unobservable by construction: genuinely out of
 * signal, the beacon reporting it could not leave either. What that event was
 * reaching for now arrives as `from_queue` on the completion itself, derived
 * server-side from how late it turned up, and only for completions that
 * actually reached us.
 */

type SendState =
  | { at: "asking" }
  | { at: "sending" }
  | {
      at: "logged";
      minutesAdded: number;
      totalMinutes: number;
      countedChildren: boolean;
    }
  | { at: "kept" }
  | { at: "failed" };

function ReceiptActions({
  homeHref,
  onStartAgain,
}: {
  homeHref: "/" | "/today";
  onStartAgain: () => void;
}) {
  // Print left the finish by founder ruling: paper belongs with reading the
  // lesson. One way home, one reset.
  return (
    <div className="done-links completion-actions">
      <Link href={homeHref}>Back to today</Link>
      <button type="button" onClick={onStartAgain}>
        Start again
      </button>
    </div>
  );
}

export function LogSession({
  sessionId,
  classId,
  className,
  homeHref = "/today",
  runStartedAt,
  startedAt,
  nextTitle,
  onStartAgain,
  onCompleted,
  actionsInto = null,
}: {
  sessionId: string;
  classId: string;
  className: string;
  homeHref?: "/" | "/today";
  /** Raw run start: stable identity even while a paused clock is frozen. */
  runStartedAt: number | null;
  /** Pause-adjusted start sent to the completion endpoint for honest minutes. */
  startedAt: number | null;
  /**
   * WHERE THE SAVE BUTTON STANDS (Johan, 2026-09-08: "finish here should
   * also be static"). Given an element, the action row — the save button,
   * its note and the failure hint — renders into it instead of at the foot of
   * the card, so the journey can hold it in its sticky foot beside the way
   * back. The state stays here; only the pixels move. Null keeps the row in
   * the card, which is what the legacy runner still wants.
   */
  actionsInto?: HTMLElement | null;
  /** The next session up on the shelf, for the after-save line. */
  nextTitle?: string | null;
  onStartAgain: () => void;
  /** Called only after the server accepted the record. Queued finishes keep
   * their exact saved run position so a reload returns to the kept receipt. */
  onCompleted: () => void;
}) {
  const expectedClientKey =
    runStartedAt === null
      ? null
      : completionClientKey(classId, sessionId, runStartedAt);
  const [queuedAtMount] = useState(() =>
    expectedClientKey === null
      ? null
      : readQueue(classId).find(
          (draft) => draft.clientKey === expectedClientKey
        ) ?? null
  );
  // The optional reflection: every field is skippable, including headcount,
  // and a second tap un-picks. The four taps are closed vocabulary
  // (lib/reflection); the note below is the one written answer (#347).
  const [mood, setMood] = useState<string | null>(null);
  const [happenings, setHappenings] = useState<string[]>([]);
  const [timing, setTiming] = useState<string | null>(null);
  const [moreOf, setMoreOf] = useState<string | null>(null);
  // "Anything else?" — her own words (#347). Seeded from a queued draft so a
  // finish restored from the offline queue still shows what she wrote.
  const [note, setNote] = useState(queuedAtMount?.note ?? "");
  const [headcount, setHeadcount] = useState(
    queuedAtMount?.headcount === undefined ? "" : String(queuedAtMount.headcount)
  );
  const [state, setState] = useState<SendState>(
    queuedAtMount ? { at: "kept" } : { at: "asking" }
  );
  const groupNoun = useGroupNoun();
  const headingId = useId();
  const countHintId = useId();
  const countErrorId = useId();
  const draftRef = useRef<CompletionDraft | null>(queuedAtMount);
  const completedRef = useRef(onCompleted);
  completedRef.current = onCompleted;

  // A finish restored from the offline queue owns its retry. On acceptance it
  // removes only that stable key, changes the kept receipt to a server receipt,
  // and clears this run's saved finish. A network miss leaves both untouched.
  useEffect(() => {
    if (!queuedAtMount) return;
    let cancelled = false;

    void post(queuedAtMount).then((result) => {
      if (cancelled) return;
      if (result.at === "unreachable") return;

      writeQueue(
        classId,
        removeCompletionKeys(readQueue(classId), new Set([queuedAtMount.clientKey]))
      );
      if (result.at === "sent") {
        setState({
          at: "logged",
          minutesAdded: result.minutesAdded,
          totalMinutes: result.totalMinutes,
          countedChildren: queuedAtMount.headcount !== undefined,
        });
        completedRef.current();
      } else {
        draftRef.current = null;
        setState({ at: "failed" });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [classId, queuedAtMount]);

  const count = headcount === "" ? null : Number(headcount);
  const countIsValid =
    count === null || (Number.isInteger(count) && count >= 1 && count <= 40);

  function nudgeHeadcount(change: -1 | 1) {
    const current = countIsValid && count !== null ? count : 0;
    const next = current + change;
    setHeadcount(next < 1 ? "" : String(Math.min(next, 40)));
    draftRef.current = null;
    if (state.at === "failed") setState({ at: "asking" });
  }

  async function log() {
    if (!countIsValid) return;

    const endedAt = Date.now();
    const stableStartedAt = startedAt ?? endedAt;
    const identityStartedAt = runStartedAt ?? stableStartedAt;
    const draft: CompletionDraft =
      draftRef.current ??
      ({
        version: 1,
        sessionId,
        classId,
        startedAt: stableStartedAt,
        endedAt,
        ...(count === null ? {} : { headcount: count }),
        ...(mood ? { mood } : {}),
        ...(happenings.length > 0 ? { happenings } : {}),
        ...(timing ? { timing } : {}),
        ...(moreOf ? { moreOf } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        clientKey: completionClientKey(classId, sessionId, identityStartedAt),
      } satisfies CompletionDraft);
    draftRef.current = draft;
    setState({ at: "sending" });

    const result = await post(draft);
    if (result.at === "sent") {
      setState({
        at: "logged",
        minutesAdded: result.minutesAdded,
        totalMinutes: result.totalMinutes,
        countedChildren: draft.headcount !== undefined,
      });
      onCompleted();
      return;
    }
    if (result.at === "rejected") {
      draftRef.current = null;
      setState({ at: "failed" });
      return;
    }

    const queued = enqueueCompletion(readQueue(classId), draft);
    if (writeQueue(classId, queued)) {
      setState({ at: "kept" });
    } else {
      setState({ at: "failed" });
    }
  }

  if (state.at === "logged") {
    return (
      <div className="log-session" aria-live="polite">
        <p className="log-done">
          {state.countedChildren ? (
            <>
              Saved for {className}: {state.minutesAdded.toLocaleString()} child-minutes
              outside today, {state.totalMinutes.toLocaleString()} so far. That time is
              real, and you led it.
            </>
          ) : (
            <>Saved for {className}. Today is tucked safely into your journal.</>
          )}
        </p>
        <ReceiptActions homeHref={homeHref} onStartAgain={onStartAgain} />
      </div>
    );
  }

  if (state.at === "kept") {
    return (
      <div className="log-session" aria-live="polite">
        <p className="log-done">
          Kept on this iPad for {className}. It will be saved when you&rsquo;re back
          online.
        </p>
        <ReceiptActions homeHref={homeHref} onStartAgain={onStartAgain} />
      </div>
    );
  }

  return (
    <div className="log-session">
      <section className="reflection-card" aria-labelledby={headingId}>
        <header className="reflection-intro">
          <span className="reflection-mark" aria-hidden="true" />
          <p className="reflection-kicker">Your reflection</p>
          <h3 className="reflection-title" id={headingId}>
            Finish for {className}
          </h3>
          <p className="reflection-sub">
            Keep what feels useful from today. Everything here is optional and
            private to you.
          </p>
        </header>

        <div className="reflection-count">
          <div className="reflection-count-copy">
            <div className="reflection-count-heading">
              <label className="reflection-label" htmlFor={`${headingId}-count`}>
                Children outside
              </label>
              <span className="reflection-optional">Optional</span>
            </div>
            <p className="reflection-hint" id={countHintId}>
              Add a number if you want to build {className}&rsquo;s outside-time total.
            </p>
          </div>
          <div className="log-count-control">
            <button
              type="button"
              aria-label="Remove one child"
              disabled={state.at === "sending" || headcount === "" || !countIsValid}
              onClick={() => nudgeHeadcount(-1)}
            >
              &minus;
            </button>
            <input
              aria-describedby={`${countHintId}${countIsValid ? "" : ` ${countErrorId}`}`}
              aria-invalid={!countIsValid}
              className="log-count"
              id={`${headingId}-count`}
              type="number"
              inputMode="numeric"
              min={1}
              max={40}
              step={1}
              placeholder="—"
              value={headcount}
              disabled={state.at === "sending"}
              onChange={(event) => {
                setHeadcount(event.target.value);
                draftRef.current = null;
                if (state.at === "failed") setState({ at: "asking" });
              }}
            />
            <button
              type="button"
              aria-label="Add one child"
              disabled={state.at === "sending" || !countIsValid || count === 40}
              onClick={() => nudgeHeadcount(1)}
            >
              +
            </button>
          </div>
          {!countIsValid && (
            <p className="reflection-count-error" id={countErrorId} role="alert">
              Enter a whole number from 1 to 40, or leave this blank.
            </p>
          )}
        </div>

        <div className="reflection">
          <ReflectionRow
            label="How did it feel?"
            options={moodOptions}
            isActive={(key) => mood === key}
            disabled={state.at === "sending"}
            onTap={(key) => {
              setMood((prev) => (prev === key ? null : key));
              draftRef.current = null;
            }}
          />
          <ReflectionRow
            label="What happened out there?"
            options={happeningOptions}
            isActive={(key) => happenings.includes(key)}
            disabled={state.at === "sending"}
            onTap={(key) => {
              setHappenings((prev) =>
                prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
              );
              draftRef.current = null;
            }}
          />
          <ReflectionRow
            label="How was the time?"
            options={timingOptions}
            isActive={(key) => timing === key}
            disabled={state.at === "sending"}
            onTap={(key) => {
              setTiming((prev) => (prev === key ? null : key));
              draftRef.current = null;
            }}
          />
          <ReflectionRow
            label={`What would your ${groupNoun} like to do more of?`}
            options={moreOfOptions}
            isActive={(key) => moreOf === key}
            disabled={state.at === "sending"}
            onTap={(key) => {
              setMoreOf((prev) => (prev === key ? null : key));
              draftRef.current = null;
            }}
          />
          {/*
            Her own words stay last: a teacher without two free hands has already
            reached every tap, and can still save without writing.
          */}
          <label className="reflection-note">
            <span className="reflection-label">Anything else?</span>
            <textarea
              className="reflection-note-box"
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder="What worked? What surprised you?"
              disabled={state.at === "sending"}
              onChange={(event) => {
                setNote(event.target.value);
                draftRef.current = null;
              }}
            />
          </label>
        </div>

        {/* In the card, or in the journey's sticky foot: same row, same
            state (see `actionsInto`). */}
        {((actions) => (actionsInto ? createPortal(actions, actionsInto) : actions))(
          <div className="reflection-actions">
            {state.at === "failed" && (
              <p className="reflection-hint" role="alert">
                This could not be saved or kept on this iPad. Try again before leaving.
              </p>
            )}
            <button
              type="button"
              className="log-submit"
              onClick={log}
              disabled={state.at === "sending" || !countIsValid}
            >
              {state.at === "sending" ? "Saving…" : "Finish and save"}
            </button>
            <span className="reflection-save-note">You can save without answering.</span>
          </div>
        )}
      </section>
    </div>
  );
}
