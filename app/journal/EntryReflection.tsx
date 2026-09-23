"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReflectionRow } from "../ReflectionTaps";
import {
  happeningOptions,
  moodOptions,
  moreOfOptions,
  reflectionWords,
  timingOptions,
} from "@/lib/reflection";
import { NOTE_MAX } from "@/lib/reflection-note";

/**
 * One journal entry's reflection: what was tapped, and the way to tap it later.
 *
 * The runner asks these four questions once, on the finish page, outside. A
 * teacher who skipped them there had no second chance (#327) — so this is the
 * second chance, indoors, with the class gone in. Same four questions, same
 * closed vocabulary, same component (ReflectionTaps) the finish renders.
 *
 * Closed, it is a record: the taps as chips, or the honest line saying there
 * are none. Open, it is the same form the finish shows, prefilled with what is
 * stored, saving through PATCH /api/completions/[id]. Prefilled and replacing
 * means a teacher can un-tap something she chose in the field, which is the
 * whole reason a record gets revisited.
 *
 * The saved state is held here rather than re-read from the server, so the
 * chips change under the teacher's hand the moment the write lands. The
 * router refresh behind it is for the page's term summary, which counts these
 * same taps and would otherwise sit one save behind.
 */

export interface StoredReflection {
  mood: string | null;
  happenings: string[];
  timing: string | null;
  moreOf: string | null;
  /** "Anything else?" in her own words, or null (#347). */
  note: string | null;
}

/** True when nothing at all was recorded: the "no reflection" state. */
export function isEmptyReflection(r: StoredReflection): boolean {
  return (
    !r.mood && r.happenings.length === 0 && !r.timing && !r.moreOf && !r.note
  );
}

/** True when at least one question is still unanswered. */
function isPartial(r: StoredReflection): boolean {
  return (
    !r.mood || r.happenings.length === 0 || !r.timing || !r.moreOf || !r.note
  );
}

/** Every stored token, in the order the questions are asked. */
function chipsOf(r: StoredReflection): string[] {
  return [
    ...(r.mood ? [r.mood] : []),
    ...r.happenings,
    ...(r.timing ? [r.timing] : []),
    ...(r.moreOf ? [r.moreOf] : []),
  ];
}

type SaveState = "closed" | "open" | "saving" | "failed";

export function EntryReflection({
  completionId,
  reflection,
}: {
  completionId: string;
  reflection: StoredReflection;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<StoredReflection>(reflection);
  const [state, setState] = useState<SaveState>("closed");

  // The form's own state, seeded from what is stored each time it opens.
  const [mood, setMood] = useState<string | null>(reflection.mood);
  const [happenings, setHappenings] = useState<string[]>(reflection.happenings);
  const [timing, setTiming] = useState<string | null>(reflection.timing);
  const [moreOf, setMoreOf] = useState<string | null>(reflection.moreOf);
  const [note, setNote] = useState(reflection.note ?? "");

  const open = () => {
    setMood(saved.mood);
    setHappenings(saved.happenings);
    setTiming(saved.timing);
    setMoreOf(saved.moreOf);
    setNote(saved.note ?? "");
    setState("open");
  };

  async function save() {
    const trimmed = note.trim();
    const next: StoredReflection = {
      mood,
      happenings,
      timing,
      moreOf,
      note: trimmed === "" ? null : trimmed,
    };
    setState("saving");
    try {
      const res = await fetch(`/api/completions/${completionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        setState("failed");
        return;
      }
      setSaved(next);
      setState("closed");
      // The term summary above counts these taps; keep it honest.
      router.refresh();
    } catch {
      setState("failed");
    }
  }

  if (state === "closed") {
    const chips = chipsOf(saved);
    return (
      <div className="entry-reflection">
        {chips.length > 0 && (
          <ul className="entry-chips">
            {chips.map((key) => (
              <li key={key}>{reflectionWords(key)}</li>
            ))}
          </ul>
        )}
        {/*
          Her own words, set as words rather than as another chip: this is the
          one part of the record she wrote rather than tapped, and it reads as
          the journal entry the rest of the row is context for.
        */}
        {saved.note && <p className="entry-note">{saved.note}</p>}
        {chips.length === 0 && !saved.note && (
          <p className="entry-unreflected">Logged without a reflection.</p>
        )}
        {isPartial(saved) && (
          <button type="button" className="entry-reflect-open" onClick={open}>
            {isEmptyReflection(saved) ? "Add a reflection" : "Answer the rest"}
          </button>
        )}
      </div>
    );
  }

  const busy = state === "saving";
  return (
    <div className="entry-reflection">
      <div className="reflection entry-reflection-form">
        <p className="reflection-sub">
          A moment for you, now the class is in. Every question is optional.
        </p>
        <ReflectionRow
          label="How did it feel?"
          options={moodOptions}
          isActive={(key) => mood === key}
          onTap={(key) => setMood((prev) => (prev === key ? null : key))}
          disabled={busy}
        />
        <ReflectionRow
          label="What happened out there?"
          options={happeningOptions}
          isActive={(key) => happenings.includes(key)}
          onTap={(key) =>
            setHappenings((prev) =>
              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
            )
          }
          disabled={busy}
        />
        <ReflectionRow
          label="How was the time?"
          options={timingOptions}
          isActive={(key) => timing === key}
          onTap={(key) => setTiming((prev) => (prev === key ? null : key))}
          disabled={busy}
        />
        <ReflectionRow
          label="What would your class like to do more of?"
          options={moreOfOptions}
          isActive={(key) => moreOf === key}
          onTap={(key) => setMoreOf((prev) => (prev === key ? null : key))}
          disabled={busy}
        />
        {/*
          The same box the finish shows, and the reason this page is worth
          having for it: a sentence about what actually happened is the thing
          a teacher least often has a free hand for while it is happening.
        */}
        <label className="reflection-note">
          <span className="reflection-label">Anything else?</span>
          <textarea
            className="reflection-note-box"
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="What worked? What surprised you?"
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {state === "failed" && (
          <p className="reflection-hint" role="alert">
            This could not be saved. Try again in a moment.
          </p>
        )}
        <div className="reflection-foot">
          <button
            type="button"
            className="log-submit"
            onClick={save}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save to the journal"}
          </button>
          <button
            type="button"
            className="reflection-skip"
            onClick={() => setState("closed")}
            disabled={busy}
          >
            Leave it
          </button>
        </div>
      </div>
    </div>
  );
}
