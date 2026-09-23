"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OutsideScope } from "@/lib/outside/captions";

/**
 * WHOSE PATCH THE RUNNER IS TALKING ABOUT (#370).
 *
 * Signed-out sample mode has no school and no grounds. Today and the door
 * learned that in #373, which scoped `app/TodayDay.tsx` and `lib/lesson/door.ts`
 * through `lib/outside/captions.ts` and said in its own body that it only
 * "advances #370". `app/run` was left out, so the entity sheet still said
 * "near your school" and the assistant still said "for your grounds" to a
 * visitor who has neither.
 *
 * ── WHY A CONTEXT AND NOT A PROP ───────────────────────────────────────────
 *
 * The same reason `GroupNoun.tsx` gives for #1214, on the same surface: the
 * two strings live in two files, one of which (`AssistantSheet`) is rendered
 * from two places inside `HybridJourney`, and `EntitySheet` from two more. A
 * prop is threaded four ways and forgotten on the fifth. One provider at the
 * page, and the scope arrives wherever the runner makes a claim.
 *
 * ── WHY THE DEFAULT IS THE SCHOOL WORD ─────────────────────────────────────
 *
 * So that a surface rendered outside the provider — a test, a future entry
 * point — reads exactly as it did before this file existed rather than
 * quietly telling a real school it is a sample patch.
 *
 * That default is also the trap, and it is worth naming rather than trusting:
 * a provider that is never mounted reinstates the whole bug in silence, and
 * every existing test stays green while it does. So the guard in
 * `tests/unit/runner-scope-claims.spec.tsx` does not assert the captions
 * alone — it renders the sheets under each scope AND pins that
 * `app/run/page.tsx` wraps its returns in this provider, which is the half a
 * caption assertion cannot see.
 */
const RunScopeContext = createContext<OutsideScope>("school");

export function RunScopeProvider(props: { scope: OutsideScope; children: ReactNode }) {
  return <RunScopeContext.Provider value={props.scope}>{props.children}</RunScopeContext.Provider>;
}

/** Whose patch this run is reading for: "school", "sample" or "chosen". */
export function useRunScope(): OutsideScope {
  return useContext(RunScopeContext);
}
