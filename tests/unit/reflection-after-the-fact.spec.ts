import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reflectionPatchSchema } from "@/lib/reflection-schema";
import {
  happeningKeys,
  moodKeys,
  moreOfKeys,
  timingKeys,
} from "@/lib/reflection";

const route = readFileSync(
  new URL("../../app/api/completions/[id]/route.ts", import.meta.url),
  "utf8"
);
const entry = readFileSync(
  new URL("../../app/journal/EntryReflection.tsx", import.meta.url),
  "utf8"
);

/**
 * A reflection can now be written after the session it belongs to (#327). The
 * second write path is where a boundary quietly stops holding, so this spec
 * exercises what the new one turns away, not what it accepts.
 */
describe("the reflection patch schema", () => {
  it("takes every token the buttons can produce", () => {
    for (const mood of moodKeys) {
      expect(reflectionPatchSchema.safeParse({ mood }).success).toBe(true);
    }
    for (const timing of timingKeys) {
      expect(reflectionPatchSchema.safeParse({ timing }).success).toBe(true);
    }
    for (const moreOf of moreOfKeys) {
      expect(reflectionPatchSchema.safeParse({ moreOf }).success).toBe(true);
    }
    expect(
      reflectionPatchSchema.safeParse({ happenings: [...happeningKeys] }).success
    ).toBe(true);
  });

  it("refuses a value that is not in the vocabulary", () => {
    expect(reflectionPatchSchema.safeParse({ mood: "delighted" }).success).toBe(
      false
    );
    expect(
      reflectionPatchSchema.safeParse({ happenings: ["kids-engaged", "rained"] })
        .success
    ).toBe(false);
    expect(reflectionPatchSchema.safeParse({ timing: "" }).success).toBe(false);
  });

  it("takes free text under `note`, and under no other key (#347)", () => {
    // The box is back on a founder call, so the boundary is no longer "no
    // free text anywhere" — it is "exactly one open field, named here". That
    // is worth a test precisely because it is the weaker claim: a second open
    // field must not be able to appear by someone adding a key to a body.
    expect(
      reflectionPatchSchema.safeParse({ note: "The wind took the sheets." })
        .success
    ).toBe(true);

    for (const body of [
      { mood: "calm", text: "a second free field" },
      { happenings: ["kids-engaged"], anythingElse: "" },
      { comment: "" },
      { note: "fine", extraNote: "not fine" },
    ]) {
      expect(reflectionPatchSchema.safeParse(body).success).toBe(false);
    }
  });

  it("keeps the note out of everything that counts", async () => {
    // A term summary that could quote a sentence about one child would undo
    // the reason the tap vocabulary is closed at all. lib/journal.ts reads
    // tokens; it must not learn to read this.
    const journal = readFileSync(
      new URL("../../lib/journal.ts", import.meta.url),
      "utf8"
    );
    // Any read of the field, however it is spelled, not any use of the word.
    expect(journal).not.toMatch(/\bnote\s*:/);
    expect(journal).not.toMatch(/\.note\b/);
    expect(journal).not.toMatch(/\bnote\b\s*[,)\]}]/);

    const { termSignal } = await import("@/lib/journal");
    const noteOnly = [
      { mood: null, happenings: [], timing: null, moreOf: null },
      { mood: null, happenings: [], timing: null, moreOf: null },
      { mood: null, happenings: [], timing: null, moreOf: null },
    ];
    const signal = termSignal(noteOnly);
    expect(signal.reflected).toBe(0);
    expect(signal.mood).toBeNull();
    expect(signal.happening).toBeNull();
  });

  it("refuses anything that would move the minutes-outside tally", () => {
    // The journal is a record, not a lever on the north-star number.
    for (const body of [
      { headcount: 30 },
      { mood: "calm", headcount: 30 },
      { endedAt: Date.now() },
      { startedAt: 0, endedAt: 1 },
      { sessionId: "another-session" },
      { classId: "another-class" },
    ]) {
      expect(reflectionPatchSchema.safeParse(body).success).toBe(false);
    }
  });

  it("accepts an explicit null, so an answer given in the field can be taken back", () => {
    const parsed = reflectionPatchSchema.safeParse({
      mood: null,
      happenings: [],
      timing: null,
      moreOf: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("takes a mood retired from the buttons but still stored", () => {
    expect(reflectionPatchSchema.safeParse({ mood: "landed-well" }).success).toBe(
      true
    );
  });
});

describe("the patch route", () => {
  it("writes only the five reflection columns", () => {
    const dataStart = route.indexOf("data: {");
    expect(dataStart).toBeGreaterThan(-1);
    const data = route.slice(dataStart, route.indexOf("select: {", dataStart));
    for (const field of ["mood", "happenings", "timing", "moreOf", "note"]) {
      expect(data).toContain(field);
    }
    for (const field of ["headcount", "startedAt", "endedAt", "sessionId", "classId"]) {
      expect(data).not.toContain(field);
    }
  });

  it("joins the completion back to the signed-in teacher before writing", () => {
    expect(route).toContain("class: { teacherId: session.user.id }");
    // The update targets the row ownership already proved, never the raw id.
    expect(route).toContain("where: { id: owned.id }");
    // A stranger's completion is not confirmed to exist.
    expect(route).toContain('status: 404');
  });

  it("reads the vocabulary rather than declaring one of its own", () => {
    expect(route).toContain('from "@/lib/reflection-schema"');
    expect(route).not.toMatch(/z\.object\(/);
  });
});

describe("the journal's reflection form", () => {
  it("renders the same four questions the runner's finish asks", () => {
    for (const label of [
      "How did it feel?",
      "What happened out there?",
      "How was the time?",
      "What would your class like to do more of?",
    ]) {
      expect(entry).toContain(label);
    }
    // The same component, so the two askings cannot drift into two products.
    expect(entry).toContain('from "../ReflectionTaps"');
    const finish = readFileSync(
      new URL("../../app/run/LogSession.tsx", import.meta.url),
      "utf8"
    );
    expect(finish).toContain('from "../ReflectionTaps"');
  });

  it("offers the one written answer, and no other typed field", () => {
    // One textarea — "Anything else?" — and nothing else to type into, so the
    // journal form and the finish stay the same two questions plus the taps.
    expect(entry).toContain("Anything else?");
    expect(entry.match(/<textarea/g)).toHaveLength(1);
    expect(entry).not.toMatch(/type="text"/);
  });

  it("writes the same note the finish writes, trimmed, with empty as absent", () => {
    // One normaliser for both write paths, so a note typed outdoors and one
    // typed on the sofa are stored identically.
    for (const source of [entry, readFileSync(
      new URL("../../app/run/LogSession.tsx", import.meta.url),
      "utf8"
    )]) {
      expect(source).toContain("reflection-note");
      expect(source).toContain("note.trim()");
    }
  });

  it("says plainly when a session was logged without one", () => {
    expect(entry).toContain("Logged without a reflection.");
  });
});
