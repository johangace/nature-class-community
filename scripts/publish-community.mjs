#!/usr/bin/env node
/**
 * Publish one Nature Class Community release to the public repository.
 *
 *   npm run community:publish -- --dry-run   # show what would be published
 *   npm run community:publish                # publish it
 *
 * AGPL section 13 is met by the public source matching what production runs,
 * so by default the release is cut from the commit production reports at
 * /api/health, never from a branch tip. The steps:
 *
 * 1. Resolve that commit and check it is on origin/main.
 * 2. Export it with scripts/export-community.mjs, which applies the manifest,
 *    the overlays and the denylist guard, and refuses on any failure.
 * 3. Replace the public repository's tree with the export in one commit. The
 *    public history is one commit per release; nobody else writes to it.
 * 4. Credit everyone whose work reached this release (commit authors and
 *    Co-authored-by trailers since the last published source) as trailers on
 *    that commit, so a contributor whose pull request was ported back from the
 *    public repository is credited there.
 * 5. Tag the next patch version and push.
 *
 * Nothing is pushed if the export is identical to what is already published.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_REMOTE = "git@github.com:johangace/nature-class-community.git";
export const HEALTH_URL = "https://natureclass.education/api/health";
export const RELEASE_AUTHOR = { name: "Johan Gace", email: "45638957+johangace@users.noreply.github.com" };

/** Maintainers and machines, whose commits need no credit line. */
const NOT_CREDITED = [/johangace/i, /gace\.johan/i, /\[bot\]/i, /noreply@anthropic\.com/i, /noreply@openai\.com/i, /noreply@github\.com/i];

/** v1.0.0, v1.0.3 -> v1.0.4. No tags yet -> v1.0.0. */
export function nextVersion(tags) {
  const versions = tags
    .map((tag) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim()))
    .filter(Boolean)
    .map((m) => m.slice(1).map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const last = versions.at(-1);
  return last ? `v${last[0]}.${last[1]}.${last[2] + 1}` : "v1.0.0";
}

/**
 * `git log --format=%an <%ae>%n%(trailers:key=Co-authored-by,valueonly)` output
 * -> unique "Name <email>" people to credit, in first-seen order.
 */
export function contributorsFromLog(logText) {
  const seen = new Map();
  for (const raw of logText.split("\n")) {
    const line = raw.trim();
    const m = /^(.+?)\s*<([^>]+)>$/.exec(line);
    if (!m) continue;
    const person = `${m[1].trim()} <${m[2].trim()}>`;
    if (NOT_CREDITED.some((re) => re.test(person))) continue;
    const key = m[2].trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, person);
  }
  return [...seen.values()];
}

export function releaseMessage({ version, sourceSha, contributors }) {
  const lines = [
    `Nature Class Community ${version.replace(/^v/, "")}`,
    "",
    `Source: ${sourceSha} (see COMMUNITY_SOURCE.json),`,
    "the revision serving https://natureclass.education at release.",
  ];
  if (contributors.length) lines.push("", ...contributors.map((c) => `Co-authored-by: ${c}`));
  return `${lines.join("\n")}\n`;
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options });
}

async function productionSha() {
  const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(15_000) });
  const body = await res.json();
  if (!/^[0-9a-f]{40}$/.test(body?.sha ?? "")) throw new Error(`${HEALTH_URL} did not report a commit`);
  return body.sha;
}

function parseArgs(argv) {
  const args = { dryRun: false, sha: "", remote: PUBLIC_REMOTE };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--sha") args.sha = argv[++i] ?? "";
    else if (argv[i] === "--remote") args.remote = argv[++i] ?? "";
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  run("git", ["fetch", "-q", "origin", "main"]);
  const sourceSha = args.sha || (await productionSha());
  try {
    run("git", ["merge-base", "--is-ancestor", sourceSha, "origin/main"]);
  } catch {
    throw new Error(`${sourceSha} is not on origin/main; publish only what main has released`);
  }

  const work = mkdtempSync(join(tmpdir(), "nc-community-publish-"));
  try {
    const exportDir = join(work, "export");
    const publicDir = join(work, "public");
    run("node", [join(ROOT, "scripts", "export-community.mjs"), "--dest", exportDir, "--ref", sourceSha], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    run("git", ["clone", "-q", args.remote, publicDir]);

    const tags = run("git", ["tag", "--list"], { cwd: publicDir }).split("\n").filter(Boolean);
    const version = nextVersion(tags);
    let previousSha = "";
    try {
      previousSha = JSON.parse(readFileSync(join(publicDir, "COMMUNITY_SOURCE.json"), "utf8")).sourceSha ?? "";
    } catch {
      /* first release */
    }

    for (const name of readdirSync(publicDir)) if (name !== ".git") rmSync(join(publicDir, name), { recursive: true, force: true });
    cpSync(exportDir, publicDir, { recursive: true });
    run("git", ["add", "-A"], { cwd: publicDir });
    const changed = run("git", ["status", "--porcelain"], { cwd: publicDir }).trim();
    if (!changed) {
      console.log(`Already published: the public repository matches ${sourceSha}.`);
      return 0;
    }

    const range = previousSha ? [`${previousSha}..${sourceSha}`] : [sourceSha];
    const log = run("git", ["log", "--format=%an <%ae>%n%(trailers:key=Co-authored-by,valueonly)", ...range]);
    const contributors = contributorsFromLog(log);
    const message = releaseMessage({ version, sourceSha, contributors });

    console.log(`${version} from ${sourceSha} (previous ${previousSha || "none"})`);
    console.log(changed.split("\n").length + " path(s) change; credited: " + (contributors.join(", ") || "none"));
    if (args.dryRun) {
      console.log("\n" + message + "\nDry run: nothing was committed or pushed.");
      return 0;
    }

    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: RELEASE_AUTHOR.name,
      GIT_AUTHOR_EMAIL: RELEASE_AUTHOR.email,
      GIT_COMMITTER_NAME: RELEASE_AUTHOR.name,
      GIT_COMMITTER_EMAIL: RELEASE_AUTHOR.email,
    };
    run("git", ["commit", "-q", "-F", "-"], { cwd: publicDir, env, input: message, stdio: ["pipe", "pipe", "inherit"] });
    run("git", ["tag", "-a", version, "-m", `Nature Class Community ${version.slice(1)}`], { cwd: publicDir, env });
    run("git", ["push", "-q", "origin", "main", "--follow-tags"], { cwd: publicDir, stdio: ["ignore", "inherit", "inherit"] });
    console.log(`Published ${version}: https://github.com/johangace/nature-class-community/releases/tag/${version}`);
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => (process.exitCode = code),
    (error) => {
      console.error(`community publish REFUSED: ${error.message}`);
      process.exitCode = 1;
    }
  );
}
