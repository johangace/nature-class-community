#!/usr/bin/env node
/**
 * Variant carry lint (#1210).
 *
 * WHAT WENT WRONG
 *
 * A phase's `conditionVariants` are full replacement phases. When the weather
 * matches, the runner shows the variant's `blocks` and none of the base
 * phase's, so every line the base author wrote is gone. Three wet-day variants
 * in `autumn-starter.json` dropped the one teacher-note that keeps the session
 * safe or ethical:
 *
 *   animal-leaf-masks / collect   "Only leaves that have already fallen. ..."
 *   leaves-and-their-trees / collect   "Ground-only collecting keeps ..."
 *   meet-your-tree / greet   "Tie the wool loosely; it must never bite ..."
 *
 * On a wet day the teacher was told how to dry a leaf and not told to leave
 * living plants alone, though the base phase's own `authorNotes` asked for
 * "the fallen-leaves-only boundary" to be preserved. Nothing in CI could see
 * it: `register-lint.mjs` checks a phase's shape, which a variant satisfies on
 * its own, and `verbatim-fidelity.mjs` compares strings that are present, so a
 * line that is simply missing has nothing to compare.
 *
 * WHAT THIS ASSERTS
 *
 * A base-phase teacher-note named in `CARRIED_NOTES` below must appear, byte
 * for byte, as a teacher-note in every condition variant of that phase (and in
 * any variant nested inside one). Drop it and the build is red; reword the
 * copy and the build is red, because a reworded conduct line is a different
 * instruction, and the base is the authored one.
 *
 * WHY A LIST HERE AND NOT A FIELD IN THE PACK
 *
 * `schema/pack.ts` is `.strict()` everywhere and the Studio validates its
 * drafts by importing that schema out of a nature-class checkout, so a new
 * block field has to land in the schema, the hand-written JSON mirror and the
 * Studio before any pack may carry it. Node ids already exist for exactly this
 * job: a `nid` is the stable address other data records against, it never
 * changes meaning, and `validate-packs.mjs` holds it unique within a session.
 * So the obligation is recorded here, against the session id and the note's
 * nid, and the packs are left exactly as the schema knows them.
 *
 * The list is audited on every run the way `GRANDFATHERED` is in
 * register-lint: an entry whose session is gone, whose nid is no longer in a
 * base phase, or whose node is no longer a teacher-note fails the build, so
 * the list cannot quietly go on describing lines that no longer exist.
 *
 * WHAT IT DOES NOT SEE, said plainly so the next reader does not rediscover it
 *
 * A conduct or safety note that is not on the list. Deciding which notes are
 * conduct is a reading of the lesson, not a fact a machine can see, and a word
 * list is the mechanism register-lint.mjs exists to have stopped using. So
 * whoever authors a condition variant for a phase with a conduct note adds
 * the note here in the same change. Pinned as a recorded blind spot in
 * `scripts/guard-mutation-check.mjs` (`variant-carry-lint/unlisted-note`).
 *
 * It also says nothing about the rest of a variant. `seed-searchers` / windy
 * replaces nine blocks with three and loses the phase's questions; whether it
 * should is a content decision (#1210), not a carry obligation.
 *
 * SCOPE
 *
 * Reads `packs/`. It judges no one's wording: its findings are machine-formed
 * addresses (`session / phase / when: nid`), never an authored sentence, so
 * the authorship guard must drop none of them, and the script fails rather
 * than passes if it ever does. See scripts/authorship.mjs.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { declareScope, HOUSE } from "./authorship.mjs";

const packsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "packs");

/**
 * Base-phase teacher-notes every condition variant of their phase must carry.
 * session id -> (note nid -> the ticket that recorded the obligation).
 *
 * Session ids are unique across every pack (validate-packs.mjs), and a nid is
 * unique within its session, so the pair names exactly one line.
 */
export const CARRIED_NOTES = {
  // "Only leaves that have already fallen. Nothing picked from a living plant."
  "animal-leaf-masks": { b11: "#1210" },
  // "Ground-only collecting keeps the trees whole and keeps this session repeatable all autumn. ..."
  "leaves-and-their-trees": { b11: "#1210" },
  // "Tie the wool loosely; it must never bite the bark, and take it home at the end of the year. ..."
  "meet-your-tree": { b18: "#1210" },
};

/** Where a base-phase block lives, or null. Condition variants are not searched. */
function findBaseNote(session, nid) {
  for (const phase of session.phases ?? []) {
    const block = (phase.blocks ?? []).find((b) => b?.nid === nid);
    if (block) return { phase, block };
  }
  return null;
}

