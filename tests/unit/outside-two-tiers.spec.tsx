import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { DailyCard } from "@/app/DailyCard";
import { SEEN_CAPTION, USUALLY_AROUND_CAPTION } from "@/lib/outside/captions";
import type { SeasonalName, Sighting } from "@/lib/outside";
import type { CastMember, ClassCast } from "@/lib/cast/member";

/**
 * TWO TIERS, TWO CAPTIONS, ON THE SURFACES A TEACHER ACTUALLY LOOKS AT.
 *
 * `outside-honesty.spec.ts` (#177) holds the data-layer half: `getOutsideNow`
 * never pours regional entries into `sightings`. This holds the rendering
 * half, which is where the bug lived — a caption, not a value. It asserts the
 * MARKUP the components produce, because "no regional name ever appears under
 * a seen caption" is a statement about what a teacher reads, and no assertion
 * about a data structure can make it.
 *
 * Rendering is `react-dom/server`, already a dependency. No DOM, no new
 * package, and it exercises the real components rather than a copy of them.
 *
 * PORTED (#172 workstream B): the Today card under test is now `DailyCard`,
 * which replaced `OutsideNowCard`. Every assertion below is #178's, unchanged
 * in meaning — the two tiers still never share a caption, a regional name
 * still never appears under a seen caption, and a photoless observation still
 * never claims "seen". Only the component and the way its groups are located
 * in the markup changed. The onboarding preview (`LiveOutside`) that #178 also
 * covered is gone: the location step confirms a place with a map now, and
 * shows no species at all, so there is no second caption to keep honest there.
 *
 * The two tiers under test:
 *   recorded  a photograph exists      "Seen near your school lately"
 *   regional  the season's own record  "Usually around here now"
 */

/** What the region's season says. No photos exist for these, by construction. */
const REGIONAL: SeasonalName[] = [
  { id: "r1", name: "Hawthorn", scientificName: "Crataegus monogyna" },
  { id: "r2", name: "Fieldfare", scientificName: "Turdus pilaris" },
];

/** A real observation: someone photographed this, at these coordinates. */
const PHOTOGRAPHED: Sighting[] = [
  { id: "o1", name: "Common Darter", photoUrl: "https://example.invalid/darter.jpg" },
];

/** Every caption that claims a sighting. None may ever carry a regional name. */
const SEEN_CAPTIONS = [SEEN_CAPTION.school, SEEN_CAPTION.sample];

/**
 * The daily card's seen GROUP: everything between the seen caption and the
 * list that follows it. On this card the claim is carried by the caption above
 * a faces row rather than by a photo circle, so this is the equivalent slice —
 * the region of markup a teacher reads as "somebody saw this near here".
 */
function seenGroup(markup: string): string {
  const caption = SEEN_CAPTIONS.find((c) => markup.includes(c));
  if (!caption) return "";
  const start = markup.indexOf(caption);
  const end = markup.indexOf("</ul>", start);
  return markup.slice(start, end === -1 ? undefined : end);
}

