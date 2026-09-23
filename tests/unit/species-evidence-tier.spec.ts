import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth: vi.fn() }));
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { speciesAllowlistFor } from "@/lib/outside/species-allowlist";
import { buildSpeciesId, parseSpeciesId } from "@/lib/ai/species-id";
import { evidenceLine } from "@/app/run/AssistantSheet";

/**
 * A SEASONAL RECORD IS NOT A LOCAL SIGHTING (#401).
 *
 * The in-run "What is this?" path built one flat allowlist out of
 * `observations.nearby` (recorded near this school inside Pointmoon's own
 * window) and `observations.historical.nearby` (the producer-ranked
 * multi-year seasonal tier), dropped which was which, and then captioned
 * every match as locally recorded. A species this school has never seen could
 * be handed to a teacher, in a field, in front of children, as evidence that
 * it lives there — and the identification could be perfectly correct while the
 * claim beside it was false.
 *
 * The tier is now a type, carried allowlist → membership gate → route → copy,
 * and these pin it at each seam rather than at the sentence.
 */

const observations = (value: unknown) =>
  vi.mocked(fetchFieldTruth).mockResolvedValue({
    facts: { fieldSnapshot: { observations: value } },
  } as never);

describe("the allowlist keeps which record a name came from", () => {
  beforeEach(() => vi.resetAllMocks());

  it("tags each tier as itself", async () => {
    observations({
      nearby: [{ name: "Common frog", scientificName: "Rana temporaria" }],
      historical: { nearby: [{ name: "Hawthorn", scientificName: "Crataegus monogyna" }] },
    });
    const { species } = await speciesAllowlistFor(51.5, -0.1);
    expect(species).toEqual([
      { name: "Common frog", scientificName: "Rana temporaria", evidence: "recent" },
      { name: "Hawthorn", scientificName: "Crataegus monogyna", evidence: "seasonal" },
    ]);
  });

  it("keeps the stronger claim when a name is in both tiers", async () => {
    observations({
      nearby: [{ name: "Hawthorn", scientificName: "Crataegus monogyna" }],
      historical: { nearby: [{ name: "hawthorn", scientificName: "Crataegus monogyna" }] },
    });
    const { species } = await speciesAllowlistFor(51.5, -0.1);
    expect(species).toHaveLength(1);
    expect(species[0]).toMatchObject({ name: "Hawthorn", evidence: "recent" });
  });

  it("carries the producer's own window, and no window of ours", async () => {
    observations({ nearby: [{ name: "Common frog", scientificName: null }], recentWindowDays: 7 });
    expect((await speciesAllowlistFor(51.5, -0.1)).recentWindowDays).toBe(7);

    for (const absent of [undefined, null, 0, -3, "7"]) {
      observations({ nearby: [{ name: "Common frog", scientificName: null }], recentWindowDays: absent });
      expect((await speciesAllowlistFor(51.5, -0.1)).recentWindowDays).toBeNull();
    }
  });

  it("makes no claim at all without a location or a usable read", async () => {
    expect(await speciesAllowlistFor(null, null)).toEqual({ species: [], recentWindowDays: null });
    vi.mocked(fetchFieldTruth).mockRejectedValue(new Error("unavailable"));
    expect(await speciesAllowlistFor(51.5, -0.1)).toEqual({ species: [], recentWindowDays: null });
  });
});

