import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { phaseSchema, parsePack, type Pack } from "@/schema/pack";
import {
  loadAllPacks,
  packOrder,
  seasonBrowsePacks,
  seasonShelf,
  shelfPacksAllSeasons,
  shelfTier,
} from "@/lib/pack";

/**
 * The vitest half of pack validation (scripts/validate-packs.mjs is the CLI
 * half — same invariants, run as `npm run validate:packs` for CI/local use
 * outside the test runner). This file is what makes those invariants show up
 * in `npm test` and in an editor's inline test runner, and — unlike the
 * script — it imports the REAL seasonShelf/shelfPacksAllSeasons/packOrder from
 * lib/pack.ts, so a change to the shelf definition can never silently drift
 * from what this suite checks.
 */

/** A fixed autumn day in London: these tests read shelf membership, not the clock. */
const SHELF_DAY = { date: new Date(2026, 8, 17), lat: 51.5 };

const packsDir = join(process.cwd(), "packs");

function loadRawPack(id: string): unknown {
  return JSON.parse(readFileSync(join(packsDir, `${id}.json`), "utf8"));
}

// packs/settle.json is NOT a pack: it is the shared settling phase
// ({ id, title, phase }), parsed by phaseSchema and prepended to opted-in
// sessions by loadPack. It gets its own assertion below instead of a skip.
const SETTLE_FILE = "settle.json";

describe("pack schema", () => {
  it("every pack file on disk parses against schema/pack.ts", () => {
    const files = readdirSync(packsDir).filter((f) => f.endsWith(".json") && f !== SETTLE_FILE);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
      expect(() => parsePack(raw), `${file} should parse`).not.toThrow();
    }
  });

  it("the shared settling phase parses against phaseSchema", () => {
    const raw = JSON.parse(readFileSync(join(packsDir, SETTLE_FILE), "utf8"));
    expect(() => phaseSchema.parse(raw.phase), `${SETTLE_FILE} phase should parse`).not.toThrow();
  });

  it("packOrder names every pack file that actually exists on disk", () => {
    const files = readdirSync(packsDir)
      .filter((f) => f.endsWith(".json") && f !== SETTLE_FILE)
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect([...packOrder].sort()).toEqual(files);
  });
});

describe("pack semantic invariants", () => {
  const packs: Pack[] = loadAllPacks();

  it("has no duplicate pack ids across the catalogue", () => {
    const ids = packs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate session ids across the WHOLE catalogue", () => {
    const ids = packs.flatMap((p) => p.sessions.map((s) => s.id));
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    expect(dupes, `duplicate session ids: ${JSON.stringify(dupes)}`).toEqual([]);
  });

  it("a deliberately duplicated session id fails validation", () => {
    // Acceptance criterion from #58, proven directly against parsePack + the
    // catalogue-wide uniqueness check, without touching a file on disk.
    const raw = loadRawPack("spring-term") as { sessions: Array<{ id: string }> };
    const rigged = structuredClone(raw);
    rigged.sessions[1]!.id = rigged.sessions[0]!.id;
    const parsed = parsePack(rigged);
    const ids = parsed.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it("has no duplicate phase keys within any single session", () => {
    for (const pack of packs) {
      for (const session of pack.sessions) {
        const keys = session.phases.map((ph) => ph.key);
        expect(
          new Set(keys).size,
          `${pack.id}/${session.id} has duplicate phase keys: ${JSON.stringify(keys)}`
        ).toBe(keys.length);
      }
    }
  });

  it("keeps every authored phase duration within its session's own durationMin", () => {
    for (const pack of packs) {
      for (const session of pack.sessions) {
        for (const phase of session.phases) {
          if (phase.durationMin === undefined) continue;
          expect(
            phase.durationMin,
            `${pack.id}/${session.id} phase "${phase.key}" (${phase.durationMin}m) exceeds session durationMin (${session.durationMin}m)`
          ).toBeLessThanOrEqual(session.durationMin);
        }
      }
    }
  });

  it("ships a non-empty childSheet on every session (product law)", () => {
    for (const pack of packs) {
      for (const session of pack.sessions) {
        expect(
          session.childSheet.length,
          `${pack.id}/${session.id} has no childSheet`
        ).toBeGreaterThan(0);
      }
    }
  });

  // --- Celebration uniqueness (#92) ---------------------------------------
  //
  // The celebration is the last thing the class hears, and a teacher leading
  // a term in order hears every one of them. A line that fits two sessions
  // was never about either — the bar the packs already meet is "You just
  // planted wildflowers for pollinators", which cannot be pasted anywhere
  // else. Matching is folded (case, whitespace, curly quotes, trailing
  // punctuation) because a duplicate arrives as a near-copy, not a
  // byte-copy; the script half in scripts/validate-packs.mjs folds the same
  // way and carries the KNOWN_CELEBRATION_COLLISIONS exception set.
  const CELEBRATION_FIELDS = ["headline", "keepsake", "nextWeekTease"] as const;

  function celebrationKey(value: string): string {
    return value
      .normalize("NFC")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/[.,;:!?]+$/, "");
  }

  function celebrationCollisions(all: Pack[]): string[] {
    const seen = new Map<string, string[]>();
    for (const pack of all) {
      for (const session of pack.sessions) {
        if (!session.celebration) continue;
        for (const field of CELEBRATION_FIELDS) {
          const value = session.celebration[field];
          if (value === undefined) continue;
          const key = `${field}::${celebrationKey(value)}`;
          const list = seen.get(key) ?? [];
          list.push(session.id);
          seen.set(key, list);
        }
      }
    }
    return [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => `${key} -> ${ids.join(", ")}`);
  }

  it("no two sessions share a celebration headline, keepsake or tease", () => {
    // Empty exception set, matching KNOWN_CELEBRATION_COLLISIONS in
    // scripts/validate-packs.mjs: the #92 sweep found no duplicates to
    // grandfather in. An accepted collision is named in both places, with
    // its ticket, rather than the check being loosened.
    const KNOWN = new Set<string>();
    const collisions = celebrationCollisions(packs).filter((c) => !KNOWN.has(c.split(" -> ")[0]!));
    expect(collisions, `duplicate celebration line(s): ${JSON.stringify(collisions)}`).toEqual([]);
  });

  it("a deliberately duplicated celebration line fails validation", () => {
    // The same proof the duplicate-session-id case above makes, for the same
    // reason: a guard that has never failed is not a guard. Rigged in memory,
    // no file on disk is touched.
    const raw = loadRawPack("autumn") as {
      sessions: Array<{ celebration?: { headline: string } }>;
    };
    const rigged = structuredClone(raw);
    rigged.sessions[1]!.celebration!.headline = rigged.sessions[0]!.celebration!.headline;
    const collisions = celebrationCollisions([parsePack(rigged)]);
    expect(collisions.length).toBeGreaterThan(0);
  });

  it("folds near-copies, so a duplicate cannot hide behind punctuation", () => {
    const raw = loadRawPack("autumn") as {
      sessions: Array<{ celebration?: { headline: string } }>;
    };
    const rigged = structuredClone(raw);
    const original = rigged.sessions[0]!.celebration!.headline;
    // The shape a copy-pasted celebration actually arrives in: same sentence,
    // different casing and a stray double space, one full stop short.
    rigged.sessions[1]!.celebration!.headline = original
      .toUpperCase()
      .replace(" ", "  ")
      .replace(/\.$/, "");
    const collisions = celebrationCollisions([parsePack(rigged)]);
    expect(collisions.length).toBeGreaterThan(0);
  });

  it("only ever uses the three real ability bands", () => {
    const validBands = new Set(["reception", "y1", "y2"]);
    function collect(node: unknown, out: Set<string>) {
      if (Array.isArray(node)) {
        node.forEach((v) => collect(v, out));
        return;
      }
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj.abilityVariants && typeof obj.abilityVariants === "object") {
        Object.keys(obj.abilityVariants).forEach((k) => out.add(k));
      }
      Object.values(obj).forEach((v) => collect(v, out));
    }
    const seen = new Set<string>();
    for (const pack of packs) collect(pack, seen);
    for (const band of seen) expect(validBands.has(band), band).toBe(true);
  });
});

