"use client";

import { useState } from "react";

/**
 * Where a new class goes out (#913): one of the teacher's places, or
 * somewhere new. The School field only exists for "somewhere new", because
 * an existing place already knows its school and asking again is the
 * double-ask #905 was filed for. Server-side, createClass takes the school
 * from the chosen place when one is chosen, so this hides a box rather than
 * relaxing a rule.
 */
export function NewClassPlace({
  options,
  defaultId,
  label,
}: {
  options: { id: string; name: string }[];
  defaultId: string;
  /** "Place", through the locale layer. */
  label: string;
}) {
  const [choice, setChoice] = useState(defaultId);
  return (
    <>
      <label className="signin-label">
        {label}
        <select
          className="signin-input"
          name="groundsId"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          <option value="new">Somewhere new</option>
        </select>
      </label>
      {choice === "new" && (
        <label className="signin-label">
          Place name
          <input
            className="signin-input"
            name="school"
            required
            maxLength={120}
            placeholder="e.g. School garden or local park"
          />
        </label>
      )}
    </>
  );
}
