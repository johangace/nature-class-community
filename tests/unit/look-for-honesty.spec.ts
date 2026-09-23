import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeReactionLine } from "@/lib/outside/captions";
import {
  resolvePhenologyRegionOrNull,
  resolveRegion,
  resolveRegionOrNull,
} from "@/lib/outside/regions";

/**
 * WHAT A SCHOOL IS TOLD IS ALIVE NEAR IT (#305).
 *
 * Onboarding told a class "Now looking for Apple, European Garden Spider,
 * Common Pear near you this week". The three names are `western-europe.json`
 * week 33 with the habitat filter applied. That file covers Portugal to
 * Poland at five species a week, so "near you" was a local claim made over
 * continental data, on the screen where a teacher decides whether to trust
 * the product.
 *
 * Two separate failures sit under that sentence and both are tested here:
 * the CLAIM (the line ignored the recorded observations sitting beside it in
 * the same API response) and the SOURCE (the region resolver was total, so
 * every coordinate outside the 15 files silently borrowed `uk-south`).
 */

/* ------------------------------------------------------------ the claim */

const SIGHTINGS = [
  { name: "Grey Heron" },
  { name: "Buff-tailed Bumblebee" },
  { name: "Common Blue" },
  { name: "Peacock Butterfly" },
];

const LOOK_FORS = [
  { species: "Apple" },
  { species: "European Garden Spider" },
  { species: "Common Pear" },
];

describe("the onboarding reaction line says which claim it is making", () => {
  it("leads with what was actually recorded near the school", () => {
    const r = composeReactionLine({ sightings: SIGHTINGS, lookFors: LOOK_FORS });

    expect(r.tier).toBe("recorded");
    expect(r.line).toContain("Grey Heron");
    expect(r.label).toBe("seen near your school lately");
    // The regional names are not borrowed into a recorded claim (#172).
    expect(r.line).not.toContain("Apple");
    expect(r.line).not.toContain("Common Pear");
  });

  it("falls back to regional only when nothing was recorded, and says so", () => {
    const r = composeReactionLine({ sightings: [], lookFors: LOOK_FORS });

    expect(r.tier).toBe("regional");
    expect(r.line).toContain("Apple");
    expect(r.label).toBe("usually around here now");
    // The exact sentence that started this ticket must not be reachable.
    expect(r.line).not.toContain("near you");
    expect(r.line).not.toContain("near your school");
  });

  it("never speaks a regional name as a recorded one, whatever the inputs", () => {
    // A regional-only read is the ordinary state for a new school in a quiet
    // recording area, so this is the common path, not the edge.
    for (const lookFors of [LOOK_FORS, LOOK_FORS.slice(0, 1), []]) {
      const r = composeReactionLine({ sightings: [], lookFors });
      expect(r.tier === "recorded").toBe(false);
    }
  });

  it("omits rather than fills when there is neither", () => {
    const empty = composeReactionLine({ sightings: [], lookFors: [] });
    expect(empty.tier).toBeNull();
    expect(empty.line).toBe("Pick what's out there and we'll tune what to look for.");

    const tuning = composeReactionLine({ sightings: [], lookFors: [], hasGrounds: true });
    expect(tuning.tier).toBeNull();
    expect(tuning.line).toBe("Tuning what to look for around your grounds.");
  });

  it("drops blank names rather than rendering a gap in the sentence", () => {
    const r = composeReactionLine({
      sightings: [{ name: "  " }, { name: "" }],
      lookFors: [{ species: "Blackberry" }],
    });
    expect(r.tier).toBe("regional");
    expect(r.line).toContain("Blackberry");
  });

  it("carries at most three names, so the line stays a sentence", () => {
    const r = composeReactionLine({ sightings: SIGHTINGS, lookFors: [] });
    expect(r.line).not.toContain("Peacock Butterfly");
  });

  it("keeps the house register: sentence case, no em dash, no all-caps", () => {
    const lines = [
      composeReactionLine({ sightings: SIGHTINGS, lookFors: LOOK_FORS }),
      composeReactionLine({ sightings: [], lookFors: LOOK_FORS }),
      composeReactionLine({ sightings: [], lookFors: [] }),
    ];
    for (const r of lines) {
      for (const text of [r.line, r.label]) {
        expect(text).not.toContain("—");
        expect(text).not.toMatch(/\b[A-Z]{3,}\b/);
      }
    }
  });
});

