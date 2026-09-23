#!/usr/bin/env node
/**
 * The render-diff proof for the node-id mint (office#330 §8, deliverable 3).
 *
 *   npm run packs:prove-node-ids
 *
 * THE CLAIM UNDER TEST
 *
 * Minting a `nid` onto every phase, block, variant and tip, and a `nodeSeq`
 * onto every session, changed NOTHING a teacher or a child can see. 1,982 ids
 * went into nine pack files in one pass; "I read the diff and it looked like
 * additions" is not a proof of that, and the diff is 2,043 lines long.
 *
 * HOW IT PROVES IT
 *
 * It builds each artifact TWICE from the same code — once from the packs as
 * they are, once from a temporary copy with every `nid` and `nodeSeq` stripped
 * back out — and compares. Not a recorded before-and-after: a before that lives
 * in a commit message is a number nobody can re-derive, and this has to stay
 * re-runnable after the next pack edit, when a real regression would look
 * exactly like this one did.
 *
 * Two artifacts, because they are the two ends of the range:
 *
 *   preview narration  every word the lesson preview SPEAKS, for all 61
 *                      sessions, through the app's own loader. If a word
 *                      moved, it moved here.
 *   offline core       the public release artifact, which embeds whole
 *                      sessions and fingerprints them. The broadest possible
 *                      surface: anything that reaches a device reaches this.
 *
 * THE MODEL IS NOT INVOLVED, and that is a property rather than a setting.
 * Neither builder can reach it: `lib/lesson/preview.ts` imports only the pack
 * types, `lib/offline/core-release.ts` imports the loader and the hazard
 * table, and neither calls `adaptSessionForPlace`. There is no key to unset and
 * no flag to remember, which is why this proof is reproducible and a proof
 * over a rendered `/read` page would not be.
 *
 * WHAT IT EXPECTS TO FIND, AND WHAT IT REFUSES TO
 *
 * The narration must be byte-identical. It is: the ids are not text, and
 * nothing in the preview reads them.
 *
 * The offline core's content and fingerprint must both remain identical.
 * Identity metadata is projected out at the public release boundary. A change
 * to either representation is a failing readiness check, not a warning.
 *
 * SCOPE: NEITHER HOUSE NOR FOUNDER (see scripts/authorship.mjs). It compares
 * two builds of the same strings against each other and holds no opinion about
 * any of them.
 */

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EMIT = process.argv.includes("--emit");

/** Fields that are identity bookkeeping rather than content. */
const IDENTITY_FIELDS = new Set(["nid", "nodeSeq"]);

/** The same key-sorted serialisation `core-release.ts` fingerprints with. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The same value with every identity field removed, at every depth. */
function withoutIdentity(value) {
  if (Array.isArray(value)) return value.map(withoutIdentity);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (IDENTITY_FIELDS.has(key)) continue;
    out[key] = withoutIdentity(child);
  }
  return out;
}

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Read every artifact this proof compares, from the packs in the CURRENT
 * WORKING DIRECTORY. `lib/pack.ts` resolves `packs/` off `process.cwd()`, which
 * is what lets the stripped half of the comparison be a temporary directory
 * holding nothing but pack files.
 */
async function emit() {
  const { buildCoreLessonRelease } = await import("../lib/offline/core-release.ts");
  const { serialiseManifest } = await import("./build-preview-narration.mjs");

  const release = buildCoreLessonRelease({ generatedAt: new Date(0) });
  const narration = serialiseManifest();

  return {
    contentFingerprint: release.contentFingerprint,
    sessionCount: Object.keys(release.sessions).length,
    /** Content only: what the release would fingerprint if identity did not ride along. */
    contentWithoutIdentity: sha(
      canonical({
        shelf: withoutIdentity(release.shelf),
        sessions: withoutIdentity(release.sessions),
        retiredSessionIds: release.retiredSessionIds,
        universalSafety: release.universalSafety,
      })
    ),
    narrationSha: sha(narration),
    narrationBytes: Buffer.byteLength(narration),
  };
}

function emitIn(cwd) {
  // `--import tsx` resolves the loader against the CHILD's cwd, and the
  // stripped half of this comparison runs in a temp directory with no
  // node_modules. Resolve it here, absolutely, from this file's own install.
  const tsx = import.meta.resolve("tsx");
  const result = spawnSync(
    process.execPath,
    ["--import", tsx, fileURLToPath(import.meta.url), "--emit"],
    { cwd, encoding: "utf8", env: { ...process.env } }
  );
  if (result.status !== 0) {
    throw new Error(
      `emit failed in ${cwd} (exit ${result.status}):\n${result.stderr || result.stdout}`
    );
  }
  const line = result.stdout.trim().split("\n").pop();
  return JSON.parse(line);
}

