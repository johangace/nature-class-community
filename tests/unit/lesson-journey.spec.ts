import { describe, expect, it } from "vitest";
import { getSession, loadPack } from "@/lib/pack";
import { projectLessonJourney } from "@/lib/lesson/journey";

describe("lesson journey preparation projection", () => {
  it("carries one authored lesson contract consistently for Today and Plan", () => {
    const pack = loadPack("summer");
    const session = getSession(pack, "summer-w1-counting-life");

    const journey = projectLessonJourney(pack, session);

    expect(journey).toMatchObject({
      id: "summer-w1-counting-life",
      packId: "summer",
      packTitle: "Summer term",
      title: "Counting life",
      question: "What's living in our grounds?",
      questionSource: "prompt",
      objective:
        "Notice everything that is alive around you and begin to work out what it means to be living - breathing, growing, reproducing, dying.",
      ageBand: "4-6",
      durationMinutes: 20,
      location:
        "Any outdoor spot with ten steps of room: a playground corner, a grass edge, a quiet stretch of pavement.",
      locationSource: "authored",
      childWork: {
        status: "authored",
        summary:
          "In a small boundary, children point to living things and count together. They do not need to identify species.",
        blockTypes: ["sheet-title", "collage-zone", "notice-line", "parent-line"],
      },
      preparation: {
        teacherNote: {
          text: "Nothing to bring. Walk out as you are.",
          source: "authored",
        },
        kit: { items: [], summary: "Nothing to carry." },
        space: {
          text:
            "Any outdoor spot with ten steps of room: a playground corner, a grass edge, a quiet stretch of pavement.",
          source: "authored",
        },
        materials: {
          items: [],
          summary: "No demonstration materials are authored.",
        },
        materialFallback: null,
      },
    });

    expect(journey.route.map(({ key, title, durationMinutes }) => ({
      key,
      title,
      durationMinutes,
    }))).toEqual([
      { key: "count-1", title: "Count", durationMinutes: 5 },
      { key: "see-2", title: "See", durationMinutes: 4 },
      { key: "hear-3", title: "Hear", durationMinutes: 3 },
      { key: "alive-4", title: "Alive", durationMinutes: 4 },
      { key: "living-5", title: "Living", durationMinutes: 4 },
      { key: "circle", title: "Circle", durationMinutes: null },
    ]);
    expect(journey.route[0]).toMatchObject({
      lead: "Look at the sky together before you set off. Whatever it's doing, name it out loud.",
      moves: ["conditions", "note", "speak"],
    });
    expect(journey.teachingNeeds.localEvidence.map((need) => need.kind)).toEqual([
      "current-conditions",
    ]);
    expect(journey.teachingNeeds.siteQualification).toBeNull();
    expect(journey.teachingNeeds.authoredGaps).toEqual([]);
  });

  it("uses honest deterministic fallbacks and names missing authored seams", () => {
    const pack = loadPack("autumn-starter");
    // Every shipped session carries a driving question since #239, so the
    // fallback can only be exercised with a session that deliberately lacks
    // one. It still has to be exercised: a future session authored without a
    // prompt must fall back honestly and say so, rather than render nothing.
    const authored = getSession(pack, "leaves-and-their-trees");
    const { prompt: _omitted, ...session } = authored;

    const journey = projectLessonJourney(pack, session);

    expect(journey.question).toBe(session.objective);
    expect(journey.questionSource).toBe("objective-fallback");
    expect(journey.location).toBe("Outside — exact space not authored.");
    expect(journey.locationSource).toBe("fallback");
    expect(journey.preparation.teacherNote).toEqual({
      text: "No additional preparation is authored.",
      source: "fallback",
    });
    expect(journey.childWork).toMatchObject({
      status: "authored",
      summary:
        "Children pick leaves up from the ground only, notice the shape, edges and colour of each one, and gather a few, then bring them back to make an A5 collage.",
    });
    expect(journey.preparation.materials.items).toEqual([
      "a fallen leaf",
      "collecting basket",
      "a wet fallen leaf",
      "A5 card",
      "glue stick",
      "a leaf",
    ]);
    expect(journey.teachingNeeds.localEvidence).toEqual([
      expect.objectContaining({ kind: "current-conditions" }),
    ]);
    expect(journey.teachingNeeds.siteQualification).toEqual({
      status: "unresolved",
      authoredCandidates: ["the oak", "the birch", "the maple"],
    });
    expect(journey.teachingNeeds.authoredGaps).toEqual([
      "driving-question",
      "preparation",
      "space",
      "site-qualification",
    ]);
  });

  it("never turns Counting Life or Leaf Collage topic tags into species/photo work", () => {
    const pack = loadPack("summer");

    for (const id of [
      "summer-w1-counting-life",
      "summer-w3-a5-leaf-collage",
    ]) {
      const journey = projectLessonJourney(pack, getSession(pack, id));
      const kinds = journey.teachingNeeds.localEvidence.map((need) => need.kind);
      expect(kinds, id).not.toContain("nearby-life");
      expect(kinds, id).not.toContain("site-species");
    }

    const leafCollage = projectLessonJourney(
      pack,
      getSession(pack, "summer-w3-a5-leaf-collage")
    );
    expect(leafCollage.teachingNeeds.siteQualification).toEqual({
      status: "unresolved",
      authoredCandidates: ["the oak", "the birch", "the maple"],
    });
    expect(leafCollage.teachingNeeds.authoredGaps).toContain("site-qualification");
    expect(leafCollage.preparation.materialFallback).toBe(
      "If there are not enough safe fallen leaves outside, bring a prepared set and tell the children these leaves were collected earlier. Never pick leaves from a living tree for this lesson."
    );
  });
});
