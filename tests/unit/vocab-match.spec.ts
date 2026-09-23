import { describe, expect, it } from "vitest";
import { buildVocabIndex, type IndexablePack } from "@/lib/vocab/term-index";
import { distinct, matchVocabulary, splitList } from "@/lib/vocab/match";
import { fold, stems, variants } from "@/lib/vocab/normalise";

/**
 * THE VOCABULARY JOIN, tested on a catalogue invented for this file (#563).
 *
 * ── ABOUT THE FIXTURE, EXPLICITLY ─────────────────────────────────────────
 *
 * The pack below is SYNTHETIC. Its ids, its titles and its glossary are made
 * up for this test. Nothing in it is copied from any school's curriculum map,
 * unit list or planning file, and there are no unit names in it at all — that
 * is exactly what #622 was closed for. The words it uses are ordinary English
 * science words this repo's own packs already author, so the fixture asserts
 * no vocabulary that was not already ours.
 *
 * The teacher's words in these tests are likewise invented — "coprolite" and
 * "detritivore" are words from the statutory programme of study any English
 * primary teaches, used here as words a matcher must honestly MISS, which is
 * the opposite of publishing anybody's list.
 */
const CATALOGUE: IndexablePack[] = [
  {
    id: "test-pack-one",
    title: "Synthetic pack one",
    sessions: [
      {
        id: "synthetic-seeds",
        title: "Synthetic seeds",
        primer: {
          glossary: [
            { term: "Seed" },
            { term: "Leaf litter" },
            { term: "Micro-habitat" },
          ],
        },
      },
      {
        id: "synthetic-leaves",
        title: "Synthetic leaves",
        primer: { glossary: [{ term: "Leaf" }, { term: "Seed" }] },
      },
      {
        // A session that authored no glossary: invisible to every word typed,
        // and counted as such rather than quietly dropped.
        id: "synthetic-wordless",
        title: "Synthetic wordless",
      },
    ],
  },
];

const index = buildVocabIndex(CATALOGUE, new Set(["synthetic-seeds"]));
const match = (...words: string[]) => matchVocabulary(words, index);

describe("an exact word finds the sessions that teach it", () => {
  it("matches across case, hyphenation and list punctuation", () => {
    for (const spelling of ["Seed", "seed", "  seed  ", "- seed"]) {
      const [result] = match(spelling).terms;
      expect(result?.status, spelling).toBe("hit");
      expect(result?.hits[0]?.kind, spelling).toBe("exact");
      expect(result?.hits[0]?.term, spelling).toBe("Seed");
    }
    const hyphen = match("micro habitat").terms[0];
    expect(hyphen?.status).toBe("hit");
    expect(hyphen?.hits[0]?.term).toBe("Micro-habitat");
  });

  it("names every session that authored the word, not just the first", () => {
    const [result] = match("seed").terms;
    expect(result?.hits[0]?.sessions.map((s) => s.sessionId)).toEqual([
      "synthetic-seeds",
      "synthetic-leaves",
    ]);
  });

  it("keeps a multi-word term whole rather than matching one word of it", () => {
    const [whole] = match("leaf litter").terms;
    expect(whole?.status).toBe("hit");
    expect(whole?.hits.map((h) => h.term)).toContain("Leaf litter");
  });
});

describe("a plural or an inflection is a hit, and is labelled as one", () => {
  it("meets the authored singular from the plural side", () => {
    const [result] = match("seeds").terms;
    expect(result?.status).toBe("hit");
    expect(result?.hits[0]?.kind).toBe("inflection");
    expect(result?.hits[0]?.term).toBe("Seed");
  });

  it("handles the irregular plural English cannot decide about", () => {
    const [result] = match("leaves").terms;
    expect(result?.status).toBe("hit");
    expect(result?.hits.map((h) => h.term)).toContain("Leaf");
    expect(result?.hits[0]?.kind).toBe("inflection");
  });

  it("inflects inside a phrase, on either word", () => {
    const [result] = match("Leaf litters").terms;
    expect(result?.status).toBe("hit");
    expect(result?.hits[0]?.term).toBe("Leaf litter");
  });

  it("never strips anything but number, so a longer word is a different word", () => {
    // "seedling" is not "seed" with an inflection on it. The runner's glossary
    // learned this rule the expensive way; it holds here too.
    const [result] = match("seedling").terms;
    expect(result?.status).not.toBe("hit");
    expect(result?.hits).toEqual([]);
  });

  it("does not de-pluralise a word that merely ends in s", () => {
    expect(stems("grass")).toEqual(["grass"]);
    expect(stems("moss")).toEqual(["moss"]);
    expect(variants("grasses")).toContain("grass");
  });
});

describe("a genuine miss stays a miss", () => {
  it("returns nothing at all for a word no session teaches", () => {
    const [result] = match("coprolite").terms;
    expect(result?.status).toBe("miss");
    expect(result?.hits).toEqual([]);
    expect(result?.near).toEqual([]);
  });

  it("returns an empty session list rather than the closest thing to hand", () => {
    const report = match("coprolite", "detritivore", "impermeable");
    expect(report.sessions).toEqual([]);
    expect(report.counts).toEqual({ asked: 3, hit: 0, near: 0, miss: 3 });
  });
});