/** Every variant under a phase, nested ones included, with a readable path. */
function variantsOf(phase, trail = []) {
  const out = [];
  for (const variant of phase.conditionVariants ?? []) {
    const path = [...trail, variant.when];
    out.push({ variant, path });
    if (variant.phase) out.push(...variantsOf(variant.phase, path));
  }
  return out;
}

/**
 * Check every session against the registry.
 *
 * Returns `{ kind, session, text, reason }[]`, where `kind` is `"dropped"` (a
 * variant does not carry a listed note) or `"stale"` (a registry entry no longer
 * names a base-phase teacher-note). `text` is a machine-formed address.
 */
export function carryFindings(sessions, registry = CARRIED_NOTES) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const findings = [];

  for (const [sessionId, notes] of Object.entries(registry)) {
    const session = byId.get(sessionId);
    for (const [nid, ticket] of Object.entries(notes)) {
      const address = `${sessionId}: ${nid}`;
      if (!session) {
        findings.push({
          kind: "stale",
          session: sessionId,
          text: address,
          reason: `no session "${sessionId}" exists in packs/ any more — delete its CARRIED_NOTES entry (${ticket})`,
        });
        continue;
      }
      const found = findBaseNote(session, nid);
      if (!found) {
        findings.push({
          kind: "stale",
          session: sessionId,
          text: address,
          reason: `no block "${nid}" in any base phase of "${sessionId}" — the note moved or was deleted; update CARRIED_NOTES (${ticket})`,
        });
        continue;
      }
      if (found.block.type !== "teacher-note" || typeof found.block.text !== "string") {
        findings.push({
          kind: "stale",
          session: sessionId,
          text: address,
          reason: `"${sessionId}" block "${nid}" is a ${found.block.type}, not a teacher-note — CARRIED_NOTES names the wrong node (${ticket})`,
        });
        continue;
      }

      const expected = found.block.text;
      for (const { variant, path } of variantsOf(found.phase)) {
        const blocks = variant.phase?.blocks ?? [];
        const carried = blocks.some((b) => b?.type === "teacher-note" && b.text === expected);
        if (carried) continue;
        const where = `${sessionId} / ${found.phase.key} / ${path.join(" > ")}`;
        findings.push({
          kind: "dropped",
          session: sessionId,
          text: `${where}: ${nid}`,
          reason:
            `the ${path.join(" > ")} variant of phase "${found.phase.key}" does not carry ` +
            `base teacher-note ${nid}. A variant replaces its base phase wholesale, so on ` +
            `that day the teacher never sees: "${expected}". Copy the note into the ` +
            `variant's blocks byte for byte (${ticket})`,
        });
      }
    }
  }
  return findings;
}

/** Every session on disk, with the file it came from. */
export function loadSessions() {
  const out = [];
  for (const file of readdirSync(packsDir).filter((f) => f.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
    for (const session of pack.sessions ?? []) out.push({ ...session, __file: file });
  }
  return out;
}

function main() {
  const scope = declareScope({
    script: "scripts/variant-carry-lint.mjs",
    reads: ["packs"],
    governs: HOUSE,
    guardsFounderText: true,
  });

  const sessions = loadSessions();
  const raw = carryFindings(sessions);
  const findings = scope.guard(raw);

  // Findings are addresses, never sentences, so provenance must drop none.
  const dropped = scope.skippedFindings();
  if (dropped.length > 0) {
    console.error(
      `Variant carry lint ABORTED: the authorship guard dropped ${dropped.length} finding(s). ` +
        `Evidence here is machine-formed and cannot be founder text; a collision means the ` +
        `evidence format needs changing, not that the obligation should be skipped.`
    );
    process.exit(1);
  }

  if (findings.length > 0) {
    console.error(`Variant carry lint FAILED. ${findings.length} finding(s):`);
    for (const f of findings) {
      console.error(`  - [${f.kind}] ${f.text}`);
      console.error(`      ${f.reason}`);
    }
    process.exit(1);
  }

  const obligations = Object.values(CARRIED_NOTES).reduce((n, notes) => n + Object.keys(notes).length, 0);
  const variants = sessions.reduce(
    (n, s) => n + (s.phases ?? []).reduce((m, p) => m + variantsOf(p).length, 0),
    0
  );
  console.log(
    `Variant carry lint: ${obligations} listed base teacher-note(s) carried into every ` +
      `condition variant of their phase; ${variants} variant(s) across ${sessions.length} ` +
      `session(s); ${scope.scopeLine()}.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
