import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DailyCard } from "@/app/DailyCard";
import { dailySummary, leadSpecies } from "@/lib/cast/summary";
import { calmLine, type CastMember, type ClassCast } from "@/lib/cast/member";

/*
 * A LONGER PER-TEST BUDGET, BECAUSE THE CLOCK IS MEASURING THE MACHINE (#593).
 *
 * Every test in this file reaches its subject through `await import(...)`
 * inside the test body — the mocks have to be in place before the module
 * graph is built, so the import cannot be hoisted out. That makes each test's
 * elapsed time mostly COMPILATION, and compilation time depends on what else
 * the suite is doing rather than on what this test asserts.
 *
 * In isolation these files run in about seven seconds. In a full parallel run
 * the same imports take orders of magnitude longer, and tests began failing
 * the 5s default intermittently — a different one each run, which is the tell
 * that it is contention and not a defect. Confirmed by stashing the branch
 * under test: the same failures on unmodified main.
 *
 * The number is deliberately generous and deliberately per-file rather than
 * global. Raising the default everywhere would hide a genuinely slow test
 * somewhere else; this says only that THIS file's clock is dominated by a
 * bundler, not by the work being measured.
 *
 * It buys time, it does not hide a hang: a test that never resolves still
 * fails, twenty seconds later.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });


/**
 * The four founder rulings on the deployed daily card (2026-08-11), plus the
 * two review-meeting amendments.
 *
 * Johan, reviewing his own coordinates on a hot day: "i dont think the big
 * image here is necessary.. would maybe give like a daily thing.. summary or
 * something... also seen here label or photographed i dont think is very
 * necessary or how many people logged it .. would also give some info about
 * the species in the childs language..."
 */

function member(over: Partial<CastMember> & { commonName: string }): CastMember {
  return {
    scientificName: null,
    photoUrl: "https://example.test/p.jpg",
    photoRole: "observation",
    photoAttribution: "A. Observer",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.test/observations/1",
    iconicTaxon: null,
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
    ...over,
  };
}

const cast = (members: CastMember[]): ClassCast => ({
  members,
  absences: [],
  source: "live",
});

const MONARCH = member({ commonName: "Monarch", line: "Orange wings with black lines." });
const HORNET = member({
  commonName: "Oriental hornet",
  safetyNote: "Can sting.",
  line: "If you see one, we watch from here.",
  sortRank: 0,
});

/* ─────────────────────────── RULING 1: the summary ─────────────────────── */

