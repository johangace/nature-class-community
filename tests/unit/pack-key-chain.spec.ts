import { describe, expect, it } from "vitest";
import { bioregionPackFor, loadBioregionPack } from "@/lib/bioregion-pack";
import { GLOBAL_PACK_KEY } from "@/lib/habitat";
import {
  PACK_KEY_RESOLVER_VERSION,
  latitudeBand,
  packKeyValues,
  resolvePackKeyChain,
} from "@/lib/pack-key";
import { shelfPacksAllSeasons } from "@/lib/pack";
import { bioregionPackSchema } from "@/schema/bioregion";
import { placeContextFor, sessionForPlace, shelfForPlace } from "@/lib/place-context";

/**
 * The pack-key fallback chain guard, and the wiring it unblocks.
 *
 * J4: polygon → koppen → latitude → global, resolver-version stamped. Three of
 * those four links are real; the polygon link is deferred and the fixtures
 * below assert it is ABSENT rather than faked, because a chain that quietly
 * skipped a link would look complete and claim a resolution it does not have.
 *
 * The second half is the wiring fixture. Both consumers are no-ops today —
 * there is no bioregion pack file — so the assertions are about the SHAPE of
 * the no-op: everything must still render, and the same call must produce a
 * different answer once a pack exists. A guard that only checked "nothing
 * changed" would pass on wiring that was never connected at all.
 */

/** The four evaluation places, as the product actually stores them. */
/** A fixed autumn day in London: these tests read shelf membership, not the clock. */
const SHELF_DAY = { date: new Date(2026, 8, 17), lat: 51.5 };

const LONDON = { lat: 51.5, lng: -0.12, climate: "oceanic" };
const PHOENIX = { lat: 33.45, lng: -112.07, climate: "arid" };
const MIAMI = { lat: 25.76, lng: -80.19, climate: "tropical" };
const NOWHERE = { lat: null, lng: null, climate: null };

describe("the chain J4 decided", () => {
  it("walks koppen, then latitude, then global", () => {
    expect(resolvePackKeyChain(PHOENIX).map((k) => k.resolution)).toEqual([
      "koppen",
      "latitude",
      "global",
    ]);
    expect(packKeyValues(resolvePackKeyChain(PHOENIX))).toEqual([
      "arid",
      "lat-23-35",
      GLOBAL_PACK_KEY,
    ]);
  });

  it("has no polygon link, because J4 deferred the framework", () => {
    // Absent rather than faked. A bounding box wearing the word "polygon"
    // would claim a resolution we do not have, which is the exact bug the
    // resolvedBy stamp exists to catch.
    for (const place of [LONDON, PHOENIX, MIAMI]) {
      expect(resolvePackKeyChain(place).some((k) => k.resolution === "polygon")).toBe(false);
    }
  });

  it("always terminates at global, so no caller handles an empty chain", () => {
    for (const place of [LONDON, PHOENIX, MIAMI, NOWHERE]) {
      const chain = resolvePackKeyChain(place);
      expect(chain.length).toBeGreaterThan(0);
      expect(chain[chain.length - 1]?.value).toBe(GLOBAL_PACK_KEY);
    }
  });

  it("gives a place we cannot locate the global chain alone", () => {
    expect(packKeyValues(resolvePackKeyChain(NOWHERE))).toEqual([GLOBAL_PACK_KEY]);
  });

  it("stamps every key with the rule that produced it", () => {
    // The live Phoenix and Miami spine mislabels were invisible for months
    // because nothing recorded which rule picked the file a school read.
    for (const key of resolvePackKeyChain(PHOENIX)) {
      expect(key.resolvedBy).toContain(PACK_KEY_RESOLVER_VERSION);
    }
  });

  it("prefers the stored climate tag over one derived from coordinates", () => {
    // A class must not meet a desert cast on the daily card and a mountain one
    // in its lesson because two code paths classified the same point twice.
    const stored = resolvePackKeyChain(PHOENIX)[0];
    expect(stored?.value).toBe("arid");
    expect(stored?.resolvedBy).toBe(`${PACK_KEY_RESOLVER_VERSION}/stored`);

    const derived = resolvePackKeyChain({ ...PHOENIX, climate: null })[0];
    expect(derived?.resolvedBy).toBe(`${PACK_KEY_RESOLVER_VERSION}/derived`);
  });

  it("ignores a climate value it does not recognise rather than keying on it", () => {
    const chain = resolvePackKeyChain({ ...PHOENIX, climate: "sonoran-ish" });
    expect(packKeyValues(chain)).not.toContain("sonoran-ish");
  });

  it("bands latitude numerically, so a band can never collide with a koppen group", () => {
    // "tropical" is already a Koppen group one link up. A latitude band that
    // borrowed the word would spell two different meanings the same way.
    expect(latitudeBand(0)).toBe("lat-00-23");
    expect(latitudeBand(-25)).toBe("lat-23-35");
    expect(latitudeBand(51.5)).toBe("lat-50-66");
    expect(latitudeBand(80)).toBe("lat-66-90");
    // Hemisphere-agnostic: Sao Paulo and Singapore band the same.
    expect(latitudeBand(-23.5)).toBe(latitudeBand(23.5));
  });
});

