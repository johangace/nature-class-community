// Server-only: reads a Pointmoon payload already fetched by the caller;
// makes no network call of its own. Never import from a client component.

/**
 * Live "usually around" entries, sourced from Pointmoon's multi-year
 * observation record rather than any hand-typed file (#284, #305).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Johan, 2026-08-17: "I dont want stored stuff we have hardcoded phenology
 * etc CIO to build a smart system pick up signals and show real time stuff."
 * `getOutsideNow`'s `lookFors`/`usuallyAround` read `lib/outside/data/
 * phenology/*.json` exclusively — 15 hand-typed region files, one of which
 * (`western-europe.json`) covers Portugal, Ireland, Norway, Poland, Greece
 * AND Albania with the same five rows (#305).
 *
 * Pointmoon's field-truth payload already carries a live alternative that
 * `getOutsideNow` fetches on every read and never used for this surface:
 * `facts.fieldSnapshot.observations.historical.nearby` — real species,
 * recorded at THIS point across multiple years, with a photograph and a
 * producer-computed `yearsObserved`. `lib/cast/live.ts` has trusted this same
 * list as the cast's own regional-evidence tier since #284 landed; this
 * module brings the identical trust to the "outside now" card.
 *
 * ── WHY ADDITIVE, NOT A REPLACEMENT, IN THIS PASS ──────────────────────────
 *
 * Full retirement of the JSON as this surface's species-list source is
 * tracked separately at nc#621, filed by the same ruling this file answers
 * to, specifically BECAUSE it is not a data-source swap: `lib/cast/read.ts`'s
 * `childNotes()` re-reads `getOutsideNow`'s `usuallyAround`/`lookFors` to find
 * the CHILD-LANGUAGE TEACHING LINE for every cast member — recorded members
 * included, by scientific-name match — and that authored prose is pedagogy,
 * not a presence claim, and is meant to stay (see the comment in
 * `childNotes()`). Swapping the JSON out from under that index for good would
 * silently blank the line on species the file happens to describe well (a
 * live-audited regression, not a hypothetical: Berkeley's own fixture records
 * a Monarch in BOTH `historical.nearby` and the California phenology file,
 * and only the file's prose ever mentions "butterfly").
 *
 * So this module is additive by construction: it never displaces an authored
 * entry, it only offers species the authored week does not already name, and
 * it gives them a plain, safe, generic note rather than inventing prose the
 * record cannot support. That already does real work Johan asked for — an
 * out-of-region school (`regionId === null`, no JSON coverage at all, e.g. a
 * class outside the British Isles/Europe/North America boxes) now gets real,
 * live, honestly-sourced names instead of nothing — without touching the
 * note-matching guarantee `lib/cast/read.ts` and its tests already hold.
 */

import { crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";
import type { FieldTruth } from "./pointmoon";
import type { LookFor, SeasonalName } from "./types";

export interface LiveRegionalEntries {
  usuallyAround: SeasonalName[];
  lookFors: LookFor[];
}

const EMPTY: LiveRegionalEntries = { usuallyAround: [], lookFors: [] };

/**
 * A stable identity for a species, scientific name first — the same
 * discipline `lib/cast/read.ts`'s `buildNoteIndex` uses, so a species named
 * differently by the two sources ("Monarch" vs "Danaus plexippus" would never
 * collide) still dedupes correctly against the authored week.
 */
export function speciesKey(entry: { scientificName?: string | null; name: string }): string {
  const scientific = entry.scientificName?.trim().toLowerCase();
  if (scientific) return `sci:${scientific}`;
  return `name:${entry.name.trim().toLowerCase()}`;
}

function genericNote(name: string): string {
  const note = `Look closely at ${name}. What do you notice?`;
  // Defence in depth: a generic template cannot itself cross the boundary,
  // but the safety check runs anyway so this file makes the same promise
  // every other authored-or-composed line in lib/outside/ makes.
  return crossesSafetyBoundary(note) ? `Look closely at ${name}.` : note;
}

/**
 * Species Pointmoon's own multi-year record names near this point, that the
 * authored phenology week (`covered`) does not already carry — capped at
 * `maxExtra`. Returns empty when Pointmoon sent nothing, never invents to
 * fill the cap, and never throws: a malformed entry is skipped, not fatal.
 */
export function liveRegionalEntries(
  data: FieldTruth | null,
  covered: ReadonlySet<string>,
  maxExtra: number
): LiveRegionalEntries {
  if (maxExtra <= 0) return EMPTY;
  const nearby = data?.facts?.fieldSnapshot?.observations?.historical?.nearby;
  if (!Array.isArray(nearby) || nearby.length === 0) return EMPTY;

  const usuallyAround: SeasonalName[] = [];
  const lookFors: LookFor[] = [];
  const seen = new Set<string>(covered);

  for (const entry of nearby) {
    if (usuallyAround.length >= maxExtra) break;
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!name) continue;

    const scientificName = entry.scientificName ?? undefined;
    const key = speciesKey({ scientificName, name });
    if (seen.has(key)) continue;
    seen.add(key);

    const id = `historical:${key}`;
    usuallyAround.push({ id, name, scientificName });
    lookFors.push({ id, species: name, note: genericNote(name) });
  }

  return { usuallyAround, lookFors };
}
