import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTE_MAX, normaliseNote, noteWithinBound } from "@/lib/reflection-note";

/**
 * "Anything else?" — the free box the prototype had, restored on a founder
 * call (#347). It is the only open field on the close, so the rules about how
 * it is stored are worth pinning rather than leaving to whichever route
 * happens to write it.
 */
describe("normaliseNote", () => {
  it("trims, because trailing whitespace is not something she wrote", () => {
    expect(normaliseNote("  The wind took the sheets.  ")).toBe(
      "The wind took the sheets."
    );
  });

  it("reads an empty or whitespace-only box as nothing written", () => {
    // "She wrote nothing" and "she opened it, thought better of it, and
    // cleared it" are the same fact. They must not be two states in the
    // database, or the journal ends up with an entry that renders an empty
    // paragraph for one and no paragraph for the other.
    expect(normaliseNote("")).toBeNull();
    expect(normaliseNote("   ")).toBeNull();
    expect(normaliseNote("\n\t ")).toBeNull();
    expect(normaliseNote(null)).toBeNull();
  });

  it("keeps the newlines inside a note, which are hers", () => {
    expect(normaliseNote("First line.\n\nSecond line.")).toBe(
      "First line.\n\nSecond line."
    );
  });

  it("says nothing at all about a value that is not text", () => {
    // undefined means "this body carried no note", which a caller must be
    // able to tell apart from "the note is now empty".
    expect(normaliseNote(undefined)).toBeUndefined();
    expect(normaliseNote(42)).toBeUndefined();
    expect(normaliseNote({})).toBeUndefined();
  });

  it("measures the bound after trimming", () => {
    const full = "x".repeat(NOTE_MAX);
    expect(noteWithinBound(full)).toBe(true);
    // Padding is not content: a note at the limit with spaces round it fits.
    expect(noteWithinBound(`  ${full}  `)).toBe(true);
    expect(noteWithinBound(`${full}x`)).toBe(false);
  });
});

describe("the routes that store a note", () => {
  const post = readFileSync(
    new URL("../../app/api/completions/route.ts", import.meta.url),
    "utf8"
  );
  const patch = readFileSync(
    new URL("../../app/api/completions/[id]/route.ts", import.meta.url),
    "utf8"
  );

  it("refuse an over-long note rather than truncating it", () => {
    // Silently dropping the end of a teacher's sentence is worse than saying
    // no: she would never know which half of the thought was kept.
    for (const [name, source] of [
      ["POST", post],
      ["PATCH", patch],
    ] as const) {
      expect(source, `${name} truncates`).toContain('error: "note too long"');
      expect(source, `${name} truncates`).not.toMatch(
        /note[^\n]*\.slice\(|substring\(/
      );
    }
  });

  it("both normalise through the one shared helper", () => {
    for (const source of [post, patch]) {
      expect(source).toContain('from "@/lib/reflection-note"');
      expect(source).toContain("normaliseNote(body.note)");
    }
  });
});