describe("the tier is read off our records, never off the model", () => {
  const recent = { name: "Common frog", scientificName: "Rana temporaria", evidence: "recent" as const };
  const seasonal = { name: "Hawthorn", scientificName: "Crataegus monogyna", evidence: "seasonal" as const };
  const note = "The lobed leaves are visible.";

  it("gives a seasonal-only match the seasonal tier", () => {
    expect(parseSpeciesId({ name: "Hawthorn", scientificName: "Crataegus monogyna", note }, [recent, seasonal]))
      .toMatchObject({ name: "Hawthorn", evidence: "seasonal" });
  });

  it("gives an off-list answer no tier, however the model captions it", () => {
    expect(parseSpeciesId({ name: "Fire salamander", scientificName: "Salamandra salamandra", note, evidence: "recent" }, [recent, seasonal]))
      .toMatchObject({ evidence: null });
  });

  /**
   * The allowlist deduplicates on COMMON name, so one taxon can survive as
   * two rows in two tiers when the recent row carries no scientific name.
   * Matching by word first read `recent` off the wrong row — the exact
   * upgrade #401 exists to stop, for a taxon only the seasonal tier knows.
   */
  it("matches the taxon before the word when the two disagree about tier", () => {
    const willowNearby = { name: "Willow", scientificName: null, evidence: "recent" as const };
    const goatWillowSeasonal = { name: "Goat willow", scientificName: "Salix caprea", evidence: "seasonal" as const };
    expect(
      parseSpeciesId({ name: "Willow", scientificName: "Salix caprea", note }, [willowNearby, goatWillowSeasonal])
    ).toMatchObject({ name: "Goat willow", scientificName: "Salix caprea", evidence: "seasonal" });
  });

  it("still matches on the common name when nobody supplies a scientific one", () => {
    const willowNearby = { name: "Willow", scientificName: null, evidence: "recent" as const };
    expect(parseSpeciesId({ name: "willow", scientificName: null, note }, [willowNearby]))
      .toMatchObject({ name: "Willow", evidence: "recent" });
  });

  it("cannot be talked into upgrading a seasonal record", () => {
    expect(parseSpeciesId({ name: "Hawthorn", scientificName: "Crataegus monogyna", note, evidence: "recent" }, [seasonal]))
      .toMatchObject({ evidence: "seasonal" });
  });

  /**
   * The structural half of "no model output can choose the tier": it is not
   * shown one. A gate that asks the model to ignore what it can see is a
   * request; a list that never carries the field is a fact.
   */
  it("never puts the tier in the species list the model reads", () => {
    const prompt = buildSpeciesId([recent, seasonal]);
    expect(prompt).not.toBeNull();
    // Anchored on the EXACT list we expect to have been rendered, not on the
    // first JSON array in the prompt: a worked example added above the
    // substitution would capture a loose regex and leave this green while
    // the real list leaked the tier.
    expect(prompt!.system).toContain(
      JSON.stringify([
        { name: "Common frog", scientificName: "Rana temporaria" },
        { name: "Hawthorn", scientificName: "Crataegus monogyna" },
      ])
    );
    // And the tier-carrying form is not in there under any spelling.
    expect(prompt!.system).not.toContain(JSON.stringify(recent));
    expect(prompt!.system).not.toContain('"evidence"');
  });
});

describe("the sentence under the answer says what the record supports", () => {
  it("bounds a recent claim by the producer's window when there is one", () => {
    expect(evidenceLine("recent", 7)).toBe(
      "Possible match to a species recorded nearby within the last 7 days."
    );
  });

  it("leaves a recent claim unbounded rather than inventing a window", () => {
    expect(evidenceLine("recent", null)).toBe(
      "Possible match to a species recorded nearby recently."
    );
  });

  /**
   * The helper is exported and called directly by specs, so a number that
   * cannot make a true claim must not be able to make one from any caller —
   * the allowlist's own guard is one layer away and separable from this
   * sentence.
   */
  it("refuses a window that cannot mean days", () => {
    for (const bad of [0, -3, 7.5, Number.NaN]) {
      expect(evidenceLine("recent", bad)).toBe(
        "Possible match to a species recorded nearby recently."
      );
    }
  });

  it("keeps a seasonal claim regional and seasonal", () => {
    const line = evidenceLine("seasonal", 7);
    expect(line).toBe(
      "Possible match to a species recorded in this region at this time of year."
    );
    // The failure this ticket is named for: a seasonal record described as a
    // local one, or given the recent tier's window.
    expect(line).not.toMatch(/nearby|this month|\d+ days/);
  });

  it("claims nothing for an identification our records do not know", () => {
    expect(evidenceLine(null, 7)).toBe("Possible identification.");
  });

  it("never lets a window alone produce a claim", () => {
    for (const days of [null, 1, 30]) {
      expect(evidenceLine(null, days)).toBe("Possible identification.");
    }
  });
});
