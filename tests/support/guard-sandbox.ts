import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A DISPOSABLE COPY OF THE REPOSITORY, for the guards that can only be proved
 * by breaking something (nc#651).
 *
 * `verbatim-fidelity.mjs` and `standards-lint.mjs` are mutation-tested: the
 * only way to show a guard bites is to damage the content it guards and watch
 * it exit non-zero. Those specs used to do that damage IN THE WORKING TREE —
 * `writeFileSync("packs/summer.json", ...)` — and restore it in a `finally`.
 *
 * Two things were wrong with that, and both were measured:
 *
 *   IT CORRUPTED OTHER SPECS. vitest runs spec files in parallel. `loadPack()`
 *   reads `packs/<id>.json` off disk on every call, so any of the ~150 other
 *   spec files could read a pack mid-write and get `SyntaxError: Unexpected end
 *   of JSON input`. That is the "a different test fails each run" symptom this
 *   ticket is named for: on clean `main`, `season-turns.spec.ts` failed that way
 *   in a full run and passed 13/13 alone.
 *
 *   IT COULD DESTROY SHIPPED CONTENT. `packs/*.json` is the curriculum. A run
 *   killed between the write and the restore — ^C, an OOM, a crashed worker —
 *   leaves a truncated grant pack on disk. No test suite should be able to do
 *   that to the product.
 *
 * So the mutation happens somewhere else entirely. This copies everything the
 * guards read into a fresh temp directory and runs them there, which is why
 * the working tree cannot be damaged rather than merely being restored
 * afterwards. Both guards cooperate without changing: `standards-lint.mjs`
 * reads relative paths (so `cwd` redirects it) and `verbatim-fidelity.mjs`
 * resolves from its own `import.meta.url` (so copying the script redirects it).
 *
 * A guard's GREEN case still runs against the real repository, read-only —
 * "passes on the packs as they ship" has to mean the packs that ship.
 *
 * This is not a new idea in this repository, which is the point: the CI-level
 * mutation harness `scripts/guard-mutation-check.mjs` has planted its
 * violations in a throwaway copy of the tree from the day it was written (its
 * `sandbox()`). The two vitest specs were the ones doing it in place. This is
 * the same discipline, sized for a spec file.
 */

/** The real repository root: the thing a guard spec must never write into. */
export const REPO_ROOT = join(__dirname, "..", "..");

/**
 * What a guard reads. `scripts/` because `verbatim-fidelity.mjs` resolves its
 * data relative to its own file, `packs/` and `fixtures/` because that is the
 * content under test.
 */
const COPIED = ["scripts", "packs", "fixtures"] as const;

export interface GuardSandbox {
  /** The sandbox root. Always outside REPO_ROOT — asserted by its own spec. */
  readonly dir: string;
  /** Absolute path to a repo-relative path inside the sandbox. */
  path(rel: string): string;
  read(rel: string): string;
  write(rel: string, body: string): void;
  edit(rel: string, mutate: (body: string) => string): void;
  exists(rel: string): boolean;
  remove(rel: string): void;
  /** Put every file this sandbox has touched back the way it was copied. */
  restore(): void;
  /** Run a repo script inside the sandbox and report what CI would act on. */
  run(scriptRel: string): { status: number; output: string };
  dispose(): void;
}

export function createGuardSandbox(label = "guard-sandbox"): GuardSandbox {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  for (const entry of COPIED) {
    cpSync(join(REPO_ROOT, entry), join(dir, entry), { recursive: true });
  }

  /** Pristine bodies, captured the first time a path is touched. */
  const originals = new Map<string, string | null>();
  const path = (rel: string) => join(dir, rel);
  const remember = (rel: string) => {
    if (originals.has(rel)) return;
    originals.set(rel, existsSync(path(rel)) ? readFileSync(path(rel), "utf8") : null);
  };

  return {
    dir,
    path,
    read: (rel) => readFileSync(path(rel), "utf8"),
    exists: (rel) => existsSync(path(rel)),
    write(rel, body) {
      remember(rel);
      writeFileSync(path(rel), body);
    },
    edit(rel, mutate) {
      remember(rel);
      writeFileSync(path(rel), mutate(readFileSync(path(rel), "utf8")));
    },
    remove(rel) {
      remember(rel);
      if (existsSync(path(rel))) unlinkSync(path(rel));
    },
    restore() {
      for (const [rel, body] of originals) {
        if (body === null) {
          if (existsSync(path(rel))) unlinkSync(path(rel));
        } else {
          writeFileSync(path(rel), body);
        }
      }
      originals.clear();
    },
    run(scriptRel) {
      try {
        const output = execFileSync("node", [path(scriptRel)], {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        return { status: 0, output };
      } catch (err) {
        const e = err as { status: number | null; stdout?: string; stderr?: string };
        return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
      }
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Run a repo script against the REAL repository, read-only. This is what a
 * guard's green case needs: the claim is about the content that ships, not
 * about a copy of it.
 */
export function runGuardOnRepo(scriptRel: string): { status: number; output: string } {
  try {
    const output = execFileSync("node", [join(REPO_ROOT, scriptRel)], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output };
  } catch (err) {
    const e = err as { status: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
