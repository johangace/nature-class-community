import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NODE_ID_PATTERN, nodeIdKinds, readNodeId, parsePack, type Session } from "@/schema/pack";
import { RETIRED_NODE_IDS } from "@/lib/pack";

/**
 * Stable node identity (office#330 §4), and the guard around it.
 *
 * `scripts/validate-packs.mjs` is the CLI half of this — same invariants, run
 * as `npm run validate:packs` in CI. This file is what puts them in `npm test`
 * and in an editor's inline runner, and it is where the SCHEMA half is proved:
 * that `nid` is genuinely optional and genuinely additive, so a pack authored
 * outside this repo still parses, while the catalogue we ship carries an id on
 * every node.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT: any particular id on any particular
 * node. Those come from a deterministic walk and they are recorded in
 * `scripts/lib/node-ids.snapshot.json`, which is the artefact that makes a
 * departure visible. A test naming `b7` would fail on the next legitimate
 * insertion and teach everybody to edit the test.
 */

const packsDir = join(process.cwd(), "packs");
const SETTLE_FILE = "settle.json";

function packFiles(): string[] {
  return readdirSync(packsDir)
    .filter((f) => f.endsWith(".json") && f !== SETTLE_FILE)
    .sort();
}

function everySession(): { file: string; session: Session }[] {
  const out: { file: string; session: Session }[] = [];
  for (const file of packFiles()) {
    const pack = parsePack(JSON.parse(readFileSync(join(packsDir, file), "utf8")));
    for (const session of pack.sessions) out.push({ file, session });
  }
  return out;
}

/** Every id-carrying node in a session, with what kind it is. Mirrors the mint. */
function idNodes(session: Session): { node: { nid?: string }; kind: string; where: string }[] {
  const found: { node: { nid?: string }; kind: string; where: string }[] = [];
  const visitPhase = (phase: Session["phases"][number], where: string): void => {
    found.push({ node: phase, kind: "phase", where });
    (phase.tips ?? []).forEach((tip, i) =>
      found.push({ node: tip, kind: "tip", where: `${where}.tips[${i}]` })
    );
    phase.blocks.forEach((block, i) =>
      found.push({ node: block, kind: "block", where: `${where}.blocks[${i}]` })
    );
    (phase.conditionVariants ?? []).forEach((variant, i) => {
      found.push({ node: variant, kind: "variant", where: `${where}.conditionVariants[${i}]` });
      visitPhase(variant.phase, `${where}.conditionVariants[${i}].phase`);
    });
  };
  session.phases.forEach((phase, i) => visitPhase(phase, `phases[${i}]`));
  session.childSheet.forEach((block, i) =>
    found.push({ node: block, kind: "block", where: `childSheet[${i}]` })
  );
  return found;
}

