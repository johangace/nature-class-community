import { describe, expect, it } from "vitest";
import { buildWorldExtract } from "@/lib/ai/prompts";
import {
  parseWorldExtractDraft,
} from "@/lib/ai/world-extract-contract";

/**
 * The onboarding assistant's output gate (#280).
 *
 * Most of what matters here is what the parser REFUSES: a candidate whose
 * quote is not really in her words, a value outside the closed vocabulary, a
 * note that would be too long or carry markup, and anything that might name
 * a child. The parser is the backstop; these tests are mostly about proving
 * the backstop holds even when the prompt's own answer does not.
 */

describe("world-extract prompt", () => {
  it("names the closed vocabulary rather than leaving it open", async () => {
    const prompt = await buildWorldExtract({ text: "We have a pond." });
    if (!prompt) throw new Error("world-extract prompt failed to load");
    expect(prompt.system).toContain('"a pond"');
    expect(prompt.system).toContain('"grounds"');
    expect(prompt.system).toContain("never invent");
    expect(prompt.system).toContain("never extract anything about a specific child");
    expect(prompt.user).toBe("We have a pond.");
  });
});

describe("world-extract output gate", () => {
  const source =
    "We have a pond in the courtyard and a bit behind the bike sheds where the nettles are. We can only really use our own grounds.";

  it("accepts a feature, a note, and a reach, each quoting her own words", () => {
    const draft = parseWorldExtractDraft(
      {
        candidates: [
          { kind: "feature", value: "a pond", quote: "a pond in the courtyard", confidence: 0.9 },
          {
            kind: "note",
            value: "a bit behind the bike sheds where the nettles are",
            quote: "a bit behind the bike sheds where the nettles are",
            confidence: 0.7,
          },
          { kind: "reach", value: "grounds", quote: "only really use our own grounds", confidence: 0.6 },
        ],
      },
      source
    );
    expect(draft).not.toBeNull();
    expect(draft?.candidates).toHaveLength(3);
  });

  it("drops a candidate whose quote cannot be found in what she actually typed", () => {
    // The invented-fact case: a plausible-looking feature with a quote that
    // is not in her text at all.
    const draft = parseWorldExtractDraft(
      {
        candidates: [
          { kind: "feature", value: "a vegetable garden", quote: "we grow vegetables every year", confidence: 0.9 },
        ],
      },
      source
    );
    expect(draft?.candidates).toEqual([]);
  });

  it("drops a feature value outside the closed vocabulary", () => {
    const draft = parseWorldExtractDraft(
      {
        candidates: [
          { kind: "feature", value: "a swimming pool", quote: "a pond in the courtyard", confidence: 0.8 },
        ],
      },
      source
    );
    expect(draft?.candidates).toEqual([]);
  });

  it("drops a reach value outside the closed vocabulary", () => {
    const draft = parseWorldExtractDraft(
      { candidates: [{ kind: "reach", value: "anywhere", quote: "only really use our own grounds", confidence: 0.5 }] },
      source
    );
    expect(draft?.candidates).toEqual([]);
  });

  it("keeps only the highest-confidence reach when the model offers more than one", () => {
    const draft = parseWorldExtractDraft(
      {
        candidates: [
          { kind: "reach", value: "grounds", quote: "only really use our own grounds", confidence: 0.4 },
          { kind: "reach", value: "doorstep", quote: "only really use our own grounds", confidence: 0.8 },
        ],
      },
      source
    );
    expect(draft?.candidates).toHaveLength(1);
    expect(draft?.candidates[0]).toMatchObject({ kind: "reach", value: "doorstep" });
  });

  it("rejects a note over the 120-character bound, matching the manual box exactly", () => {
    const long = "x".repeat(121);
    const draft = parseWorldExtractDraft(
      { candidates: [{ kind: "note", value: long, quote: long.slice(0, 50), confidence: 0.6 }] },
      long
    );
    expect(draft?.candidates).toEqual([]);
  });

  it("rejects a note carrying markup or a link", () => {
    const withLink = "check https://example.test for photos";
    const draft = parseWorldExtractDraft(
      { candidates: [{ kind: "note", value: withLink, quote: withLink, confidence: 0.5 }] },
      withLink
    );
    expect(draft?.candidates).toEqual([]);
  });

  it("clamps an out-of-range confidence rather than rejecting the candidate", () => {
    const draft = parseWorldExtractDraft(
      {
        candidates: [
          { kind: "feature", value: "a pond", quote: "a pond in the courtyard", confidence: 5 },
        ],
      },
      source
    );
    expect(draft?.candidates[0]?.confidence).toBe(1);
  });

  it("returns null for a malformed reply rather than throwing", () => {
    expect(parseWorldExtractDraft(null, source)).toBeNull();
    expect(parseWorldExtractDraft({ candidates: "not an array" }, source)).toBeNull();
    expect(parseWorldExtractDraft("just a string", source)).toBeNull();
  });

  it("returns an empty candidate list, not null, when nothing matched", () => {
    const draft = parseWorldExtractDraft({ candidates: [] }, source);
    expect(draft).toEqual({ candidates: [] });
  });
});

