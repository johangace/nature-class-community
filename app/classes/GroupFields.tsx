"use client";

import { useState } from "react";
import { AGE_RANGES, GROUP_OPTIONS, GROUP_TYPES, type GroupType } from "@/lib/group-profile";

/** Additional groups use the same audience/age vocabulary as first run. */
export function GroupFields({ defaultType }: { defaultType?: string | null }) {
  const [type, setType] = useState<GroupType>(
    GROUP_TYPES.includes(defaultType as GroupType) ? defaultType as GroupType : "school"
  );
  const group = GROUP_OPTIONS.find((option) => option.value === type)!;
  return (
    <>
      <label className="signin-label">
        Who is this for?
        <select className="signin-input" name="groupType" value={type}
          onChange={(event) => setType(event.target.value as GroupType)}>
          {GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="signin-label">
        {type === "school" ? "Class name (optional)" : type === "family" ? "Family name (optional)" : "Group name (optional)"}
        <input className="signin-input" name="name" maxLength={80} placeholder={group.placeholder} />
      </label>
      <label className="signin-label">
        What age range?
        <select className="signin-input" name="ageRange" defaultValue={AGE_RANGES[0]}>
          {AGE_RANGES.map((range) => <option key={range} value={range}>{range}</option>)}
        </select>
      </label>
    </>
  );
}