describe("a near miss is shown as a near miss, never promoted", () => {
  it("reports one word of one of our phrases as part-of-phrase, not a hit", () => {
    const [result] = match("litter").terms;
    expect(result?.status).toBe("near");
    expect(result?.hits).toEqual([]);
    expect(result?.near[0]?.kind).toBe("part-of-phrase");
    expect(result?.near[0]?.term).toBe("Leaf litter");
    expect(result?.near[0]?.because).toContain("Leaf litter");
  });

  it("reports a one-letter difference as spelling, not as the word itself", () => {
    const [result] = match("leef litter").terms;
    expect(result?.status).toBe("near");
    expect(result?.near[0]?.kind).toBe("spelling");
    expect(result?.hits).toEqual([]);
  });

  it("keeps near misses out of the session overlap and out of the hit count", () => {
    const report = match("litter");
    expect(report.sessions).toEqual([]);
    expect(report.counts.hit).toBe(0);
    expect(report.counts.near).toBe(1);
  });

  it("does not call a short word a typo of another short word", () => {
    // Four letters apart by one letter is a different word, not a slip.
    const report = matchVocabulary(
      ["bud"],
      buildVocabIndex([
        {
          id: "test-pack-two",
          title: "Synthetic pack two",
          sessions: [
            { id: "synthetic-short", title: "Short", primer: { glossary: [{ term: "Mud" }] } },
          ],
        },
      ])
    );
    expect(report.terms[0]?.status).toBe("miss");
  });
});

describe("her words come back exactly as she wrote them", () => {
  const asPasted = [" seeds", "Leaf Litter,", "- Micro-Habitat", "COPROLITE"];

  it("echoes each entry byte for byte, whatever the match did internally", () => {
    const report = matchVocabulary(asPasted, index);
    expect(report.terms.map((t) => t.input)).toEqual(asPasted);
  });

  it("carries her spelling, not ours, into the session overlap", () => {
    const report = matchVocabulary(asPasted, index);
    const words = report.sessions.flatMap((s) => s.words.map((w) => w.input));
    expect(words).toContain(" seeds");
    expect(words).toContain("- Micro-Habitat");
    // Ours is alongside hers, never in place of it.
    const first = report.sessions[0]?.words[0];
    expect(first?.term).not.toBe(first?.input);
  });

  it("never trims, cases or corrects an entry it could not match", () => {
    const [miss] = matchVocabulary(["  CoProLite!!  "], index).terms;
    expect(miss?.input).toBe("  CoProLite!!  ");
    expect(miss?.status).toBe("miss");
  });

  it("splits a pasted list on separators but never on a space", () => {
    expect(splitList("seed, leaf litter\nmicro-habitat;coprolite")).toEqual([
      "seed",
      " leaf litter",
      "micro-habitat",
      "coprolite",
    ]);
  });
});

describe("the overlap is shown, never a bare score", () => {
  it("lists which of her words each session covers, and with which of ours", () => {
    const report = match("seed", "leaves", "coprolite");
    const top = report.sessions[0];
    expect(top?.session.sessionId).toBe("synthetic-leaves");
    expect(top?.words).toEqual([
      { input: "seed", term: "Seed", kind: "exact" },
      { input: "leaves", term: "Leaf", kind: "inflection" },
    ]);
    expect(distinct(top?.words ?? [])).toBe(2);
  });

  it("puts the session a teacher can reach today first among equals", () => {
    const report = match("seed");
    expect(report.sessions.map((s) => s.session.sessionId)).toEqual([
      "synthetic-seeds",
      "synthetic-leaves",
    ]);
    expect(report.sessions[0]?.session.onShelf).toBe(true);
  });

  it("asks once for the same word typed twice, and answers each row", () => {
    // "Seed" and "seed" are one word typed two ways, so the counts do not
    // double. "seeds" is a second row she actually wrote: it is answered on
    // its own line, mapped to the same term of ours, and the session shows
    // both rather than deciding for her that they were the same word.
    const report = match("seed", "Seed", "seeds");
    expect(report.terms).toHaveLength(3);
    expect(report.terms.every((t) => t.status === "hit")).toBe(true);
    expect(report.counts).toEqual({ asked: 2, hit: 2, near: 0, miss: 0 });
    expect(report.sessions[0]?.words).toEqual([
      { input: "seed", term: "Seed", kind: "exact" },
      { input: "seeds", term: "Seed", kind: "inflection" },
    ]);
  });

  it("carries the coverage gap with every answer", () => {
    expect(match("seed").coverage).toBe(index.coverage);
  });
});

describe("the index knows what it cannot see", () => {
  it("counts the wordless sessions rather than dropping them", () => {
    expect(index.coverage.sessions).toBe(3);
    expect(index.coverage.sessionsWithTerms).toBe(2);
    expect(index.coverage.wordlessSessionIds).toEqual(["synthetic-wordless"]);
  });

  it("folds duplicate terms into one entry that names both sessions", () => {
    const seed = index.terms.find((t) => t.folded === "seed");
    expect(seed?.sources.map((s) => s.session.sessionId)).toEqual([
      "synthetic-seeds",
      "synthetic-leaves",
    ]);
    expect(index.coverage.termEntries).toBe(5);
    expect(index.coverage.distinctTerms).toBe(4);
  });

  it("folds only the ways one word is typed, never two words together", () => {
    expect(fold("Micro-Habitat")).toBe("micro habitat");
    expect(fold("  • leaf litter, ")).toBe("leaf litter");
    // Two different words never fold together. There is no authority to cite
    // for a synonym, so the matcher asserts none.
    expect(fold("detritivore")).not.toBe(fold("decomposer"));
  });
});
