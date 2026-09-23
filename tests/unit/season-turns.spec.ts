import { describe, expect, it } from "vitest";
import {
  leadPack,
  seasonAt,
  seasonBrowse,
  seasonBrowsePacks,
  seasonOpensIn,
  seasonShelf,
  shelfPacks,
  shelfPacksAllSeasons,
  shelfTier,
} from "@/lib/pack";

/**
 * The term turns without anyone editing a file (#274), and since 2026-09-06
 * only one season is open at a time: the other three sit on the shelf by
 * title with the month each unlocks. Johan: "for winter spring summer just
 * keep the titles but say unlocks December, unlocks March etc. Also put them
 * in the right order."
 */

const LONDON = 51.5;
const MELBOURNE = -37.8;
const AUG = new Date(2026, 7, 17);
const SEP = new Date(2026, 8, 17);
const DEC = new Date(2026, 11, 17);
const JAN = new Date(2026, 0, 17);
const APR = new Date(2026, 3, 17);

function lead(date: Date, lat?: number | null): string {
  return leadPack({ date, lat }).id;
}

describe("the term turns without anyone editing a file", () => {
  it("leads with the nearest season that has lessons in August, while summer is a drawer of titles", () => {
    expect(seasonBrowse({ date: AUG, lat: LONDON })[0]?.season).toBe("summer");
    expect(lead(AUG, LONDON)).toBe("autumn-starter");
  });

  it("leads with autumn in September — the case that was broken", () => {
    expect(lead(SEP, LONDON)).toBe("autumn-starter");
  });

  it("leads with winter in December, the partner's four in the partner's order", () => {
    expect(lead(DEC, LONDON)).toBe("winter-starter");
    expect(shelfPacks({ date: DEC, lat: LONDON })[0]?.sessions.map((s) => s.id)).toEqual([
      "bird-watching",
      "making-bird-feeders",
      "bark-rubbings",
      "winter-survival-sort",
    ]);
  });

  it("leads with the nearest season that has lessons while spring is a drawer of titles", () => {
    // Spring and summer are title-only for now (Johan, 2026-09-07): nothing
    // in them can be led, so April leads with the next season that has
    // lessons rather than an empty pack, and shelfPacks is empty.
    expect(shelfPacks({ date: APR, lat: LONDON })).toEqual([]);
    expect(lead(APR, LONDON)).toBe("autumn-starter");
  });

  it("does not lead with the opposite season", () => {
    expect(lead(JAN, LONDON)).not.toBe("summer");
  });
});

describe("the hemisphere, which the obvious fix would have got wrong", () => {
  it("reads August as summer in London and winter in Melbourne", () => {
    expect(seasonAt(AUG, LONDON)).toBe("summer");
    expect(seasonAt(AUG, MELBOURNE)).toBe("winter");
  });

  it("reads September as autumn in London and spring in Melbourne", () => {
    expect(seasonAt(SEP, LONDON)).toBe("autumn");
    expect(seasonAt(SEP, MELBOURNE)).toBe("spring");
  });

  it("opens spring for a Melbourne class in September, not autumn", () => {
    const melbourne = seasonBrowse({ date: SEP, lat: MELBOURNE });
    expect(melbourne[0]?.season).toBe("spring");
    expect(melbourne[0]?.open).toBe(true);
    expect(melbourne.find((s) => s.season === "autumn")?.open).toBe(false);
  });

  it("falls back to the northern reading when we do not know where they are", () => {
    expect(seasonAt(SEP, null)).toBe("autumn");
    expect(seasonAt(SEP, undefined)).toBe("autumn");
  });

  it("names the month a season unlocks for the hemisphere the class is in", () => {
    expect(seasonOpensIn("winter", LONDON)).toBe("December");
    expect(seasonOpensIn("spring", LONDON)).toBe("March");
    expect(seasonOpensIn("summer", LONDON)).toBe("June");
    expect(seasonOpensIn("autumn", LONDON)).toBe("September");
    expect(seasonOpensIn("winter", MELBOURNE)).toBe("June");
    expect(seasonOpensIn("autumn", MELBOURNE)).toBe("March");
    expect(seasonOpensIn("winter", null)).toBe("December");
  });
});

