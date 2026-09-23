import { describe, expect, it } from "vitest";
import {
  admissibleSessions,
  filterShelfByValidity,
  sessionValidity,
} from "@/lib/validity";
import { shelfPacksAllSeasons } from "@/lib/pack";

/** A fixed autumn day in London: the shelf tests read membership, not the clock. */
const SHELF_DAY = { date: new Date(2026, 8, 17), lat: 51.5 };
import { bioregionPackSchema, emptyBioregionPack, type BioregionPack } from "@/schema/bioregion";
import type { Session } from "@/schema/pack";

/**
 * The validity guard (#206).
 *
 * The case this exists for, verbatim from office#330: "why leaves change" must
 * not ship to Miami. The isolating fixtures below are the three packs — London,
 * Miami, and a monsoon pack — because the bug is not "does the filter run", it
 * is "does the filter reach a DIFFERENT answer for two real places".
 *
 * The second fixture is the wave-1 one and it is the more dangerous case: an
 * empty pack must exclude NOTHING. Every real pack in the product today has an
 * empty season ontology, so a resolver that read an unfilled slot as an absent
 * season would empty the shelf for every school on the day it shipped.
 */

function pack(seasons: string[], drivers: string[]): BioregionPack {
  return bioregionPackSchema.parse({
    key: { resolution: "koppen", value: "test", resolvedBy: "pack-key@test" },
    seasonOntology: { seasons, driver: null, drivers },
  });
}

/** Temperate deciduous. Leaves fall, and September is the wind-down. */
const LONDON = pack(
  ["spring", "summer", "autumn", "winter"],
  ["deciduous-leaf-fall", "seed-dispersal", "sowing-window", "wildflower-bloom"]
);

/** Subtropical. No autumn, and nothing here drops its leaves on a schedule. */
const MIAMI = pack(["wet", "dry"], ["storm-season", "wet-season-green-up"]);

/**
 * Arid with a monsoon. September is the alive month, and the sowing window
 * opens on rain rather than on a date — the inversion the design is for.
 */
const PHOENIX = pack(
  ["cool", "hot-dry", "monsoon", "second-spring"],
  ["monsoon-green-up", "sowing-window"]
);

function session(id: string, validity?: Session["validity"]): Session {
  return {
    id,
    title: id,
    topic: id,
    objective: id,
    namedSkill: id,
    kit: [],
    durationMin: 45,
    phases: [{ key: "p", title: "p", blocks: [{ type: "say-aloud", text: "x" }] }],
    childSheet: [],
    standards: [],
    ...(validity ? { validity } : {}),
  } as Session;
}

const WHY_LEAVES_CHANGE = session("why-leaves-change", {
  requiresSeason: ["autumn"],
  requiresDriver: ["deciduous-leaf-fall"],
});

describe("why leaves change must not ship to Miami", () => {
  it("ships in London", () => {
    const verdict = sessionValidity(WHY_LEAVES_CHANGE, LONDON);
    expect(verdict.admissible).toBe(true);
    expect(verdict.reason).toBe("satisfied");
  });

  it("does not ship in Miami, and names what is missing", () => {
    const verdict = sessionValidity(WHY_LEAVES_CHANGE, MIAMI);
    expect(verdict.admissible).toBe(false);
    expect(verdict.reason).toBe("season-absent");
    expect(verdict.missing).toEqual(["autumn"]);
  });

  it("does not ship in Phoenix either — a monsoon is not an autumn", () => {
    const verdict = sessionValidity(WHY_LEAVES_CHANGE, PHOENIX);
    expect(verdict.admissible).toBe(false);
  });

  it("excludes on the driver even where the season word happens to exist", () => {
    // The stronger claim doing its job: a pack could call something "autumn"
    // and still have nothing that drops its leaves. The word is not the event.
    const wordButNoEvent = pack(["autumn", "wet"], ["storm-season"]);
    const verdict = sessionValidity(WHY_LEAVES_CHANGE, wordButNoEvent);
    expect(verdict.admissible).toBe(false);
    expect(verdict.reason).toBe("driver-absent");
    expect(verdict.missing).toEqual(["deciduous-leaf-fall"]);
  });
});

describe("an empty slot never excludes anything", () => {
  /**
   * THE WAVE-1 FIXTURE. Every real pack today is this one. If this goes red,
   * shipping the resolver empties the shelf for the entire product.
   */
  it("admits every shelf session against a wave-1 pack with nothing filled", () => {
    const empty = emptyBioregionPack({
      resolution: "global",
      value: "global",
      resolvedBy: "pack-key@test",
    });
    for (const curriculum of shelfPacksAllSeasons(SHELF_DAY)) {
      const kept = admissibleSessions(curriculum.sessions, empty);
      expect(kept, curriculum.id).toHaveLength(curriculum.sessions.length);
    }
  });

  it("checks only the slots a pack has actually filled", () => {
    // Drivers named, seasons not. The driver question can be answered and the
    // season question must not be asked.
    const driversOnly = pack([], ["deciduous-leaf-fall", "seed-dispersal"]);
    expect(sessionValidity(WHY_LEAVES_CHANGE, driversOnly).admissible).toBe(true);

    const seasonsOnly = pack(["wet", "dry"], []);
    const verdict = sessionValidity(WHY_LEAVES_CHANGE, seasonsOnly);
    expect(verdict.admissible).toBe(false);
    expect(verdict.reason).toBe("season-absent");
  });

  it("admits everything when there is no pack at all", () => {
    // The cold-URL and demo path. A product that shows nothing until it knows
    // everything shows nothing.
    expect(sessionValidity(WHY_LEAVES_CHANGE, null).admissible).toBe(true);
    expect(sessionValidity(WHY_LEAVES_CHANGE, null).reason).toBe("undetermined");
  });
});

