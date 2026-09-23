import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCast, type TaxonReferenceIndex } from "@/lib/cast/resolve";
import { resolveDoor } from "@/lib/lesson/door";
import type { CastMember } from "@/lib/cast/member";
import type { PhenologyEntry } from "@/lib/outside/types";

/**
 * A SEASONAL EVENT IS NOT A FINDABLE SPECIMEN (#1020).
 *
 * `lib/outside/data/phenology/uk-north.json`, week 35, as authored:
 *
 *     { "id": "uk_north_w35_swallow_gathering",
 *       "species": "Swallow Gathering",
 *       "scientificName": "Hirundo rustica",
 *       "description": "Swallows massing on wires before migration" }
 *
 * `lib/outside/data/taxon-reference.json` — generated from the iNaturalist API,
 * never hand-edited — resolves `hirundo rustica` to taxon 11901, iconic taxon
 * `Aves`, common name "Barn Swallow", and a releasable photograph of one bird.
 * So the row cleared `matchesTopic` for `birds` and for `animals` and printed
 * as a specimen: an event's name over a portrait of a single swallow, on a
 * lesson about sorting fallen leaves.
 *
 * Johan, 2026-09-06: *"a seasonal EVENT, not a findable specimen — a child
 * sorting leaves cannot go and look at it."*
 *
 * The taxon gate could not have caught it. Taxonomically the row IS a bird,
 * and by the time a member reaches `servesTopic` the mislabelling is already
 * inside its `iconicTaxon`. The distinction the gate needed did not exist in
 * the data at all, so the row now carries it (`PhenologyEntry.kind`), and the
 * one seam that turns a row into a specimen reads it.
 *
 * Every fixture below is the REAL row from the shipped region file, not a
 * stand-in typed here, and the control is its own neighbour: week 16 of the
 * same file carries "Swallow", the same `Hirundo rustica`, as a species. The
 * two differ in exactly one authored field, which is the whole claim.
 */

const DIR = "lib/outside/data/phenology";

type Region = Record<string, PhenologyEntry[]>;

function region(file: string): Region {
  return JSON.parse(readFileSync(join(DIR, `${file}.json`), "utf8")) as Region;
}

function row(file: string, week: string, id: string): PhenologyEntry {
  const found = region(file)[week]?.find((entry) => entry.id === id);
  if (!found) throw new Error(`${file}.json week ${week} no longer holds ${id}`);
  return found;
}

/** The generated reference, read as the product reads it. */
const TAXA: Record<string, { iconicTaxon: string | null; commonName: string | null }> = JSON.parse(
  readFileSync(join("lib", "outside", "data", "taxon-reference.json"), "utf8")
).taxa;

const REFERENCES = TAXA as unknown as TaxonReferenceIndex;

const GATHERING = row("uk-north", "35", "uk_north_w35_swallow_gathering");
const SWALLOW = row("uk-north", "16", "uk_north_w16_swallow");

function member(entry: PhenologyEntry): CastMember {
  const [resolved] = resolveCast({
    data: null,
    phenology: [entry],
    taxonReferences: REFERENCES,
  }).members;
  if (!resolved) throw new Error(`${entry.species} resolved to no member at all`);
  return { ...resolved, line: "" } as CastMember;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the row that started it", () => {
  it("is the row the ticket quotes, and it says what it is", () => {
    expect(GATHERING.species).toBe("Swallow Gathering");
    expect(GATHERING.scientificName).toBe("Hirundo rustica");
    expect(GATHERING.kind).toBe("event");
    // The scientific name is KEPT. The event really is about barn swallows,
    // the "what to look for" note wants to know that, and deleting it would
    // be a second thing to remember rather than a fact to read.
    expect(GATHERING.description).toBe("Swallows massing on wires before migration");
  });

  it("still resolves in the taxonomy that made it dangerous", () => {
    // Not a hypothetical: this is why removing the row's identity was the
    // wrong fix and why the gate has to be told, not left to infer.
    expect(TAXA["hirundo rustica"]?.iconicTaxon).toBe("Aves");
    expect(TAXA["hirundo rustica"]?.commonName).toBe("Barn Swallow");
  });
});

