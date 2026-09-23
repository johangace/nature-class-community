import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeakAndShow } from "@/app/cast/SpeakAndShow";
import { speciesHref, type CastMember } from "@/lib/cast/member";
import { returnToRunHref, shouldAutoResume } from "@/app/run/return-to-run";

/**
 * A SPECIES TAP DURING A RUN IS NO LONGER A ONE-WAY DOOR (#874).
 *
 * "I clicked on a bird and it took me out of the lesson." The face was a
 * plain link, the profile's back link went to Today, and a fresh /run held
 * the saved position behind a "pick up?" question. Now a face tapped inside
 * a run carries the session, the profile links back INTO that run, and the
 * runner re-enters the saved beat without asking.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function member(index: number): CastMember {
  return {
    commonName: `Species ${index + 1}`,
    scientificName: `Genus species-${index + 1}`,
    photoUrl: null,
    iconicTaxon: "Aves",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: index,
    absent: false,
    line: "",
  };
}

describe("the link out carries the run it left", () => {
  it("adds the session only when a run is named, after any topic", () => {
    const m = member(0);
    expect(speciesHref(m)).toBe("/species/genus-species-1");
    expect(speciesHref(m, "minibeasts")).toBe("/species/genus-species-1?topic=minibeasts");
    expect(speciesHref(m, null, "autumn-w1")).toBe("/species/genus-species-1?session=autumn-w1");
    expect(speciesHref(m, "birds", "autumn-w1")).toBe(
      "/species/genus-species-1?topic=birds&session=autumn-w1"
    );
  });

  it("is carried by every face in a run, and by none when browsing", () => {
    const members = [member(0), member(1)];
    const common = { members, lines: ["a", "b"], sessionTitle: "Bird walk", sessionId: "autumn-w1" };
    const run = renderToStaticMarkup(
      createElement(SpeakAndShow, {
        ...common,
        mode: "run",
        onBack: () => undefined,
        onContinue: () => undefined,
      })
    );
    expect(run.match(/session=autumn-w1/g)).toHaveLength(2);

    const browse = renderToStaticMarkup(createElement(SpeakAndShow, { ...common }));
    expect(browse).not.toContain("session=");
  });
});

describe("the way back", () => {
  it("returns to the same run and asks it to re-enter the saved beat", () => {
    expect(returnToRunHref("autumn-w1")).toBe("/run?session=autumn-w1&resume=1");
    expect(returnToRunHref("a b")).toBe("/run?session=a%20b&resume=1");
  });

  it("only the exact flag re-enters silently", () => {
    expect(shouldAutoResume("1")).toBe(true);
    expect(shouldAutoResume(undefined)).toBe(false);
    expect(shouldAutoResume("true")).toBe(false);
    expect(shouldAutoResume(["1"])).toBe(false);
  });
});

describe("the wiring holds end to end", () => {
  it("the runner names its session to the cast beat and honours the flag", () => {
    const runner = read("app/run/Runner.tsx");
    expect(runner).toContain("sessionId={session.id}");
    expect(runner).toMatch(/if \(saved && autoResume\) \{\s*[\s\S]{0,400}applyResume\(saved\);/);
  });

  it("the door slot, the other species link inside a run, carries the run too", () => {
    expect(read("app/run/DoorSlot.tsx")).toContain("speciesHref(member, topic, fromRun)");
    expect(read("app/run/HybridJourney.tsx")).toMatch(/<DoorSlot[\s\S]{0,200}fromRun=\{session\.id\}/);
  });

  it("the journey, which renders every authored lesson, honours the flag too", () => {
    const journey = read("app/run/HybridJourney.tsx");
    expect(journey).toMatch(/if \(saved && autoResume\) \{\s*[\s\S]{0,300}applyResume\(saved\);/);
  });

  it("the run page reads the flag off the URL for both runners", () => {
    const page = read("app/run/page.tsx");
    expect(page.match(/autoResume=\{shouldAutoResume\(resume\)\}/g)).toHaveLength(2);
  });

  it("the species page validates the session before offering the way back", () => {
    const page = read("app/species/[slug]/page.tsx");
    expect(page).toContain("findSession(rawSession)?.session");
    expect(page).toContain("returnToRunHref(fromRun)");
    expect(page).toContain('"Back to the lesson"');
  });
});