/**
 * A directory holding the pack files with every identity field stripped out.
 *
 * It also carries a one-line tsconfig pointing `@/*` back at the REAL repo,
 * which is what makes this a comparison of packs rather than of trees: the
 * child runs with its cwd here, so `lib/pack.ts` reads these stripped packs
 * (it resolves `packs/` off `process.cwd()`), while every `@/` import still
 * resolves to the same source files the first half ran. One variable moves.
 */
function strippedPacks() {
  const dir = mkdtempSync(join(tmpdir(), "nc-node-id-proof-"));
  const packs = join(dir, "packs");
  mkdirSync(packs);
  writeFileSync(
    join(dir, "tsconfig.json"),
    `${JSON.stringify(
      { compilerOptions: { baseUrl: ".", paths: { "@/*": [`${root}/*`] } } },
      null,
      2
    )}\n`,
    "utf8"
  );
  const source = join(root, "packs");
  for (const entry of readdirSync(source)) {
    if (entry.endsWith(".json")) {
      const parsed = JSON.parse(readFileSync(join(source, entry), "utf8"));
      writeFileSync(
        join(packs, entry),
        `${JSON.stringify(withoutIdentity(parsed), null, 2)}\n`,
        "utf8"
      );
    } else {
      cpSync(join(source, entry), join(packs, entry), { recursive: true });
    }
  }
  return dir;
}

function main() {
  const withIds = emitIn(root);
  const sandbox = strippedPacks();
  let withoutIds;
  try {
    withoutIds = emitIn(sandbox);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  const problems = [];

  if (withIds.narrationSha !== withoutIds.narrationSha) {
    problems.push(
      `the preview narration MOVED. With ids: ${withIds.narrationSha} ` +
        `(${withIds.narrationBytes} bytes). Without: ${withoutIds.narrationSha} ` +
        `(${withoutIds.narrationBytes} bytes). A node id is not text and nothing in ` +
        `lib/lesson/preview.ts reads one, so a difference here means the mint changed ` +
        `a session's SHAPE — a reordered array, a dropped field — not just its handles.`
    );
  }

  if (withIds.contentWithoutIdentity !== withoutIds.contentWithoutIdentity) {
    problems.push(
      `the offline core's CONTENT moved, with ids discounted on both sides: ` +
        `${withIds.contentWithoutIdentity} against ${withoutIds.contentWithoutIdentity}. ` +
        `Something other than nid/nodeSeq changed in the packs.`
    );
  }

  if (withIds.sessionCount !== withoutIds.sessionCount) {
    problems.push(
      `the release holds ${withIds.sessionCount} session(s) with ids and ` +
        `${withoutIds.sessionCount} without.`
    );
  }

  console.log("Node-id invisibility proof");
  console.log(`  preview narration    with ids  ${withIds.narrationSha}`);
  console.log(`                       without   ${withoutIds.narrationSha}`);
  console.log(
    `                       ${
      withIds.narrationSha === withoutIds.narrationSha
        ? "BYTE-IDENTICAL — no spoken word moved"
        : "DIFFERENT"
    }`
  );
  console.log(`  offline core content with ids  ${withIds.contentWithoutIdentity}`);
  console.log(`                       without   ${withoutIds.contentWithoutIdentity}`);
  console.log(
    `                       ${
      withIds.contentWithoutIdentity === withoutIds.contentWithoutIdentity
        ? "IDENTICAL — nothing but nid/nodeSeq differs"
        : "DIFFERENT"
    }`
  );
  console.log(`  contentFingerprint   with ids  ${withIds.contentFingerprint}`);
  console.log(`                       without   ${withoutIds.contentFingerprint}`);

  if (withIds.contentFingerprint !== withoutIds.contentFingerprint) {
    problems.push("the public core fingerprint moved: project identity metadata out before publishing");
  }

  if (problems.length > 0) {
    console.error(`\nNode-id invisibility proof FAILED. ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `\nProof passed: the mint changed no spoken word and no released content across ` +
      `${withIds.sessionCount} released session(s).`
  );
}

if (EMIT) {
  emit().then((payload) => console.log(JSON.stringify(payload)));
} else {
  main();
}