/** A cast member with only the fields these assertions care about. */
function castMember(over: Partial<CastMember> & { commonName: string }): CastMember {
  return {
    scientificName: null,
    photoUrl: null,
    iconicTaxon: null,
    honestyTier: "regional",
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

/** The two tiers, as the cast the daily card actually reads. */
function castOf(recorded: Sighting[], regional: SeasonalName[]): ClassCast {
  return {
    members: [
      ...recorded.map((s, i) =>
        castMember({
          commonName: s.name,
          photoUrl: s.photoUrl,
          honestyTier: "recorded",
          sortRank: i,
        })
      ),
      ...regional.map((r, i) =>
        castMember({ commonName: r.name, sortRank: recorded.length + i })
      ),
    ],
    absences: [],
    source: "live",
  };
}

/** A read that happened, on an ordinary day. The card's quietest state. */
const MILD = { state: "fine" as const, adjustment: null };

function card(recorded: Sighting[], regional: SeasonalName[]) {
  return renderToStaticMarkup(
    <DailyCard
      data={{
        condition: MILD,
        temperature: null,
        sky: null,
        cast: castOf(recorded, regional),
        summary: null,
      }}
      scope="school"
    />
  );
}

describe("day one: zero observations, and the season still has a home", () => {
  it("shows no seen caption on the Today card, and names the season instead", () => {
    const markup = card([], REGIONAL);

    for (const caption of SEEN_CAPTIONS) {
      expect(markup).not.toContain(caption);
    }
    // Truthful AND useful. Subtraction alone left this card blank on the day
    // that matters most; the names belong on its face, under a caption that
    // claims only what the phenology file knows.
    expect(markup).toContain(USUALLY_AROUND_CAPTION);
    for (const entry of REGIONAL) {
      expect(markup).toContain(entry.name);
    }
    // And never under the seen claim.
    expect(seenGroup(markup)).toBe("");
  });

  it("stays quiet when the season is empty too", () => {
    const markup = card([], []);

    for (const caption of SEEN_CAPTIONS) {
      expect(markup).not.toContain(caption);
    }
    expect(markup).not.toContain(USUALLY_AROUND_CAPTION);
  });
});

describe("the two tiers never mix, even when both are present", () => {
  it("keeps regional names out of the seen list when there are real sightings", () => {
    const markup = card(PHOTOGRAPHED, REGIONAL);

    expect(markup).toContain(SEEN_CAPTION.school);
    const seen = seenGroup(markup);
    expect(seen).toContain("Common Darter");
    for (const entry of REGIONAL) {
      expect(seen).not.toContain(entry.name);
    }
    // Both tiers on one card, each under its own caption.
    expect(markup).toContain(USUALLY_AROUND_CAPTION);
  });

  it("keeps a photoless observation in the recorded group as a named plate", () => {
    // Presence and photography are independent evidence. Losing an image must
    // not erase the valid local record or restate it as regional expectation.
    const markup = card([{ id: "o2", name: "Grey Heron", photoUrl: null }], REGIONAL);

    expect(markup).toContain(SEEN_CAPTION.school);
    expect(seenGroup(markup)).toContain("Grey Heron");
    expect(seenGroup(markup)).toContain("cast-portrait-plate");
  });
});

/**
 * End to end on the real compose: a genuinely quiet night, rendered. Pointmoon
 * is pointed at a closed local port so the read fails instantly and
 * deterministically, which is the shape of the real failure rather than a
 * hand-written stand-in for it.
 */
describe("a real quiet night, composed and rendered", () => {
  let outside: Awaited<ReturnType<typeof import("@/lib/outside").getOutsideNow>>;

  beforeAll(async () => {
    process.env.POINTMOON_API_URL = "http://127.0.0.1:9";
    const { getOutsideNow } = await import("@/lib/outside");
    outside = await getOutsideNow({
      // Central London, in a week the uk-south file has entries for.
      lat: 51.546,
      lng: -0.105,
      date: new Date("2026-10-14T09:00:00Z"),
    });
  });

  it("does not borrow seasonal names when the producer is unreachable", () => {
    expect(outside.sightings).toEqual([]);
    expect(outside.usuallyAround).toEqual([]);
    for (const entry of outside.usuallyAround) {
      expect(entry.name.length).toBeGreaterThan(0);
      // The structural half of the guarantee: there is no photoUrl field to
      // put a photo in, so this can never be rendered as a sighting.
      expect(entry).not.toHaveProperty("photoUrl");
    }
  });

  it("renders that exact result with the honest caption and no seen caption", () => {
    const markup = card(outside.sightings, outside.usuallyAround);
    for (const caption of SEEN_CAPTIONS) {
      expect(markup).not.toContain(caption);
    }
    expect(markup).not.toContain(USUALLY_AROUND_CAPTION);
  });
});
