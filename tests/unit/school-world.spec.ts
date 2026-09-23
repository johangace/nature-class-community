import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rankHabitats, readPlace, suggestedFrom } from "@/lib/outside/place";
import { REACH_IDS, REACH_OPTIONS, SITE_FEATURES } from "@/app/start/vocab";
import { getPhenologyEntries } from "@/lib/outside/phenology";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * The school's world (#277).
 *
 * The guard is mostly about SILENCE. Every zoom is allowed to have nothing to
 * say, and the failure that matters is a screen describing an empty schoolyard
 * because a read came back thin. So most of what is asserted here is what the
 * code does NOT say.
 */

function payload(signals: Array<{ id: string; value: string | number }>): FieldTruth {
  return { facts: { signals } };
}

/**
 * THE ISOLATING FIXTURE for #284's second half.
 *
 * These are the verbatim `outdoor.place.*` and `nature.management.*` values
 * Pointmoon served for the London coordinates (51.546, -0.105) on 2026-08-17,
 * copied out of the live response. The old tests fed this module "high",
 * "adjacent" and "schoolyard-edge" — words the producer has never once
 * returned — which is exactly why it stayed green while inventing a pond and a
 * tree canopy for a built-up London school on every real request.
 */
const LONDON_LIVE = payload([
  { id: "outdoor.place.habitat_type", value: "built-up" },
  { id: "outdoor.place.water_adjacency", value: 0.12 },
  { id: "outdoor.place.canopy_proxy", value: 0.14 },
  { id: "outdoor.place.horizon_openness", value: 0.4 },
  { id: "outdoor.place.edge_density", value: 0.18 },
  { id: "outdoor.place.habitat_complexity", value: 0.17 },
  { id: "nature.management.access_mode", value: "open" },
]);

describe("reading what a map can see", () => {
  it("says nothing at all when Pointmoon did not answer", () => {
    // The load-bearing case. A thin read must not read as a bare schoolyard.
    for (const empty of [null, {} as FieldTruth, payload([])]) {
      const read = readPlace(empty);
      expect(read.answered).toBe(false);
      expect(read.observations).toEqual([]);
    }
  });

  it("invents neither a pond nor a tree canopy for built-up London", () => {
    // The bug, stated as a test. A 0.12 water proxy and a 0.14 canopy proxy
    // are not a pond and not a canopy, and the old reader called both present
    // because it only ever rejected a literal "0".
    const read = readPlace(LONDON_LIVE);

    expect(read.answered).toBe(true);
    expect(read.observations.some((o) => /Open water close by/.test(o.says))).toBe(false);
    expect(read.observations.some((o) => /Tree canopy/.test(o.says))).toBe(false);
    // And it does not prefill her answers with either of them.
    expect(suggestedFrom(read)).toEqual([]);
  });

  it("still reads the signals that ARE strong on that same payload", () => {
    const read = readPlace(LONDON_LIVE);
    const said = read.observations.map((o) => o.says).join(" ");

    // The word-valued signal that replaced the dead `managed_level`.
    expect(said).toContain("open ground");
    // "built-up" with the hyphen humanised away. Hyphens are ours, not hers.
    expect(said).toContain("built up");
    // And that is ALL it says. Every proxy on this payload (0.12 water, 0.14
    // canopy, 0.17 complexity, 0.18 edges, 0.4 horizon) sits in the dead band,
    // so the honest London read is two lines, not seven.
    expect(read.observations).toHaveLength(2);
  });

  it("says nothing in the dead band rather than committing to half a signal", () => {
    // 0.2 is neither a canopy nor an absence of one. Silence is the answer.
    const read = readPlace(payload([{ id: "outdoor.place.canopy_proxy", value: 0.2 }]));
    expect(read.answered).toBe(true);
    expect(read.observations).toEqual([]);

    const strong = readPlace(payload([{ id: "outdoor.place.canopy_proxy", value: 0.8 }]));
    expect(strong.observations[0]?.says).toContain("Tree canopy");
    expect(suggestedFrom(strong)).toEqual(["trees"]);
  });

  it("reads no signal that Pointmoon does not serve", () => {
    // The two dead ids, proven dead: neither appears in the live vocabulary,
    // so neither may appear in this module. A read keyed on them is a line
    // that can never fire, which is indistinguishable from a lie by omission.
    // Matches a READABLE table entry (`id: "..."`), not prose: the module's
    // own comment names both dead ids on purpose, to record what went wrong.
    const source = readFileSync(join(process.cwd(), "lib/outside/place.ts"), "utf8");
    const keyedOn = (id: string) => new RegExp(`\\bid:\\s*"${id.replace(/\./g, "\\.")}"`);
    expect(source).not.toMatch(keyedOn("outdoor.place.managed_level"));
    expect(source).not.toMatch(keyedOn("outdoor.place.landcover_type"));
    // Not vacuous: the same matcher finds the ids that ARE wired.
    expect(source).toMatch(keyedOn("outdoor.place.habitat_complexity"));
    expect(source).toMatch(keyedOn("nature.management.access_mode"));
  });

  it("reads only the signals it was taught, and never invents the rest", () => {
    const read = readPlace(
      payload([
        { id: "outdoor.place.canopy_proxy", value: 0.7 },
        { id: "outdoor.place.something_we_never_mapped", value: "3" },
      ])
    );
    expect(read.answered).toBe(true);
    expect(read.observations).toHaveLength(1);
    expect(read.observations[0]?.says).toContain("canopy");
  });

  it("distinguishes 'no water' from 'we did not look'", () => {
    // Two different facts, and the whole product turns on not collapsing them.
    const looked = readPlace(payload([{ id: "outdoor.place.water_adjacency", value: 0 }]));
    expect(looked.observations[0]?.says).toContain("No open water");

    const didNotLook = readPlace(payload([{ id: "outdoor.place.canopy_proxy", value: 0.7 }]));
    expect(didNotLook.observations.some((o) => /water/i.test(o.says))).toBe(false);
  });

  it("carries the signal id on every line, so a wrong one is traceable", () => {
    const read = readPlace(payload([{ id: "outdoor.place.habitat_type", value: "schoolyard-edge" }]));
    expect(read.observations[0]?.signalId).toBe("outdoor.place.habitat_type");
    // Hyphens are ours, not hers.
    expect(read.observations[0]?.says).toContain("schoolyard edge");
  });

  it("suggests values for prefilling, and suggests nothing from an empty read", () => {
    const rich = readPlace(
      payload([
        { id: "outdoor.place.canopy_proxy", value: 0.8 },
        { id: "outdoor.place.water_adjacency", value: 0.9 },
      ])
    );
    expect(suggestedFrom(rich).sort()).toEqual(["pond", "trees"]);
    expect(suggestedFrom(readPlace(null))).toEqual([]);
  });
});

