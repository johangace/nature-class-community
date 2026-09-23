import { describe, expect, it } from "vitest";
import { resolveHinge } from "@/lib/lesson/hinge";
import { loadAllPacks } from "@/lib/pack";
import { conditionsBucket, presentConditions, suggestedCondition } from "@/lib/outside/bucket";
import { calmLine } from "@/lib/cast/member";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import { conditionKinds, type ConditionKind } from "@/schema/pack";

/**
 * THE HINGE (#323, #1007): authored lines, only on the days the day and the
 * lesson actually meet, in two registers.
 *
 * Three things are pinned. The app decides ONLY whether a condition is met
 * and which authored note comes first: the sentences are the author's, whole,
 * and nothing here completes or softens them. Silence is the common case and
 * stays the common case. And the day is read as EVERY kind true of it, off
 * the field each word names, so a warm, still, bright morning can fire the
 * still line a minibeast lesson authored while the card still calls the day
 * mild.
 */

export function payload(
  current: Record<string, unknown>,
  ground: Record<string, unknown> | null = null
): FieldTruth {
  return {
    facts: { fieldSnapshot: { weather: { current }, ...(ground ? { ground } : {}) } },
  } as unknown as FieldTruth;
}

const trees = {
  conditionNotes: [
    {
      when: ["wet"] as ConditionKind[],
      teacher: "Bark is darker and smells stronger after rain, so put a hand on a trunk first.",
      child: "The rain has made the bark dark. Wet bark smells stronger, so we will stand close and take a breath.",
    },
    {
      when: ["hot", "bright"] as ConditionKind[],
      teacher: "The shade under a tree is the coolest thing out there today, so the class can feel what a tree does.",
    },
  ],
};

describe("reading the day as every kind true of it", () => {
  it("names each kind off the field the word means, and nothing else", () => {
    expect(presentConditions(payload({ precipitationRateMmPerHour: 2, windKph: 2 }))).toEqual(["wet"]);
    expect(presentConditions(payload({ windKph: 45, felt: { apparentC: 18 } }))).toEqual(["windy"]);
    expect(presentConditions(payload({ felt: { apparentC: 2 }, windKph: 10, cloudCoverPct: 80 }))).toEqual(["cold"]);
    expect(presentConditions(payload({ felt: { apparentC: 29 }, windKph: 10, cloudCoverPct: 80 }))).toEqual(["hot"]);
    expect(
      presentConditions(
        payload({ felt: { apparentC: 18 }, windKph: 10, cloudCoverPct: 80 }, { hoursSinceMeaningfulPrecipitation: 72 })
      )
    ).toEqual(["dry"]);
    expect(presentConditions(payload({ felt: { apparentC: 18 }, windKph: 3, cloudCoverPct: 80 }))).toEqual(["still"]);
    expect(presentConditions(payload({ felt: { apparentC: 18 }, windKph: 10, cloudCoverPct: 10 }))).toEqual(["bright"]);
    expect(presentConditions(payload({ felt: { apparentC: 18 }, windKph: 10, skyCondition: "clear" }))).toEqual(["bright"]);
  });

  it("stacks the kinds a real morning carries, primary first", () => {
    const warmStillBright = payload(
      { felt: { apparentC: 27 }, windKph: 3, cloudCoverPct: 5 },
      { hoursSinceMeaningfulPrecipitation: 90 }
    );
    expect(presentConditions(warmStillBright)).toEqual(["hot", "dry", "still", "bright"]);
  });

  it("lets rain outrank dry, still and bright", () => {
    const rain = payload(
      { precipitationRateMmPerHour: 1, windKph: 2, cloudCoverPct: 10 },
      { hoursSinceMeaningfulPrecipitation: 100 }
    );
    expect(presentConditions(rain)).toEqual(["wet"]);
  });

  it("asserts no kind from a missing field", () => {
    expect(presentConditions(payload({ felt: { apparentC: 18 } }))).toEqual([]);
    expect(presentConditions(payload({ felt: { apparentC: 18 }, cloudCoverPct: 50 }))).toEqual([]);
    expect(presentConditions(null)).toEqual([]);
  });

  it("says hot when it is hot, and no longer borrows the word dry for it", () => {
    expect(suggestedCondition(conditionsBucket(payload({ felt: { apparentC: 29 } })))).toBe("hot");
    expect(suggestedCondition(conditionsBucket(payload({ felt: { apparentC: 21 } })))).toBeNull();
  });

  it("speaks only the pack's vocabulary", () => {
    const all = presentConditions(
      payload({ felt: { apparentC: 27 }, windKph: 3, cloudCoverPct: 5 }, { hoursSinceMeaningfulPrecipitation: 90 })
    );
    for (const kind of all) expect(conditionKinds).toContain(kind);
  });
});

