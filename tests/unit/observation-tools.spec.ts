import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  auditObservationLinks,
  classifyObservationUrl,
  describeObservationFinding,
  DECLARED_OBSERVATION_LINKS,
  INATURALIST,
  observationUrlsIn,
  OBSERVATION_TOOLS,
  recommendedObservationTool,
  SEEK,
  type DeclaredObservationLink,
} from "@/lib/observation-tools";

/**
 * #758 — child privacy in observation tools.
 *
 * The first real teacher, 2026-08-31: for children she uses Seek rather than
 * iNaturalist. The audit behind this spec is
 * `docs/observation-tools-audit-2026-08-31.md`; the position it pins is in
 * `lib/observation-tools.ts`.
 *
 * Three things are checked, and the middle one is the point:
 *
 *   1. the classifier tells a licence receipt from an invitation to join;
 *   2. the guard GOES RED on a fabricated violation — a check nobody has
 *      watched fail is not evidence (#554), so the red is exercised here in
 *      the same file as the green;
 *   3. the real tree is held to the audited state: no rendered surface, pack
 *      or prompt carries an undeclared link to an observation platform.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * What gets scanned: everything that can put a URL in front of a person.
 * `scripts/` is excluded because the build-time iNaturalist API client lives
 * there and is not a surface, and `tests/` because a spec's own fixtures are
 * not rendered either.
 */
const SCANNED_ROOTS = ["app", "lib", "packs", "prompts", "engine", "schema"];
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".json", ".md", ".css"]);

/**
 * The register itself. It holds the source URLs every claim about Seek and
 * iNaturalist was read from, which is exactly where those URLs belong; it
 * renders nothing.
 */
const NOT_A_SURFACE = new Set(["lib/observation-tools.ts"]);

/**
 * Generated corpora, held to a different rule.
 *
 * `taxon-reference.json` is written by `scripts/build-taxon-reference.mjs` from
 * the iNaturalist API and is never hand-edited, so it carries hundreds of photo
 * pages that no person typed and no declaration list could usefully hold. It is
 * exempt from the declaration requirement and NOT exempt from judgement: the
 * test below requires every observation URL in it to be a photo page, so the
 * day the generator starts storing observation records instead, this goes red.
 */
const GENERATED_CORPORA = new Set(["lib/outside/data/taxon-reference.json"]);

function scannedFiles(): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  for (const root of SCANNED_ROOTS) {
    const base = join(ROOT, root);
    let entries: string[];
    try {
      entries = readdirSync(base, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = `${root}/${String(entry).split("\\").join("/")}`;
      if (NOT_A_SURFACE.has(rel) || GENERATED_CORPORA.has(rel)) continue;
      if (!SCANNED_EXTENSIONS.has(extname(rel))) continue;
      const absolute = join(ROOT, rel);
      let source: string;
      try {
        source = readFileSync(absolute, "utf8");
      } catch {
        continue; // a directory whose name ends in an extension we scan
      }
      files.push({ path: rel, source });
    }
  }
  return files;
}

