import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveClimate } from "@/lib/outside/climate";
import { resolvePhenologyRegion } from "@/lib/outside/regions";
import {
  ACRONYMS,
  CHILD,
  FIELD_AUDIENCE,
  allowedInField,
} from "../../scripts/lib/acronyms.mjs";

/**
 * The register guard on the phenology data (#188).
 *
 * WHOSE WRITING THIS GOVERNS: HOUSE. `lib/outside/data/phenology/*.json` is
 * content an agent wrote, not the founder's curriculum. His sessions live in
 * `packs/` and are held to their source rows by `scripts/verbatim-fidelity.mjs`
 * — the only check in this repo permitted an opinion about his text. This one
 * never reads them. See `scripts/authorship.mjs` for why that boundary is
 * enforced rather than remembered.
 *
 * WHY IT MATTERS MORE THAN IT USED TO. `childFriendlyNote` was teacher-adjacent
 * trivia until Johan's ruling of 2026-08-11 ("give some info about the species
 * in the childs language") put it on the face of the daily card. The same
 * strings also feed `lib/grounding.ts`, which hands them to the model as fact.
 * All-caps emphasis that was merely untidy in a data file is now shouting at a
 * seven-year-old and priming the model to shout back.
 *
 * SWEPT, AND NOW THE WHOLE DIRECTORY. Each region was rewritten by hand and
 * joined the list below when its file was clean. us-california went first
 * because Berkeley is the demo school; the remaining fourteen landed together
 * in the sweep that closed #188. The list is no longer a subset, so the seam
 * this file described has closed: a new region file cannot be added without
 * being held to the register from its first commit, because SWEPT is now read
 * from the directory rather than hand-maintained. A region that shouts fails
 * here on the day it lands.
 */

/**
 * Every region on disk. This was a hand-kept subset while the sweep was in
 * progress; it is the directory itself now that no region is exempt.
 */
const SWEPT = readdirSync(new URL("../../lib/outside/data/phenology/", import.meta.url))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

/**
 * Real acronyms. Not emphasis, and they stay — but only in front of the reader
 * they are legible to.
 *
 * "Never all-caps" is a rule about SHOUTING — a word set in capitals so the
 * reader leans on it. An acronym is not shouting; it is how the thing is
 * spelled. US and UK were grandfathered when this guard was written, and the
 * sweep of #188 found four more already in the data: PNW (Pacific Northwest)
 * and BC (British Columbia) name places, UV names a kind of light, DJ names a
 * job. Lower-casing any of them would misspell a word, not calm a sentence.
 *
 * That was a flat set of terms until #599, and a flat set answers the wrong
 * question. Whether "PNW" belongs on a seven-year-old's card is a legibility
 * question, and legibility depends on who is reading: "PNW" is correctly
 * spelled in a teacher's `description` and unreadable in the line the card
 * shows a child. #556 could only fix the two live instances — with one set of
 * terms, dropping "PNW" reds eleven correct `description`s and keeping it lets
 * the next region file put it back on a child's card with CI green.
 *
 * So the allowance is keyed by audience now, and it lives in
 * `scripts/lib/acronyms.mjs` because `scripts/caps-lint.mjs` needs the same
 * answers. Every term there carries the measurement it was decided on. The
 * assertion below asks `allowedInField`, so a term is judged against the
 * reader of the field it turned up in rather than against a list of words.
 *
 * What stays here is the list of fields this guard reads. Each one's reader is
 * declared in that module, and the assertion below fails a field that has none
 * rather than quietly forbidding every acronym in it.
 */
const JUDGED_FIELDS = ["childFriendlyNote", "description", "species"] as const;

/**
 * Entries with no `childFriendlyNote` at all — #547, CLOSED, and this set is
 * empty because of it.
 *
 * Seven entries were never written: hazel catkins and red fox, in the weeks
 * where their description turns to the spent end of the season, across
 * `uk-north` and `uk-south`. They fell through to `description` — "catkins
 * spent", "mating season winds down" — which is a teacher's sentence, on a
 * child's card, in London, a demo location. They only became visible when this
 * guard stopped looking at one region and started looking at fifteen.
 *
 * They were held rather than swept, because writing them is content authoring
 * and not de-shouting, and a style pass that quietly invents child-facing copy
 * on the way past is exactly what produced #130 and #140. #547 wrote them: two
 * species, three sentences, each repeated across the weeks that share its
 * description, which is how every other note in these two files is keyed.
 *
 * The set stays as a named, empty declaration rather than being deleted, in
 * the shape `GENERATED_PARENT_LINE`'s empty exception list takes in
 * `scripts/register-lint.mjs`: an empty exception list is what a rule that
 * holds looks like, and it says so where a reviewer reads it. Nothing may be
 * added here — an entry landing without a child's line is a regression, not a
 * case for cover.
 */