describe("ruling 1: the hero band becomes a daily summary", () => {
  it("names today's session", () => {
    const s = dailySummary({ state: "hot", sessionTitle: "Counting life", members: [] });
    expect(s).toBe("Today: Counting life.");
  });

  it("points at a lead species when there is one", () => {
    const s = dailySummary({ state: "hot", sessionTitle: "Counting life", members: [MONARCH] });
    expect(s).toContain("Today: Counting life.");
    expect(s).toContain("Monarch was recorded nearby recently.");
  });

  it("says nothing at all when there is no session and nothing to point at", () => {
    expect(dailySummary({ state: "fine", sessionTitle: null, members: [] })).toBeNull();
  });

  it("stays silent on a card that could not see outside", () => {
    // The quiet card already says its own honest sentence; a summary on top
    // would be the card talking twice about knowing nothing.
    expect(dailySummary({ state: null, sessionTitle: "Counting life", members: [MONARCH] })).toBeNull();
  });

  it("keeps to at most two short sentences", () => {
    const s = dailySummary({ state: "rain", sessionTitle: "Counting life", members: [MONARCH] }) ?? "";
    expect(s.split(". ").filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(s.length).toBeLessThanOrEqual(120);
  });

  it("stays in register", () => {
    const s = dailySummary({ state: "hot", sessionTitle: "Counting life", members: [MONARCH] }) ?? "";
    expect(s).not.toMatch(/[—–]/);
    expect(s).not.toMatch(/!/);
  });
});

/* ── AMENDMENT 1 (Athena's trap): the session is named on EVERY state ───── */

describe("amendment 1: the session is named on every condition state", () => {
  const STATES = ["hot", "rain", "cold", "wind", "fine"] as const;

  it("names it on all five, mild included", () => {
    for (const state of STATES) {
      expect(dailySummary({ state, sessionTitle: "Counting life", members: [] })).toBe(
        "Today: Counting life."
      );
    }
  });

  it("is not weather commentary: the summary never mentions the conditions", () => {
    for (const state of STATES) {
      const s = dailySummary({ state, sessionTitle: "Counting life", members: [MONARCH] }) ?? "";
      expect(s).not.toMatch(/hot|rain|cold|wind|mild|degrees|sky/i);
    }
  });

  it("leaves the mild-says-little benchmark exactly where it was", () => {
    // The benchmark is about CONDITIONS. A fine day still renders no tint
    // class beyond its own, no adjustment line, and two faces — and now also
    // names the session, which is not a conditions claim.
    const markup = renderToStaticMarkup(
      createElement(DailyCard, {
        data: {
          condition: { state: "fine", adjustment: null },
          temperature: "21°C",
          sky: "a clear sky",
          cast: cast([MONARCH, member({ commonName: "Anise Swallowtail", sortRank: 1 })]),
          summary: dailySummary({ state: "fine", sessionTitle: "Counting life", members: [MONARCH] }),
        },
        scope: "school" as const,
      })
    );
    expect(markup).toContain("daily-card-fine");
    expect(markup).toContain("daily-card-airy");
    expect(markup).not.toContain("daily-adjust");
    expect(markup).toContain("Today: Counting life.");
  });
});

/* ──────────────── RULING 4: safety-forward applies to prominence ────────── */

describe("ruling 4: a stinging species is never the recommendation", () => {
  it("skips a safety-flagged species for the lead even when it ranks first", () => {
    // The live card put an Oriental Hornet in the "easiest to find" slot with
    // a photograph the size of the card.
    const lead = leadSpecies([HORNET, member({ commonName: "Monarch", sortRank: 1 })]);
    expect(lead?.commonName).toBe("Monarch");
  });

  it("points at nothing rather than at the hornet", () => {
    const s = dailySummary({ state: "hot", sessionTitle: "Counting life", members: [HORNET] });
    expect(s).toBe("Today: Counting life.");
    expect(s).not.toContain("Oriental hornet");
  });

  it("keeps it present on the card, just never promoted", () => {
    const markup = renderToStaticMarkup(
      createElement(DailyCard, {
        data: {
          condition: { state: "hot", adjustment: "Hot day. Plan for shade and water, and keep it short." },
          temperature: "37°C",
          sky: "a clear sky",
          cast: cast([HORNET]),
          summary: dailySummary({ state: "hot", sessionTitle: "Counting life", members: [HORNET] }),
        },
        scope: "school" as const,
      })
    );
    // Presence: yes. Prominence: no.
    expect(markup).toContain("Oriental hornet");
    expect(markup).not.toContain("Oriental hornet is the easiest");
    // And its line is the calm boundary a child can act on.
    expect(markup).toContain("If you see one, we watch from here.");
  });

  it("never leads with a regional or absent member either", () => {
    // "Easiest to find" is an invitation. We only extend it for something
    // actually recorded here, with a photograph to show.
    expect(leadSpecies([member({ commonName: "Hawthorn", honestyTier: "regional" })])).toBeNull();
    expect(leadSpecies([member({ commonName: "Lizard", absent: true })])).toBeNull();
    expect(leadSpecies([member({ commonName: "Snail", photoUrl: null })])).toBeNull();
  });
});

/* ───────── RULING 2: no tier chips, no counts — material carries it ─────── */

describe("ruling 2: the tier is carried by the image material alone", () => {
  const markup = renderToStaticMarkup(
    createElement(DailyCard, {
      data: {
        condition: { state: "hot", adjustment: "Hot day. Plan for shade and water, and keep it short." },
        temperature: "37°C",
        sky: "a clear sky",
        cast: cast([
          MONARCH,
          member({ commonName: "Hawthorn", honestyTier: "regional", photoUrl: null, sortRank: 1 }),
        ]),
        summary: null,
      },
      scope: "school" as const,
    })
  );

  it("prints no tier chip text on any face", () => {
    expect(markup).not.toContain("cast-tier");
    expect(markup).not.toMatch(/>seen here</);
    expect(markup).not.toMatch(/>around the region</);
    expect(markup).not.toMatch(/>not seen yet</);
  });

  it("prints no observation counts", () => {
    expect(markup).not.toMatch(/logged nearby/);
    expect(markup).not.toMatch(/\d+ (seen|logged|recorded)/);
  });

  it("still distinguishes the tiers, by material", () => {
    expect(markup).toContain("cast-portrait-seen");
    expect(markup).toContain("cast-portrait-plate");
  });

  it("has no photo band left to render", () => {
    expect(markup).not.toContain("daily-band");
  });
});

/* ─────── RULING 3 + AMENDMENT 2: the child line, and the shouting ──────── */

describe("ruling 3: one line in the child's language", () => {
  it("renders the authored note on the face", () => {
    const markup = renderToStaticMarkup(
      createElement(DailyCard, {
        data: {
          condition: { state: "fine", adjustment: null },
          temperature: "21°C",
          sky: "a clear sky",
          cast: cast([member({ commonName: "Monarch", line: "Orange wings with black lines." })]),
          summary: null,
        },
        scope: "school" as const,
      })
    );
    expect(markup).toContain("Orange wings with black lines.");
  });
});

describe("amendment 2: dirty source data never shouts at a child", () => {
  it("calms the real strings us-california.json ships today (#188)", () => {
    expect(calmLine("TONIGHT is the best night for shooting stars")).toBe(
      "Tonight is the best night for shooting stars."
    );
    expect(calmLine("The frog choir is SO loud now, hundreds of tiny frogs")).toContain(
      "so loud"
    );
  });

  it("keeps an animal's call as a word rather than mangling or dropping it", () => {
    // Lowercased, not deleted: "ribbit ribbit" still says exactly what it said.
    const line = calmLine("After the rain, listen for a loud RIBBIT RIBBIT. These tiny frogs");
    expect(line).toContain("ribbit ribbit");
    expect(line).not.toContain("RIBBIT");
  });

  it("gives the sentence its own capital back", () => {
    expect(calmLine("TONIGHT the sky is clear")).toMatch(/^Tonight/);
  });

  it("leaves a single letter alone", () => {
    expect(calmLine("A tiny bird zooms straight up")).toBe("A tiny bird zooms straight up.");
  });

  it("never severs a sentence mid-phrase and punctuates the fragment", () => {
    // The real string uk-south.json ships for the broad-bodied chaser. The
    // first sentence is 67 characters and carries no comma, so a hard cut at
    // the 64-character cap used to leave "…like a tiny." — a simile with its
    // object amputated, then given a full stop so it reads as a finished
    // thought. This line is printed under a thumbnail and read aloud.
    const line = calmLine(
      "A chunky blue dragonfly zooms over the pond like a tiny helicopter. It can fly backwards!"
    );
    expect(line).not.toMatch(/like a tiny\.$/);
    expect(line).toBe(
      "A chunky blue dragonfly zooms over the pond like a tiny helicopter."
    );
  });

  it("still drops a comma-spliced tail, which is what the cap is for", () => {
    // A real clause boundary is still a legitimate place to stop.
    const line = calmLine(
      "Whole hillsides turn purple like a fairy painted them, and the bees hum, and the air smells of honey"
    );
    expect(line).toBe("Whole hillsides turn purple like a fairy painted them.");
  });

  it("leaves an already-calm note untouched", () => {
    expect(calmLine("Hot wind makes the golden grass dance and wave")).toBe(
      "Hot wind makes the golden grass dance and wave."
    );
  });

  it("holds the line whatever the source does, so either PR can merge first", () => {
    // Edison's sweep fixes the data; this fixes the rendering. Both, forever.
    for (const shouted of ["LOOK at the sky", "the WHOLE tree is gold", "listen for a KEE-WICK"]) {
      expect(calmLine(shouted)).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

/**
 * The join that makes ruling 3 land on a RECORDED species.
 *
 * Caught in the browser, not in a test: the first build of this shipped a card
 * whose every recorded face had no line — Monarch and Anise Swallowtail, the
 * exact species on screen when Johan asked for the child's language. Pointmoon
 * reports what an observer typed ("Monarch"); the phenology authored "Monarch
 * Butterfly". An exact-string match finds neither from the other.
 */
// Constructed producer note fixture, independent of the species display cap.
const producerNotes = {
  time: { date: "2026-01-05T12:00:00Z" },
  phenology: { epistemicType: "curated", provider: "hand-authored", regionKey: "us-california", week: 2,
    entries: [{ id: "fixture-monarch-note", species: "Monarch Butterfly", scientificName: "Danaus plexippus",
      kind: "species", description: "A butterfly with orange wings.", childFriendlyNote: "A butterfly with orange wings and black lines.",
      habitats: [], senses: ["sight"], confidence: "high", epistemicType: "curated" }] },
};
describe("ruling 3, on recorded species: the two sources name it differently", () => {
  it("finds the note by scientific name, which is identical on both sides", async () => {
    const { getClassCast } = await import("@/lib/cast/read");
    const { default: fixture } = await import("../fixtures/pointmoon/berkeley_ca.json");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...fixture, facts: { ...fixture.facts, fieldSnapshot: { ...fixture.facts.fieldSnapshot, ...producerNotes } } }), { status: 200 }))
    );

    // The producer note shares scientific identity despite its longer common name.
    const resolved = await getClassCast(null, {
      lat: 37.871,
      lng: -122.273,
      date: new Date("2026-01-05"),
    });

    const monarch = resolved.members.find((m) => m.commonName === "Monarch");
    expect(monarch).toBeDefined();
    expect(monarch?.honestyTier).toBe("recorded");
    // The line a class can actually hear.
    expect(monarch?.line.length).toBeGreaterThan(0);
    expect(monarch?.line).toMatch(/butterfl/i);

    vi.unstubAllGlobals();
  });
});

describe("the common-name fallback refuses to guess", () => {
  it("lets a fuller authored name meet a shorter observed one", async () => {
    const { getClassCast } = await import("@/lib/cast/read");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            schemaVersion: "field-truth@1.1.0",
            facts: {
              fieldSnapshot: {
                ...producerNotes,
                // No scientific name, so only the common-name key can match.
                observations: { nearby: [{ name: "Monarch", photoUrl: "https://e.test/m.jpg" }] },
              },
            },
          }),
          { status: 200 }
        )
      )
    );

    const resolved = await getClassCast(null, {
      lat: 37.872,
      lng: -122.274,
      date: new Date("2026-01-05"),
    });
    expect(resolved.members.find((m) => m.commonName === "Monarch")?.line.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("never lets a bare kind inherit a species' note", async () => {
    const { getClassCast } = await import("@/lib/cast/read");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            schemaVersion: "field-truth@1.1.0",
            facts: {
              fieldSnapshot: {
                ...producerNotes,
                observations: { nearby: [{ name: "Butterfly", photoUrl: "https://e.test/b.jpg" }] },
              },
            },
          }),
          { status: 200 }
        )
      )
    );

    const resolved = await getClassCast(null, {
      lat: 37.873,
      lng: -122.275,
      date: new Date("2026-01-05"),
    });
    // "Butterfly" strips to nothing, so it matches no authored note. A wrong
    // note is an invented nature fact in the child's own language.
    expect(resolved.members.find((m) => m.commonName === "Butterfly")?.line).toBe("");
    vi.unstubAllGlobals();
  });
});

