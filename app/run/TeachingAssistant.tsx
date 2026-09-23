"use client";

import { LessonSupportTool, type LessonSupportAction } from "@/app/LessonSupportTool";
import type { AbilityBand } from "@/schema/pack";

const teachingActions: LessonSupportAction[] = [
  { task: "simpler", label: "Make this simpler" },
  { task: "movement", label: "Add movement" },
  { task: "challenge", label: "Add challenge" },
  {
    task: "child-question",
    label: "A child asked…",
    prompt: "What did they ask?",
    placeholder: "Type the question without a name",
  },
];

export function TeachingAssistant({
  ability,
  enabled,
  locale,
  phaseKey,
  sessionId,
}: {
  /** The class's band, or undefined when nobody knows it (#860). */
  ability: AbilityBand | undefined;
  enabled: boolean;
  locale?: string;
  phaseKey?: string;
  sessionId: string;
}) {
  if (!enabled) return null;
  return (
    <LessonSupportTool
      actions={teachingActions}
      ability={ability}
      className="lesson-support lesson-support-run"
      locale={locale}
      phaseKey={phaseKey}
      sessionId={sessionId}
      // The visible title had drifted from the component's own name (#378,
      // Johan: it is called teacher's assistant, like it was before).
      title="Teacher's assistant"
    />
  );
}
