import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CastFace } from "@/app/CastFace";
import { observedLine, relativeDayPhrase, type CastMember } from "@/lib/cast/member";
import { resolveCast } from "@/lib/cast/resolve";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import {
  parsePointmoonNatureProjection,
  slotPlace,
  type PointmoonPhenophase,
  type PointmoonPhenophaseEvidence,
  type PointmoonSpeciesRecency,
} from "@/lib/outside/pointmoon-contract";

/**
 * The observed leg on the lesson surfaces (#959).
 *
 * The curated seasonal calendar says what a typical year does. Pointmoon's
 * `phenophase` and `recency` say what somebody actually saw, and when, and
 * roughly where. The north star for the seam: Pointmoon supplies tokens and
 * instants, Nature Class writes the sentence. So every word on the line
 * below must trace to a token, and the line must NOT exist when the tokens
 * do not — never a calendar fallback, never "not flowering" said to a child.
 */

const NOW = new Date("2026-08-17T12:00:00.000Z");

const recency: PointmoonSpeciesRecency = {
  provider: "inaturalist",
  latestObservedAt: "2026-08-15T09:12:40.000Z",
  recordCount: 2,
  observerCount: 2,
  sampledRecordCount: 50,
  placeHint: "Richmond Park, London, Greater London",
  placeHintStatus: "coarse",
};

const flowering: PointmoonPhenophase = {
  provider: "inaturalist",
  flowering: { recordCount: 2, latestObservedAt: "2026-08-15T09:12:40.000Z", license: "cc-by" },
  fruiting: null,
  flowerBudding: null,
  noFlowersOrFruits: null,
  leaves: { state: "green", recordCount: 1, latestObservedAt: "2026-08-11T16:03:00.000Z", license: "cc-by-nc" },
  sampledRecordCount: 50,
  epistemicType: "observed",
};

function member(over: Partial<CastMember> = {}): CastMember {
  const built: CastMember = {
    commonName: "Borage",
    scientificName: "Borago officinalis",
    photoUrl: null,
    iconicTaxon: "Plantae",
    honestyTier: "recorded",
    lastSeenWindow: 7,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Blue star flowers that bees love.",
    ...over,
  };
  // Surfaces render the precomputed line; the helper pins the clock the way
  // resolveCast does at resolve time.
  if (built.observed === undefined) built.observed = observedLine(built, NOW);
  return built;
}

