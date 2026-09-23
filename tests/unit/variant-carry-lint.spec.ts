import { describe, expect, it } from "vitest";
import {
  CARRIED_NOTES,
  carryFindings,
  loadSessions,
  type CarryBlock,
  type CarrySession,
} from "../../scripts/variant-carry-lint.mjs";

/**
 * The vitest half of the variant carry lint (#1210). CI runs the CLI half as
 * `node scripts/variant-carry-lint.mjs`. Every obligation is exercised against
 * a variant that drops it and one that carries it, so a future edit that
 * declaws the check turns red here.
 */

const CONDUCT = "Only leaves that have already fallen. Nothing picked from a living plant.";

function session(variantBlocks: CarryBlock[]): CarrySession {
  return {
    id: "fixture-masks",
    phases: [
      {
        key: "collect",
        blocks: [
          { nid: "b1", type: "say-aloud", text: "Find leaves on the ground." },
          { nid: "b2", type: "teacher-note", text: CONDUCT },
        ],
        conditionVariants: [
          { when: "wet", phase: { key: "collect-wet", blocks: variantBlocks } },
        ],
      },
    ],
  };
}

const registry = { "fixture-masks": { b2: "#1210" } };

describe("variant carry lint", () => {
  it("passes a variant that carries the listed note byte for byte", () => {
    const s = session([
      { type: "say-aloud", text: "Rain makes the leaves shiny." },
      { type: "teacher-note", text: CONDUCT },
    ]);
    expect(carryFindings([s], registry)).toEqual([]);
  });

  it("fails a variant that drops the listed note (the #1210 shape)", () => {
    const s = session([
      { type: "say-aloud", text: "Rain makes the leaves shiny." },
      { type: "teacher-note", text: "Pat wet leaves on a sleeve before gluing. They stick fine." },
    ]);
    const findings = carryFindings([s], registry);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("dropped");
    expect(findings[0]?.text).toBe("fixture-masks / collect / wet: b2");
    expect(findings[0]?.reason).toContain(CONDUCT);
  });

  it("fails a reworded copy, because the base is the authored instruction", () => {
    const s = session([{ type: "teacher-note", text: "Only fallen leaves, please." }]);
    expect(carryFindings([s], registry).map((f) => f.kind)).toEqual(["dropped"]);
  });

  it("does not accept the line as a say-aloud: it must reach the adult as a note", () => {
    const s = session([{ type: "say-aloud", text: CONDUCT }]);
    expect(carryFindings([s], registry).map((f) => f.kind)).toEqual(["dropped"]);
  });

  it("holds a variant nested inside a variant to the same obligation", () => {
    const s = session([{ type: "teacher-note", text: CONDUCT }]);
    s.phases![0]!.conditionVariants![0]!.phase.conditionVariants = [
      { when: "cold", phase: { key: "collect-wet-cold", blocks: [{ type: "say-aloud", text: "Brr." }] } },
    ];
    const findings = carryFindings([s], registry);
    expect(findings.map((f) => f.text)).toEqual(["fixture-masks / collect / wet > cold: b2"]);
  });

  it("reports a stale registry entry rather than passing over it", () => {
    const s = session([{ type: "teacher-note", text: CONDUCT }]);
    expect(carryFindings([s], { "no-such-session": { b2: "#1210" } })[0]?.kind).toBe("stale");
    expect(carryFindings([s], { "fixture-masks": { b99: "#1210" } })[0]?.reason).toContain("no block");
    expect(carryFindings([s], { "fixture-masks": { b1: "#1210" } })[0]?.reason).toContain("not a teacher-note");
  });

  it("passes every session on disk", () => {
    expect(carryFindings(loadSessions())).toEqual([]);
  });

  it("goes red on the shipped packs with the carried copies removed (pre-fix data)", () => {
    const sessions = loadSessions().map((s) => structuredClone(s));
    for (const s of sessions) {
      const notes = CARRIED_NOTES[s.id];
      if (!notes) continue;
      for (const phase of s.phases ?? []) {
        const listed = (phase.blocks ?? []).filter((b) => b.nid && notes[b.nid]).map((b) => b.text);
        for (const v of phase.conditionVariants ?? []) {
          v.phase.blocks = (v.phase.blocks ?? []).filter((b) => !listed.includes(b.text));
        }
      }
    }
    const findings = carryFindings(sessions);
    expect(findings.map((f) => f.text).sort()).toEqual([
      "animal-leaf-masks / collect / wet: b11",
      "leaves-and-their-trees / collect / wet: b11",
      "meet-your-tree / greet / wet: b18",
    ]);
  });
});
