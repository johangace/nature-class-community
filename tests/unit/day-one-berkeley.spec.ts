import { londonCalendarOnly } from "../fixtures/pointmoon/nc621/replay";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailyCard } from "@/app/DailyCard";
import { CastCards } from "@/app/print/CastCards";
import { cardCondition, feltTemperature, skyPhrase } from "@/lib/cast/conditions";
import { getClassCast } from "@/lib/cast/read";
import { readAloudLine } from "@/lib/cast/speak";
import { castMaterial } from "@/lib/cast/member";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";

/**
 * The whole chain, replayed against a REAL recorded payload (#172 workstream
 * B), using Edison's demo fixture from #177.
 *
 * The #165 spine's rule and the replay discipline behind it: a surface is not
 * proven by a hand-built object that happens to have the fields the renderer
 * reads. It is proven by the payload the API actually returned on a real
 * morning in a real place. This walks Berkeley, 2026-08-11 — one fixture in,
 * and out the other end the daily card, the read-aloud line and the printed
 * cards, all agreeing.
 *
 * Berkeley that morning was 12.8 degrees and foggy, which lands on `fine`. So
 * this is also the RESTRAINT BENCHMARK on real data rather than on a
 * hypothetical: the card that a teacher meets on an ordinary morning must be
 * nearly silent, and if it ever stops being silent this test says so.
 */

const BERKELEY = { lat: 37.871, lng: -122.273 };

function stubFetchWith(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
  );
}

let fixture: unknown;

beforeEach(async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(
    new URL("../fixtures/pointmoon/berkeley_ca.json", import.meta.url),
    "utf8"
  );
  fixture = JSON.parse(raw);
  stubFetchWith(fixture);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Berkeley, replayed end to end", () => {
  it("reads the morning as fine, and says nothing about it", async () => {
    const data = await fetchFieldTruth(BERKELEY);
    const condition = cardCondition(data);

    expect(feltTemperature(data)).toBe("13°C");
    expect(feltTemperature(data, "us")).toBe("55°F");
    expect(skyPhrase(data)).toContain("fog");

    // 12.8 degrees, no rain, a light breeze. An ordinary morning.
    expect(condition?.state).toBe("fine");
    // The benchmark, on real data: the card adds nothing.
    expect(condition?.adjustment).toBeNull();
  });

  it("resolves a live cast of real recorded species, in findability order", async () => {
    const cast = await getClassCast(null, { ...BERKELEY, date: new Date("2026-08-11") });

    // The storage layer is gone (#284): every read resolves live.
    expect(cast.source).toBe("live");
    expect(cast.members.length).toBeGreaterThan(0);

    // The fixture proves nearby presence, but its legacy bare image URL has no
    // role/credit/licence/source contract and therefore renders as a plate.
    const lead = cast.members[0];
    expect(lead?.honestyTier).toBe("recorded");
    expect(lead?.photoUrl).toBeNull();
    expect(castMaterial(lead!)).toBe("plate");

    // Live resolution recovers what the composed fallback structurally could
    // not: honest absences from the multi-year record. Every absence must say
    // so and stay on the recorded tier — never an invented sighting.
    expect(cast.absences.length).toBeGreaterThan(0);
    for (const absence of cast.absences) {
      expect(absence.absent).toBe(true);
      expect(absence.honestyTier).toBe("recorded");
    }
  });

  it("renders the mild card with no adjustment and no photo band", async () => {
    const data = await fetchFieldTruth(BERKELEY);
    const cast = await getClassCast(null, { ...BERKELEY, date: new Date("2026-08-11") });

    const markup = renderToStaticMarkup(
      createElement(DailyCard, {
        data: {
          condition: cardCondition(data),
          temperature: feltTemperature(data),
          sky: skyPhrase(data),
          cast,
          summary: null,
        },
        scope: "school" as const,
      })
    );

    expect(markup).toContain("daily-card-fine");
    // No adjustment line, and no hero band: on a fine day the card does not
    // raise its voice even when there IS a good photograph to raise it with.
    expect(markup).not.toContain("daily-adjust");
    expect(markup).not.toContain("daily-band");
    // Two faces, not three.
    expect((markup.match(/class="cast-face"/g) ?? []).length).toBe(2);
  });

  it("says one honest line about the leading species, with no invented biology", async () => {
    const cast = await getClassCast(null, { ...BERKELEY, date: new Date("2026-08-11") });
    const lead = cast.members[0]!;
    const line = readAloudLine(lead, { locality: "recorded-nearby" });

    expect(line).toContain(lead.commonName);
    expect(line).toContain("was recorded nearby.");
    // Nothing about what it eats, where it rests, or when it flies.
    expect(line.split(". ").filter(Boolean)).toHaveLength(1);
  });

  it("prints the same species the card showed, in the same order", async () => {
    const cast = await getClassCast(null, { ...BERKELEY, date: new Date("2026-08-11") });

    const printed = renderToStaticMarkup(
      createElement(CastCards, {
        members: cast.members,
        located: true,
        readOn: "Tuesday 11 August",
      })
    );

    // The promise: shown cards are printed cards. Same accessor, same order.
    for (const member of cast.members.slice(0, 6)) {
      expect(printed).toContain(member.commonName);
    }
    expect(printed).toContain("print-card-plate");
    expect(printed).not.toContain("<img");
  });
});