describe("#621 producer notes are independent of species selection", () => {
  it("gives an observed member a note beyond the board and habitat limits", async () => {
    const { getClassCast } = await import("@/lib/cast/read");
    const filler = { ...producerNotes.phenology.entries[0]!, id: "fixture-other", species: "Other butterfly", scientificName: "Other taxon" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: {
        ...producerNotes,
        phenology: { ...producerNotes.phenology, entries: [filler, ...producerNotes.phenology.entries] },
        observations: { nearby: [{ name: "Monarch", scientificName: "Danaus plexippus", iconicTaxon: "Insecta" }] },
      } },
    }), { status: 200 })));
    const cast = await getClassCast(null, { lat: 37.9, lng: -122.3, date: new Date("2026-01-05"), limit: 1, habitats: ["pond"] });
    expect(cast.members).toHaveLength(1);
    expect(cast.members[0]?.honestyTier).toBe("recorded");
    expect(cast.members[0]?.line).toContain("orange wings");
    vi.unstubAllGlobals();
  });
  it("keeps a historical member but no calendar note when the producer has no matching note", async () => {
    const { getClassCast } = await import("@/lib/cast/read");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: {
        observations: { nearby: [], birds: { notable: [] }, historical: { nearby: [{ name: "Monarch", scientificName: "Danaus plexippus", iconicTaxon: "Insecta", yearsObserved: 3, sampledYears: 3, avgCount: 2 }] } },
      } },
    }), { status: 200 })));
    const cast = await getClassCast(null, { lat: 37.901, lng: -122.301, date: new Date("2026-01-05") });
    expect(cast.members.find(m => m.scientificName === "Danaus plexippus")?.line).toBe("");
    vi.unstubAllGlobals();
  });
});