const ENTRIES_WITH_NO_CHILD_NOTE = new Set<string>([]);

const CAPS = /\b[A-Z]{2,}\b/g;

interface Entry {
  id: string;
  species: string;
  description: string;
  childFriendlyNote?: string;
}

function readRegion(region: string): Record<string, Entry[]> {
  const url = new URL(
    `../../lib/outside/data/phenology/${region}.json`,
    import.meta.url
  );
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("the swept set", () => {
  it("is every region file on disk, so none is silently exempt", () => {
    expect(SWEPT.length).toBeGreaterThanOrEqual(15);
    expect(SWEPT).toContain("us-california");
    expect(SWEPT).toContain("uk-north");
  });

  it("holds no entry back from the child's-language rule", () => {
    // The ratchet, in the shape `auditGrandfathered()` uses in
    // `scripts/register-lint.mjs`: an exception list may only shrink. #547
    // emptied this one, so re-listing an id here to make a new entry pass
    // fails right here instead of passing quietly as cover.
    expect([...ENTRIES_WITH_NO_CHILD_NOTE]).toEqual([]);
  });
});

describe("the acronym allowance", () => {
  it("declares a reader for every field this guard judges", () => {
    // `allowedInField` refuses a field with no declared reader, so a field
    // added to JUDGED_FIELDS without one would silently forbid every acronym
    // in it. Fail here, where the reason is written down, rather than there.
    for (const field of JUDGED_FIELDS) {
      expect(FIELD_AUDIENCE[field]).toBeTruthy();
    }
  });

  it("keeps the terms a child cannot read away from the child's fields", () => {
    // Pinned, not derived: this is the decision of #599, and it should take an
    // edit to this line to change it. "PNW" is the term that ticket was about.
    // "US" is here because it is also how the pronoun "us" looks when it is
    // shouted, and a child's line is where that would land. "BC" joined them in
    // #611: #599 measured it as failing the same test as "PNW" and left it
    // allowed anyway, because one child's line said "BC winters" and
    // restricting the term would have reddened the build. That sentence is
    // rewritten, so the exception propping it up is gone.
    const teacherOnly = Object.keys(ACRONYMS)
      .filter((term) => !ACRONYMS[term]?.includes(CHILD))
      .sort();
    expect(teacherOnly).toEqual(["BC", "PNW", "US"]);
  });
});

describe.each(SWEPT)("phenology register: %s", (region) => {
  const data = readRegion(region);
  const entries = Object.values(data).flat();

  it("has entries to judge", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("shouts at nobody, and spells nothing a child cannot read", () => {
    // One walk, two rules, because they are the same rule asked of two
    // readers: a capitalised run is shouting unless it is an acronym THIS
    // FIELD'S reader knows. `allowedInField` is where that is decided, so a
    // term allowed for a teacher and not for a child fails here on the field
    // it landed in rather than passing on the strength of being a real word
    // somewhere else in the file.
    const shouting: string[] = [];
    for (const entry of entries) {
      for (const field of JUDGED_FIELDS) {
        const text = entry[field] ?? "";
        for (const hit of text.match(CAPS) ?? []) {
          if (!allowedInField(hit, field)) shouting.push(`${entry.id}.${field}: ${hit}`);
        }
      }
    }
    expect(shouting).toEqual([]);
  });

  it("still has a line in the child's language for every entry", () => {
    // The card falls through to `description` when the note is missing, and
    // `description` is written for a teacher. A sweep that emptied a note
    // would look clean here and read as jargon on the card, so hold the floor.
    //
    // Since #547 the exception set is empty, so this covers every entry in
    // every region with nothing held back. The filter is kept rather than
    // inlined because it is the seam the exception set was read through, and
    // an empty set that is still consulted is a rule that holds; a deleted one
    // is a rule nobody can tell was ever there.
    const missing = entries
      .filter((e) => !(e.childFriendlyNote ?? "").trim())
      .map((e) => e.id);
    expect(missing.filter((id) => !ENTRIES_WITH_NO_CHILD_NOTE.has(id))).toEqual([]);
  });

  it("carries no em dashes, which #108 already removed", () => {
    const dashed = entries
      .filter((e) => `${e.childFriendlyNote ?? ""}${e.description}`.includes("—"))
      .map((e) => e.id);
    expect(dashed).toEqual([]);
  });
});

describe("the demo path", () => {
  it("resolves Berkeley to the California phenology file", () => {
    // Berkeley, the demo school (#172 review meeting). This is the reason
    // us-california went first: it is the file the show-and-tell reads from.
    const lat = 37.871;
    const lng = -122.273;
    const region = resolvePhenologyRegion(lat, lng, resolveClimate(lat, lng));
    expect(region).toBe("us-california");
    expect(SWEPT).toContain(region);
  });
});
