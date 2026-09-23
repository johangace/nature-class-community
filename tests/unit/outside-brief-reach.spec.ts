/**
 * THE BRIEF READS WHAT POINTMOON ACTUALLY SENDS (#304).
 *
 * This is a REACH test, not a correctness test, and the distinction is the
 * whole reason it exists. #284 found that five of six place-signal reads in
 * this app were wrong for weeks: they were written against a vocabulary the
 * producer never returned, so every unit test passed forever. A producer that
 * never sends a field can never contradict a reader that misunderstands it.
 *
 * So the fixture here is a VERBATIM LIVE PAYLOAD, recorded from
 * `GET /api/moon?audience=facts&surface=open&lat=51.546&lng=-0.105` on
 * 2026-08-17 at 19:25 UTC, 186KB, unedited. Not a hand-written object shaped
 * like what we hope arrives. If Pointmoon renames `moonIlluminationPct` or
 * moves `daylightMinutesRemaining`, these assertions go red, which is exactly
 * what did not happen last time.
 *
 * The counts are asserted as floors rather than exact numbers where the real
 * world moves underneath them, and exactly where the payload is fixed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  groundPhrase,
  lightLeft,
  moonPhrase,
  skyFacts,
  sunTimes,
  upcomingSky,
} from "@/lib/outside/sky";
import { parsePointmoonNatureProjection } from "@/lib/outside/pointmoon-contract";
import type { FieldTruth } from "@/lib/outside/pointmoon";

const payload = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/pointmoon/london_uk_2026-08-17.json"),
    "utf8"
  )
) as FieldTruth & { schemaVersion: string };

describe("the recorded payload is the one we claim to read", () => {
  it("still speaks the schema version the projection accepts", () => {
    // The single most likely silent break: a version bump empties every
    // observation while the weather keeps working, so the card degrades to
    // regional-only and looks like a thin recording area rather than a bug.
    expect(payload.schemaVersion).toBe("field-truth@1.1.0");
  });

  it("carries fifteen nearby species, most of them photographed", () => {
    const projection = parsePointmoonNatureProjection(payload, {
      // The slice expires 24h after recording, so the clock is pinned to the
      // moment of the read. Without this the fixture goes stale and the test
      // starts asserting the thin path.
      now: new Date("2026-08-17T19:30:00.000Z"),
    });
    expect(projection.status).toBe("ready");
    if (projection.status !== "ready") return;

    expect(projection.observations.length).toBeGreaterThanOrEqual(15);
    const photographed = projection.observations.filter((o) => o.photo !== null);
    expect(photographed.length).toBeGreaterThanOrEqual(13);

    // The two species from the OLD prototype's screenshot, the ones Johan was
    // holding up as what we used to show. Both are in tonight's live payload,
    // both photographed. The read was never the problem.
    const names = projection.observations.map((o) => o.commonName);
    expect(names).toContain("Common Wood-Pigeon");
    expect(names).toContain("Eurasian Coot");
  });
});

describe("the sky composer reaches the fields it was written against", () => {
  it("reads sunrise and sunset as a local wall clock, not as UTC", () => {
    // The payload says "2026-08-17T05:49" with NO zone. Parsing that as a
    // Date on a UTC server and formatting it back gives 5:49 am only by
    // accident and 4:49 am in any other timezone. The string is the answer.
    expect(sunTimes(payload)).toEqual({ sunrise: "5:49 am", sunset: "8:19 pm" });
  });

  it("reads the moon's phase and how lit it is", () => {
    expect(moonPhrase(payload)).toBe("waxing crescent, 28% lit");
  });

  it("reads the light left in the day, and zero is an answer", () => {
    // Recorded six minutes after sunset, so this really is zero. A composer
    // that treated zero as missing would go silent at the exact moment the
    // fact matters most.
    expect(lightLeft(payload)).toBe("the light has gone");
  });

  it("reads what the ground is doing underfoot", () => {
    expect(groundPhrase(payload)).toBe("dry underfoot");
  });

  it("builds an instrument row from the readings that came back", () => {
    const facts = skyFacts(payload);
    const labels = facts.map((f) => f.label);
    expect(labels).toEqual(["sunrise", "sunset", "light left", "moon", "ground"]);
    // Nothing in the row is empty. A labelled blank is the placeholder this
    // whole surface is built to never render.
    expect(facts.every((f) => f.value.trim().length > 0)).toBe(true);
  });

  it("surfaces the nearest sky event in the producer's own words", () => {
    const event = upcomingSky(payload);
    expect(event).not.toBeNull();
    expect(event?.label).toBe("partial lunar eclipse");
    expect(event?.when).toBe("in 10 days");
    expect(event?.note).toContain("shadow");
  });
});

describe("a thin or absent read composes nothing rather than a hedge", () => {
  const nothing: FieldTruth = {};

  it("returns null for every line and an empty row", () => {
    expect(sunTimes(nothing)).toEqual({ sunrise: null, sunset: null });
    expect(moonPhrase(nothing)).toBeNull();
    expect(lightLeft(nothing)).toBeNull();
    expect(groundPhrase(nothing)).toBeNull();
    expect(upcomingSky(nothing)).toBeNull();
    expect(skyFacts(nothing)).toEqual([]);
    expect(skyFacts(null)).toEqual([]);
  });

  it("drops a sky event it cannot date rather than guessing at when", () => {
    const undated: FieldTruth = {
      facts: {
        fieldSnapshot: {
          astronomy: { upcomingEvents: [{ label: "meteor shower", note: "look up" }] },
        },
      },
    };
    expect(upcomingSky(undated)).toBeNull();
  });

  it("drops an event past half a term as trivia, not a plan", () => {
    const distant: FieldTruth = {
      facts: {
        fieldSnapshot: {
          astronomy: {
            upcomingEvents: [{ label: "total solar eclipse", daysOffset: 300 }],
          },
        },
      },
    };
    expect(upcomingSky(distant)).toBeNull();
  });
});
