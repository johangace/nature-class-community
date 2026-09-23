import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardCondition, feltTemperature, skyPhrase } from "@/lib/cast/conditions";
import { closingAbsence, hasCarriedAbsences } from "@/lib/cast/closing";
import { castMaterial, type CastMember, type ClassCast } from "@/lib/cast/read";
import { localizeDeep } from "@/lib/localization";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * The daily card, replayed against the three RECORDED payloads (#172, #436).
 *
 * Not synthetic weather. These are the real reads from Phoenix, London and
 * Berkeley on 2026-08-11, so what these tests assert is what a teacher in each
 * of those places actually got that morning. `card-condition-state.spec.ts`
 * pins the state machine on hand-built payloads; this file is the replay, and
 * the difference matters — a threshold can be right on a constructed number
 * and wrong on the shape a producer actually sends.
 *
 * The one thing they exist to protect is the SILENCE. Two of the three real
 * cities were having an ordinary day, and on an ordinary day this card is
 * almost empty. If a future change makes the mild card speak, these fail.
 *
 * RESCUED FROM `wb-profile-lesson` (#436). The branch was overtaken before it
 * merged and these 220 lines never reached main. Where the API moved under
 * them the assertion is ported; where the behaviour was deliberately changed
 * the assertion was dropped rather than bent, and the PR that landed this file
 * names each one.
 */

function fixture(name: string): FieldTruth {
  const file = join(process.cwd(), "tests/fixtures/pointmoon", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as FieldTruth;
}

const phoenix = fixture("phoenix_az");
const london = fixture("london_uk");
const berkeley = fixture("berkeley_ca");

describe("the recorded mornings, and which of them the card speaks on", () => {
  it("reads Phoenix at 29 degrees as a hot day and gives it its one line", () => {
    const got = cardCondition(phoenix);
    expect(got?.state).toBe("hot");
    // The line opened "Hot day. " when this was written. #323 took the state
    // name off the front of every adjustment, because each surface that
    // renders one renders the conditions directly above it. The line itself
    // is unchanged; only the clause a teacher's eye had learned to skip went.
    expect(got?.adjustment).toBe("Plan for shade and water, and keep it short.");
  });

  it("reads London as an ordinary day and says NOTHING about it", () => {
    const got = cardCondition(london);
    expect(got?.state).toBe("fine");
    // The benchmark, on real data. A 23 degree clear morning in London does
    // not need advice, and a card that offers some has spent the register it
    // needs for the morning that does.
    expect(got?.adjustment).toBeNull();
  });

  it("reads a foggy 13 degree Berkeley morning as ordinary too", () => {
    // Fog is atmosphere, not an obstacle. It changes what a class can see, not
    // what a teacher has to do about coats, so it earns no adjustment line.
    const got = cardCondition(berkeley);
    expect(got?.state).toBe("fine");
    expect(got?.adjustment).toBeNull();
  });

  it("keeps two of the three real cities quiet", () => {
    const spoken = [phoenix, london, berkeley]
      .map((d) => cardCondition(d)?.adjustment)
      .filter((line) => typeof line === "string");
    // If this ever reads 3, the card has started talking on ordinary days.
    expect(spoken).toHaveLength(1);
  });
});

describe("the temperature carries a unit the teacher reading it uses", () => {
  it("gives a UK class Celsius", () => {
    expect(feltTemperature(london, "uk")).toBe("23°C");
  });

  it("gives a Phoenix class Fahrenheit, not a bare number and not Celsius", () => {
    // 29.4C. The #168 card showed "37 degrees" with no unit at all; a US
    // teacher reading "29" on a day like this would read it as cold.
    expect(feltTemperature(phoenix, "us")).toBe("85°F");
  });

  it("converts before rounding, so the edge lands on the right degree", () => {
    expect(feltTemperature(berkeley, "us")).toBe("55°F");
    expect(feltTemperature(berkeley, "uk")).toBe("13°C");
  });
});

describe("the sky reads on its own, without the temperature welded to it", () => {
  it("gives the sky and the air, and no degrees", () => {
    expect(skyPhrase(london)).toBe("a clear sky · a light breeze");
    expect(skyPhrase(berkeley)).toBe("fog · a light breeze");
    // Phoenix said "a clear sky" when this was written, off the render enum's
    // `skyCondition: "clear"`. The same payload carries `cloudCoverPct: 65`
    // and `condition: "Partly cloudy"`, and #368 demoted the render enum below
    // the producer's own cloud number for exactly that contradiction. The
    // morning did not change; the sentence stopped being wrong about it.
    expect(skyPhrase(phoenix)).toBe("a cloudy sky · still air");
  });

  it("never contains a degree sign, because the card renders that itself", () => {
    for (const data of [phoenix, london, berkeley]) {
      expect(skyPhrase(data) ?? "").not.toMatch(/°/);
    }
  });

  it("is null when there was no read, not an empty string to render", () => {
    expect(skyPhrase(null)).toBeNull();
  });
});

/* ------------------------------------------------------------- the empties */

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.test/bee.jpg",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Seen near here lately.",
    ...over,
  };
}

describe("no photograph is never a grey box", () => {
  it("has exactly four materials and no fifth, empty one", () => {
    const materials = new Set(
      [
        member(),
        member({ honestyTier: "regional" }),
        member({ photoUrl: null }),
        member({ absent: true, photoUrl: null }),
      ].map(castMaterial)
    );
    expect(materials).toEqual(new Set(["seen", "regional", "plate", "absent"]));
  });
});

describe("the closing absence line is built and silent", () => {
  const withAbsence: ClassCast = {
    members: [member()],
    absences: [
      member({
        commonName: "Field grasshopper",
        absent: true,
        photoUrl: null,
        yearsObserved: 5,
        historicalAvgCount: 12,
        sortRank: 0,
      }),
    ],
    source: "live",
  };

  it("carries the absence through to the surfaces", () => {
    // The evidence arrives. That part is real and must keep working, or the
    // day the token lands there will be nothing here to speak about.
    expect(hasCarriedAbsences(withAbsence)).toBe(true);
  });

  it("says nothing about it, even with five years of record behind it", () => {
    // THE GATE. An absence we can see is not an absence we can explain: no
    // field distinguishes "expected today and not found" from "nobody was
    // outside logging". An invented absence is worse than no absence.
    expect(closingAbsence(withAbsence)).toBeNull();
  });

  it("says nothing when there are no absences either", () => {
    expect(closingAbsence({ members: [member()], absences: [], source: "live" })).toBeNull();
  });
});

describe("a species name is a fact, and the locale layer does not touch it", () => {
  it("leaves a common name alone while localizing the line beside it", () => {
    const cast = {
      members: [
        member({
          commonName: "Grey heron",
          line: "Grey on the water, favourite of the reeds.",
        }),
      ],
    };
    const us = localizeDeep(cast, "us");
    // The bird is called a Grey heron in Ohio too. The map may not rename it.
    expect(us.members[0]?.commonName).toBe("Grey heron");
    // The sentence around it is display text, and does get the US voice.
    expect(us.members[0]?.line).toBe("Gray on the water, favorite of the reeds.");
  });
});
