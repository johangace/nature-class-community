import { expect, it, vi } from "vitest";
const callModel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/model", () => ({ callModel, isModelAvailable: () => true }));
import { draftSpeciesLearning } from "@/lib/ai/species-learning";
import { draftSpeciesNote } from "@/lib/ai/species-note";

it("keeps a supported introduction when the adult note is rejected, and retries a failed child draft", async () => {
  const text = "This honey bee gathers nectar from flowers and lives in a colony.";
  const input = { commonName: "Recovery bee", scientificName: "Apis mellifera", source: { text, title: "Bee", url: "https://en.wikipedia.org/wiki/Western_honey_bee" } };
  const child = { introduction: { text: "Honey bees gather nectar from flowers.", evidenceId: "s1" }, lookFor: null, question: null };
  callModel.mockResolvedValueOnce({ text: JSON.stringify({ whatItIs: "Unsupported!", forTeacher: "It gathers nectar." }), model: "test" });
  expect(await draftSpeciesNote(input)).toBeNull();
  callModel.mockResolvedValueOnce(null);
  expect(await draftSpeciesLearning(input)).toBeNull();
  callModel.mockResolvedValueOnce({ text: JSON.stringify(child), model: "test" });
  const [first, second] = await Promise.all([draftSpeciesLearning(input), draftSpeciesLearning(input)]);
  expect(first?.introduction).toBe(child.introduction.text);
  expect(second).toEqual(first);
  expect(callModel).toHaveBeenCalledTimes(3);
  expect(await draftSpeciesLearning(input)).toEqual(first);
  expect(callModel).toHaveBeenCalledTimes(3);
});

it("recovers a source lookup immediately after a network failure", async () => {
  const { getSpeciesSource } = await import("@/lib/outside/species-source");
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({ query: { pages: { "1": { title: "Recovery species", extract: "Recoveria testensis lives among leaves. ".repeat(10) } } } }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const input = { commonName: "Recovery species", scientificName: "Recoveria testensis" };
    expect(await getSpeciesSource(input)).toBeNull();
    expect((await getSpeciesSource(input))?.title).toBe("Recovery species");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});


it("selects exact supplied passages without copying model quotations", async () => {
  callModel.mockClear();
  const article = "This bug has a hairy body. Its wings change colour in winter.";
  const input = { commonName: "Passage bug", source: { text: article, title: "Bug", url: "https://en.wikipedia.org/wiki/Bug" } };
  callModel.mockResolvedValueOnce({ text: JSON.stringify({
    introduction: { text: "Its body is covered in tiny hairs.", evidenceId: "s1", evidence: "An invented quotation is ignored." },
    lookFor: { text: "Look for blue spots.", evidenceId: "s999" },
    question: null,
  }), model: "test" });
  const result = await draftSpeciesLearning(input);
  expect(result?.introduction).toBe("Its body is covered in tiny hairs.");
  expect(result?.lookFor).toContain("shapes and patterns");
  const sent = callModel.mock.calls[0]![0].user as string;
  const passages = JSON.parse(sent.split("Source passages:\n")[1]!);
  expect(passages).toEqual([{ id: "s1", text: "This bug has a hairy body." }, { id: "s2", text: "Its wings change colour in winter." }]);
  for (const passage of passages) expect(article.includes(passage.text)).toBe(true);
});

it.each(["s999", 1, " s1", "__proto__", null])("rejects an unknown or malformed introduction passage ID: %s", async (evidenceId) => {
  const input = { commonName: `Unknown passage ${String(evidenceId)}`, source: { text: "The bug has a hairy body.", title: "Bug", url: "https://en.wikipedia.org/wiki/Bug" } };
  callModel.mockResolvedValueOnce({ text: JSON.stringify({ introduction: { text: "Its body has tiny hairs.", evidenceId, evidence: input.source.text } }), model: "test" });
  expect(await draftSpeciesLearning(input)).toBeNull();
});

it("keeps content checks even with a valid passage ID", async () => {
  const input = { commonName: "Unsafe passage bug", source: { text: "The bug has a hairy body.", title: "Bug", url: "https://en.wikipedia.org/wiki/Bug" } };
  callModel.mockResolvedValueOnce({ text: JSON.stringify({ introduction: { text: "You will find it in your school today.", evidenceId: "s1" } }), model: "test" });
  expect(await draftSpeciesLearning(input)).toBeNull();
});

it("does not call the model when no bounded source passage is available", async () => {
  callModel.mockClear();
  const input = { commonName: "No passage bug", source: { text: "Long ".repeat(100) + ".", title: "Bug", url: "https://en.wikipedia.org/wiki/Bug" } };
  expect(await draftSpeciesLearning(input)).toBeNull();
  expect(callModel).not.toHaveBeenCalled();
});