describe("shelf semantics (visible programme versus included sequence)", () => {
  it("keeps the autumn garden in the catalogue but off every shelf while hidden", () => {
    const archive = loadAllPacks().find((pack) => pack.id === "autumn-garden");
    expect(archive).toBeDefined();
    expect(archive?.collection).toEqual({
      id: "plant-environment",
      label: "Plant environment",
    });
    expect(shelfPacksAllSeasons(SHELF_DAY).some((pack) => pack.id === "autumn-garden")).toBe(false);
    expect(
      seasonBrowsePacks().some((pack) => pack.id === "autumn-garden")
    ).toBe(false);
    expect(shelfTier("autumn-garden")).toBeNull();
  });

  it("resolves every seasonShelf entry to a real pack", () => {
    for (const entry of seasonShelf) {
      expect(() => loadRawPack(entry.pack)).not.toThrow();
    }
  });

  it("resolves every seasonShelf `only` session id to a real session in its pack", () => {
    const packs = loadAllPacks();
    for (const entry of seasonShelf) {
      if (!entry.only) continue;
      const pack = packs.find((p) => p.id === entry.pack);
      expect(pack, `pack "${entry.pack}" not found`).toBeTruthy();
      const ids = new Set(pack!.sessions.map((s) => s.id));
      for (const wanted of entry.only) {
        expect(ids.has(wanted), `session "${wanted}" not in pack "${entry.pack}"`).toBe(true);
      }
    }
  });

  it("never returns an empty shelf section", () => {
    for (const pack of shelfPacksAllSeasons(SHELF_DAY)) {
      expect(pack.sessions.length, `shelf pack "${pack.id}" is empty`).toBeGreaterThan(0);
    }
  });

  it("no two sessions on the shelf share a title", () => {
    // #105 is closed, so this is now a plain assertion rather than a
    // documented exception. The autumn-starter rewrite is "Leaves and their
    // trees"; "A5 leaf collage" belongs to Johan's ported summer session
    // alone, and its title is held by scripts/verbatim-fidelity.mjs.
    //
    // If a duplicate is ever accepted again, name it in KNOWN below and in
    // scripts/validate-packs.mjs's matching set, rather than deleting the
    // check: a teacher scanning the shelf cannot tell two identically named
    // sessions apart, whatever the ids say.
    const KNOWN = new Set<string>();
    const titles = new Map<string, string[]>();
    for (const pack of shelfPacksAllSeasons(SHELF_DAY)) {
      for (const session of pack.sessions) {
        const list = titles.get(session.title) ?? [];
        list.push(session.id);
        titles.set(session.title, list);
      }
    }
    const collisions = [...titles.entries()]
      .filter(([, ids]) => ids.length > 1)
      .filter(([title]) => !KNOWN.has(title));
    expect(
      collisions,
      `shelf title collision(s): ${JSON.stringify(collisions)}`
    ).toEqual([]);
  });
});
