import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createGuardSandbox, REPO_ROOT } from "../support/guard-sandbox";

/**
 * THE SUITE MAY NOT WRITE THE CURRICULUM (nc#651).
 *
 * `packs/*.json` is the grant content. `fixtures/source-rows/` is the ported
 * source of truth the verbatim guard measures against. Both were being written
 * IN PLACE by mutation tests — damaged, checked, restored — which cost two
 * different things:
 *
 *   RANDOM FAILURES ELSEWHERE. vitest runs spec files in parallel and
 *   `loadPack()` reads a pack off disk on every call, so any other spec could
 *   read a pack mid-write. On clean `main`, `season-turns.spec.ts` failed with
 *   `SyntaxError: Unexpected end of JSON input` in a full run and passed 13/13
 *   on its own — the "which test fails changes run to run" this ticket names.
 *
 *   A REAL RISK TO SHIPPED CONTENT. A run killed between the write and the
 *   restore leaves a truncated pack in the working tree.
 *
 * This spec is the proof, and it is deliberately not a lint over source text.
 * It finds every spec file that can mutate the filesystem at all, runs exactly
 * those in a child vitest, and compares the guarded trees byte for byte AND
 * mtime for mtime across the run. It fails on the code as it was before the
 * sandbox landed, because `packs/summer.json` and `packs/autumn-garden.json`
 * really were rewritten; it passes now because the mutation happens in a temp
 * directory instead.
 *
 * It stays honest as the suite grows: a spec file added tomorrow that imports
 * a mutating `node:fs` call is discovered here without anyone updating a list.
 */

/**
 * The child vitest run is real work (real git repositories, real guard
 * processes) and this file's own cost is process spawning. Five seconds is
 * vitest's default and is not an honest budget for it on a loaded machine.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** The trees a spec must never write into. */
const GUARDED = ["packs", "fixtures", "scripts/lib"];

/** `node:fs` calls that can change what is on disk. */
const MUTATORS = [
  "writeFileSync",
  "appendFileSync",
  "unlinkSync",
  "rmSync",
  "rmdirSync",
  "renameSync",
  "copyFileSync",
  "cpSync",
  "truncateSync",
  "mkdirSync",
  "symlinkSync",
  "utimesSync",
];

const SPEC_DIRS = ["tests/unit", "tests/integration"];

function walk(dir: string, out: string[] = [], dirs?: string[]): string[] {
  dirs?.push(dir);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, dirs);
    else out.push(full);
  }
  return out;
}

/** Every spec file that imports something able to write to disk. */
function specsThatCanWrite(): string[] {
  const self = join(REPO_ROOT, "tests/unit/packs-survive-the-suite.spec.ts");
  return SPEC_DIRS.flatMap((dir) => walk(join(REPO_ROOT, dir)))
    .filter((f) => /\.spec\.tsx?$/.test(f) && f !== self)
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes("node:fs") && MUTATORS.some((m) => src.includes(m));
    })
    .sort();
}

/** Path -> what it is right now: size, digest, and the clock stamp a write moves. */
function census(): Map<string, string> {
  const seen = new Map<string, string>();
  for (const tree of GUARDED) {
    const dirs: string[] = [];
    for (const file of walk(join(REPO_ROOT, tree), [], dirs)) {
      const stat = statSync(file);
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      seen.set(relative(REPO_ROOT, file), `${stat.size} ${stat.mtimeMs} ${digest}`);
    }
    // Every directory's stamp too, so a file created and deleted inside the run
    // — the stray-fixture mutation test — cannot pass unnoticed.
    for (const dir of dirs) seen.set(`${relative(REPO_ROOT, dir)}/`, String(statSync(dir).mtimeMs));
  }
  return seen;
}

function diff(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((p) => before.get(p) !== after.get(p))
    .map((p) => `${p}: ${before.get(p) ?? "(absent)"} -> ${after.get(p) ?? "(absent)"}`)
    .sort();
}

describe("the shipped curriculum survives its own test suite", () => {
  it("is untouched by every spec that can write to disk", () => {
    const specs = specsThatCanWrite();
    // If this ever finds nothing, the discovery has broken, not the repo.
    expect(specs.length).toBeGreaterThan(0);

    const before = census();
    const result = execFileSync(
      "node",
      ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...specs.map((s) => relative(REPO_ROOT, s))],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } }
    );
    const after = census();

    expect(diff(before, after), `these specs rewrote guarded content:\n${result}`).toEqual([]);
  });

  it("mutation-tests a guard somewhere that is not this repository", () => {
    // The structural half of the same claim: a sandbox is a real directory,
    // holding real copies, and it is nowhere inside the working tree.
    const sandbox = createGuardSandbox("sandbox-location");
    try {
      expect(sandbox.dir.startsWith(REPO_ROOT)).toBe(false);
      expect(sandbox.read("packs/summer.json")).toBe(
        readFileSync(join(REPO_ROOT, "packs/summer.json"), "utf8")
      );
      sandbox.write("packs/summer.json", "{}");
      expect(sandbox.read("packs/summer.json")).toBe("{}");
      expect(readFileSync(join(REPO_ROOT, "packs/summer.json"), "utf8")).not.toBe("{}");
    } finally {
      sandbox.dispose();
    }
  });
});