describe("the registry, with an empty pack directory", () => {
  it("has no pack files yet, which is the shipped state of wave 1", () => {
    expect(loadBioregionPack("arid")).toBeNull();
    expect(loadBioregionPack(GLOBAL_PACK_KEY)).toBeNull();
  });

  it("returns a declared, empty pack rather than null", () => {
    // Null and empty would mean the same thing today and different things
    // later, which is the ambiguity this whole wave exists to remove.
    const resolved = bioregionPackFor(resolvePackKeyChain(PHOENIX));
    expect(resolved.pack.expectedSilence).toEqual([]);
    expect(resolved.pack.seasonOntology.seasons).toEqual([]);
  });

  it("keys the empty pack to the place, and says no file answered", () => {
    const resolved = bioregionPackFor(resolvePackKeyChain(PHOENIX));
    expect(resolved.pack.key.value).toBe("arid");
    // `source` is what carries the distinction: this place has no pack, as
    // opposed to a pack that says nothing.
    expect(resolved.source).toBeNull();
    expect(resolved.chain).toEqual(["arid", "lat-23-35", GLOBAL_PACK_KEY]);
  });
});

describe("the wiring, proven by the seam it now drives", () => {
  it("carries the resolved chain into the session transform", () => {
    // The end-to-end assertion, now on a synthetic variant rather than a
    // shipped one: #266 retired the climate-keyed variants from the packs
    // (a climate key cannot see a calendar), but the chain still has to reach
    // the transform, and this is what proves it does.
    const found = shelfPacksAllSeasons(SHELF_DAY)
      .flatMap((p) => p.sessions)
      .find((s) => s.id === "summer-w2-minibeast-hunting")!;
    const withVariant = {
      ...found,
      spaceNeeded: "London wording",
      spaceNeededVariants: { arid: "desert wording" },
    };
    const arid = sessionForPlace(withVariant, placeContextFor(PHOENIX));
    const london = sessionForPlace(withVariant, placeContextFor(LONDON));
    expect(arid.spaceNeeded).toBe("desert wording");
    expect(london.spaceNeeded).toBe("London wording");
  });

  it("gives two places different answers from the same session", () => {
    const found = shelfPacksAllSeasons(SHELF_DAY)
      .flatMap((p) => p.sessions)
      .find((s) => s.id === "summer-w2-minibeast-hunting")!;
    const withVariants = {
      ...found,
      spaceNeeded: "base",
      spaceNeededVariants: { arid: "desert", tropical: "damp" },
    };
    const arid = sessionForPlace(withVariants, placeContextFor(PHOENIX)).spaceNeeded;
    const trop = sessionForPlace(withVariants, placeContextFor(MIAMI)).spaceNeeded;
    expect(arid).toBe("desert");
    expect(trop).toBe("damp");
    expect(arid).not.toBe(trop);
  });

  it("shows the whole shelf wherever the country allows, because no pack excludes anything yet", () => {
    // The honest no-op for the pack half: every real school today resolves an
    // empty pack, and an empty season ontology excludes nothing by design. The
    // country half is real since 2026-09-08: the conker and acorn maths trail
    // is GB only, so the two US places lose exactly that one.
    for (const place of [LONDON, NOWHERE]) {
      const shelf = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(place));
      expect(shelf.flatMap((p) => p.sessions)).toHaveLength(9);
    }
    for (const place of [PHOENIX, MIAMI]) {
      const ids = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(place))
        .flatMap((p) => p.sessions)
        .map((s) => s.id);
      expect(ids).toHaveLength(8);
      expect(ids).not.toContain("conker-acorn-maths-trail");
    }
  });

  it("does not mutate the loaded pack — the source keeps its own words", () => {
    // The #142 pattern one level up: only the copy travelling to the renderer
    // differs, and the pack on disk is still what its author typed.
    const before = shelfPacksAllSeasons(SHELF_DAY)
      .flatMap((p) => p.sessions)
      .find((s) => s.id === "summer-w2-minibeast-hunting");
    shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(PHOENIX));
    const after = shelfPacksAllSeasons(SHELF_DAY)
      .flatMap((p) => p.sessions)
      .find((s) => s.id === "summer-w2-minibeast-hunting");
    expect(after?.spaceNeeded).toBe(before?.spaceNeeded);
    expect(after?.spaceNeeded).toBe(
      "Soil, a log, a bush or a tree. Any patch where small creatures hide."
    );
  });
});

