import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVocabIndex } from "@/lib/vocab/term-index";
import { matchVocabulary } from "@/lib/vocab/match";

/**
 * THE INDEX OVER THE REAL SHELF, AND THE GAP IT MEASURES (#563).
 *
 * The matcher next door is tested on a synthetic catalogue. This file holds it
 * against the packs we actually ship, because two of the ticket's three
 * questions are about our own data rather than about the algorithm:
 *
 *   1. Does every indexed word come from a session that authored it — or has
 *      the index started holding words nobody wrote? Provenance is the whole
 *      claim. An index that can produce a term with no session behind it is an
 *      index that can put a lesson in front of a teacher for a word it made up.
 *
 *   2. How much of the shelf can a teacher's list even see? Matching over
 *      incomplete glossaries measures our own gaps, which is why #563 was
 *      sequenced behind #356. The gap is the finding, so it is asserted here
 *      rather than left to a report nobody re-runs.
 *
 * The ratchets are one-directional, like tests/unit/glossary-reach.spec.ts's:
 * coverage may improve freely and may not regress silently.
 */

const root = process.cwd();
const index = loadVocabIndex();

describe("every indexed word has a session behind it", () => {
  it("names at least one authoring session for every term", () => {
    for (const term of index.terms) {
      expect(term.sources.length, term.term).toBeGreaterThan(0);
      for (const source of term.sources) {
        expect(source.session.sessionId, term.term).not.toBe("");
        expect(source.session.packId, term.term).not.toBe("");
      }
    }
  });

  it("holds no word that is not authored, byte for byte, in a pack", () => {
    // The index may fold a word to compare it; it may never STORE a folded or
    // corrected spelling. Every displayed term must appear in the pack file
    // exactly as the index carries it.
    const packText = readdirSync(resolve(root, "packs"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => readFileSync(resolve(root, "packs", file), "utf8"))
      .join("\n");

    for (const term of index.terms) {
      for (const source of term.sources) {
        expect(packText, source.term).toContain(JSON.stringify(source.term).slice(1, -1));
      }
    }
  });

  it("indexes the glossary and nothing else — no titles, no objectives", () => {
    // A guard against the index quietly widening into "everything a session
    // says", which would make a hit mean nothing in particular.
    const titles = new Set(index.sessions.map((s) => s.sessionTitle.toLowerCase()));
    const authored = new Set<string>();
    for (const term of index.terms) for (const s of term.sources) authored.add(s.term);
    for (const term of index.terms) {
      if (!titles.has(term.folded)) continue;
      // A word may legitimately be both a title and a glossary term ("Ice").
      // It is only allowed in if a session authored it as a term.
      expect(authored.has(term.term), term.term).toBe(true);
    }
  });
});

describe("the coverage the matcher can honestly claim", () => {
  it("reports the shelf it can see, and the part it cannot", () => {
    const c = index.coverage;
    // Real numbers on 2026-08-28: 8 packs, 56 sessions, 48 with a glossary,
    // 8 without, 172 authored entries folding to 129 distinct terms. Nine
    // packs since winter-starter (2026-09-06); ten since
    // living-things-spring (#564), whose four sessions each carry a glossary.
    expect(c.packs).toBe(10);
    expect(c.sessions).toBeGreaterThanOrEqual(56);
    expect(c.sessionsWithTerms).toBeGreaterThanOrEqual(48);
    expect(c.sessionsWithoutTerms).toBeLessThanOrEqual(8);
    expect(c.termEntries).toBeGreaterThanOrEqual(172);
    expect(c.distinctTerms).toBeGreaterThanOrEqual(129);
    expect(c.sessionsWithTerms + c.sessionsWithoutTerms).toBe(c.sessions);
  });

  it("names the wordless sessions, so the gap is a work list", () => {
    const c = index.coverage;
    expect(c.wordlessSessionIds).toHaveLength(c.sessionsWithoutTerms);
    // Four of the eight are ON THE SHELF — a fifth of what a teacher can
    // actually reach today is invisible to any word she types. That is the
    // number #563 exists to surface, and it holds until those glossaries are
    // written (#350's list).
    expect(c.shelfWordlessSessionIds.length).toBeLessThanOrEqual(4);
    for (const id of c.shelfWordlessSessionIds) {
      expect(c.wordlessSessionIds).toContain(id);
    }
    expect(c.shelfSessionsWithTerms + c.shelfWordlessSessionIds.length).toBe(
      c.shelfSessions
    );
  });
});

describe("a real list against the real shelf", () => {
  it("finds sessions for words we teach and misses words we do not", () => {
    const report = matchVocabulary(
      ["seed", "Frost", "leaf litter", "coprolite", "impermeable"],
      index
    );
    const statuses = Object.fromEntries(report.terms.map((t) => [t.input, t.status]));
    expect(statuses["seed"]).toBe("hit");
    expect(statuses["Frost"]).toBe("hit");
    expect(statuses["leaf litter"]).toBe("hit");
    // Words from the statutory programme of study that our glossaries do not
    // carry. A miss is the honest answer; nothing may pad it.
    expect(statuses["coprolite"]).toBe("miss");
    expect(statuses["impermeable"]).toBe("miss");
    expect(report.sessions.length).toBeGreaterThan(0);
    for (const overlap of report.sessions) {
      expect(overlap.words.length).toBeGreaterThan(0);
    }
  });

  it("returns nothing at all when the list is entirely outside our glossaries", () => {
    const report = matchVocabulary(["coprolite", "impermeable"], index);
    expect(report.sessions).toEqual([]);
    expect(report.counts.hit).toBe(0);
  });
});

describe("the script runs and prints what it found", () => {
  const run = (args: string[]) =>
    execFileSync("npx", ["tsx", "scripts/vocab-match.mjs", ...args], {
      encoding: "utf8",
      cwd: root,
    });

  it("prints coverage on its own", () => {
    const out = run(["--coverage"]);
    expect(out).toContain("WHAT THE MATCHER CAN SEE");
    expect(out).toMatch(/\d+ of \d+ sessions carry glossary terms/);
    expect(out).toContain("Sessions with no glossary");
  });

  it("prints hits, misses and the per-session overlap for a pasted list", () => {
    const out = run(["seed, coprolite, Leaf Litter"]);
    expect(out).toContain("YOUR WORDS");
    // Her words, exactly as she typed them, including the space the comma left.
    expect(out).toContain('HIT   "seed"');
    expect(out).toContain('MISS  " coprolite"');
    expect(out).toContain('" Leaf Litter"');
    expect(out).toContain("SESSIONS THAT COVER THEM");
    expect(out).toMatch(/covers \d+ of your words/);
  });

  it("says so plainly when nothing matched", () => {
    const out = run(["coprolite; impermeable"]);
    expect(out).toContain("None. No session in the catalogue teaches any of these words.");
  });
}, 60_000);
