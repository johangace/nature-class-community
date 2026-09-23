#!/usr/bin/env node
/**
 * Produce a clean, local Nature Class Community source tree from one exact git commit.
 *
 * This script deliberately does NOT create a repository, add a remote, push, publish,
 * deploy, or change repository visibility. Those are founder-gated outward actions.
 *
 * The export is conservative: it copies the runtime/source tree named by
 * scripts/community-export-manifest.json and excludes only clearly private/non-runtime
 * areas. Final publication still requires #525, #1314, #1315 and #1316.
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = join(ROOT, "scripts", "community-export-manifest.json");
export const RECEIPT_FILE = "COMMUNITY_SOURCE.json";

function normalizePath(value) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function isUnder(path, root) {
  const p = normalizePath(path);
  const r = normalizePath(root);
  return Boolean(r) && (p === r || p.startsWith(`${r}/`));
}

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error("community export manifest schemaVersion must be 1");

  for (const key of ["includeRoots", "includeFiles", "excludeRoots", "excludeFiles"]) {
    if (!Array.isArray(manifest?.[key])) throw new Error(`community export manifest ${key} must be an array`);
    const normalized = manifest[key].map(normalizePath);
    if (normalized.some((item) => !item || item.startsWith("../") || item.includes("/../"))) {
      throw new Error(`community export manifest ${key} contains an unsafe path`);
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new Error(`community export manifest ${key} contains duplicate paths`);
    }
  }

  for (const privateRoot of [".claude", ".github", "docs"]) {
    if (!manifest.excludeRoots.map(normalizePath).includes(privateRoot)) {
      throw new Error(`community export manifest must exclude ${privateRoot}`);
    }
  }

  for (const privateFile of ["PORT-LOG.md", "CLA.md", "CONTRIBUTING.md"]) {
    if (!manifest.excludeFiles.map(normalizePath).includes(privateFile)) {
      throw new Error(`community export manifest must exclude ${privateFile}`);
    }
  }

  const overlays = manifest.overlays ?? {};
  if (typeof overlays !== "object" || Array.isArray(overlays)) {
    throw new Error("community export manifest overlays must be an object of public path -> source path");
  }
  for (const [target, source] of Object.entries(overlays)) {
    for (const path of [target, source]) {
      const p = normalizePath(path);
      if (!p || p.startsWith("../") || p.includes("/../") || isAbsolute(p)) {
        throw new Error(`community export manifest overlay contains an unsafe path: ${path}`);
      }
    }
  }

  if (manifest.denylist !== undefined && typeof manifest.denylist !== "string") {
    throw new Error("community export manifest denylist must be a repository path");
  }

  return manifest;
}

/**
 * Files copied from one path in the source tree to another in the export.
 *
 * The public root needs its own README, notices and security policy; the
 * private README links into docs that do not ship. Keeping the public copies
 * under an unexported folder and placing them here means neither README can
 * silently become the other.
 */