describe("the house position on observation tools (#758)", () => {
  it("sends children to Seek and an adult observer to iNaturalist", () => {
    expect(recommendedObservationTool("children-observing").id).toBe("seek");
    expect(recommendedObservationTool("adult-observer").id).toBe("inaturalist");
  });

  it("keeps iNaturalist as a named tool rather than deleting it", () => {
    // The over-correction this ticket explicitly refused: iNaturalist proper is
    // the right tool for an adult pre-walking her ground, and the position says
    // so out loud instead of quietly removing it.
    expect(OBSERVATION_TOOLS.map((t) => t.id).sort()).toEqual(["inaturalist", "seek"]);
    expect(INATURALIST.facts.length).toBeGreaterThan(0);
  });

  it("lets no claim about a children's app travel without its source and its date", () => {
    // The repo rule: a thing we cannot verify resolves to absent, never to a
    // plausible value. A sentence about what Seek does with a child's location
    // is the last place to relax it.
    for (const tool of OBSERVATION_TOOLS) {
      expect(tool.facts.length).toBeGreaterThan(0);
      for (const fact of tool.facts) {
        expect(fact.claim.trim().length).toBeGreaterThan(20);
        expect(fact.source.trim()).not.toBe("");
        expect(fact.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      // What we could not establish is recorded as unestablished.
      expect(tool.unverified.length).toBeGreaterThan(0);
    }
  });

  it("does not repeat the shorthand that Seek does not use location", () => {
    // The teacher's words are "seek doesnt geolocate". They are directionally right
    // and literally wrong: Seek asks for location and coarsens it. The position
    // must carry the accurate version, because a confident wrong sentence about
    // a children's app is worse than no sentence.
    const seekText = SEEK.facts.map((f) => f.claim).join(" ");
    expect(seekText).toMatch(/asks for location permission/i);
    expect(seekText).toMatch(/rounded to two decimal places/i);
    expect(seekText).toMatch(/never stored in the app/i);
  });
});

describe("classifying a link to an observation platform", () => {
  it("tells a licence receipt from a record from an invitation to join", () => {
    expect(classifyObservationUrl("https://www.inaturalist.org/photos/42")?.kind).toBe(
      "photo-provenance"
    );
    expect(classifyObservationUrl("https://www.inaturalist.org/observations/42")?.kind).toBe(
      "record"
    );
    expect(classifyObservationUrl("https://www.inaturalist.org/taxa/12345")?.kind).toBe(
      "record"
    );
    expect(
      classifyObservationUrl("https://www.inaturalist.org/observations/new")?.kind
    ).toBe("participation");
    expect(classifyObservationUrl("https://www.inaturalist.org/signup")?.kind).toBe(
      "participation"
    );
    expect(classifyObservationUrl("https://www.inaturalist.org/")?.kind).toBe(
      "participation"
    );
  });

  it("leaves everything that is not an observation platform alone", () => {
    expect(classifyObservationUrl("https://en.wikipedia.org/wiki/Apis_mellifera")).toBeNull();
    expect(classifyObservationUrl("https://upload.wikimedia.org/a.jpg")).toBeNull();
    expect(classifyObservationUrl("not a url at all")).toBeNull();
  });

  it("finds the literals in a block of source", () => {
    const source = `
      const credit = "https://www.inaturalist.org/photos/7";
      // see also https://www.inaturalist.org/observations/new
      const other = "https://example.test/x";
    `;
    expect(observationUrlsIn(source).sort()).toEqual([
      "https://www.inaturalist.org/observations/new",
      "https://www.inaturalist.org/photos/7",
    ]);
  });
});

describe("the guard can go red", () => {
  /**
   * The #554 discipline, in-file: `register-lint` exited 0 unconditionally for
   * months while pull requests cited it as evidence. So the fabricated
   * violation is asserted here, beside the real scan, and the same guard is
   * planted in `scripts/guard-mutation-check.mjs` so CI keeps proving it.
   */
  it("refuses an undeclared observation-platform link on any surface", () => {
    const findings = auditObservationLinks([
      {
        path: "app/run/Fabricated.tsx",
        source: '<a href="https://www.inaturalist.org/observations/new">Add this sighting</a>',
      },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.problem).toBe("undeclared");
    expect(describeObservationFinding(findings[0]!)).toContain(
      "undeclared observation-platform link"
    );
  });

  it("refuses an invitation to join, on a class surface, even when declared", () => {
    const declared: DeclaredObservationLink[] = [
      {
        literal: "https://www.inaturalist.org/observations/new",
        file: "app/print/Fabricated.tsx",
        audience: "class",
        why: "fabricated for this spec",
      },
    ];
    const findings = auditObservationLinks(
      [
        {
          path: "app/print/Fabricated.tsx",
          source: 'href="https://www.inaturalist.org/observations/new"',
        },
      ],
      declared
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.problem).toBe("participation-link-on-a-class-surface");
    expect(describeObservationFinding(findings[0]!)).toContain("Seek by iNaturalist");
  });

  it("passes a declared credit link on a teacher surface", () => {
    const declared: DeclaredObservationLink[] = [
      {
        literal: "https://www.inaturalist.org/photos/42",
        file: "app/Fabricated.tsx",
        audience: "teacher",
        why: "fabricated for this spec",
      },
    ];
    expect(
      auditObservationLinks(
        [{ path: "app/Fabricated.tsx", source: '"https://www.inaturalist.org/photos/42"' }],
        declared
      )
    ).toEqual([]);
  });
});

describe("the tree itself", () => {
  it("scans a real corpus rather than an empty one", () => {
    // Without this the scan below is the register-lint failure again: green
    // because it looked at nothing.
    const files = scannedFiles();
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.path === "app/PhotoCredit.tsx")).toBe(true);
    expect(files.some((f) => f.path.startsWith("packs/"))).toBe(true);
  });

  it("carries no undeclared link to an observation platform", () => {
    const findings = auditObservationLinks(scannedFiles());
    expect(findings.map(describeObservationFinding)).toEqual([]);
  });

  it("holds the generated photo corpus to photo pages only", () => {
    // 845 iNaturalist URLs live in this file. Every one is a licence receipt
    // for a photograph, which is why the corpus is exempt from declaring them
    // one by one. If the generator ever wrote an observation page or a signup
    // link in there, "exempt from declaring" would quietly become "exempt from
    // judgement", so the kind is checked instead.
    const source = readFileSync(join(ROOT, "lib/outside/data/taxon-reference.json"), "utf8");
    const urls = observationUrlsIn(source);
    expect(urls.length).toBeGreaterThan(100);
    const kinds = new Set(urls.map((u) => classifyObservationUrl(u)?.kind));
    expect([...kinds]).toEqual(["photo-provenance"]);
  });

  it("has an empty declaration list, which is the audited finding of #758", () => {
    // On 2026-08-31 the product named no observation app anywhere: iNaturalist
    // is a data source behind Pointmoon and the subject of photo credits, never
    // a place we send a teacher or a class. When this list stops being empty,
    // the audit doc is stale and should be updated in the same change.
    expect(DECLARED_OBSERVATION_LINKS).toEqual([]);
  });
});

describe("what the audit deliberately left alone", () => {
  /**
   * `app/PhotoCredit.tsx` renders `href={asset.sourceUrl}` — a value from
   * Pointmoon, usually an iNaturalist photo page. It is attribution, it is the
   * right tool, and #758 says keep it. Pinned here so a later reading of this
   * ticket does not mistake it for something the guard forgot.
   */
  it("keeps the photo-credit link out of the guard's way", () => {
    const source = readFileSync(join(ROOT, "app/PhotoCredit.tsx"), "utf8");
    expect(source).toContain("href={asset.sourceUrl}");
    // It is dynamic, so it carries no literal for the scanner to catch, and
    // that is exactly why the audit had to be read by a person as well.
    expect(observationUrlsIn(source)).toEqual([]);
  });
});