describe("an event resolves to no specimen", () => {
  it("gives the gathering no taxon, no photograph and no species identity", () => {
    const gathering = member(GATHERING);
    expect(gathering.iconicTaxon).toBeNull();
    expect(gathering.photoUrl).toBeNull();
    expect(gathering.scientificName).toBeNull();
    // Still a whole member. It is not dropped, it is not silenced, and a class
    // is still told the swallows are massing.
    expect(gathering.commonName).toBe("Swallow Gathering");
    expect(gathering.honestyTier).toBe("regional");
  });

  it("leaves the species row of the same bird exactly as it was", () => {
    const swallow = member(SWALLOW);
    expect(swallow.commonName).toBe("Swallow");
    expect(swallow.scientificName).toBe("Hirundo rustica");
    expect(swallow.iconicTaxon).toBe("Aves");
    expect(swallow.photoUrl).toContain("inaturalist");
  });
});

/**
 * THE SAFETY DECISION IS NOT PART OF THE IDENTITY (#1027).
 *
 * #1020 drops an event's identity — taxon, photograph, scientific name — and it
 * is careful to read the SAFETY note off the authored name first, before the
 * drop: "a gate that removes a specimen has no business removing a warning."
 * `admissible()` in `resolveCast` is the second safety reader and it was not
 * carried through, so it saw the nulled `scientificName` and let an event
 * through a Reception cast it is meant to be excluded from — while still
 * printing the warning, which is the worst of both answers.
 *
 * No shipped row reaches this today: none of the four event taxa in the corpus
 * matches a safety prefix. But `swarm` is one of the event head nouns above, and
 * `Vespa` is an `exclude-youngest` genus, so a "Hornet Swarm" row is one authored
 * line away. The fixture below is that row, written here rather than waited for.
 */
const HORNET_SWARM: PhenologyEntry = {
  id: "fixture_w28_hornet_swarm",
  species: "Hornet Swarm",
  kind: "event",
  scientificName: "Vespa crabro",
  description: "Hornets massing around a nest in the hedge",
  habitats: ["woodland", "urban"],
  senses: ["sight", "sound"],
  confidence: "high",
};

describe("an event's authored taxon still reaches every safety decision", () => {
  const castFor = (yearGroup: string) =>
    resolveCast({
      data: null,
      phenology: [HORNET_SWARM, GATHERING],
      taxonReferences: REFERENCES,
      yearGroup,
    });

  it("keeps a Vespa event off a Reception cast entirely", () => {
    const reception = castFor("Reception");
    expect(reception.members.some((m) => m.commonName === "Hornet Swarm")).toBe(false);
    // The exclusion is about this row, not about events: the harmless one stays.
    expect(reception.members.some((m) => m.commonName === "Swallow Gathering")).toBe(true);
  });

  it("keeps it, and its warning, for an older year group", () => {
    const swarm = castFor("Year 2").members.find((m) => m.commonName === "Hornet Swarm");
    expect(swarm).toBeDefined();
    expect(swarm?.safetyNote).toBe(
      "A hornet. Worth watching from a few steps back, and never worth touching."
    );
    // And it is still an event: no taxon, no photograph, no species identity.
    expect(swarm?.scientificName).toBeNull();
    expect(swarm?.iconicTaxon).toBeNull();
    expect(swarm?.photoUrl).toBeNull();
  });

  it("excludes it on the ability band too, which decides when it is set", () => {
    const banded = resolveCast({
      data: null,
      phenology: [HORNET_SWARM],
      taxonReferences: REFERENCES,
      yearGroup: "Year 4",
      abilityBand: "reception",
    });
    expect(banded.members.some((m) => m.commonName === "Hornet Swarm")).toBe(false);
  });
});

describe("the door's taxon gate, on the ticket's own row", () => {
  const specimenNames = (topic: "birds" | "animals" | "trees") =>
    resolveDoor({
      members: [member(GATHERING), member(SWALLOW)],
      located: false,
      topic,
    });

  it("drops the gathering from a birds lesson and keeps the swallow", () => {
    const door = specimenNames("birds");
    expect(door.kind).not.toBe("none");
    const names = door.kind === "none" ? [] : door.specimens.map((s) => s.member.commonName);
    expect(names).toContain("Swallow");
    expect(names).not.toContain("Swallow Gathering");
  });

  it("drops it from an animals lesson too, which is the leg #1019 could not reach", () => {
    const door = specimenNames("animals");
    const names = door.kind === "none" ? [] : door.specimens.map((s) => s.member.commonName);
    expect(names).toContain("Swallow");
    expect(names).not.toContain("Swallow Gathering");
  });

  it("shows neither on a trees lesson, because a bird is not a tree", () => {
    const door = specimenNames("trees");
    const names = door.kind === "none" ? [] : door.specimens.map((s) => s.member.commonName);
    expect(names).toEqual([]);
  });
});

