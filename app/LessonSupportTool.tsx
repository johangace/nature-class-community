"use client";

import { useState } from "react";
import type {
  LessonSupportDraft,
  LessonSupportTask,
} from "@/lib/ai/lesson-support-contract";
import type { AbilityBand } from "@/schema/pack";

export interface LessonSupportAction {
  task: LessonSupportTask;
  label: string;
  prompt?: string;
  placeholder?: string;
}

type SupportResponse = {
  available?: boolean;
  draft?: LessonSupportDraft | null;
  error?: string;
};

export function LessonSupportTool({
  actions,
  ability,
  className,
  locale,
  phaseKey,
  sessionId,
  title,
}: {
  actions: LessonSupportAction[];
  ability?: AbilityBand;
  className: string;
  locale?: string;
  phaseKey?: string;
  sessionId: string;
  title: string;
}) {
  const [selected, setSelected] = useState<LessonSupportAction | null>(null);
  const [constraint, setConstraint] = useState("");
  const [draft, setDraft] = useState<LessonSupportDraft | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");

  async function ask(action: LessonSupportAction, immediateConstraint?: string) {
    setStatus("loading");
    setDraft(null);
    try {
      const response = await fetch("/api/lesson-support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          task: action.task,
          phaseKey,
          ability,
          locale,
          constraint: immediateConstraint?.trim() || undefined,
        }),
      });
      const body = (await response.json()) as SupportResponse;
      if (!response.ok) {
        setStatus("error");
        return;
      }
      if (!body.available || !body.draft) {
        setStatus("empty");
        return;
      }
      setDraft(body.draft);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function choose(action: LessonSupportAction) {
    setStatus("idle");
    setDraft(null);
    setConstraint("");
    setSelected(action);
    if (!action.prompt) void ask(action);
  }

  return (
    <section className={className} aria-label={title}>
      <div className="lesson-support-heading">
        <h2>{title}</h2>
        <p>Optional help. Your lesson route and safety stay unchanged.</p>
      </div>
      <div className="lesson-support-actions" role="group" aria-label="Choose help">
        {actions.map((action) => (
          <button
            key={action.task}
            type="button"
            aria-pressed={selected?.task === action.task}
            disabled={status === "loading"}
            onClick={() => choose(action)}
          >
            {action.label}
          </button>
        ))}
      </div>

      {selected?.prompt && (
        <form
          className="lesson-support-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (constraint.trim()) void ask(selected, constraint);
          }}
        >
          <label htmlFor={`lesson-support-${selected.task}`}>{selected.prompt}</label>
          <textarea
            id={`lesson-support-${selected.task}`}
            value={constraint}
            maxLength={240}
            rows={2}
            placeholder={selected.placeholder}
            onChange={(event) => setConstraint(event.target.value)}
          />
          {selected.task === "child-question" && (
            <small>Leave out the child&rsquo;s name and any identifying detail.</small>
          )}
          <button type="submit" disabled={!constraint.trim() || status === "loading"}>
            {status === "loading" ? "Thinking…" : "Draft help"}
          </button>
        </form>
      )}

      {status === "loading" && !selected?.prompt && (
        <p className="lesson-support-status" role="status">Thinking…</p>
      )}
      {status === "empty" && (
        <p className="lesson-support-status" role="status">
          No safe suggestion arrived. Keep the authored lesson as it is.
        </p>
      )}
      {status === "error" && (
        <p className="lesson-support-status" role="status">
          Help is quiet just now. The lesson is ready without it.
        </p>
      )}
      {draft && (
        <article className="lesson-support-draft" aria-live="polite">
          <h3>{draft.headline}</h3>
          <p>{draft.teacherNote}</p>
          {draft.sayAloud && <blockquote>{draft.sayAloud}</blockquote>}
          {draft.change && <small>{draft.change}</small>}
        </article>
      )}
    </section>
  );
}
