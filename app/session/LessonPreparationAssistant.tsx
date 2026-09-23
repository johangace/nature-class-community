"use client";

import {
  LessonSupportTool,
  type LessonSupportAction,
} from "@/app/LessonSupportTool";
import type { LessonSupportTask } from "@/lib/ai/lesson-support-contract";

const actionByTask: Record<LessonSupportTask, LessonSupportAction> = {
  age: { task: "age", label: "Adapt for this age" },
  hyperlocal: { task: "hyperlocal", label: "Make it local" },
  explain: { task: "explain", label: "Explain the lesson" },
  time: {
    task: "time",
    label: "Change the time",
    prompt: "How much time do you have?",
    placeholder: "For example: 20 minutes",
  },
  space: {
    task: "space",
    label: "Change the space",
    prompt: "What safe space do you have?",
    placeholder: "For example: a small paved courtyard",
  },
  materials: {
    task: "materials",
    label: "Change materials",
    prompt: "What is missing or different?",
    placeholder: "For example: no glue sticks",
  },
  simpler: { task: "simpler", label: "Make this simpler" },
  movement: { task: "movement", label: "Add movement" },
  challenge: { task: "challenge", label: "Add challenge" },
  "child-question": {
    task: "child-question",
    label: "A child asked…",
    prompt: "What did they ask?",
    placeholder: "Type the question without a name",
  },
};

export function LessonPreparationAssistant({
  enabled,
  locale,
  sessionId,
  tasks,
}: {
  enabled: boolean;
  locale?: string;
  sessionId: string;
  tasks: LessonSupportTask[];
}) {
  if (!enabled) return null;
  return (
    <LessonSupportTool
      actions={tasks.map((task) => actionByTask[task])}
      className="lesson-support lesson-support-prep"
      locale={locale}
      sessionId={sessionId}
      title="Shape this lesson"
    />
  );
}