// ---------------------------------------------------------------------------
// #377 · The photograph path. A photo has no quote, so the quote-in-source
// guard cannot hold it honest; parseWorldPhotoDraft enforces the replacement
// invariant instead. These are its mutation fixtures: each one feeds the
// parser exactly the reply a misbehaving model would produce and asserts the
// guard refuses it, so a loosened guard is a red test, not a quiet leak.
// ---------------------------------------------------------------------------

import { parseWorldPhotoDraft, PHOTO_QUOTE } from "@/lib/ai/world-extract-contract";

describe("parseWorldPhotoDraft (#377)", () => {
  const RECORD = ["Stinging nettle", "Common frog", "Pedunculate oak"];

  it("refuses the whole read when the model reports a person in frame", () => {
    const draft = parseWorldPhotoDraft(
      { person: true, candidates: [{ kind: "feature", value: "a pond", confidence: 0.9 }] },
      RECORD
    );
    expect(draft?.personSeen).toBe(true);
    // Nothing survives a person report, whatever else the reply carried.
    expect(draft?.candidates).toHaveLength(0);
  });

  it("discards a species the local record does not carry", () => {
    const draft = parseWorldPhotoDraft(
      {
        person: false,
        candidates: [
          { kind: "species", value: "Fire salamander", confidence: 0.95 },
          { kind: "species", value: "Common frog", confidence: 0.8 },
        ],
      },
      RECORD
    );
    expect(draft?.candidates.map((c) => c.value)).toEqual(["Common frog"]);
  });

  it("keeps the record's own spelling, never the model's casing", () => {
    const draft = parseWorldPhotoDraft(
      { person: false, candidates: [{ kind: "species", value: "stinging NETTLE", confidence: 0.7 }] },
      RECORD
    );
    expect(draft?.candidates[0]?.value).toBe("Stinging nettle");
    expect(draft?.candidates[0]?.quote).toBe(PHOTO_QUOTE);
  });

  it("never admits free text: a note-shaped candidate from a photo is dropped", () => {
    const draft = parseWorldPhotoDraft(
      {
        person: false,
        candidates: [
          { kind: "note", value: "the corner where the nettles grow", confidence: 0.9 },
          { kind: "feature", value: "a pond", confidence: 0.9 },
        ],
      },
      RECORD
    );
    expect(draft?.candidates).toHaveLength(1);
    expect(draft?.candidates[0]).toMatchObject({ kind: "feature", value: "a pond" });
  });

  it("holds features to the closed vocabulary", () => {
    const draft = parseWorldPhotoDraft(
      { person: false, candidates: [{ kind: "feature", value: "a swimming pool", confidence: 0.9 }] },
      RECORD
    );
    expect(draft?.candidates).toHaveLength(0);
  });
});