describe("resolving the hinge", () => {
  it("states the authored note when today is one of its conditions", () => {
    expect(resolveHinge(trees, ["wet"])).toEqual({
      teacher: trees.conditionNotes[0]!.teacher,
      child: trees.conditionNotes[0]!.child,
      kind: "wet",
    });
    expect(resolveHinge(trees, "wet")?.teacher).toBe(trees.conditionNotes[0]!.teacher);
  });

  it("takes the first authored note that meets the day, in the author's order", () => {
    expect(resolveHinge(trees, ["wet", "bright"])?.teacher).toBe(trees.conditionNotes[0]!.teacher);
    expect(resolveHinge(trees, ["bright"])?.teacher).toBe(trees.conditionNotes[1]!.teacher);
    expect(resolveHinge(trees, ["hot", "still"])?.teacher).toBe(trees.conditionNotes[1]!.teacher);
  });

  it("carries a null child while a note has only its teacher line", () => {
    expect(resolveHinge(trees, ["hot"])).toEqual({ teacher: trees.conditionNotes[1]!.teacher, child: null, kind: "hot" });
  });

  /**
   * THE KIND THAT MATCHED, WHICH IS WHAT THE RUNNER DRAWS (2026-09-08).
   *
   * Johan: *"we can add the lesson note on the runner inside with a conditions
   * or something label only when we have it"*. The note's mark is drawn from
   * this, so a note authored `when: ["hot", "bright"]` that fired on a bright
   * day may not be drawn with the hot mark, and vice versa. It is the note's
   * OWN order that decides when both are true, not the day's.
   */
  it("reports which of the note's conditions actually fired", () => {
    expect(resolveHinge(trees, ["bright"])?.kind).toBe("bright");
    expect(resolveHinge(trees, ["hot"])?.kind).toBe("hot");
    expect(resolveHinge(trees, ["bright", "hot"])?.kind).toBe("hot");
    expect(resolveHinge(trees, "wet")?.kind).toBe("wet");
  });

  it("is silent on every other condition", () => {
    for (const other of ["dry", "windy", "cold", "still"] as const) {
      expect(resolveHinge(trees, [other])).toBeNull();
    }
  });

  it("is silent on an ordinary day and on a failed read alike", () => {
    expect(resolveHinge(trees, null)).toBeNull();
    expect(resolveHinge(trees, [])).toBeNull();
    expect(presentConditions(payload({ skyCondition: "cloudy", felt: { apparentC: 18 }, windKph: 12 }))).toEqual([]);
    expect(presentConditions(null)).toEqual([]);
  });

  it("is silent for a session that authors nothing", () => {
    expect(resolveHinge({}, ["wet"])).toBeNull();
  });

  it("returns the author's whole sentences, never a fragment", () => {
    const hinge = resolveHinge(trees, ["wet"]);
    expect(hinge?.teacher).toMatch(/^[A-Z]/);
    expect(hinge?.teacher.endsWith(".")).toBe(true);
    expect(hinge?.child).toMatch(/^[A-Z]/);
  });

  it("fires off the same reading the runner's own variants fire off", () => {
    const wet = payload({ skyCondition: "overcast", precipitationRateMmPerHour: 2 });
    expect(resolveHinge(trees, presentConditions(wet))?.teacher).toBe(trees.conditionNotes[0]!.teacher);
    expect(resolveHinge(trees, suggestedCondition(conditionsBucket(wet)))?.teacher).toBe(
      trees.conditionNotes[0]!.teacher
    );
  });
});