describe("observedLine — the sentence is ours, the tokens are Pointmoon's", () => {
  it("writes phase and relative day from the tokens, and no place when the slot has none", () => {
    // This slot carries no place of its own — the shape every payload had
    // before pointmoon#126, and the shape a record with no readable place
    // still has. recency's coarse place is right there and is not borrowed.
    expect(observedLine(member({ recency, phenophase: flowering }), NOW)).toBe(
      "In flower, seen 2 days ago"
    );
  });

  it("renders nothing without a phenophase object — no calendar fallback", () => {
    expect(observedLine(member(), NOW)).toBeNull();
    expect(observedLine(member({ recency }), NOW)).toBeNull();
  });

  it("stays silent on the typed negative: 'not flowering' is not said to children", () => {
    const negative: PointmoonPhenophase = {
      ...flowering,
      flowering: null,
      leaves: null,
      noFlowersOrFruits: { recordCount: 1, latestObservedAt: "2026-08-16T08:00:00.000Z", license: "cc0" },
    };
    expect(observedLine(member({ recency, phenophase: negative }), NOW)).toBeNull();
  });

  it("needs a dated record: an undated slot has no instant to be honest about", () => {
    const undated: PointmoonPhenophase = {
      ...flowering,
      flowering: { recordCount: 1, latestObservedAt: null, license: "cc-by" },
      leaves: null,
    };
    expect(observedLine(member({ recency, phenophase: undated }), NOW)).toBeNull();
  });

  it("names the freshest dated slot, so a newer leaf record outranks older flowers", () => {
    const turning: PointmoonPhenophase = {
      ...flowering,
      flowering: { recordCount: 1, latestObservedAt: "2026-08-01T09:00:00.000Z", license: "cc-by" },
      leaves: { state: "coloured", recordCount: 1, latestObservedAt: "2026-08-16T09:00:00.000Z", license: "cc-by" },
    };
    // No place: recency's freshest record (the 15th) is not this sighting.
    expect(observedLine(member({ recency, phenophase: turning }), NOW)).toBe(
      "Leaves turning, seen yesterday"
    );
  });

  it("never borrows recency's place, whatever its status or instant", () => {
    // recency describes the freshest SAMPLED record; the line describes the
    // freshest ANNOTATED one. Two records, and a shared timestamp does not
    // make them one (pointmoon#122). Since #967 `observedLine` cannot even
    // see this field — the case below is the runtime half of that proof.
    const withheld: PointmoonSpeciesRecency = {
      ...recency,
      placeHint: null,
      placeHintStatus: "withheld-obscured",
    };
    expect(observedLine(member({ recency: withheld, phenophase: flowering }), NOW)).toBe(
      "In flower, seen 2 days ago"
    );
    const otherRecord: PointmoonSpeciesRecency = {
      ...recency,
      latestObservedAt: "2026-08-16T20:00:00.000Z",
    };
    expect(observedLine(member({ recency: otherRecord, phenophase: flowering }), NOW)).toBe(
      "In flower, seen 2 days ago"
    );
  });

  it("gives way to the safety line and says nothing about an absence", () => {
    expect(
      observedLine(member({ recency, phenophase: flowering, safetyNote: "Look, do not touch." }), NOW)
    ).toBeNull();
    expect(observedLine(member({ recency, phenophase: flowering, absent: true }), NOW)).toBeNull();
  });

  it("phrases the day from the instant and our own clock", () => {
    const at = (iso: string) => relativeDayPhrase(iso, NOW);
    expect(at("2026-08-17T09:00:00.000Z")).toBe("today");
    expect(at("2026-08-16T13:00:00.000Z")).toBe("yesterday");
    expect(at("2026-08-14T13:00:00.000Z")).toBe("3 days ago");
    expect(at("2026-08-08T13:00:00.000Z")).toBe("last week");
    expect(at("2026-07-20T13:00:00.000Z")).toBe("4 weeks ago");
    // A record stamped after our clock reads as today, never as a negative.
    expect(at("2026-08-18T13:00:00.000Z")).toBe("today");
    expect(at("not an instant")).toBeNull();
  });
});

/**
 * THE SLOT'S OWN PLACE (#967).
 *
 * #959 shipped the line without a place, because `recency.placeHint` and the
 * phenophase instant came from different records with no shared id. Pointmoon
 * fixed that at the source (pointmoon#122, PR pointmoon#126, live): every slot
 * now carries its own `placeHint`, `placeHintStatus` and `observationId`. So
 * the place on this line is the annotated record's own, and every other place
 * in the payload — recency's included — stays where it is.
 */
