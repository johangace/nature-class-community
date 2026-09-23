import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonPackSection } from "@/app/season/SeasonPackSection";
import { confirmLocation } from "@/app/start/location-state";
import { loadPack } from "@/lib/pack";
import {
  OUTSIDE_DOOR_CAPTION,
  REGIONAL_GAP_CAPTION,
  SEEN_CAPTION,
  seenCaption,
} from "@/lib/outside/captions";
import { parseTryPlace, roundTryPlace, serializeTryPlace } from "@/lib/try-place";

/**
 * ONE QUESTION, THEN THE REAL THING (#877, second slice).
 *
 * Johan, 2026-09-02: "we can simplify and show season and only first session
 * open gives her full pic and minimal changes". A signed-out visitor says
 * where her school is, the season reads for that spot, the first session runs
 * in full, and the account door comes after.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the visitor's chosen spot", () => {
  it("is kept to about a kilometre, so one town shares one read", () => {
    expect(roundTryPlace(51.5467, -0.1052)).toEqual({ lat: 51.55, lng: -0.11 });
    expect(roundTryPlace("37.8716", "-122.2727")).toEqual({ lat: 37.87, lng: -122.27 });
  });

  it("refuses anything that is not a place on earth", () => {
    expect(roundTryPlace(91, 0)).toBeNull();
    expect(roundTryPlace(0, 181)).toBeNull();
    expect(roundTryPlace(Number.NaN, 0)).toBeNull();
    expect(roundTryPlace("north", "west")).toBeNull();
  });

  it("round-trips through the cookie and ignores a cookie it did not write", () => {
    const place = roundTryPlace(51.5467, -0.1052)!;
    expect(parseTryPlace(serializeTryPlace(place))).toEqual(place);
    expect(parseTryPlace(" 37.87,-122.27 ")).toEqual({ lat: 37.87, lng: -122.27 });
    expect(parseTryPlace(undefined)).toBeNull();
    expect(parseTryPlace("")).toBeNull();
    expect(parseTryPlace("51.546,-0.105,7")).toBeNull();
    expect(parseTryPlace("lat=51;lng=0")).toBeNull();
    expect(parseTryPlace("51.5467,-0.1052")).toBeNull();
  });

  it("keeps the name she chose it by, so a reload never renames her school (#922)", () => {
    const place = roundTryPlace(51.5467, -0.3052, "Ealing, Greater London, England, W5 5AW, United Kingdom")!;
    expect(place.label).toBe("Ealing, Greater London, England, W5 5AW, United Kingdom");
    expect(parseTryPlace(serializeTryPlace(place))).toEqual(place);
    // Bounded, flattened, and never the cookie's own separator.
    expect(roundTryPlace(1, 1, "  a\n b  ")!.label).toBe("a b");
    expect(roundTryPlace(1, 1, "x".repeat(300))!.label).toHaveLength(120);
    expect(roundTryPlace(1, 1, "")).toEqual({ lat: 1, lng: 1 });
    expect(parseTryPlace("51.55,-0.31|Ealing%2C%20London")).toEqual({
      lat: 51.55,
      lng: -0.31,
      label: "Ealing, London",
    });
    expect(parseTryPlace("51.55,-0.31|")).toBeNull();
  });
});

describe("the third honesty register", () => {
  it("names the place she chose without calling it a sample or her school", () => {
    expect(seenCaption("chosen", "Ealing")).toBe("Seen lately near Ealing");
    expect(seenCaption("chosen", null)).toBe(SEEN_CAPTION.chosen);
    expect(seenCaption("chosen", "Ealing")).not.toContain("sample");
    expect(seenCaption("chosen", "Ealing")).not.toContain("your school");
    expect(OUTSIDE_DOOR_CAPTION.chosen).toContain("the place you chose");
    expect(REGIONAL_GAP_CAPTION.chosen).toContain("the place you chose");
  });

  it("leaves the school and sample captions word for word", () => {
    expect(seenCaption("school", "Ealing")).toBe("Seen near your school lately");
    expect(seenCaption("sample", "Canonbury")).toBe(
      "Seen lately near Canonbury, the sample patch"
    );
  });

  it("the located step says where a remembered spot came from", () => {
    const said = confirmLocation({
      route: "remembered",
      lat: 51.55,
      lng: -0.11,
      place: { name: "Canonbury", address: null },
    });
    expect(said.provenance).toBe(
      "This is the place you chose before signing in, at 51.550, -0.110."
    );
    // Her own name for it leads over whatever the reverse geocoder says now.
    const named = confirmLocation({
      route: "remembered",
      lat: 51.51,
      lng: -0.3,
      place: { name: "Park Royal", address: null },
      pickedLabel: "Ealing, Greater London",
    });
    expect(named.headline).toBe("Ealing, Greater London");
  });
});

describe("the signed-out season shelf", () => {
  const pack = loadPack("autumn-starter");
  const first = pack.sessions[0]!.id;

  it("opens the first session in full and sends the rest through sign-in", () => {
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="community"
        led={new Set()}
        nextUp={first}
        openOnly={first}
      />
    );
    expect(html).toContain(`/session?session=${first}`);
    for (const session of pack.sessions.slice(1)) {
      expect(html).toContain(session.title);
      expect(html).not.toContain(`/session?session=${session.id}`);
    }
    expect(html.match(/href="\/sign-in"/g)).toHaveLength(pack.sessions.length - 1);
    expect(html).toContain(">open<");
    expect(html).not.toContain("next up");
  });

  it("opens a saved lesson offline, sign-in door or not", () => {
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="community"
        led={new Set()}
        nextUp={first}
        openOnly={first}
        offline
      />
    );
    expect(html).not.toContain('href="/sign-in"');
    for (const session of pack.sessions) {
      expect(html).toContain(`/field#session=${session.id}&amp;view=run`);
    }
  });

  it("is untouched for a signed-in teacher", () => {
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="community"
        led={new Set()}
        nextUp={first}
      />
    );
    expect(html).not.toContain('href="/sign-in"');
    for (const session of pack.sessions) {
      expect(html).toContain(`/session?session=${session.id}`);
    }
  });
});

describe("the wiring, pinned at the source", () => {
  it("every London fallback asks for the chosen spot first, signed out only", () => {
    expect(read("lib/teacher.ts")).toContain(
      "if (!teacher) return (await getTryPlace()) ?? fixtureLocation();"
    );
    expect(read("lib/cast/surface.ts")).toContain(
      "const chosen = teacher ? null : await getTryPlace();"
    );
    expect(read("lib/place-context.ts")).toContain(
      "const chosen = teacher ? null : await getTryPlace();"
    );
  });

  it("the season page and the start page open to a visitor, and /start hides from crawlers", () => {
    const start = read("app/start/page.tsx");
    expect(start).not.toContain('if (!teacher) redirect("/sign-in")');
    expect(start).toContain('mode="try"');
    expect(start).toContain("robots: { index: false, follow: false }");
    const season = read("app/season/page.tsx");
    expect(season).toContain("leadPack({ lat: chosen?.lat ?? null }).sessions[0]?.id ?? nextUp");
    expect(season).toContain("Make it your school. Sign in");
  });

  it("the public reads round a visitor's coordinates and never read a class", () => {
    const outside = read("app/api/outside/route.ts");
    expect(outside).not.toContain('status: 401');
    expect(outside).toContain("roundTryPlace(parsed.data.lat, parsed.data.lng)");
    expect(outside).not.toContain("getActiveClass(");
    const geocode = read("app/api/geocode/route.ts");
    expect(geocode).not.toContain("status: 401");
    expect(geocode).not.toContain("getTeacher");
  });

  it("creating the class forgets the cookie", () => {
    expect(read("app/start/actions.ts")).toContain(
      'jar.delete({ name: TRY_PLACE_COOKIE, path: "/" });'
    );
  });
});