/* ----------------------------------------------------------- the source */

describe("the region resolver admits when it has no file", () => {
  it("still resolves the regions it genuinely covers", () => {
    expect(resolveRegionOrNull(51.498, -0.06)).toBe("uk-south");
    expect(resolveRegionOrNull(53.48, -2.24)).toBe("uk-north");
    expect(resolveRegionOrNull(55.95, -3.19)).toBe("uk-scotland");
    expect(resolveRegionOrNull(53.35, -6.26)).toBe("ireland");
    expect(resolveRegionOrNull(41.327, 19.819)).toBe("western-europe");
    expect(resolveRegionOrNull(33.448, -112.074)).toBe("us-mountain-west");
    expect(resolveRegionOrNull(45.51, -122.68)).toBe("us-pacific-nw");
    expect(resolveRegionOrNull(50.216, -66.383)).toBe("canada-east"); // Sept-Iles
    expect(resolveRegionOrNull(49.282, -123.121)).toBe("canada-west"); // Vancouver
  });

  it("routes the eastern Canadian population corridor to canada-east", () => {
    const canadianCities: Array<[string, number, number]> = [
      ["Windsor", 42.315, -83.036],
      ["Toronto", 43.653, -79.383],
      ["Ottawa", 45.422, -75.697],
      ["Montreal", 45.502, -73.567],
      ["Halifax", 44.649, -63.575],
    ];

    for (const [city, lat, lng] of canadianCities) {
      expect(resolveRegionOrNull(lat, lng), city).toBe("canada-east");
    }
  });

  it("does not pull neighbouring US cities into canada-east", () => {
    const usCities: Array<[string, number, number, string]> = [
      ["Detroit", 42.331, -83.046, "us-new-england"],
      ["Cleveland", 41.499, -81.694, "us-new-england"],
      ["Buffalo", 42.886, -78.879, "us-new-england"],
      ["Marquette", 46.544, -87.395, "us-new-england"],
      ["Minneapolis", 44.978, -93.265, "us-midwest"],
      ["Burlington", 44.476, -73.212, "us-new-england"],
      ["Portland, Maine", 43.66, -70.257, "us-new-england"],
    ];

    for (const [city, lat, lng, expectedRegion] of usCities) {
      expect(resolveRegionOrNull(lat, lng), city).toBe(expectedRegion);
    }
  });

  it("returns null where no file covers the school, instead of handing it uk-south", () => {
    // Every one of these read `uk-south` before #305: a northern late-summer
    // calendar, and for the southern-hemisphere ones, in their late winter.
    const uncovered: Array<[string, number, number]> = [
      ["Sydney", -33.868, 151.209],
      ["Auckland", -36.848, 174.763],
      ["Cape Town", -33.925, 18.424],
      ["Nairobi", -1.286, 36.817],
      ["Mumbai", 19.076, 72.877],
      ["Tokyo", 35.689, 139.692],
      ["Singapore", 1.352, 103.82],
      ["Reykjavik", 64.146, -21.942],
    ];
    for (const [name, lat, lng] of uncovered) {
      expect(resolveRegionOrNull(lat, lng), name).toBeNull();
    }
  });

  it("stops the North America longitude band reaching South America", () => {
    // Buenos Aires and Santiago sit inside -170..-52 and used to resolve to
    // us-southeast: a Georgia calendar, wrong hemisphere.
    expect(resolveRegionOrNull(-34.603, -58.381)).toBeNull();
    expect(resolveRegionOrNull(-33.447, -70.673)).toBeNull();
    expect(resolveRegionOrNull(-23.55, -46.633)).toBeNull();
    // And still answers for the continent it was written about.
    expect(resolveRegionOrNull(33.749, -84.388)).toBe("us-southeast");
  });

  it("keeps west Cornwall in England", () => {
    // The Ireland test had no southern bound, so anything west of -5.5 below
    // 55.5 was Ireland, which is most of the Penwith peninsula.
    expect(resolveRegionOrNull(50.119, -5.537)).toBe("uk-south"); // Penzance
    expect(resolveRegionOrNull(50.066, -5.714)).toBe("uk-south"); // Land's End
    expect(resolveRegionOrNull(49.914, -6.316)).toBe("uk-south"); // Isles of Scilly
    // Ireland itself is unmoved, Northern Ireland included.
    expect(resolveRegionOrNull(51.898, -8.475)).toBe("ireland"); // Cork
    expect(resolveRegionOrNull(54.597, -5.93)).toBe("ireland"); // Belfast
    // And the Hebrides stay Scottish rather than falling into the new band.
    expect(resolveRegionOrNull(58.209, -6.386)).toBe("uk-scotland"); // Stornoway
  });

  it("keeps the total form for the sample patch, which has no coordinates", () => {
    // The signed-out demo says on its face that it is a sample, so a default
    // there is a labelled default and not a claim about anyone's school.
    expect(resolveRegion(null, null)).toBe("uk-south");
    expect(resolveRegion(undefined, undefined)).toBe("uk-south");
    expect(resolveRegionOrNull(null, null)).toBeNull();
  });

  it("passes the null through the climate correction rather than swallowing it", () => {
    expect(resolvePhenologyRegionOrNull(-33.868, 151.209, "oceanic")).toBeNull();
    // The Sonoran correction still fires where it was written to.
    expect(resolvePhenologyRegionOrNull(33.448, -112.074, "arid")).toBe("us-south-central");
  });
});