describe("observedLine names the slot's own coarse place (#967)", () => {
  const placed = (over: Partial<PointmoonPhenophaseEvidence> = {}): PointmoonPhenophase => {
    const slot: PointmoonPhenophaseEvidence = {
      recordCount: 2,
      latestObservedAt: "2026-08-15T09:12:40.000Z",
      license: "cc-by",
      placeHint: "Wandsworth Common, London, Greater London",
      placeHintStatus: "coarse",
      observationId: "395595741",
      ...over,
    };
    // The projection never sets a key it has no value for, so neither does
    // this builder: an overridden-away hint leaves the key absent.
    if (slot.placeHint === undefined) delete slot.placeHint;
    return { ...flowering, flowering: slot, leaves: null };
  };

  it("prints the coarse place of the record it is describing", () => {
    expect(observedLine(member({ recency, phenophase: placed() }), NOW)).toBe(
      "In flower, seen 2 days ago near Wandsworth Common, London, Greater London"
    );
  });

  it("takes the place from a member that has no recency at all", () => {
    // The proof of source: there is no other place in this object to borrow.
    const noReceipt = member({ phenophase: placed() });
    expect(noReceipt).not.toHaveProperty("recency");
    expect(observedLine(noReceipt, NOW)).toBe(
      "In flower, seen 2 days ago near Wandsworth Common, London, Greater London"
    );
  });

  it("prefers the slot's place over recency's, even when recency has a coarse one", () => {
    // recency says Richmond Park; the annotated record says Wandsworth
    // Common. Only one of them saw this flower.
    const line = observedLine(member({ recency, phenophase: placed() }), NOW);
    expect(line).toContain("Wandsworth Common");
    expect(line).not.toContain("Richmond Park");
  });

  it.each(["withheld-obscured", "unavailable"] as const)(
    "says nothing about place under %s, and the rest of the line is unchanged",
    (status) => {
      expect(
        observedLine(member({ recency, phenophase: placed({ placeHintStatus: status, placeHint: undefined }) }), NOW)
      ).toBe("In flower, seen 2 days ago");
    }
  );

  it("still renders nothing at all when there is no phenophase", () => {
    expect(observedLine(member({ recency }), NOW)).toBeNull();
  });

  it("will not compile if a recency receipt is offered where a slot belongs", () => {
    // The structural half of the ticket: "never recency.placeHint" is a type
    // error, not a comment somebody has to remember. `slotPlace` takes an
    // annotated slot, and a recency object is not one (it carries no
    // `license`), so `npm run typecheck` fails the day this line compiles.
    // Never called — the point is what the checker says, not what it returns.
    const wrong = () =>
      // @ts-expect-error a sample receipt is not one annotation's evidence
      slotPlace(recency);
    expect(typeof wrong).toBe("function");
  });

  it("uses the chosen slot's place, not a sibling slot's", () => {
    // The freshest dated slot wins the sentence, so it must also own the
    // place: a stale flowering record's place on a fresh leaf line would be
    // the same mix-up one rung down.
    const bothPlaced: PointmoonPhenophase = {
      ...flowering,
      flowering: {
        recordCount: 1,
        latestObservedAt: "2026-08-01T09:00:00.000Z",
        license: "cc-by",
        placeHint: "Kew Gardens, London",
        placeHintStatus: "coarse",
      },
      leaves: {
        state: "coloured",
        recordCount: 1,
        latestObservedAt: "2026-08-16T09:00:00.000Z",
        license: "cc-by",
        placeHint: "Hampstead Heath, London",
        placeHintStatus: "coarse",
      },
    };
    expect(observedLine(member({ recency, phenophase: bothPlaced }), NOW)).toBe(
      "Leaves turning, seen yesterday near Hampstead Heath, London"
    );
  });

  it("renders the place on the face and the tile", () => {
    const seen = member({ recency, phenophase: placed() });
    const face = renderToStaticMarkup(<CastFace member={seen} />);
    expect(face).toContain("near Wandsworth Common, London, Greater London");
    expect(face).toContain("via iNaturalist");
    const tile = renderToStaticMarkup(<CastFace member={seen} size="tile" />);
    expect(tile).toContain("near Wandsworth Common");
  });

  it("travels from a payload through the projection into the resolved line", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const rows = (payload as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    }).facts.fieldSnapshot.observations.nearby;
    const row = rows.find((r) => r.scientificName === "Borago officinalis")!;
    // The recorded fixture predates pointmoon#126, so the post-#126 slot
    // shape is added here — deliberately naming a DIFFERENT place from the
    // recency hint the same row carries, so borrowing the wrong one would
    // show up in this assertion rather than hide behind a matching string.
    Object.assign((row.phenophase as Record<string, unknown>).flowering as Record<string, unknown>, {
      placeHint: "Wandsworth Common, London, Greater London",
      placeHintStatus: "coarse",
      observationId: "395595741",
    });
    const cast = resolveCast({ data: payload, topic: "plants", topicFilter: true, now: NOW });
    const borage = cast.members.find((m) => m.scientificName === "Borago officinalis");
    expect(borage?.recency?.placeHint).toBe("Richmond Park, London, Greater London");
    expect(borage?.observed).toBe(
      "In flower, seen 2 days ago near Wandsworth Common, London, Greater London"
    );
  });
});