describe("which habitats this week's life is actually in", () => {
  it("ranks commonest first", () => {
    const ranked = rankHabitats([
      { id: "a", species: "A", description: "", habitats: ["meadow", "hedgerow"], senses: [], confidence: "high" },
      { id: "b", species: "B", description: "", habitats: ["meadow"], senses: [], confidence: "high" },
      { id: "c", species: "C", description: "", habitats: ["woodland"], senses: [], confidence: "high" },
    ]);
    expect(ranked[0]).toBe("meadow");
    expect(ranked).toContain("woodland");
  });

  it("is empty for an empty week rather than guessing a habitat", () => {
    expect(rankHabitats([])).toEqual([]);
  });

  it("shows that London in late August is not a look-under-logs week", async () => {
    // The finding that started this. "Look under logs" is a damp-spring
    // instruction, and in week 33 the life in southern England is in grassland
    // and hedgerow. The lesson line was wrong on TIME, not only on place.
    const entries = await getPhenologyEntries({
      region: "uk-south",
      date: new Date(2026, 7, 17),
      limit: 8,
    });
    expect(entries.length).toBeGreaterThan(0);
    const ranked = rankHabitats(entries);
    expect(ranked.slice(0, 3)).not.toContain("woodland");
  });
});

describe("the vocabularies a teacher answers from", () => {
  it("offers concrete things she can walk to, not categories", () => {
    // Every entry has to be pointable-at. "Biodiversity area" is not.
    expect(SITE_FEATURES).toContain("a pond");
    expect(SITE_FEATURES).toContain("a wild corner nobody mows");
    expect(new Set(SITE_FEATURES).size).toBe(SITE_FEATURES.length);
  });

  it("keeps reach ids and options in step", () => {
    expect([...REACH_IDS].sort()).toEqual(REACH_OPTIONS.map((r) => r.id).sort());
    // Hard surface must exist. It is the tightest case and the one a form that
    // assumed a field would silently miss.
    expect(REACH_IDS).toContain("hard-surface");
  });

  it("has no 'not sure' option, because unanswered is not an answer", () => {
    expect(REACH_OPTIONS.some((r) => /not sure|unknown|maybe/i.test(r.label))).toBe(false);
  });
});
