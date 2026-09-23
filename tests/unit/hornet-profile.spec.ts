import { describe, expect, it } from "vitest";
import { safetyFor } from "@/lib/cast/safety";
import { childLine, SAFETY_CHILD_LINE } from "@/lib/cast/member";
import { composeDepth } from "@/lib/cast/depth";
import type { PhenologyEntry } from "@/lib/outside/types";

/** Johan asked for the Oriental Hornet profile by name. */

describe("Oriental Hornet (Vespa orientalis)", () => {
  it("is caught by the genus matcher, so an old stored cast still gets the band", () => {
    // The row may predate the safety module and carry no safetyNote at all.
    const derived = safetyFor("Vespa orientalis");
    expect(derived).not.toBeNull();
    expect(derived?.note.length).toBeGreaterThan(0);
  });

  it("matches the two genera on their own rules, not by prefix bleed", () => {
    // "Vespa " carries a load-bearing trailing space so it cannot swallow
    // "Vespula". Both sting, so both are covered — by separate entries, with
    // their own wording, rather than one accidentally standing in for the other.
    const hornet = safetyFor("Vespa orientalis");
    const wasp = safetyFor("Vespula vulgaris");
    expect(hornet).not.toBeNull();
    expect(wasp).not.toBeNull();
    expect(hornet?.note).not.toBe(wasp?.note);
  });

  it("hands the class the boundary, not an ordinary look-for line", () => {
    expect(childLine({ safetyNote: "Can sting.", absent: false }, "Busy on the flowers")).toBe(
      SAFETY_CHILD_LINE
    );
    expect(SAFETY_CHILD_LINE).toContain("we watch from here");
  });

  it("shows the depth sections when the phenology holds an entry", () => {
    const entry: PhenologyEntry = {
      id: "x",
      species: "Oriental Hornet",
      scientificName: "Vespa orientalis",
      description: "Workers foraging on fallen fruit and around bins in late summer.",
      habitats: ["garden", "urban"],
      senses: ["sight"],
      confidence: "high",
      narrativePhase: "peak",
    };
    const depth = composeDepth(entry, "Insecta");
    expect(depth.whatItIs).toContain("an insect");
    expect(depth.whatItIs).toContain("the garden");
    expect(depth.rightNow).toContain("peak");
    expect(depth.forTeacher).toContain("fallen fruit");
  });

  it("is absent rather than padded when we hold no entry for it", () => {
    const depth = composeDepth(null, "Insecta");
    expect(depth.rightNow).toBeNull();
    expect(depth.forTeacher).toBeNull();
    // The taxon alone is still a true sentence, so that one survives.
    expect(depth.whatItIs).toBe("This is an insect.");
  });
});