describe("the face and the tile render the observed leg apart from the curated line", () => {
  it("shows the dated line on a face and a tile, in its own element", () => {
    const seen = member({ recency, phenophase: flowering });
    const face = renderToStaticMarkup(<CastFace member={seen} />);
    expect(face).toContain("cast-face-observed");
    expect(face).toContain("In flower, seen");
    expect(face).not.toContain("near ");
    // The curated line is still there and still first.
    expect(face.indexOf("cast-face-line")).toBeLessThan(face.indexOf("cast-face-observed"));

    const tile = renderToStaticMarkup(<CastFace member={seen} size="tile" />);
    expect(tile).toContain("cast-tile-observed");
    expect(tile).toContain("In flower, seen");
  });

  it("renders no observed element at all without a dated record", () => {
    for (const m of [member(), member({ recency }), member({ honestyTier: "regional" })]) {
      const face = renderToStaticMarkup(<CastFace member={m} />);
      expect(face).not.toContain("observed");
      expect(face).not.toContain("seen ");
      const tile = renderToStaticMarkup(<CastFace member={m} size="tile" />);
      expect(tile).not.toContain("observed");
    }
  });

  it("styles the observed line apart from the curated one", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.cast-face-observed[\s\S]*?color: var\(--living\)/);
    expect(css).toContain(".cast-tile-observed");
    expect(css).toContain(".species-observed");
  });
});

describe("the tokens travel from the recorded fixture into the resolved cast", () => {
  const payload = JSON.parse(
    readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
  ) as FieldTruth;

  it("projects Borage's recency and phenophase off the recorded payload", () => {
    const projection = parsePointmoonNatureProjection(payload, { now: NOW });
    if (projection.status !== "ready") throw new Error("expected a ready projection");
    const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
    expect(borage?.recency).toMatchObject({ placeHintStatus: "coarse", recordCount: 2 });
    expect(borage?.phenophase).toMatchObject({ epistemicType: "observed" });
    const withRecency = projection.observations.filter((o) => o.recency);
    expect(withRecency).toHaveLength(1);
  });

  it("carries them into the resolved cast, and invents nothing for unsampled rows", () => {
    const cast = resolveCast({ data: payload, topic: "plants", topicFilter: true });
    const borage = cast.members.find((m) => m.scientificName === "Borago officinalis");
    expect(borage?.recency).toMatchObject({ placeHint: "Richmond Park, London, Greater London" });
    expect(borage?.phenophase?.flowering).toMatchObject({ recordCount: 2 });
    expect(
      observedLine({ ...borage!, line: "" } as CastMember, NOW)
    ).toBe("In flower, seen 2 days ago");

    // A row Pointmoon did not sample carries nothing, and nothing is invented.
    const yarrow = cast.members.find((m) => m.scientificName === "Achillea millefolium");
    expect(yarrow).toBeDefined();
    expect(yarrow).not.toHaveProperty("recency");
    expect(yarrow).not.toHaveProperty("phenophase");
  });
});

