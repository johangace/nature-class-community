"use client";

import { LessonMediaStrip } from "@/app/session/LessonMediaStrip";
import type { LessonMediaItem } from "@/lib/lesson/media";

/** Source-backed photographs stay one tap away without becoming a run phase. */
export function FieldReferenceTray({ items }: { items: LessonMediaItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="field-reference-tray">
      <summary>Photo references · {items.length}</summary>
      <LessonMediaStrip items={items} heading="What has been recorded nearby" />
    </details>
  );
}
