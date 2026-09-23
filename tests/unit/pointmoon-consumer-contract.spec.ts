import { describe, expect, it } from "vitest";
import {
  POINTMOON_NATURE_CONTRACT_VERSION,
  parsePointmoonNatureProjection,
} from "@/lib/outside/pointmoon-contract";

function payload(entry: Record<string, unknown>, observations: Record<string, unknown> = {}) {
  return {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        observations: {
          recentWindowDays: 7,
          nearby: [entry],
          birds: { notable: [] },
          absent: [],
          ...observations,
        },
      },
    },
  };
}

const monarch = {
  name: "Monarch",
  scientificName: "Danaus plexippus",
  count: 3,
  iconicTaxon: "Insecta",
  yearsObserved: 2,
};

describe("Pointmoon nature consumer contract", () => {
  it("keeps legacy presence while refusing a bare legacy photoUrl", () => {
    const result = parsePointmoonNatureProjection(
      payload({
        ...monarch,
        photoUrl: "https://legacy.example.test/monarch.jpg",
      })
    );

    expect(result).toMatchObject({
      contractVersion: POINTMOON_NATURE_CONTRACT_VERSION,
      status: "ready",
      freshness: "legacy-unbounded",
      recentWindowDays: 7,
    });
    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      commonName: "Monarch",
      scientificName: "Danaus plexippus",
      count: 3,
      photo: null,
    });
    expect(result.observations[0]).not.toHaveProperty("photoUrl");
    expect(JSON.stringify(result)).not.toContain("legacy.example.test");
  });

  it("projects a complete open photo as one typed asset", () => {
    const result = parsePointmoonNatureProjection(
      payload({
        ...monarch,
        presence: {
          provider: "inaturalist",
          taxonId: "48662",
          observationCount: 3,
          radiusKm: 10,
          windowStart: "2026-08-06",
          windowEnd: "2026-08-13",
          latitude: 51.5,
          longitude: -0.1,
        },
        photo: {
          url: "https://images.example.test/monarch.jpg",
          role: "observation",
          creator: "A. Observer",
          attribution: "Photo by A. Observer",
          license: "cc-by",
          sourceUrl: "https://source.example.test/observations/42",
          observationId: "42",
          observedAt: "2026-08-12T10:30:00.000Z",
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.observations[0]?.photo).toEqual({
      url: "https://images.example.test/monarch.jpg",
      role: "observation",
      creator: "A. Observer",
      attribution: "Photo by A. Observer",
      license: "cc-by",
      sourceUrl: "https://source.example.test/observations/42",
      observationId: "42",
      observedAt: "2026-08-12T10:30:00.000Z",
    });
    expect(result.observations[0]?.presence).toEqual({
      provider: "inaturalist",
      taxonId: "48662",
      observationCount: 3,
      radiusKm: 10,
      windowStart: "2026-08-06",
      windowEnd: "2026-08-13",
    });
    expect(result.observations[0]?.presence).not.toHaveProperty("latitude");
    expect(result.observations[0]?.presence).not.toHaveProperty("longitude");
  });

  /**
   * The one condition left, and it is transport rather than rights: an https
   * page cannot display an http image, so admitting it would produce a broken
   * picture rather than an uncredited one. Everything that used to sit beside
   * this in a rejection table now has its own test below, for keeping.
   */
  it("drops an insecure image URL without erasing the valid presence", () => {
    const result = parsePointmoonNatureProjection(
      payload({
        ...monarch,
        presence: {
          provider: "inaturalist",
          taxonId: "48662",
          observationCount: 3,
          radiusKm: 10,
          windowStart: "2026-08-06",
          windowEnd: "2026-08-13",
        },
        photo: {
          url: "http://images.example.test/m.jpg",
          role: "observation",
          attribution: "Photo by A. Observer",
          license: "cc-by",
          sourceUrl: "https://source.example.test/observations/42",
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.commonName).toBe("Monarch");
    expect(result.observations[0]?.photo).toBeNull();
    expect(result.observations[0]?.presence).toMatchObject({
      provider: "inaturalist",
      taxonId: "48662",
      observationCount: 3,
    });
    expect(JSON.stringify(result)).not.toContain("javascript:");
    expect(JSON.stringify(result)).not.toContain("http://images.example.test");
  });

  /**
   * WHAT NO LONGER DROPS A PHOTOGRAPH.
   *
   * Johan, 2026-08-17: "all photos no gates! we need any photo we can get".
   *
   * A missing byline, an unusable source page and an unrecognised role each
   * used to bin the picture. Every one of them looked principled and every one
   * rendered on screen as "nothing photographed near this school". They are
   * recorded now, not enforced: the credit line prints what travelled, an
   * unusable source page simply is not linked, and an odd role is filed as a
   * reference rather than refused.
   *
   * The insecure IMAGE url is still refused, above. That one is transport, not
   * rights: an https page cannot display an http image, so it would be a
   * broken picture rather than an uncredited one.
   */
  it.each([
    ["a missing attribution", { attribution: "" }],
    ["an unusable source URL", { sourceUrl: "javascript:alert(1)" }],
    ["an unknown role", { role: "decorative" }],
  ])("keeps a photograph with %s", (_label, override) => {
    const result = parsePointmoonNatureProjection(
      payload({
        ...monarch,
        photo: {
          url: "https://images.example.test/monarch.jpg",
          role: "observation",
          attribution: "Photo by A. Observer",
          license: "cc-by",
          sourceUrl: "https://source.example.test/observations/42",
          ...override,
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.observations[0]?.photo?.url).toBe("https://images.example.test/monarch.jpg");
    // Never at the cost of letting a javascript: URL through to a renderer.
    expect(JSON.stringify(result)).not.toContain("javascript:");
  });

  /**
   * A NON-COMMERCIAL LICENCE IS NOT A REASON TO WITHHOLD THE PHOTOGRAPH.
   *
   * `cc-by-nc` was in the rejection table above until 2026-08-17. It is
   * iNaturalist's most common photo licence, so the boundary was discarding
   * the majority of what Pointmoon serves, before any renderer saw it, with
   * no error and no log. On screen it was indistinguishable from a school
   * with nothing photographed nearby, which is why it survived for months.
   *
   * Johan, 2026-08-17: "if pointmoon is passing those photos dont add stupid
   * gates... keep attribution but accept any photos we can get."
   *
   * The licence is now carried, not judged. What still guards the boundary is
   * the row above: transport, credit, source and role.
   */
  it.each([["cc-by-nc"], ["cc-by-sa"], ["cc-by-nd"], ["cc-by-nc-sa"]])(
    "keeps a %s photograph and records its licence rather than dropping it",
    (license) => {
      const result = parsePointmoonNatureProjection(
        payload({
          ...monarch,
          photo: {
            url: "https://images.example.test/monarch.jpg",
            role: "observation",
            attribution: "Photo by A. Observer",
            license,
            sourceUrl: "https://source.example.test/observations/42",
          },
        })
      );

      if (result.status !== "ready") throw new Error("expected a ready projection");
      expect(result.observations[0]?.photo).toMatchObject({
        url: "https://images.example.test/monarch.jpg",
        attribution: "Photo by A. Observer",
        license,
      });
    }
  );

  it("records an unstated licence as unstated rather than inventing an open one", () => {
    const result = parsePointmoonNatureProjection(
      payload({
        ...monarch,
        photo: {
          url: "https://images.example.test/monarch.jpg",
          role: "observation",
          attribution: "iNaturalist",
          sourceUrl: "https://source.example.test/observations/42",
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    // Shown, because credit and source travelled. Labelled honestly, because
    // nobody asserted a licence and we do not get to assert one for them.
    expect(result.observations[0]?.photo).toMatchObject({ license: "unstated" });
  });

  it("drops malformed presence evidence without erasing an independently valid photo", () => {
    const result = parsePointmoonNatureProjection(
      payload({
        ...monarch,
        presence: {
          provider: "inaturalist",
          taxonId: "48662",
          observationCount: 3,
          radiusKm: 10,
          windowStart: "not-a-date",
          windowEnd: "2026-08-13",
        },
        photo: {
          url: "https://images.example.test/monarch.jpg",
          role: "observation",
          attribution: "Photo by A. Observer",
          license: "cc-by",
          sourceUrl: "https://source.example.test/observations/42",
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.observations[0]?.presence).toBeNull();
    expect(result.observations[0]?.photo?.url).toBe(
      "https://images.example.test/monarch.jpg"
    );
  });

  it("marks an unknown source version explicitly thin", () => {
    const result = parsePointmoonNatureProjection({
      ...payload(monarch),
      schemaVersion: "field-truth@9.0.0",
    });

    expect(result).toEqual({
      contractVersion: POINTMOON_NATURE_CONTRACT_VERSION,
      status: "thin",
      reason: "unsupported-version",
      sourceSchemaVersion: "field-truth@9.0.0",
    });
  });

  it("marks an expired observation snapshot explicitly thin", () => {
    const result = parsePointmoonNatureProjection(
      payload(monarch, { validUntil: "2026-08-13T11:59:59.000Z" }),
      { now: new Date("2026-08-13T12:00:00.000Z") }
    );

    expect(result).toEqual({
      contractVersion: POINTMOON_NATURE_CONTRACT_VERSION,
      status: "thin",
      reason: "stale",
      sourceSchemaVersion: "field-truth@1.1.0",
    });
  });

  it("distinguishes a malformed observation slice from a valid empty read", () => {
    const malformed = parsePointmoonNatureProjection({
      schemaVersion: "field-truth@1.1.0",
      facts: { fieldSnapshot: { observations: "not-an-object" } },
    });
    const empty = parsePointmoonNatureProjection(
      payload(monarch, { nearby: [], birds: { notable: [] }, absent: [] })
    );

    expect(malformed).toMatchObject({ status: "thin", reason: "invalid-observations" });
    expect(empty).toMatchObject({ status: "ready", observations: [], absences: [] });
  });

  it("projects notable birds and historical absences without trusting their bare photos", () => {
    const result = parsePointmoonNatureProjection(
      payload(monarch, {
        nearby: [],
        birds: {
          notable: [{ ...monarch, name: "Swift", scientificName: "Apus apus" }],
        },
        absent: [
          {
            ...monarch,
            name: "Garden tiger moth",
            scientificName: "Arctia caja",
            photoUrl: "https://legacy.example.test/moth.jpg",
          },
        ],
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.observations).toMatchObject([
      { commonName: "Swift", source: "notable-bird", photo: null },
    ]);
    expect(result.absences).toMatchObject([
      { commonName: "Garden tiger moth", source: "historical-absence", photo: null },
    ]);
  });

  it("projects Pointmoon's historical nearby tier without trusting its bare photo URL", () => {
    const result = parsePointmoonNatureProjection(
      payload(monarch, {
        historical: {
          resolutionStatus: "resolved",
          resolutionReason: null,
          nearby: [
            {
              name: "Speckled Wood",
              scientificName: "Pararge aegeria",
              avgCount: 41,
              yearsObserved: 3,
              sampledYears: 3,
              iconicTaxon: "Insecta",
              photoUrl: "https://legacy.example.test/speckled-wood.jpg",
              photo: {
                url: "https://images.example.test/speckled-wood.jpg",
                role: "taxon-reference",
                attribution: "Photo by A. Observer",
                license: "cc-by",
                sourceUrl: "https://source.example.test/photos/84",
              },
            },
          ],
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.historical).toEqual({
      resolutionStatus: "resolved",
      resolutionReason: null,
      observations: [
        {
          commonName: "Speckled Wood",
          scientificName: "Pararge aegeria",
          avgCount: 41,
          yearsObserved: 3,
          sampledYears: 3,
          iconicTaxon: "Insecta",
          photo: {
            url: "https://images.example.test/speckled-wood.jpg",
            role: "taxon-reference",
            attribution: "Photo by A. Observer",
            license: "cc-by",
            sourceUrl: "https://source.example.test/photos/84",
          },
        },
      ],
    });
    expect(JSON.stringify(result.historical)).not.toContain("legacy.example.test");
  });

  it("does not turn an unresolved historical read into regional evidence", () => {
    const result = parsePointmoonNatureProjection(
      payload(monarch, {
        historical: {
          resolutionStatus: "unresolved",
          resolutionReason: "timeout",
          nearby: [{ name: "Unverified moth", scientificName: "Mothus incertus" }],
        },
      })
    );

    if (result.status !== "ready") throw new Error("expected a ready projection");
    expect(result.historical).toEqual({
      resolutionStatus: "unresolved",
      resolutionReason: "timeout",
      observations: [],
    });
  });

  /**
   * The observed leg (#959). Pointmoon's rule is "absent, not zeroed": a row
   * the direct sample never saw carries no `recency`, a row nobody annotated
   * carries no `phenophase`. The projection keeps that discipline — the key
   * appears only when a whole, valid object crossed — and never throws on a
   * malformed one.
   */
  describe("carries per-species recency and observed phenophase (#959)", () => {
    const recency = {
      provider: "inaturalist",
      latestObservedAt: "2026-08-15T09:12:40.000Z",
      recordCount: 2,
      observerCount: 2,
      sampledRecordCount: 50,
      placeHint: "Richmond Park, London, Greater London",
      placeHintStatus: "coarse",
    };
    const phenophase = {
      provider: "inaturalist",
      flowering: { recordCount: 2, latestObservedAt: "2026-08-15T09:12:40.000Z", license: "cc-by" },
      fruiting: null,
      flowerBudding: null,
      noFlowersOrFruits: null,
      leaves: {
        state: "green",
        recordCount: 1,
        latestObservedAt: "2026-08-11T16:03:00.000Z",
        license: "cc-by-nc",
      },
      sampledRecordCount: 50,
      epistemicType: "observed",
    };

    it("projects both objects whole when they are well formed", () => {
      const result = parsePointmoonNatureProjection(payload({ ...monarch, recency, phenophase }));
      if (result.status !== "ready") throw new Error("expected a ready projection");
      expect(result.observations[0]?.recency).toEqual(recency);
      expect(result.observations[0]?.phenophase).toEqual(phenophase);
    });

    it("leaves both keys absent when Pointmoon sent neither", () => {
      const result = parsePointmoonNatureProjection(payload(monarch));
      if (result.status !== "ready") throw new Error("expected a ready projection");
      expect(result.observations[0]).not.toHaveProperty("recency");
      expect(result.observations[0]).not.toHaveProperty("phenophase");
      expect(result.observations[0]?.recency).toBeUndefined();
      expect(result.observations[0]?.phenophase).toBeUndefined();
    });

    it("drops a malformed object without throwing or losing the row", () => {
      const cases: unknown[] = [
        "flowering",
        42,
        [],
        { ...recency, provider: "ebird" },
        { ...recency, sampledRecordCount: "fifty" },
        { ...recency, placeHintStatus: "precise" },
      ];
      for (const bad of cases) {
        const result = parsePointmoonNatureProjection(
          payload({ ...monarch, recency: bad, phenophase: bad })
        );
        if (result.status !== "ready") throw new Error("expected a ready projection");
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]).not.toHaveProperty("recency");
        expect(result.observations[0]).not.toHaveProperty("phenophase");
      }
    });

    it("never carries a place hint under a status that withholds it", () => {
      const result = parsePointmoonNatureProjection(
        payload({
          ...monarch,
          recency: { ...recency, placeHint: "Somebody's Garden", placeHintStatus: "withheld-obscured" },
        })
      );
      if (result.status !== "ready") throw new Error("expected a ready projection");
      expect(result.observations[0]?.recency).toMatchObject({
        placeHint: null,
        placeHintStatus: "withheld-obscured",
      });
      expect(JSON.stringify(result)).not.toContain("Garden");
    });

    it("keeps the counts when the instant is unparseable, and nulls the instant", () => {
      const result = parsePointmoonNatureProjection(
        payload({ ...monarch, recency: { ...recency, latestObservedAt: "yesterday-ish" } })
      );
      if (result.status !== "ready") throw new Error("expected a ready projection");
      expect(result.observations[0]?.recency).toMatchObject({ latestObservedAt: null, recordCount: 2 });
    });

    it("loses one malformed slot, not its siblings, and drops an object with no slot at all", () => {
      const oneBad = parsePointmoonNatureProjection(
        payload({
          ...monarch,
          phenophase: { ...phenophase, leaves: { ...phenophase.leaves, state: "purple" } },
        })
      );
      if (oneBad.status !== "ready") throw new Error("expected a ready projection");
      expect(oneBad.observations[0]?.phenophase).toMatchObject({
        flowering: phenophase.flowering,
        leaves: null,
      });

      const allNull = parsePointmoonNatureProjection(
        payload({
          ...monarch,
          phenophase: {
            ...phenophase,
            flowering: null,
            leaves: null,
          },
        })
      );
      if (allNull.status !== "ready") throw new Error("expected a ready projection");
      expect(allNull.observations[0]).not.toHaveProperty("phenophase");
    });

    /**
     * A place on the SLOT (#967, producer pointmoon#122 / PR pointmoon#126).
     *
     * Each annotated slot now carries the place, status and id of the record
     * it was read off, so a surface can name where that sighting was without
     * borrowing the sample receipt's place. The coarse-only rule that governs
     * `recency.placeHint` governs these identically — one shared projection —
     * and everything else is typed absence.
     */
    const slotShape = {
      recordCount: 2,
      latestObservedAt: "2026-08-15T09:12:40.000Z",
      license: "cc-by",
      placeHint: "Wandsworth Common, London, Greater London",
      placeHintStatus: "coarse",
      observationId: "395595741",
    };

    function projectSlot(flowering: Record<string, unknown>) {
      const result = parsePointmoonNatureProjection(
        payload({ ...monarch, phenophase: { ...phenophase, flowering, leaves: null } })
      );
      if (result.status !== "ready") throw new Error("expected a ready projection");
      return result.observations[0]?.phenophase?.flowering;
    }

    it("carries a slot's own coarse place, status and observation id", () => {
      expect(projectSlot(slotShape)).toEqual({
        recordCount: 2,
        latestObservedAt: "2026-08-15T09:12:40.000Z",
        license: "cc-by",
        placeHint: "Wandsworth Common, London, Greater London",
        placeHintStatus: "coarse",
        observationId: "395595741",
      });
    });

    it.each([
      ["withheld-obscured", "withheld-obscured"],
      ["unavailable", "unavailable"],
    ])("keeps the status but never the string under %s", (status, expected) => {
      const projected = projectSlot({ ...slotShape, placeHintStatus: status });
      expect(projected).toMatchObject({ placeHintStatus: expected, recordCount: 2 });
      expect(projected).not.toHaveProperty("placeHint");
      expect(JSON.stringify(projected)).not.toContain("Wandsworth");
    });

    it("drops the place, not the phase, when the status is one we do not read", () => {
      // The asymmetry with recency is deliberate: an unreadable status on a
      // sample receipt sinks the receipt, but on an annotation it costs only
      // the place. The flowering evidence is still true.
      const projected = projectSlot({ ...slotShape, placeHintStatus: "precise" });
      expect(projected).toMatchObject({ recordCount: 2, latestObservedAt: "2026-08-15T09:12:40.000Z" });
      expect(projected).not.toHaveProperty("placeHint");
      expect(projected).not.toHaveProperty("placeHintStatus");
    });

    it("leaves the keys off a payload from before pointmoon#126", () => {
      const projected = projectSlot({
        recordCount: 2,
        latestObservedAt: "2026-08-15T09:12:40.000Z",
        license: "cc-by",
      });
      expect(projected).not.toHaveProperty("placeHint");
      expect(projected).not.toHaveProperty("placeHintStatus");
      expect(projected).not.toHaveProperty("observationId");
    });

    it("refuses a hint or an id that is not a plain string", () => {
      const projected = projectSlot({ ...slotShape, placeHint: { name: "Kew" }, observationId: 395595741 });
      expect(projected).toMatchObject({ placeHintStatus: "coarse" });
      expect(projected).not.toHaveProperty("placeHint");
      expect(projected).not.toHaveProperty("observationId");
    });
  });
});