describe("Codex review on PR #960", () => {
  it("credits iNaturalist wherever the observed line renders, photo or no photo", () => {
    const seen = member({ recency, phenophase: flowering });
    const face = renderToStaticMarkup(<CastFace member={seen} />);
    const tile = renderToStaticMarkup(<CastFace member={seen} size="tile" />);
    expect(face).toContain("via iNaturalist");
    expect(tile).toContain("via iNaturalist");
    // Text, never an anchor: the face and tile are whole-card links, and a
    // platform front-door link is an invitation to join, which class surfaces
    // refuse (#758).
    expect(face).not.toMatch(/<a[^>]*observed-credit/);
    expect(tile).not.toMatch(/<a[^>]*observed-credit/);
    expect(face).not.toContain("inaturalist.org");
  });

  it("does not render a credit when there is no observed line", () => {
    const quiet = member({ recency, phenophase: undefined });
    const face = renderToStaticMarkup(<CastFace member={quiet} />);
    expect(face).not.toContain("via iNaturalist");
  });

  it("refuses a phenophase that does not declare itself observed", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const rows = (payload as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    }).facts.fieldSnapshot.observations.nearby;
    const borageRow = rows.find((r) => r.scientificName === "Borago officinalis");
    if (!borageRow || !borageRow.phenophase) throw new Error("fixture row missing");
    for (const bad of ["inferred", "curated", undefined]) {
      const mutated = JSON.parse(JSON.stringify(payload)) as FieldTruth;
      const mutatedRows = (mutated as unknown as {
        facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
      }).facts.fieldSnapshot.observations.nearby;
      const row = mutatedRows.find((r) => r.scientificName === "Borago officinalis")!;
      const phenophase = row.phenophase as Record<string, unknown>;
      if (bad === undefined) delete phenophase.epistemicType;
      else phenophase.epistemicType = bad;
      const projection = parsePointmoonNatureProjection(mutated, { now: NOW });
      if (projection.status !== "ready") throw new Error("expected a ready projection");
      const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
      expect(borage).toBeDefined();
      expect(borage?.phenophase).toBeUndefined();
      // The row itself survives: only the unproven claim is dropped.
      expect(borage?.recency).toBeDefined();
    }
  });
});

describe("Codex review on PR #960, round two", () => {
  it("separates the credit from the line with real text, not only margin", () => {
    const face = renderToStaticMarkup(<CastFace member={member({ recency, phenophase: flowering })} />);
    const text = face.replace(/<[^>]+>/g, "");
    // CastFace reads the real clock, so only the shape is asserted.
    expect(text).toMatch(/seen .+ ago via iNaturalist/);
    expect(text).not.toContain("agovia");
  });

  it("maps --living in outdoor mode and keeps the credit opaque", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const outdoor = css.slice(css.indexOf('[data-outdoor="true"] {'));
    expect(outdoor.slice(0, 2500)).toMatch(/--living:\s*#9cc47e/);
    const credit = css.slice(css.indexOf(".observed-credit {"));
    expect(credit.slice(0, credit.indexOf("}"))).not.toContain("opacity");
  });

  it("rejects a recency receipt with zero records, observers or sample", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    for (const field of ["recordCount", "observerCount", "sampledRecordCount"]) {
      const mutated = JSON.parse(JSON.stringify(payload)) as FieldTruth;
      const rows = (mutated as unknown as {
        facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
      }).facts.fieldSnapshot.observations.nearby;
      const row = rows.find((r) => r.scientificName === "Borago officinalis")!;
      (row.recency as Record<string, unknown>)[field] = 0;
      const projection = parsePointmoonNatureProjection(mutated, { now: NOW });
      if (projection.status !== "ready") throw new Error("expected a ready projection");
      const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
      expect(borage?.recency).toBeUndefined();
      expect(borage?.phenophase).toBeDefined();
    }
  });
});

describe("Codex review on PR #960, round three", () => {
  it("says nothing for no-live-leaves: an absence is not something to look for", () => {
    const bare: PointmoonPhenophase = {
      ...flowering,
      flowering: null,
      leaves: { state: "no-live-leaves", recordCount: 1, latestObservedAt: "2026-08-16T09:00:00.000Z", license: "cc-by" },
    };
    expect(observedLine(member({ recency, phenophase: bare }), NOW)).toBeNull();
  });

  it("rejects a phenophase receipt whose sample size is zero", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const mutated = JSON.parse(JSON.stringify(payload)) as FieldTruth;
    const rows = (mutated as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    }).facts.fieldSnapshot.observations.nearby;
    const row = rows.find((r) => r.scientificName === "Borago officinalis")!;
    (row.phenophase as Record<string, unknown>).sampledRecordCount = 0;
    const projection = parsePointmoonNatureProjection(mutated, { now: NOW });
    if (projection.status !== "ready") throw new Error("expected a ready projection");
    const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
    expect(borage?.phenophase).toBeUndefined();
    expect(borage?.recency).toBeDefined();
  });
});