describe("the week's read offers it to notice, never to meet", () => {
  it("keeps the gathering out of usuallyAround and in lookFors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schemaVersion: "field-truth@1.1.0",
              facts: { fieldSnapshot: { time: { date: "2026-08-28T09:00:00Z" }, phenology: { epistemicType: "curated", provider: "hand-authored", regionKey: "uk-north", week: 35, entries: [{ ...GATHERING, epistemicType: "curated" }] }, observations: { nearby: [], birds: { notable: [] } } } },
            }),
            { status: 200 }
          )
      )
    );
    const { getOutsideNow } = await import("@/lib/outside");
    const outside = await getOutsideNow({
      // Leeds, which reads uk-north, on a date in ISO week 35.
      lat: 53.8,
      lng: -1.55,
      date: new Date("2026-08-28T09:00:00Z"),
      limit: 20,
    });

    expect(outside.regionId).toBe("uk-north");
    expect(outside.week).toBe(35);
    expect(outside.lookFors.map((l) => l.species)).toContain("Swallow Gathering");
    // `usuallyAround` is what everything downstream treats as a specimen —
    // the lesson's photograph strip, the brief's cast, the note index that
    // lets a recorded creature inherit a phenology line by scientific name.
    expect(outside.usuallyAround.map((s) => s.name)).not.toContain("Swallow Gathering");
    // And nothing else on that list carries the gathering's identity either,
    // which is what stops a photographed barn swallow wearing the event's note.
    expect(outside.usuallyAround.map((s) => s.scientificName)).not.toContain("Hirundo rustica");
  });
});

/**
 * THE RATCHET.
 *
 * The fix above is only as good as the marking, and the marking is authored by
 * hand across fifteen files. This is the floor under it: in every one of these
 * names the event noun is the HEAD — the last word — which is how English
 * builds them, and no species in the 4,388-row corpus ends in one of these.
 * A new row called "Toad Migration" or "Frog Chorus" fails here until somebody
 * says what it is.
 *
 * It is a floor and not a definition. A row can name an event without using
 * any of these words, and no list of words could catch that; the field is the
 * fix, this only stops the obvious ones being forgotten again.
 */
const EVENT_HEAD_NOUNS = new Set([
  "gathering",
  "gatherings",
  "murmuration",
  "murmurations",
  "migration",
  "migrations",
  "rut",
  "chorus",
  "solstice",
  "equinox",
  "shower",
  "roost",
  "swarm",
  "spawning",
  "emergence",
]);

describe("every row that names an event says so", () => {
  const rows = readdirSync(DIR)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) =>
      Object.entries(region(file.replace(/\.json$/, ""))).flatMap(([week, entries]) =>
        entries.map((entry) => ({ file, week, entry }))
      )
    );

  it("reads the whole corpus, so a green here means something", () => {
    expect(rows.length).toBeGreaterThan(4000);
  });

  it("marks every row whose name ends in an event noun", () => {
    const unmarked = rows
      .filter(({ entry }) => {
        const head = entry.species.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, "");
        return head !== undefined && EVENT_HEAD_NOUNS.has(head) && entry.kind !== "event";
      })
      .map(({ file, week, entry }) => `${file} w${week} ${entry.id} (${entry.species})`);
    expect(unmarked).toEqual([]);
  });

  it("never marks a row whose kind is not one of the two", () => {
    const wrong = rows
      .filter(({ entry }) => {
        if (entry.kind === undefined) return false;
        return entry.kind !== "event" && entry.kind !== "species";
      })
      .map(({ entry }) => `${entry.id}: ${String(entry.kind)}`);
    expect(wrong).toEqual([]);
  });
});
