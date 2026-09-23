#!/usr/bin/env node
/**
 * Mint stable node ids across every pack (office#330 §4, "Stable identity").
 *
 *   npm run packs:mint-node-ids            # assign what is missing, in place
 *   npm run packs:mint-node-ids -- --check # assign nothing; fail if anything is missing
 *
 * WHY IDENTITY COMES FIRST
 *
 * Every output this product derives from a lesson is derived from PARTICULAR
 * LINES: a worksheet from the collect-count block, an audio clip from the
 * spoken line, a prepared day from the phases it rewrote. The only handle any
 * of them has today is a positional path — `phases[1].blocks[2].text` — and a
 * position is not an identity. `applyEdit` in the Studio splices an array
 * element out on an empty-string edit, every later index shifts, and the
 * stored path now names a different sentence with nothing anywhere going red.
 *
 * So a dependency recorded at lesson level marks a whole lesson stale on every
 * small edit, and a dependency recorded positionally quietly points at the
 * wrong line. Node ids are the third option, and they are the thing every
 * later slice keys on.
 *
 * WHAT THIS ASSIGNS
 *
 * A `nid` on every phase, block, condition variant and phase tip
 * (`NODE_ID_PATTERN` in schema/pack.ts), and a `nodeSeq` high-water mark on
 * every session.
 *
 * THE RULES, and each one is a property the check in scripts/validate-packs.mjs
 * holds shut afterwards:
 *
 *   1. AN EXISTING ID IS NEVER REASSIGNED. This script only ever fills a node
 *      that has none. That is what makes a re-run a no-op and what makes the
 *      id survive the next edit, which is the entire point of minting it.
 *   2. ONE COUNTER PER SESSION, shared by all four kinds, so the number alone
 *      is unique within the session and `nodeSeq` means something a check can
 *      hold. The letter says what kind of node it is; it is not a namespace.
 *   3. THE COUNTER NEVER GOES BACKWARDS. It starts at the higher of the
 *      session's recorded `nodeSeq` and the largest number already in the
 *      tree, so an id freed by a deleted node is never handed out again.
 *   4. DETERMINISTIC ORDER: pack files sorted by name, sessions in authored
 *      order, then each phase depth-first in document order — the phase, its
 *      tips, its blocks, then each condition variant and the phase inside it —
 *      and the child sheet last. Running this twice on the same tree produces
 *      the same file, byte for byte.
 *
 * WHAT IT DOES NOT TOUCH
 *
 * `packs/settle.json`. It is not a pack: it is ONE shared settling phase that
 * `loadPack` prepends to every session that opts in, so its nodes have no
 * single session to be unique within, and one id on it would arrive inside
 * eleven different sessions at once. Addressing a shared node needs a
 * namespace of its own and that decision is not this change's to make; the
 * validation below states the exclusion rather than leaving it as a silence.
 *
 * SEQUENCING. Every object in schema/pack.ts is `.strict()`, and the Studio
 * validates each draft by importing that file out of a nature-class checkout,
 * so the schema change must be merged before any pack carries a `nid` or the
 * Studio rejects the packs it is editing. This script therefore lands in the
 * same change as the schema and is run once the schema is in.
 *
 * It also invalidates every open Studio draft's revision: `revisionOf` is a
 * sha256 over the whole session, and this rewrites every session. Run it when
 * no drafts are open.
 *
 * SCOPE: NEITHER HOUSE NOR FOUNDER (see scripts/authorship.mjs). It reads no
 * prose and writes none. It adds machine handles beside the text and reorders
 * nothing, which is why the render-diff proof
 * (`scripts/node-id-invisibility.mjs`) can hold it to byte-identical output.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NODE_ID_PATTERN, nodeIdKinds } from "../schema/pack.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = join(root, "packs");

/** Not a pack: one shared phase with no session to be unique within. */
export const NOT_A_PACK = "settle.json";

const CHECK = process.argv.includes("--check");

/**
 * Rewrite the pack so `nid` reads FIRST on every object that has one, and
 * `nodeSeq` sits where the schema declares it, immediately above `phases`.
 *
 * Purely for the diff, and it is a whole separate pass rather than something
 * the mint does inline for a reason worth stating: the mint walks a tree of
 * slots it has already collected, so replacing an object mid-walk detaches
 * every slot recorded inside it — a condition variant's own phase, its blocks,
 * its tips — and those nodes then take their ids on an orphan nobody writes
 * out. The mint therefore only ever sets a key in place, and this runs once,
 * afterwards, over the finished object.
 *
 * A machine handle appended after four hundred characters of authored prose is
 * a handle nobody reading the pack ever sees. At the top of the object it
 * reads as what it is: the node's name.
 */
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== "object") return value;

  const rebuilt = {};
  if (value.nid !== undefined) rebuilt.nid = value.nid;
  for (const [key, child] of Object.entries(value)) {
    if (key === "nid" || key === "nodeSeq") continue;
    if (key === "phases" && value.nodeSeq !== undefined) rebuilt.nodeSeq = value.nodeSeq;
    rebuilt[key] = ordered(child);
  }
  // A session that somehow has no `phases` still keeps its mark rather than
  // losing it to the reordering. Unreachable through the schema (phases is
  // required), and silently dropping a high-water mark is not a failure worth
  // depending on that.
  if (value.nodeSeq !== undefined && rebuilt.nodeSeq === undefined) {
    rebuilt.nodeSeq = value.nodeSeq;
  }
  return rebuilt;
}

