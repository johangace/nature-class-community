import { describe, expect, it } from "vitest";
import { parseChildLearning, type SpeciesNoteInput } from "@/lib/ai/species-note";

const source = "The ladybird has a red shell with black spots. It feeds on aphids. The adult has six legs.";
const input: SpeciesNoteInput = { commonName: "Ladybird", scientificName: "Coccinella septempunctata", source: { title: "Ladybird", url: "https://en.wikipedia.org/wiki/Coccinella_septempunctata", text: source } };
const child = () => ({
  introduction: { text: "This little beetle eats tiny insects called aphids.", evidence: "It feeds on aphids." },
  lookFor: { text: "Look for black spots on its red shell.", evidence: "The ladybird has a red shell with black spots." },
  question: { text: "What shapes can you find on its shell?", evidence: "The ladybird has a red shell with black spots." },
});

describe("child species stories", () => {
  it("keeps a separate child-readable introduction, detail and question", () => {
    expect(parseChildLearning(child(), input)).toEqual({ introduction: child().introduction.text, lookFor: child().lookFor.text, question: child().question.text });
  });
  it("refuses missing child fields rather than falling back to adult notes", () => {
    expect(parseChildLearning(null, input)).toBeNull();
    expect(parseChildLearning({ whatItIs: "Coleoptera has hardened elytra." }, input)).toBeNull();
  });
  it("rejects a supporting passage absent from this species source", () => {
    const value = child(); value.lookFor.evidence = "This frog has green skin.";
    expect(parseChildLearning(value, input)?.lookFor).toBe("Look at the picture. What shapes and patterns can you find?");
    expect(parseChildLearning(value, input)?.introduction).toBe(value.introduction.text);
  });
  it("retains a supported introduction when the article offers no visual detail", () => {
    const value = { introduction: child().introduction, lookFor: null, question: null };
    expect(parseChildLearning(value, input)?.introduction).toBe(value.introduction.text);
    expect(parseChildLearning(value, input)?.lookFor).toContain("shapes and patterns");
  });
  it("rejects invented numbers and locality claims", () => {
    const value = child(); value.introduction.text = "It has 17 spots.";
    expect(parseChildLearning(value, input)).toBeNull();
    value.introduction.text = "It lives in your school.";
    expect(parseChildLearning(value, input)).toBeNull();
  });
  it("substitutes a neutral question when the supplied line is not a question", () => {
    const value = child(); value.question.text = "Its shell is red.";
    expect(parseChildLearning(value, input)?.question).toBe("What would you like to find out about this living thing?");
  });
});


it("identifies a rejected introduction without returning its words in the diagnostic", () => {
  const reasons: string[] = [];
  const value = { introduction: { text: "A private model sentence.", evidence: "A passage not in this article." } };
  expect(parseChildLearning(value, input, (reason) => reasons.push(reason))).toBeNull();
  expect(reasons).toEqual(["evidence-not-in-source"]);
});


it("keeps complete opening sentences when a sourced introduction exceeds its word budget", () => {
  const opening = "This small bug has a red back.";
  const long = opening + " It is a bug that can be seen on a leaf or on a stem and it can sit in the sun for a long time on a warm day when the air is still and the sky is clear.";
  expect(long.split(/\s+/).length).toBeGreaterThan(40);
  const forThisSource = { ...input, source: { ...input.source, text: long } };
  const result = parseChildLearning({ introduction: { text: long, evidence: long } }, forThisSource);
  expect(result?.introduction).toBe(opening);
});

it("does not shorten an overlong sentence midway or accept unsupported evidence", () => {
  const long = "This bug " + "has a red back and ".repeat(12) + "rests on leaves.";
  const forThisSource = { ...input, source: { ...input.source, text: long } };
  expect(parseChildLearning({ introduction: { text: long, evidence: long } }, forThisSource)).toBeNull();
  expect(parseChildLearning({ introduction: { text: "A little beetle. " + long, evidence: "This is not the supplied article." } }, forThisSource)).toBeNull();
});

it("still rejects content violations in a short opening sentence", () => {
  const long = "You will find 999 of them today. " + "It has a red back and a small head. ".repeat(6);
  const forThisSource = { ...input, source: { ...input.source, text: long } };
  expect(parseChildLearning({ introduction: { text: long, evidence: long } }, forThisSource)).toBeNull();
});