export function selectOverlayEntries(entries, manifest) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  return Object.entries(manifest.overlays ?? {})
    .map(([target, source]) => {
      const entry = byPath.get(normalizePath(source));
      if (!entry) throw new Error(`community export overlay source is missing from the tree: ${source}`);
      return { ...entry, path: normalizePath(target), source: entry.path };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

const BINARY = /\.(mp3|png|jpe?g|webp|gif|ico|ttf|woff2?|pdf)$/i;

/**
 * The fail-closed content guard.
 *
 * Rules name what must never be published (a real person's name, a link to
 * the private repository) and live in a file under an unexported root, so the
 * list itself does not ship. A rule may skip roots where the same text is
 * required attribution, such as a CC BY photographer's name in reference data.
 *
 * @param {{ path: string, text: string }[]} files
 * @param {{ rules: { name: string, pattern: string, flags?: string, roots?: string[], skipRoots?: string[] }[] }} denylist
 * @returns {{ rule: string, path: string, line: number }[]}
 */
export function findDenylistHits(files, denylist) {
  const hits = [];
  for (const rule of denylist?.rules ?? []) {
    const re = new RegExp(rule.pattern, rule.flags ?? "");
    for (const { path, text } of files) {
      if (rule.roots && !rule.roots.some((root) => isUnder(path, root))) continue;
      if ((rule.skipRoots ?? []).some((root) => isUnder(path, root))) continue;
      text.split("\n").forEach((line, index) => {
        if (re.test(line)) hits.push({ rule: rule.name, path, line: index + 1 });
      });
    }
  }
  return hits;
}

export function shouldExport(path, manifest) {
  const p = normalizePath(path);
  const excluded =
    manifest.excludeFiles.map(normalizePath).includes(p) ||
    manifest.excludeRoots.some((root) => isUnder(p, root));
  if (excluded) return false;

  return (
    manifest.includeFiles.map(normalizePath).includes(p) ||
    manifest.includeRoots.some((root) => isUnder(p, root))
  );
}

export function selectExportEntries(entries, manifest) {
  validateManifest(manifest);
  return entries
    .filter((entry) => shouldExport(entry.path, manifest))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function git(args, { cwd = ROOT, encoding = "utf8" } = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function resolveSourceSha(ref = "HEAD", runner = git) {
  return String(runner(["rev-parse", "--verify", `${ref}^{commit}`])).trim();
}

export function parseLsTree(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer ?? "");
  return text
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf("\t");
      if (tab < 0) throw new Error(`unexpected git ls-tree record: ${record}`);
      const [mode, type, object] = record.slice(0, tab).split(" ");
      return { mode, type, object, path: normalizePath(record.slice(tab + 1)) };
    });
}

export function listTree(sourceSha, runner = git) {
  return parseLsTree(runner(["ls-tree", "-r", "-z", sourceSha], { encoding: null }));
}

function assertDestination(dest) {
  const resolved = resolve(dest);
  const rel = relative(ROOT, resolved);
  const insideSource = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (insideSource) {
    throw new Error("community export destination must be outside the private working repository");
  }

  if (existsSync(resolved) && readdirSync(resolved).length > 0) {
    throw new Error(`community export destination is not empty: ${resolved}`);
  }
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

function writeEntry({ entry, sourceSha, dest, runner = git }) {
  if (entry.type !== "blob") {
    throw new Error(`community export refuses non-blob entry ${entry.path} (${entry.type})`);
  }
  if (entry.mode === "120000" || entry.mode === "160000") {
    throw new Error(`community export refuses symlink/submodule entry ${entry.path}`);
  }

  const target = join(dest, entry.path);
  mkdirSync(dirname(target), { recursive: true });
  const blob = runner(["show", `${sourceSha}:${entry.path}`], { encoding: null });
  writeFileSync(target, blob);
  if (entry.mode === "100755") chmodSync(target, 0o755);
}

function parseArgs(argv) {
  const args = { ref: "HEAD", dest: "", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dest") args.dest = argv[++i] ?? "";
    else if (arg === "--ref" || arg === "--sha") args.ref = argv[++i] ?? "";
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run community:export -- --dest /absolute/empty/path [--ref <commit-ish>]",
    "  npm run community:export -- --dry-run [--ref <commit-ish>]",
    "",
    "The command only writes a local clean tree. It never creates or publishes a repository.",
  ].join("\n");
}

export function buildReceipt({ sourceSha, entries, overlays = [] }) {
  const all = [...entries, ...overlays].sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: 1,
    sourceSha,
    manifest: "scripts/community-export-manifest.json",
    fileCount: all.length,
    files: all.map((entry) => entry.path),
    overlays: Object.fromEntries(overlays.map((entry) => [entry.path, entry.source])),
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.dryRun && !args.dest) throw new Error("--dest is required unless --dry-run is used");

  const sourceSha = resolveSourceSha(args.ref || "HEAD");
  // The manifest at the exported commit, not the working tree, so the same
  // SHA always exports the same tree whatever is checked out.
  const manifest = validateManifest(JSON.parse(String(git(["show", `${sourceSha}:scripts/community-export-manifest.json`]))));
  const tree = listTree(sourceSha);
  const entries = selectExportEntries(tree, manifest);
  const overlays = selectOverlayEntries(tree, manifest);

  if (entries.length === 0) throw new Error("community export selected zero files");
  const collision = overlays.find((overlay) => entries.some((entry) => entry.path === overlay.path));
  if (collision) throw new Error(`community export overlay would overwrite an exported file: ${collision.path}`);

  if (manifest.denylist) {
    const denylist = JSON.parse(String(git(["show", `${sourceSha}:${normalizePath(manifest.denylist)}`])));
    const files = [...entries, ...overlays]
      .filter((entry) => !BINARY.test(entry.path))
      .map((entry) => ({ path: entry.path, text: String(git(["show", `${sourceSha}:${entry.source ?? entry.path}`])) }));
    const hits = findDenylistHits(files, denylist);
    if (hits.length > 0) {
      throw new Error(
        `${hits.length} denylisted line(s) would be published:\n` +
          hits.map((hit) => `  ${hit.path}:${hit.line}  (${hit.rule})`).join("\n")
      );
    }
  }

  const receipt = buildReceipt({ sourceSha, entries, overlays });

  if (args.dryRun) {
    console.log(JSON.stringify(receipt, null, 2));
    return 0;
  }

  const dest = assertDestination(args.dest);
  for (const entry of entries) writeEntry({ entry, sourceSha, dest });
  for (const overlay of overlays) {
    const target = join(dest, overlay.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, git(["show", `${sourceSha}:${overlay.source}`], { encoding: null }));
  }

  writeFileSync(join(dest, RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  console.log(
    [
      `Nature Class Community source tree written to ${dest}`,
      `source SHA: ${sourceSha}`,
      `files: ${entries.length}`,
      `receipt: ${join(dest, RECEIPT_FILE)}`,
      "No repository was created, no remote was configured, and nothing was published.",
    ].join("\n")
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`community export REFUSED: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}