describe("Codex review on PR #960, round four", () => {
  it("a newer no-live-leaves record does not hide an older flowering record", () => {
    const mixed: PointmoonPhenophase = {
      ...flowering,
      leaves: { state: "no-live-leaves", recordCount: 1, latestObservedAt: "2026-08-16T09:00:00.000Z", license: "cc-by" },
    };
    expect(observedLine(member({ recency, phenophase: mixed }), NOW)).toBe("In flower, seen 2 days ago");
  });
});

describe("Codex review on PR #960, round six", () => {
  it.each([
    ["a day the month does not have", "2026-02-30T09:00:00.000Z"],
    ["a thirteenth month", "2026-13-01T09:00:00.000Z"],
    ["an hour of 24", "2026-08-15T24:00:00Z"],
    ["an offset with 60 minutes", "2026-08-15T09:00:00+01:60"],
  ])("refuses an ISO-shaped timestamp with %s", (_label, value) => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const mutated = JSON.parse(JSON.stringify(payload)) as FieldTruth;
    const rows = (mutated as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    }).facts.fieldSnapshot.observations.nearby;
    const row = rows.find((r) => r.scientificName === "Borago officinalis")!;
    ((row.phenophase as Record<string, unknown>).flowering as Record<string, unknown>).latestObservedAt = value;
    const projection = parsePointmoonNatureProjection(mutated, { now: NOW });
    if (projection.status !== "ready") throw new Error("expected a ready projection");
    const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
    expect(borage?.phenophase?.flowering?.latestObservedAt).toBeNull();
  });

  it("still accepts a real instant with an offset and a leap day", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const mutated = JSON.parse(JSON.stringify(payload)) as FieldTruth;
    const rows = (mutated as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    }).facts.fieldSnapshot.observations.nearby;
    const row = rows.find((r) => r.scientificName === "Borago officinalis")!;
    ((row.phenophase as Record<string, unknown>).flowering as Record<string, unknown>).latestObservedAt =
      "2024-02-29T10:30:00+01:00";
    const projection = parsePointmoonNatureProjection(mutated, { now: NOW });
    if (projection.status !== "ready") throw new Error("expected a ready projection");
    const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
    expect(borage?.phenophase?.flowering?.latestObservedAt).toBe("2024-02-29T09:30:00.000Z");
  });
});

describe("Codex review on PR #960, round five", () => {
  it("refuses a timestamp that is not ISO 8601, even one Date.parse would accept", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const mutated = JSON.parse(JSON.stringify(payload)) as FieldTruth;
    const rows = (mutated as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    }).facts.fieldSnapshot.observations.nearby;
    const row = rows.find((r) => r.scientificName === "Borago officinalis")!;
    ((row.phenophase as Record<string, unknown>).flowering as Record<string, unknown>).latestObservedAt = "1";
    const projection = parsePointmoonNatureProjection(mutated, { now: NOW });
    if (projection.status !== "ready") throw new Error("expected a ready projection");
    const borage = projection.observations.find((o) => o.scientificName === "Borago officinalis");
    expect(borage?.phenophase?.flowering?.latestObservedAt).toBeNull();
  });

  it("phrases the observed line once, at resolve time, against the given clock", () => {
    const payload = JSON.parse(
      readFileSync(new URL("../fixtures/pointmoon/london_uk_2026-08-17.json", import.meta.url), "utf8")
    ) as FieldTruth;
    const cast = resolveCast({ data: payload, topic: "plants", topicFilter: true, now: NOW });
    const borage = cast.members.find((m) => m.scientificName === "Borago officinalis");
    expect(borage?.observed).toBe("In flower, seen 2 days ago");
    // The face renders the stored line and runs no clock of its own.
    const face = renderToStaticMarkup(<CastFace member={{ ...borage!, line: "" } as CastMember} />);
    expect(face).toContain("In flower, seen 2 days ago");
  });
});