/**
 * Every node in a session that carries an id, in mint order.
 *
 * Returns `{ parent, key }` pairs rather than the nodes themselves so the
 * caller knows WHERE each node sits and, from the slot, what kind it is. The
 * order is the mint order documented in the header, and it is the only place
 * that order is written down.
 */
export function nodeSlots(session) {
  const slots = [];

  const visitPhase = (parent, key) => {
    const phase = parent[key];
    slots.push({ parent, key, kind: "phase" });
    for (let i = 0; i < (phase.tips?.length ?? 0); i += 1) {
      slots.push({ parent: phase.tips, key: i, kind: "tip" });
    }
    for (let i = 0; i < (phase.blocks?.length ?? 0); i += 1) {
      slots.push({ parent: phase.blocks, key: i, kind: "block" });
    }
    for (let i = 0; i < (phase.conditionVariants?.length ?? 0); i += 1) {
      slots.push({ parent: phase.conditionVariants, key: i, kind: "variant" });
      visitPhase(phase.conditionVariants[i], "phase");
    }
  };

  for (let i = 0; i < session.phases.length; i += 1) visitPhase(session.phases, i);
  for (let i = 0; i < (session.childSheet?.length ?? 0); i += 1) {
    slots.push({ parent: session.childSheet, key: i, kind: "block" });
  }
  return slots;
}

/**
 * Mint one session in place. Returns what it did, so the caller can report
 * and so `--check` can fail on the same numbers it would have written.
 */
export function mintSession(session, { assign = true } = {}) {
  const slots = nodeSlots(session);
  const seen = new Map(); // nid -> the slot that already claimed it
  const malformed = [];
  let highest = 0;

  for (const slot of slots) {
    const nid = slot.parent[slot.key].nid;
    if (nid === undefined) continue;
    if (!NODE_ID_PATTERN.test(nid)) {
      malformed.push(nid);
      continue;
    }
    if (seen.has(nid)) malformed.push(`${nid} (twice)`);
    seen.set(nid, slot);
    highest = Math.max(highest, Number(nid.slice(1)));
  }

  // Rule 3: never backwards. The recorded mark wins when it is ahead of the
  // tree, which is exactly the case a deletion leaves behind.
  let counter = Math.max(session.nodeSeq ?? 0, highest);
  const minted = [];

  for (const slot of slots) {
    const node = slot.parent[slot.key];
    if (node.nid !== undefined) continue;
    counter += 1;
    const nid = `${nodeIdKinds[slot.kind]}${counter}`;
    minted.push(nid);
    // Set in place, never replace: see `ordered` above for why.
    if (assign) node.nid = nid;
  }

  if (assign) session.nodeSeq = counter;
  return { minted, malformed, nodeSeq: counter, total: slots.length };
}

function packFiles() {
  return readdirSync(packsDir)
    .filter((f) => f.endsWith(".json") && f !== NOT_A_PACK)
    .sort();
}

function main() {
  let mintedTotal = 0;
  let nodeTotal = 0;
  const problems = [];
  const touched = [];

  for (const file of packFiles()) {
    const path = join(packsDir, file);
    const pack = JSON.parse(readFileSync(path, "utf8"));
    let changed = false;

    for (const session of pack.sessions) {
      const result = mintSession(session, { assign: !CHECK });
      nodeTotal += result.total;
      mintedTotal += result.minted.length;
      for (const bad of result.malformed) {
        problems.push(
          `${file} / ${session.id}: node id "${bad}" is not a well-formed, unique id — ` +
            `see NODE_ID_PATTERN in schema/pack.ts. Fix it by hand; this script never ` +
            `reassigns an id that already exists.`
        );
      }
      if (result.minted.length > 0) {
        changed = true;
        if (CHECK) {
          problems.push(
            `${file} / ${session.id}: ${result.minted.length} node(s) carry no id. ` +
              `Run \`npm run packs:mint-node-ids\` and commit the result.`
          );
        }
      }
    }

    if (changed && !CHECK) {
      writeFileSync(path, `${JSON.stringify(ordered(pack), null, 2)}\n`, "utf8");
      touched.push(file);
    }
  }

  if (problems.length > 0) {
    console.error(`Node-id mint FAILED. ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  if (CHECK) {
    console.log(`Node-id check passed: ${nodeTotal} node(s) across the catalogue, all minted.`);
    return;
  }

  console.log(
    `Node-id mint: ${mintedTotal} id(s) assigned across ${nodeTotal} node(s); ` +
      `${touched.length} file(s) rewritten${touched.length > 0 ? ` (${touched.join(", ")})` : ""}. ` +
      `${NOT_A_PACK} is excluded on purpose — it is one shared phase, not a session.`
  );
  console.log(
    `Next: \`npm run packs:snapshot\` to record the ids, then \`npm run validate:packs\`.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