describe("the hinges the packs actually author", () => {
  const packs = loadAllPacks();
  const authored = packs.flatMap((pack) =>
    pack.sessions.flatMap((session) =>
      (session.conditionNotes ?? []).map((note) => ({ where: `${pack.id} · ${session.id}`, note }))
    )
  );

  it("parse, and hold the house register in both registers", () => {
    expect(authored.length).toBeGreaterThan(0);
    for (const { where, note } of authored) {
      expect(note.when.length, where).toBeGreaterThan(0);
      for (const kind of note.when) expect(conditionKinds, where).toContain(kind);
      expect(note.teacher, where).toMatch(/^[A-Z]/);
      expect(note.teacher, where).not.toMatch(/—|--|!/);
      expect(note.teacher, where).not.toMatch(/\b[A-Z]{3,}\b/);
      expect(note.teacher.endsWith("."), where).toBe(true);
      expect(note.teacher.split(/\s+/).length, where).toBeGreaterThan(8);
      if (!note.child) continue;
      // The acquaintance register, said aloud: short, calm, no question, no
      // exclamation, no promise, no dash.
      expect(note.child, where).toMatch(/^[A-Z]/);
      expect(note.child, where).not.toMatch(/—|–|!|\?/);
      expect(note.child, where).not.toMatch(/\b[A-Z]{3,}\b/);
      expect(note.child.length, where).toBeLessThanOrEqual(140);
      expect(note.child, where).not.toMatch(/\b(you will (find|see)|you'll (find|see))\b/i);
      expect(note.child.trim(), where).toBe(note.child);
      expect(calmLine(note.child).length, where).toBeGreaterThan(0);
    }
  });

  it("does not leave the promoted clause behind in preparation", () => {
    const session = packs
      .flatMap((pack) => pack.sessions)
      .find((s) => s.id === "summer-w4-our-earths-magnificent-trees");
    expect(session?.preparation).toBe("Nothing to bring.");
    const wet = session?.conditionNotes?.find((n) => n.when.includes("wet"));
    expect(wet).toBeTruthy();
    expect(wet?.teacher).toMatch(/bark/i);
    expect(wet?.teacher).toMatch(/smell/i);
  });

  it("leaves a preparation that states a preference exactly as authored", () => {
    const session = packs.flatMap((pack) => pack.sessions).find((s) => s.id === "autumn-w2-wind");
    expect(session?.preparation).toBe(
      "Best on a day with some breeze. If calm, look for any air movement, thermals near walls, drafts."
    );
  });

  it("never opens an authored TEACHER line by restating the weather", () => {
    // The child line MAY open with the day: it is the first thing the class
    // hears about it. The teacher line sits under a composed weather sentence
    // on Today, so it must not say the morning twice (#341).
    const OPENERS = [
      /^(the )?(rain|sun|wind|sky|air|snow|frost|ice)\b/i,
      /^(it is|it's|there is|there's) (hot|cold|wet|dry|windy|raining|sunny|freezing)/i,
      /^(rain|snow|frost) is falling/i,
      /^(properly|really|very) (cold|hot|wet|dry|windy)/i,
      /^(wet|dry|cold|hot|windy) (ground|day|out)/i,
      /^good day for it/i,
      /^clouds are drifting/i,
    ];
    for (const { where, note } of authored) {
      for (const opener of OPENERS) expect(note.teacher, where).not.toMatch(opener);
    }
  });

  it("stays silent on most sessions, which is the design and not a gap", () => {
    const sessions = packs.flatMap((pack) => pack.sessions);
    const withHinge = sessions.filter((s) => s.conditionNotes).length;
    expect(withHinge).toBeLessThan(sessions.length / 2);
  });
});

describe("every condition a pack can author actually resolves from a real read", () => {
  const cases: Array<[ConditionKind, Record<string, unknown>, Record<string, unknown> | null]> = [
    ["wet", { skyCondition: "overcast", precipitationRateMmPerHour: 2 }, null],
    ["windy", { skyCondition: "cloudy", windKph: 45 }, null],
    ["cold", { skyCondition: "cloudy", felt: { apparentC: 2 }, windKph: 12 }, null],
    ["hot", { skyCondition: "cloudy", felt: { apparentC: 29 }, windKph: 12 }, null],
    ["dry", { skyCondition: "cloudy", felt: { apparentC: 18 }, windKph: 12 }, { hoursSinceMeaningfulPrecipitation: 60 }],
    ["still", { skyCondition: "cloudy", felt: { apparentC: 18 }, windKph: 2 }, null],
    ["bright", { skyCondition: "clear", felt: { apparentC: 18 }, windKph: 12 }, null],
  ];

  it.each(cases)("resolves %s from the payload the runner reads", (kind, current, ground) => {
    const present = presentConditions(payload(current, ground));
    expect(present).toContain(kind);
    expect(resolveHinge({ conditionNotes: [{ when: [kind], teacher: "A line." }] }, present)?.teacher).toBe("A line.");
  });

  it("stays silent on an ordinary day for every one of them", () => {
    const mild = presentConditions(payload({ skyCondition: "cloudy", felt: { apparentC: 17 }, windKph: 12 }));
    expect(mild).toEqual([]);
    for (const [kind] of cases) {
      expect(resolveHinge({ conditionNotes: [{ when: [kind], teacher: "A line." }] }, mild)).toBeNull();
    }
  });

  it("covers every word in the vocabulary, so no authored kind is a line nobody sees", () => {
    expect(new Set(cases.map(([kind]) => kind))).toEqual(new Set(conditionKinds));
  });
});
