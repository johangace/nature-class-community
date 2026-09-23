"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * WHO IS HOLDING THE PHONE (#1214).
 *
 * The runner told everyone they were teaching a class. Thirteen strings in
 * `app/run` said "the class" or "your class" — the settle, the circle, the
 * present-to-board control, the reflection question — to a family in a garden
 * and a Saturday nature club just as readily as to Year 4.
 *
 * ── WHY A NOUN AND NOT NEUTRAL COPY ────────────────────────────────────────
 *
 * The cheap fix is "everyone", and #467 declined it on the record: it costs
 * the majority audience the word they actually use. This repository already
 * shipped the other answer in `lib/group-profile.ts` — `groupNoun(groupType)`
 * returns "class" | "family" | "group", and `/world`, `/account` and
 * `/classes` have varied their copy that way since #1156. Its default is
 * deliberate and documented on the function: **missing audience means an
 * existing school record, not an inferred family**. So a school keeps
 * "class", a signed-out visitor keeps "class", and only a group that said it
 * was a family or a club reads as one.
 *
 * ── WHY A CONTEXT AND NOT A PROP ───────────────────────────────────────────
 *
 * `app/run` could not reach `groupType` at all: zero occurrences of it in the
 * whole directory. The strings live in four files, two of which
 * (`CircleTime`, `FieldPhotos`, `LogSession`) are rendered by BOTH runners, so
 * a prop would be threaded five ways and forgotten on the sixth. One provider
 * at the page, beside `GlossaryProvider` and for the same reason, and the
 * word arrives wherever the runner draws it.
 *
 * The default is the school word, so a surface rendered outside the provider —
 * a test, a future entry point — reads exactly as it did before this file
 * existed rather than losing the noun entirely.
 */
export type { GroupNoun } from "@/lib/group-profile";
import type { GroupNoun } from "@/lib/group-profile";

const GroupNounContext = createContext<GroupNoun>("class");

export function GroupNounProvider(props: { noun: GroupNoun; children: ReactNode }) {
  return (
    <GroupNounContext.Provider value={props.noun}>{props.children}</GroupNounContext.Provider>
  );
}

/** The word for the people in front of her: "class", "family" or "group". */
export function useGroupNoun(): GroupNoun {
  return useContext(GroupNounContext);
}