/**
 * The two-shapes choice (#178), pinned.
 *
 * `usuallyAround` and `lookFors` are the same phenology entries in two shapes.
 * The composer takes IDENTITY from the first and the LINE from the second,
 * matched by id. These assertions exist so that choice is a decision with a
 * test behind it rather than an accident of which list got iterated first.
 */
describe("the regional tier reads both shapes of the same entry", () => {
  it("takes the scientific name from usuallyAround, which lookFors does not carry", async () => {
    // A quiet read: no observations, so every member is regional.
    stubFetchWith(londonCalendarOnly());

    const cast = await getClassCast(null, {
      lat: 51.546,
      lng: -0.105,
      date: new Date("2026-09-13T09:00:00Z"),
    });

    expect(cast.members.length).toBeGreaterThan(0);
    expect(cast.members.every((m) => m.honestyTier === "regional")).toBe(true);

    // lookFors has no scientificName field at all, so a regional member
    // carrying one proves the identity came from usuallyAround.
    expect(cast.members.some((m) => typeof m.scientificName === "string")).toBe(true);
  });

  it("takes the face line from the matching lookFors note", async () => {
    stubFetchWith(londonCalendarOnly());

    const { getOutsideNow } = await import("@/lib/outside");
    const outside = await getOutsideNow({
      lat: 51.547,
      lng: -0.106,
      date: new Date("2026-09-13T09:00:00Z"),
    });
    const cast = await getClassCast(null, {
      lat: 51.547,
      lng: -0.106,
      date: new Date("2026-09-13T09:00:00Z"),
    });

    const first = cast.members[0];
    const note = outside.lookFors.find((lf) => lf.species === first?.commonName)?.note;
    expect(note).toBeTruthy();
    expect(first?.line.length).toBeGreaterThan(0);
    // calmLine only ever shortens and repunctuates, so the line is a prefix of
    // the note it came from. That is what proves they are the same entry
    // rather than two entries that happen to sit at the same index.
    const opening = (first?.line ?? "").replace(/\.$/, "").slice(0, 20);
    expect((note ?? "").replace(/\s*[—–]\s*/g, ", ")).toContain(opening);
  });

  it("never lets a regional member wear a local sighting's clothes", async () => {
    stubFetchWith(londonCalendarOnly());

    const cast = await getClassCast(null, {
      lat: 51.548,
      lng: -0.107,
      date: new Date("2026-09-13T09:00:00Z"),
    });

    // THIS USED TO ASSERT `photoUrl === null` for every regional member, on
    // the reasoning that the phenology files carry no photographs and a
    // regional member should show its name rather than borrow a picture from
    // somewhere else. The first half was a fact about our reading rather than
    // about the world: iNaturalist holds thousands of releasable photographs
    // of these exact species, and the photo contract has carried a
    // `taxon-reference` role for them since it was written (#321, #323).
    //
    // The cost of not asking was visible on Përmet's page: with no
    // `iconicTaxon` either, a swallow, a spider and a fire salamander all drew
    // the same leaf.
    //
    // What must still hold is the CLAIM, and it is narrower and stronger than
    // "no picture". A regional member may show what its species looks like. It
    // may never present as a photograph taken near this school this week.
    for (const member of cast.members) {
      expect(member.honestyTier).toBe("regional");
      // No sighting window and no local recurrence: this is a season or a
      // month, never "seen here, this recently".
      expect(member.lastSeenWindow).toBeNull();
      expect(member.yearsObserved).toBeNull();
      // A picture of the species, never an observation logged at these
      // coordinates. The role is what carries the difference.
      if (member.photoUrl !== null) {
        expect(member.photoRole).toBe("taxon-reference");
      }
      // And the material is the visible half of the same rule: the paper-frame
      // inset or the drawn plate, never the full-fidelity "seen" treatment.
      expect(["regional", "plate"]).toContain(castMaterial(member));
      expect(castMaterial(member)).not.toBe("seen");
    }
  });
});