describe("one season open, three waiting, in the order a year reads", () => {
  it("walks forward round the year from the season it is", () => {
    const sep = seasonBrowse({ date: SEP, lat: LONDON }).map((s) => s.season);
    expect(sep).toEqual(["autumn", "winter", "spring", "summer"]);
    const dec = seasonBrowse({ date: DEC, lat: LONDON }).map((s) => s.season);
    expect(dec).toEqual(["winter", "spring", "summer", "autumn"]);
    const apr = seasonBrowse({ date: APR, lat: LONDON }).map((s) => s.season);
    expect(apr).toEqual(["spring", "summer", "autumn", "winter"]);
  });

  it("opens exactly the season the class is standing in", () => {
    const sep = seasonBrowse({ date: SEP, lat: LONDON });
    expect(sep.map((s) => [s.season, s.open])).toEqual([
      ["autumn", true],
      ["winter", false],
      ["spring", false],
      ["summer", false],
    ]);
    expect(sep.map((s) => s.opensIn)).toEqual(["September", "December", "March", "June"]);
  });

  it("keeps the same nine Community sessions on the whole shelf all year, and opens a different share of them each season", () => {
    for (const date of [AUG, SEP, JAN, APR]) {
      const all = shelfPacksAllSeasons({ date, lat: LONDON }).flatMap((p) => p.sessions);
      expect(all, date.toDateString()).toHaveLength(9);
    }
    const open = (d: Date) => shelfPacks({ date: d, lat: LONDON }).flatMap((p) => p.sessions).length;
    expect(open(SEP)).toBe(5);
    expect(open(DEC)).toBe(4);
    // Title-only seasons open nothing until their lessons are built.
    expect(open(APR)).toBe(0);
    expect(open(AUG)).toBe(0);
  });

  it("opens the autumn shelf with Minibeast hunting, without moving its file", () => {
    const autumn = shelfPacks({ date: SEP, lat: LONDON })[0]!;
    expect(autumn.id).toBe("autumn-starter");
    expect(autumn.sessions.map((s) => s.id)).toEqual([
      "summer-w2-minibeast-hunting",
      "seed-searchers",
      "animal-leaf-masks",
      "nature-recycling-system",
      "conker-acorn-maths-trail",
    ]);
    // Summer is a drawer of titles for now, so August leads nothing of its own.
    expect(shelfPacks({ date: AUG, lat: LONDON })).toEqual([]);
  });

  it("archives Meet your tree and the contemplative winter deck off the shelf, still in the catalogue", () => {
    const ids = shelfPacksAllSeasons({ date: SEP, lat: LONDON }).flatMap((p) => p.sessions).map((s) => s.id);
    expect(ids).not.toContain("meet-your-tree");
    expect(ids).not.toContain("leaves-and-their-trees");
    expect(ids).not.toContain("winter-w2-ice");
    expect(seasonShelf.some((e) => e.pack === "winter-term")).toBe(false);
  });

  it("holds the Premium pack off both shelves while it is hidden (Johan, 2026-09-04)", () => {
    const included = shelfPacks({ date: SEP, lat: LONDON });
    const browse = seasonBrowsePacks({ date: SEP, lat: LONDON });
    expect(included.some((pack) => pack.id === "autumn-garden")).toBe(false);
    expect(browse.some((pack) => pack.id === "autumn-garden")).toBe(false);
    expect(shelfTier("autumn-garden")).toBeNull();
    expect(shelfTier("autumn-starter")).toBe("community");
    expect(shelfTier("winter-starter")).toBe("community");
  });

  it("defers to a place that declared its own seasons: authored order, everything open", () => {
    const monsoon = seasonBrowse({
      date: SEP,
      lat: 33.45,
      declaredSeasons: ["cool", "hot-dry", "monsoon", "second-spring"],
    });
    expect(monsoon.map((s) => s.pack.id)).toEqual(seasonShelf.map((e) => e.pack));
    expect(monsoon.every((s) => s.open)).toBe(true);
  });

  it("still uses the calendar when a place declared seasons that include this one", () => {
    const temperate = shelfPacks({
      date: SEP,
      lat: LONDON,
      declaredSeasons: ["spring", "summer", "autumn", "winter"],
    });
    expect(temperate[0]?.id).toBe("autumn-starter");
    expect(temperate).toHaveLength(1);
  });

  it("ignores an empty declaration rather than treating it as evidence", () => {
    const empty = shelfPacks({ date: SEP, lat: LONDON, declaredSeasons: [] });
    expect(empty[0]?.id).toBe("autumn-starter");
  });
});
