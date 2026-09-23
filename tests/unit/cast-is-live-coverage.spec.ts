import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasRecentObservationEvidence } from "@/lib/cast/resolve";

/**
 * THE CAST IS READ FROM NOW, AND FROM NOWHERE ELSE (#284).
 *
 * This file replaces `cast-refresh-upgrade-contract.spec.ts`, which guarded
 * the opposite invariant: that a class's cast was stored once and upgraded by
 * a deliberate teacher refresh. Johan's ruling on 2026-08-17 ended that model,
 * so the old spec's assertions are not merely stale, they are backwards.
 *
 * ── WHY THIS IS A SOURCE SCAN ──────────────────────────────────────────────
 *
 * The same reason `place-wiring-coverage.spec.ts` is one. The failure mode
 * here is REACH, not behaviour: every behavioural test can pass while one
 * surface still reads `castMember` and quietly shows a teacher last March's
 * species list next to today's on the very next screen. Half-wired is worse
 * than unwired — unwired is one known bug, half-wired is the product
 * contradicting itself between the page she prepares from and the page she
 * leads from.
 *
 * So the guard is about the source: no application code may read or write the
 * stored cast at all. When someone reintroduces one on a Friday, this goes red
 * and names the file.
 */

const ROOTS = ["app", "lib"];

/** Reading or writing the frozen species store. Any of these is the failure. */
const TOUCHES_STORED_CAST =
  /\b(prisma\.castMember|resolveAndStoreCast|getStoredCast|storeCast)\s*[.(]/;

/**
 * Files allowed to name the stored cast, and why. A file earns a place here by
 * documenting the retired model, never by still using it.
 */
const EXEMPT: Record<string, string> = {
  "lib/cast/index.ts":
    "Carries the written record of why the storage layer was removed, naming the four functions it used to export so the history is readable at the place it used to live. Exports none of them.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no surface reads a stored cast", () => {
  const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root))).map((path) => ({
    rel: path.slice(process.cwd().length + 1),
    source: readFileSync(path, "utf8"),
  }));

  it("finds the application source at all, so the scan cannot pass vacuously", () => {
    expect(files.length).toBeGreaterThan(50);
    // And the matcher works: it finds the pattern in a string that has it.
    expect(TOUCHES_STORED_CAST.test("await prisma.castMember.findMany({})")).toBe(true);
  });

  it("names any file that still reads or writes CastMember rows", () => {
    const touching = files
      .filter((file) => TOUCHES_STORED_CAST.test(file.source))
      .filter((file) => !(file.rel in EXEMPT))
      .map((file) => file.rel);

    // A named file here means a teacher can meet a frozen species list — one
    // resolved on a night Pointmoon had no photograph, carrying photoUrl null
    // forever — beside a live one. Resolve it from the current read instead.
    expect(touching).toEqual([]);
  });

  it("keeps every exemption pointed at a file that still exists, with a real reason", () => {
    const present = new Set(files.map((file) => file.rel));
    for (const [rel, reason] of Object.entries(EXEMPT)) {
      expect(present.has(rel), rel).toBe(true);
      expect(reason.length, rel).toBeGreaterThan(40);
    }
  });

  it("leaves no manual refresh control, because there is nothing to refresh", () => {
    const classesPage = readFileSync(join(process.cwd(), "app/classes/page.tsx"), "utf8");
    expect(classesPage).not.toContain("refreshClassCast");
    expect(classesPage).not.toContain("Refresh nearby nature");
    // And it says so, rather than silently dropping a control she used to use.
    expect(classesPage).toContain("read fresh every morning");
  });

  it("resolves the cast through the live path and holds it only in a TTL cache", () => {
    const live = readFileSync(join(process.cwd(), "lib/cast/live.ts"), "utf8");
    const read = readFileSync(join(process.cwd(), "lib/cast/read.ts"), "utf8");

    expect(read).toContain("resolveLiveCast");
    // A bounded, expiring memo — not a table. Both properties are load-bearing:
    // an unbounded cache is a leak and a cache without a TTL is a database.
    expect(live).toMatch(/RESOLVE_TTL_MS\s*=\s*[\d_]+/);
    expect(live).toMatch(/RESOLVE_CACHE_MAX\s*=\s*[\d_]+/);
    expect(live).not.toMatch(/prisma\.castMember/);
  });

  it("gets the regional observation tier from Pointmoon instead of a second iNaturalist pipeline", () => {
    const live = readFileSync(join(process.cwd(), "lib/cast/live.ts"), "utf8");

    expect(live).not.toContain("@/lib/outside/seasonal");
    expect(live).not.toContain("seasonalNearby");
    expect(live).toContain("observations?.historical?.nearby");
  });
});

describe("the evidence gate the resolver still holds", () => {
  it("does not mistake an empty observation list for present evidence", () => {
    // Kept from the retired spec because the function outlived the refresh
    // path that called it: `thin` on a live read means the same thing.
    expect(hasRecentObservationEvidence(null)).toBe(false);
    expect(
      hasRecentObservationEvidence({
        facts: {
          fieldSnapshot: {
            weather: { current: { skyCondition: "clear" } },
            observations: { nearby: [], birds: { notable: [] }, absent: [] },
          },
        },
      })
    ).toBe(false);
    expect(
      hasRecentObservationEvidence({
        facts: {
          fieldSnapshot: {
            observations: { nearby: [{ name: "Garden spider" }], birds: { notable: [] } },
          },
        },
      })
    ).toBe(true);
    expect(
      hasRecentObservationEvidence({
        facts: {
          fieldSnapshot: {
            observations: { nearby: [], birds: { notable: [{ name: "Robin" }] } },
          },
        },
      })
    ).toBe(true);
  });
});