describe("the node id itself", () => {
  it("accepts one of p/b/v/t and digits, and nothing else", () => {
    for (const good of ["p1", "b2", "v33", "t404", "b0"]) {
      expect(NODE_ID_PATTERN.test(good), good).toBe(true);
    }
    // A UUID is the shape this scheme was chosen against: 898 blocks of 36
    // characters makes every pack diff unreadable.
    for (const bad of ["", "1", "x1", "p", "p1a", "P1", "p-1", "p 1", "9f1c2b3e-0000-4000-8000-000000000000"]) {
      expect(NODE_ID_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("reads the kind and the number back out, and refuses what it cannot", () => {
    expect(readNodeId("p12")).toEqual({ kind: "phase", seq: 12 });
    expect(readNodeId("b1")).toEqual({ kind: "block", seq: 1 });
    expect(readNodeId("v7")).toEqual({ kind: "variant", seq: 7 });
    expect(readNodeId("t9")).toEqual({ kind: "tip", seq: 9 });
    expect(readNodeId("q1")).toBeNull();
    expect(readNodeId("phase-1")).toBeNull();
  });

  it("has a letter for every kind and no two kinds share one", () => {
    const letters = Object.values(nodeIdKinds);
    expect(new Set(letters).size).toBe(letters.length);
    for (const letter of letters) expect(NODE_ID_PATTERN.test(`${letter}1`)).toBe(true);
  });
});

describe("the schema is additive", () => {
  /**
   * The isolating fixture for the whole change: a pack with no ids anywhere
   * must still parse. Every object in schema/pack.ts is `.strict()`, and the
   * Studio validates each draft by importing that file out of a nature-class
   * checkout — so if `nid` had landed as required rather than optional, every
   * pack in the world outside this repo would stop parsing at once.
   */
  it("a pack carrying no nid and no nodeSeq still parses", () => {
    const raw = JSON.parse(readFileSync(join(packsDir, packFiles()[0]!), "utf8"));
    const stripped = JSON.parse(
      JSON.stringify(raw, (key, value) => (key === "nid" || key === "nodeSeq" ? undefined : value))
    );
    expect(JSON.stringify(stripped)).not.toContain('"nid"');
    expect(() => parsePack(stripped)).not.toThrow();
  });

  it("strictness survived: an undeclared field beside nid is still refused", () => {
    const raw = JSON.parse(readFileSync(join(packsDir, packFiles()[0]!), "utf8"));
    raw.sessions[0].phases[0].blocks[0].nidd = "b1";
    expect(() => parsePack(raw)).toThrow();
  });

  it("a malformed nid is refused by the schema, not merely by the lint", () => {
    const raw = JSON.parse(readFileSync(join(packsDir, packFiles()[0]!), "utf8"));
    raw.sessions[0].phases[0].nid = "phase-one";
    expect(() => parsePack(raw)).toThrow();
  });
});

describe("the shipped catalogue is fully minted", () => {
  it("every phase, block, variant and tip carries an id, on the right letter", () => {
    const unminted: string[] = [];
    const wrongKind: string[] = [];
    for (const { file, session } of everySession()) {
      for (const { node, kind, where } of idNodes(session)) {
        if (node.nid === undefined) {
          unminted.push(`${file} / ${session.id} ${where}`);
          continue;
        }
        const read = readNodeId(node.nid);
        if (!read || read.kind !== kind) {
          wrongKind.push(`${file} / ${session.id} ${where} = ${node.nid} (a ${kind})`);
        }
      }
    }
    expect(unminted).toEqual([]);
    expect(wrongKind).toEqual([]);
  });

  it("ids are unique within a session and at or below its nodeSeq", () => {
    const problems: string[] = [];
    for (const { file, session } of everySession()) {
      const seen = new Set<string>();
      for (const { node, where } of idNodes(session)) {
        const nid = node.nid!;
        if (seen.has(nid)) problems.push(`${file} / ${session.id}: duplicate ${nid} at ${where}`);
        seen.add(nid);
        const seq = readNodeId(nid)!.seq;
        if (session.nodeSeq === undefined || seq > session.nodeSeq) {
          problems.push(
            `${file} / ${session.id}: ${nid} at ${where} is above nodeSeq ${session.nodeSeq}`
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("no session reuses an id its own RETIRED_NODE_IDS entry has retired", () => {
    const problems: string[] = [];
    for (const { session } of everySession()) {
      const retired = new Set(RETIRED_NODE_IDS[session.id] ?? []);
      if (retired.size === 0) continue;
      for (const { node, where } of idNodes(session)) {
        if (retired.has(node.nid!)) {
          problems.push(`${session.id}: retired id ${node.nid} is live again at ${where}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("the committed node-id snapshot", () => {
  const snapshot = JSON.parse(
    readFileSync(join(process.cwd(), "scripts", "lib", "node-ids.snapshot.json"), "utf8")
  ) as { nodeIds: Record<string, string[]> };

  /**
   * The snapshot is what makes a DEPARTURE visible: a nid is the address an
   * output records what it was derived from, so an address that quietly
   * becomes free is one the next mint can reissue onto a different line.
   */
  it("records exactly the ids the catalogue holds today", () => {
    const live: Record<string, string[]> = {};
    for (const { session } of everySession()) {
      live[session.id] = idNodes(session)
        .map(({ node }) => node.nid!)
        .sort();
    }
    expect(Object.keys(snapshot.nodeIds).sort()).toEqual(Object.keys(live).sort());
    for (const [sessionId, ids] of Object.entries(live)) {
      expect(snapshot.nodeIds[sessionId], sessionId).toEqual(ids);
    }
  });

  it("says why it exists, so the next person does not delete it as noise", () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "scripts", "lib", "node-ids.snapshot.json"), "utf8")
    ) as { _why?: string };
    expect(raw._why ?? "").toContain("RETIRED_NODE_IDS");
  });
});

describe("packs/settle.json is out of scope, on purpose", () => {
  /**
   * It is ONE shared phase that `loadPack` prepends to every session that opts
   * in, so a single id on it would arrive inside eleven sessions at once and
   * "unique within a session" could not be true of it. Asserted rather than
   * left as a silence, because an unminted node otherwise reads as an
   * oversight the next person quietly "fixes".
   */
  it("carries no node ids", () => {
    const raw = readFileSync(join(packsDir, SETTLE_FILE), "utf8");
    expect(raw).not.toContain('"nid"');
  });
});
