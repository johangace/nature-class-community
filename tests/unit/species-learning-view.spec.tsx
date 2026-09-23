// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SpeciesLearning } from "@/app/species/SpeciesLearning";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const result = {
  learning: { introduction: "A ladybird eats tiny aphids.", lookFor: "Look for spots on its wing cases.", question: "What shapes can you find?" },
  source: { title: "Ladybird", url: "https://en.wikipedia.org/wiki/Coccinellidae" },
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("loads the child view and its source without sending a photograph", async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ result, forTeacher: "Adult-only prose" }));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(<SpeciesLearning commonName="Ladybird" scientificName="Coccinellidae" />));
  expect(host.textContent).toContain(result.learning.introduction);
  expect(host.textContent).toContain("Wonder together");
  expect(host.textContent).not.toContain("Adult-only prose");
  expect(host.querySelector("a")?.href).toBe(result.source.url);
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ commonName: "Ladybird", scientificName: "Coccinellidae" });
});

it.each([401, 500])("keeps a looking question when the request returns %s", async (status) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));
  await act(async () => root.render(<SpeciesLearning commonName="Ladybird" scientificName={null} />));
  expect(host.textContent).toContain("What colours, shapes or patterns");
  if (status === 401) expect(host.querySelector("a")?.getAttribute("href")).toBe("/sign-in");
  else expect(host.querySelector("button")?.textContent).toBe("Try again");
  expect(host.textContent).not.toContain("Finding the species story");
});

it("does not repeat a known missing story and aborts work when the viewer closes", async () => {
  const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(<SpeciesLearning commonName="Ladybird" scientificName={null} initial={null} />));
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => root.render(<SpeciesLearning key="new" commonName="Ladybird" scientificName={null} />));
  const signal = fetcher.mock.calls[0]![1]!.signal as AbortSignal;
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
});

it("reads only the child words, stops on request, and cancels when closed", async () => {
  const speak = vi.fn(); const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  await act(async () => root.render(<SpeciesLearning commonName="Ladybird" scientificName={null} initial={result} />));
  const button = host.querySelector("button")!;
  await act(async () => button.click());
  expect(speak.mock.calls[0]![0].text).toContain(result.learning.question);
  expect(button.textContent).toBe("Stop reading");
  await act(async () => button.click());
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(button.textContent).toBe("Listen");
  await act(async () => button.click());
  await act(async () => root.render(null));
  expect(cancel).toHaveBeenCalledTimes(2);
});

it("recovers from an absent profile introduction when the teacher retries", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ result }));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(<SpeciesLearning commonName="Ladybird" scientificName={null} initial={null} />));
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("couldn’t load");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain(result.learning.introduction);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("explains a synchronous speech failure without breaking the words", async () => {
  vi.stubGlobal("speechSynthesis", { speak: () => { throw new Error("not available"); }, cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
  await act(async () => root.render(<SpeciesLearning commonName="Ladybird" scientificName={null} initial={result} />));
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("Reading aloud is unavailable");
  expect(host.textContent).toContain(result.learning.introduction);
});