/* ------------------------------------------------------------ the reach */

/**
 * A SOURCE SCAN, for the same reason cast-is-live-coverage.spec.ts is one.
 * The failure here is REACH: every behavioural test above can pass while one
 * surface still holds its own inline "near you" template over `lookFors`, and
 * that surface is the one a teacher meets first. The behavioural tests prove
 * the composer is honest; only a scan proves nothing bypasses it.
 */

const ROOTS = ["app", "lib"];

/**
 * A local claim ("near you", "near your school") in user-facing copy.
 *
 * Matched against ONE LINE of comment-stripped source at a time, and that is
 * the whole subtlety of this guard. The first version required the phrase to
 * sit between two quotes, which failed twice over: a JSX text node carries no
 * quotes of its own, so honest copy was caught only when a `style={{ }}`
 * further up happened to supply one and the character class ran across forty
 * lines of markup to reach it; and a comment WARNING about the phrase read
 * exactly like copy using it, so the files documenting this very rule were
 * reported as breaking it. A guard that cannot tell a warning from the thing
 * it warns against forbids explaining itself, and one that spans lines names
 * whichever file the scan happened to start in.
 */
const LOCAL_CLAIM = /near (?:you|your school)\b/i;

/** Source with comments removed: this guard governs COPY, not commentary. */
function copyOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/** Building a species sentence out of the regional list by hand. */
const INLINE_LOOK_FOR_TEMPLATE = /lookFors[\s\S]{0,160}?\.join\(/;

/**
 * Files allowed to make a local claim, and why. A file earns a place here by
 * making the claim over RECORDED observations, never over regional ones.
 */
const EXEMPT: Record<string, string> = {
  "lib/outside/captions.ts":
    "Owns both captions and the composer that picks between them. SEEN_CAPTION.school is the local claim itself, and it is only ever attached to Pointmoon's recorded observations.",
  "lib/outside/observations.ts":
    "Names the recorded row in a doc comment describing where Pointmoon's photographed observations are turned into sightings. Makes no claim over regional data.",
  "lib/outside/index.ts":
    "Carries the written #172 ruling that regional is never spoken as recorded, quoting both captions to explain the split it enforces.",
  "lib/outside/types.ts":
    "Documents on the type itself which list a surface may caption as seen and which it may not.",
  "lib/cast/member.ts":
    "Records in a comment the profile bug where a regional name was captioned as photographed, so the history stays readable where it happened.",
  "lib/cast/summary.ts":
    "Records the Oriental Hornet incident in a comment, as the reason the easiest-to-find slot is chosen the way it is.",
  "app/SeenNearby.tsx":
    "Renders the recorded sightings row, which is the surface the local claim belongs to; it has no access to the regional list at all.",
  "app/today/page.tsx":
    "Explains in a comment which of the two the signed-in and signed-out reads caption as, and defers the strings themselves to the captions module.",
  "app/run/HybridJourney.tsx":
    "Says 'Nothing has been recorded near your school this week' when a species has neither a sighting nor a written note. That is a claim about the ABSENCE of recorded observations, which is the honest half of this rule rather than a breach of it: it never reaches for the regional list to fill the silence, it says the silence out loud.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no surface makes a local claim over regional data", () => {
  const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root))).map((path) => ({
    rel: path.slice(process.cwd().length + 1),
    source: copyOnly(readFileSync(path, "utf8")),
  }));

  it("finds the application source at all, so the scan cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(50);
    // And both matchers work on a string that has what they hunt for.
    expect(LOCAL_CLAIM.test('const s = `looking for ${a} near you this week.`')).toBe(true);
    expect(INLINE_LOOK_FOR_TEMPLATE.test("bloom.lookFors.slice(0, 3).map(f).join(\", \")")).toBe(true);
    // JSX text carries no quotes of its own and must still be caught.
    expect(LOCAL_CLAIM.test("      Seen near your school this week")).toBe(true);
  });

  it("reads copy and not commentary, so the rule can be written down", () => {
    // Every file that explains this rule quotes the phrase it forbids. If
    // that counted, the guard would name lib/ai/door-line.ts and friends for
    // documenting the very thing they comply with — which is how it failed.
    expect(copyOnly('/* never say "near your school" over regional data */')).not.toMatch(
      LOCAL_CLAIM
    );
    expect(copyOnly('// "near you" is a claim about records\n')).not.toMatch(LOCAL_CLAIM);
    // Real copy on the next line survives the stripping.
    expect(
      copyOnly('// a warning about near you\nconst s = "seen near your school";')
    ).toMatch(LOCAL_CLAIM);
  });

  it("does not run a match across unrelated lines", () => {
    // The old pattern reached from a quote in a style attribute, through
    // forty lines of markup, to a phrase in a different element, and blamed
    // the file it started in.
    const markup = 'style={{ fontStyle: "italic" }}\n<p>plain copy</p>\n<p>and more</p>';
    expect(markup).not.toMatch(LOCAL_CLAIM);
  });

  it("names any file building its own species sentence from the regional list", () => {
    // The onboarding line was exactly this: an inline template over lookFors,
    // which is how it kept a claim the rest of the app had already retired.
    const touching = files
      .filter((file) => INLINE_LOOK_FOR_TEMPLATE.test(file.source))
      .map((file) => file.rel);

    expect(touching).toEqual([]);
  });

  it("names any unexempted file saying near you or near your school", () => {
    const claiming = files
      .filter((file) => LOCAL_CLAIM.test(file.source))
      .filter((file) => !(file.rel in EXEMPT))
      .map((file) => file.rel);

    // A named file here means a teacher can be told a continental calendar was
    // seen at her school. Route it through composeReactionLine instead.
    expect(claiming).toEqual([]);
  });

  it("keeps every exemption pointed at a file that still exists, with a real reason", () => {
    const present = new Set(files.map((file) => file.rel));
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      expect(present.has(rel), rel).toBe(true);
      expect(reason.length, rel).toBeGreaterThan(40);
    }
  });

  it("removes the grounds reaction line with the optional onboarding walk", () => {
    const flow = readFileSync(join(process.cwd(), "app/start/StartFlow.tsx"), "utf8");
    expect(flow).not.toContain("composeReactionLine");
    expect(flow).not.toContain("sightings: bloom?.sightings");
    expect(flow).not.toContain("now looking for, near you");
  });
});