describe("the September inversion", () => {
  it("keeps a sowing lesson in a monsoon pack that has no spring", () => {
    // Seed bombs are flagged on the DRIVER, not the season, precisely so a
    // place that sows on rain instead of on a date keeps the lesson.
    const seedBombs = session("seed-bombs", { requiresDriver: ["sowing-window"] });
    expect(PHOENIX.seasonOntology.seasons).not.toContain("spring");
    expect(sessionValidity(seedBombs, PHOENIX).admissible).toBe(true);
    expect(sessionValidity(seedBombs, PHOENIX).reason).toBe("satisfied");
  });

  it("excludes it where nothing opens a sowing window", () => {
    const seedBombs = session("seed-bombs", { requiresDriver: ["sowing-window"] });
    expect(sessionValidity(seedBombs, MIAMI).admissible).toBe(false);
  });
});

describe("the three states stay apart", () => {
  it("tells universal from satisfied from undetermined", () => {
    expect(sessionValidity(session("u", { universal: true }), MIAMI).reason).toBe("universal");
    expect(sessionValidity(WHY_LEAVES_CHANGE, LONDON).reason).toBe("satisfied");
    // Unjudged is NOT the same as judged safe everywhere. It ships, and it says
    // it was never checked.
    expect(sessionValidity(session("unjudged"), MIAMI).reason).toBe("undetermined");
    expect(sessionValidity(session("unjudged"), MIAMI).admissible).toBe(true);
  });

  it("does not consult the pack for a universal lesson", () => {
    expect(sessionValidity(session("u", { universal: true }), null).reason).toBe("universal");
  });
});

describe("the authored shelf", () => {
  it("carries a validity judgement on every one of the nine shelf sessions, every season", () => {
    // The fixture that catches an unflagged shelf session: a lesson added to
    // the shelf without a judgement would sit at `undetermined` forever and
    // reach a place nobody checked it against.
    const unflagged: string[] = [];
    let total = 0;
    for (const curriculum of shelfPacksAllSeasons(SHELF_DAY)) {
      for (const s of curriculum.sessions) {
        total += 1;
        if (!s.validity) unflagged.push(`${curriculum.id}/${s.id}`);
      }
    }
    expect(total).toBe(9);
    expect(unflagged).toEqual([]);
  });

  it("keeps the whole shelf in London and loses the autumn lessons in Miami", () => {
    const shelf = shelfPacksAllSeasons(SHELF_DAY);
    const london = filterShelfByValidity(shelf, LONDON);
    expect(london.flatMap((p) => p.sessions)).toHaveLength(9);

    const miami = filterShelfByValidity(shelf, MIAMI);
    const kept = miami.flatMap((p) => p.sessions).map((s) => s.id);
    // The autumn lessons that claim leaf fall and seed dispersal go.
    expect(kept).not.toContain("leaves-and-their-trees");
    expect(kept).not.toContain("seed-searchers");
    expect(kept).not.toContain("nature-recycling-system");
    expect(kept).not.toContain("conker-acorn-maths-trail");
    // Nothing universal is harmed.
    expect(kept).toContain("summer-w2-minibeast-hunting");
  });

  it("drops a curriculum pack whose every session was excluded, never shows it empty", () => {
    const autumnOnly = [
      {
        id: "autumn-only",
        title: "t",
        subject: "s",
        ageBand: "4-6",
        sessions: [WHY_LEAVES_CHANGE],
      },
    ];
    expect(filterShelfByValidity(autumnOnly, MIAMI)).toEqual([]);
    expect(filterShelfByValidity(autumnOnly, LONDON)).toHaveLength(1);
  });
});

describe("requiresCountry: a lesson true in some countries and not others (2026-09-08)", () => {
  // Johan, on the conker and acorn maths trail: "mark it UK only for now we
  // need this filter anyways". Horse chestnuts are a European park tree.
  const conkers = session("conkers", { requiresSeason: ["autumn"], requiresCountry: ["GB"] });

  it("admits in the named country, and says it checked", () => {
    expect(sessionValidity(conkers, LONDON, "GB").admissible).toBe(true);
    expect(sessionValidity(conkers, LONDON, "GB").reason).toBe("satisfied");
  });

  it("excludes elsewhere, naming the countries it wanted", () => {
    const verdict = sessionValidity(conkers, LONDON, "US");
    expect(verdict.admissible).toBe(false);
    expect(verdict.reason).toBe("country-absent");
    expect(verdict.missing).toEqual(["GB"]);
  });

  it("admits when the country is unknown: an unfilled slot is not evidence", () => {
    expect(sessionValidity(conkers, LONDON, null).admissible).toBe(true);
    expect(sessionValidity(conkers, null, null).reason).toBe("undetermined");
  });

  it("needs no pack to exclude: the answer comes from the coordinates alone", () => {
    expect(sessionValidity(conkers, null, "US").admissible).toBe(false);
  });

  it("marks the conker and acorn maths trail GB only on the shelf", () => {
    const shelf = shelfPacksAllSeasons(SHELF_DAY);
    const newYork = filterShelfByValidity(shelf, LONDON, "US").flatMap((p) => p.sessions).map((s) => s.id);
    expect(newYork).not.toContain("conker-acorn-maths-trail");
    expect(newYork).toContain("seed-searchers");
    const london = filterShelfByValidity(shelf, LONDON, "GB").flatMap((p) => p.sessions).map((s) => s.id);
    expect(london).toContain("conker-acorn-maths-trail");
  });
});
