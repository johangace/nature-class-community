#!/usr/bin/env node
// License audit: every production dependency (transitive included) must carry
// a license from the allowlist below. Runs in CI; exits non-zero on violation.
// Walks the installed production dependency graph starting from package.json
// "dependencies", resolving each package the way Node does (nearest
// node_modules, walking up), and reads each package's own package.json for
// its declared license. No dependencies of its own.
//
// SCOPE: NEITHER. This reads dependency metadata in node_modules — no prose,
// house or founder. It does not open `packs/` or `fixtures/` and has no
// business doing so. Listed here because every check in this repo now says
// whose writing it governs; see `scripts/authorship.mjs` for why.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWLIST = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  // Reviewed additions (both AGPL-3.0 compatible):
  // caniuse-lite ships CC-BY-4.0 browser-support data via Next.js.
  "CC-BY-4.0",
  // sharp's prebuilt libvips binaries (Next.js image optimization) are LGPL.
  "LGPL-3.0-or-later",
];

const allowed = new Set(ALLOWLIST.map((l) => l.toLowerCase()));

function licenseAllowed(license) {
  if (!license) return false;
  // Normalize legacy object form: { type: "MIT", url: ... }
  if (typeof license === "object") license = license.type ?? "";
  const value = String(license).trim();
  if (allowed.has(value.toLowerCase())) return true;
  // Simple SPDX expressions: OR passes if any branch is allowed,
  // AND requires every part allowed.
  const stripped = value.replace(/^\(|\)$/g, "");
  if (/\sOR\s/i.test(stripped)) {
    return stripped.split(/\sOR\s/i).some((p) => allowed.has(p.trim().toLowerCase()));
  }
  if (/\sAND\s/i.test(stripped)) {
    return stripped.split(/\sAND\s/i).every((p) => allowed.has(p.trim().toLowerCase()));
  }
  return false;
}

// Resolve a package the way Node does: nearest node_modules first, then up.
function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  while (true) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }
  const fallback = join(root, "node_modules", name);
  return existsSync(join(fallback, "package.json")) ? fallback : null;
}

const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const queue = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({
  name,
  fromDir: root,
  optional: false,
}));

const visited = new Set();
const violations = [];
const missing = [];
let checked = 0;

while (queue.length > 0) {
  const { name, fromDir, optional } = queue.shift();
  const pkgDir = resolvePackageDir(name, fromDir);
  if (!pkgDir) {
    // Optional deps (e.g. platform-specific binaries) may legitimately be
    // absent; anything else missing means the install is broken.
    if (!optional) missing.push(name);
    continue;
  }
  if (visited.has(pkgDir)) continue;
  visited.add(pkgDir);
  checked += 1;

  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const license = manifest.license ?? manifest.licenses?.[0]?.type;
  if (!licenseAllowed(license)) {
    violations.push({ name: manifest.name ?? name, license: license ?? "(none declared)" });
  }

  for (const dep of Object.keys(manifest.dependencies ?? {})) {
    queue.push({ name: dep, fromDir: pkgDir, optional });
  }
  for (const dep of Object.keys(manifest.optionalDependencies ?? {})) {
    queue.push({ name: dep, fromDir: pkgDir, optional: true });
  }
}

if (missing.length > 0) {
  console.error(`License audit FAILED. Missing installed packages (run npm ci?): ${missing.join(", ")}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`License audit FAILED. ${violations.length} package(s) outside allowlist:`);
  for (const v of violations) {
    console.error(`  - ${v.name}: ${JSON.stringify(v.license)}`);
  }
  console.error(`Allowlist: ${ALLOWLIST.join(", ")}`);
  process.exit(1);
}

console.log(`License audit passed: ${checked} production packages, all within allowlist.`);
