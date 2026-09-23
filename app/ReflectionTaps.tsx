"use client";

import type { ReflectionOption } from "@/lib/reflection";

/**
 * One reflection question: its label, and its closed vocabulary as taps.
 *
 * Lifted out of the runner's finish (app/run/LogSession.tsx) when the journal
 * gained a second place to answer the same four questions (#327). Both callers
 * render the SAME lists from lib/reflection.ts through the SAME markup, so the
 * finish and the journal cannot drift into two different vocabularies — which
 * is the whole point of the closed lists: the buttons, the API validator and
 * the journal's words all read one file.
 *
 * A tap toggles. There is no clear-all and no free-text row, here or anywhere:
 * see the header of lib/reflection.ts for why an "anything else?" box is not a
 * component someone adds.
 */
export function ReflectionRow({
  label,
  options,
  isActive,
  onTap,
  disabled,
}: {
  label: string;
  options: readonly ReflectionOption<string>[];
  isActive: (key: string) => boolean;
  onTap: (key: string) => void;
  /** True while a save is in flight, so a second tap can't race the first. */
  disabled?: boolean;
}) {
  return (
    <div className="reflection-question">
      <span className="reflection-label">{label}</span>
      <div className="reflection-taps">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={isActive(option.key) ? "active" : ""}
            aria-pressed={isActive(option.key)}
            disabled={disabled}
            onClick={() => onTap(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