describe("the wiring, proven against a pack that exists", () => {
  /**
   * THE FIXTURE THAT MAKES THE REST MEAN ANYTHING.
   *
   * Every assertion above is about an empty directory, and a walk that was
   * never connected at all would pass all of them. This one supplies a Miami
   * pack and asserts the SAME call produces a different, correct answer — the
   * only evidence that the chain, the registry, the validity resolver and the
   * shelf are actually joined together.
   *
   * It is a fixture and not a shipped file on purpose: wave 1 enters no data
   * (J1), and the data waves are #209-#215.
   */
  const MIAMI_PACK = bioregionPackSchema.parse({
    key: { resolution: "koppen", value: "tropical", resolvedBy: "pack-key@fixture" },
    seasonOntology: {
      seasons: ["wet", "dry"],
      driver: "rain-onset",
      drivers: ["storm-season", "wet-season-green-up"],
    },
  });

  const lookup = (key: string) => (key === "tropical" ? MIAMI_PACK : null);

  it("finds the pack by walking the chain to its koppen link", () => {
    const place = placeContextFor(MIAMI, lookup);
    expect(place.source).toBe("tropical");
    expect(place.pack.seasonOntology.seasons).toEqual(["wet", "dry"]);
  });

  it("stops offering Miami the two autumn lessons", () => {
    // "Why leaves change must not ship to Miami", end to end, from a place.
    const ids = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(MIAMI, lookup))
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    expect(ids).not.toContain("leaves-and-their-trees");
    expect(ids).not.toContain("seed-searchers");
    // Nothing universal is harmed.
    expect(ids).toContain("summer-w2-minibeast-hunting");
  });

  it("shows what an UNDER-DECLARED pack costs: it over-excludes, quietly", () => {
    // A finding worth keeping, and a warning to whoever authors the first real
    // pack. This fixture names two drivers and no others, so seed bombs and the
    // wildflower investigation go too — not because Miami has no sowing window
    // or no bloom, but because the pack did not SAY it has one.
    //
    // That is the resolver behaving correctly: it refuses to assume a driver
    // nobody wrote down, exactly as it refuses to invent one. The cost lands on
    // the shelf as a shorter list rather than as a wrong lesson, which is the
    // right way round — but it means an incomplete driver list silently shrinks
    // what a school is offered, and nothing on screen explains why.
    const ids = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(MIAMI, lookup))
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    // Four: the nine Community shelf sessions minus the four autumn-bound
    // starter sessions and the winter-bound survival sort. Spring is a drawer
    // of titles for now (2026-09-07), so the two spring sessions whose drivers
    // were not declared are not on the shelf to be over-excluded; when spring
    // returns, they are.
    expect(ids).toHaveLength(4);
    expect(ids).not.toContain("spring-w1-seed-bombs");
    expect(ids).not.toContain("spring-w2-wildflower-investigation");

    // Declare the drivers and the lessons come straight back. Exclusion tracks
    // the data precisely; there is nothing hardcoded about Miami anywhere.
    const fuller = bioregionPackSchema.parse({
      key: { resolution: "koppen", value: "tropical", resolvedBy: "pack-key@fixture" },
      seasonOntology: {
        seasons: ["wet", "dry"],
        driver: "rain-onset",
        drivers: [
          "storm-season",
          "wet-season-green-up",
          "sowing-window",
          "wildflower-bloom",
        ],
      },
    });
    const restored = shelfForPlace(
      shelfPacksAllSeasons(SHELF_DAY),
      placeContextFor(MIAMI, (key) => (key === "tropical" ? fuller : null))
    )
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    expect(restored).toHaveLength(4);
    // The autumn two stay gone, because those are genuinely not true here.
    expect(restored).not.toContain("leaves-and-their-trees");
    expect(restored).not.toContain("seed-searchers");
  });

  it("leaves London's nine untouched by Miami's pack", () => {
    const ids = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(LONDON, lookup))
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    expect(ids).toHaveLength(9);
    expect(ids).toContain("animal-leaf-masks");
  });

  it("reverts to eight the moment the pack is gone: only the GB-only lesson stays out", () => {
    // The other half of the proof: the pack's exclusion comes from the DATA,
    // not from something hardcoded about Miami. The country filter needs no
    // pack, so the conker lesson stays out of a US shelf either way.
    const ids = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(MIAMI, () => null))
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    expect(ids).toHaveLength(8);
    expect(ids).not.toContain("conker-acorn-maths-trail");
  });
});

describe("the country reaches the shelf through the place context (2026-09-08)", () => {
  it("drops the GB-only conker lesson for a New York class and keeps it for London", () => {
    const NEW_YORK = { lat: 40.7128, lng: -74.006, climate: null };
    const LONDON_SCHOOL = { lat: 51.5074, lng: -0.1278, climate: null };
    expect(placeContextFor(NEW_YORK).country).toBe("US");
    expect(placeContextFor(LONDON_SCHOOL).country).toBe("GB");
    expect(placeContextFor({}).country).toBeNull();
    const ny = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(NEW_YORK))
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    expect(ny).not.toContain("conker-acorn-maths-trail");
    expect(ny).toContain("seed-searchers");
    const ldn = shelfForPlace(shelfPacksAllSeasons(SHELF_DAY), placeContextFor(LONDON_SCHOOL))
      .flatMap((p) => p.sessions)
      .map((s) => s.id);
    expect(ldn).toContain("conker-acorn-maths-trail");
  });
});
