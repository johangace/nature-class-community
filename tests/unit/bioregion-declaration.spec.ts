import { describe, expect, it } from "vitest";
import {
  BIOREGION_DIMENSIONS,
  BIOREGION_DIMENSION_COUNT,
  emptyBioregionPack,
  emptyLearnerContext,
  findDimension,
  learnerContextSchema,
  schemaGapDeclaration,
  slotState,
  type BioregionDimension,
  type PackKey,
} from "@/schema/bioregion";

/**
 * The schema guard for wave 1 (#204).
 *
 * The claim under test is narrow and load-bearing: an undeclared slot is an
 * invitation to invent, a declared-empty slot renders as silence. So the guard
 * proves two things and no more — that all 26 dimensions are DECLARED, and that
 * the declaration can tell "declared and empty" from "not declared at all".
 *
 * The isolating fixture is the path assertion below. Delete any slot from
 * `bioregionPackSchema` or `learnerContextSchema` and the parsed empty object
 * stops carrying that key, so its dimension resolves to `undeclared` and the
 * test goes red naming the dimension by number. That is the mutation the guard
 * exists to catch, and the "reads undeclared" case proves the mechanism can
 * actually see it rather than reporting empty for everything.
 *
 * It asserts nothing about DATA. Wave 1 enters none, and a guard that expected
 * some would go red the moment #209 starts, which is the opposite of the job.
 */

const TEST_KEY: PackKey = {
  resolution: "koppen",
  value: "BWh",
  resolvedBy: "pack-key@test",
};

describe("the 26-dimension declaration", () => {
  it("declares exactly the office#330 inventory, numbered 1 to 26", () => {
    expect(BIOREGION_DIMENSIONS).toHaveLength(BIOREGION_DIMENSION_COUNT);
    expect(BIOREGION_DIMENSIONS.map((d) => d.n)).toEqual(
      Array.from({ length: BIOREGION_DIMENSION_COUNT }, (_, i) => i + 1)
    );
  });

  it("gives every dimension a unique id and at least one declaring path", () => {
    const ids = BIOREGION_DIMENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dimension of BIOREGION_DIMENSIONS) {
      expect(dimension.declaredIn.length).toBeGreaterThan(0);
    }
  });

  it("declares a both-sided dimension on both sides", () => {
    for (const dimension of BIOREGION_DIMENSIONS.filter((d) => d.side === "both")) {
      const roots = new Set(dimension.declaredIn.map((p) => p.split(".")[0]));
      expect(roots, `dimension ${dimension.n} (${dimension.id})`).toEqual(
        new Set(["pack", "learner"])
      );
    }
  });
});

describe("the schema-gap declaration", () => {
  const pack = emptyBioregionPack(TEST_KEY);
  const learner = emptyLearnerContext();

  /**
   * THE ISOLATING FIXTURE. Every declared path must resolve against the parsed
   * empty objects. Remove a slot from either schema and its dimension flips to
   * `undeclared` here, red, named.
   */
  it("resolves every declared path — no dimension reads as undeclared", () => {
    const undeclared = schemaGapDeclaration(pack, learner)
      .filter((gap) => gap.state === "undeclared")
      .map((gap) => `${gap.n} ${gap.id} (${gap.declaredIn.join(", ")})`);
    expect(undeclared).toEqual([]);
  });

  it("reports every dimension except the pack key as declared-empty in wave 1", () => {
    // Dimension 1 is the pack's IDENTITY, not its content: a pack with no key
    // is not an empty pack, it is not a pack. Every other slot is empty, and
    // this is the shipped state of the schema wave rather than a gap in it.
    const declaration = schemaGapDeclaration(pack, learner);
    expect(declaration).toHaveLength(BIOREGION_DIMENSION_COUNT);

    const filled = declaration.filter((gap) => gap.state === "filled").map((gap) => gap.id);
    expect(filled).toEqual(["pack-key"]);
    expect(
      declaration.filter((gap) => gap.id !== "pack-key").every((gap) => gap.state === "declared-empty")
    ).toBe(true);
  });

  it("reads a slot that is not in the schema as undeclared, not as empty", () => {
    // The mutation proof: this is what a deleted slot looks like from the
    // outside. If the guard could not tell this from an empty one, every
    // assertion above would pass on a schema with nothing in it.
    const deleted: BioregionDimension = {
      n: 99,
      id: "not-a-dimension",
      name: "A slot nobody declared",
      wave: "true",
      side: "pack",
      declaredIn: ["pack.thisWasNeverDeclared"],
    };
    expect(slotState(deleted, pack, learner)).toBe("undeclared");
  });

  it("reads a filled slot as filled", () => {
    const silenceProfile = findDimension("silence-profile");
    expect(silenceProfile).not.toBeNull();
    expect(slotState(silenceProfile!, pack, learner)).toBe("declared-empty");

    const filled = {
      ...pack,
      expectedSilence: [
        { signalId: "autumn-colour", reason: "No deciduous canopy in this pack" },
      ],
    };
    expect(slotState(silenceProfile!, filled, learner)).toBe("filled");
  });

  it("counts a both-sided dimension as filled when either half is written", () => {
    const calendar = findDimension("teachable-calendar");
    expect(calendar).not.toBeNull();

    const withTermDates = {
      ...learner,
      termDates: [{ id: "autumn", opensOn: "2026-09-02", closesOn: "2026-10-23" }],
    };
    expect(slotState(calendar!, pack, withTermDates)).toBe("filled");
  });

  it("reads a missing side as empty rather than as a schema hole", () => {
    // Asking the pack alone about a learner dimension is a caller with half the
    // picture, not a broken schema. It must not read as `undeclared`, because
    // `undeclared` is the state that means "someone may invent here".
    const declaration = schemaGapDeclaration(pack, null);
    expect(declaration.some((gap) => gap.state === "undeclared")).toBe(false);
  });
});

describe("the boundary the declaration is meant to hold", () => {
  it("keeps jurisdiction as its own field, never derived from locale", () => {
    // Phoenix and Sacramento share `us` and differ on standards, policy and
    // seasons. Setting one must leave the other untouched and null.
    const learner = learnerContextSchema.parse({ locale: "us" });
    expect(learner.locale).toBe("us");
    expect(learner.jurisdiction).toBeNull();
  });

  it("declares age and ability as two axes, not one band", () => {
    const learner = learnerContextSchema.parse({ ageBand: "4-6" });
    expect(learner.ageBand).toBe("4-6");
    expect(learner.abilityBand).toBeNull();
  });

  it("stamps a pack key with the chain link that produced it", () => {
    const pack = emptyBioregionPack(TEST_KEY);
    expect(pack.key.resolution).toBe("koppen");
    expect(pack.key.resolvedBy).toBe("pack-key@test");
  });
});
