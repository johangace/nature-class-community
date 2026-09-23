import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/ai/api-guard", () => ({ guardAiRoute: vi.fn(), privateJson: (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } }) }));
vi.mock("@/lib/outside/species-source", () => ({ getSpeciesSource: vi.fn() }));
vi.mock("@/lib/ai/species-learning", () => ({ draftSpeciesLearning: vi.fn() }));
vi.mock("@/lib/request-locale", () => ({ requestLocale: vi.fn().mockResolvedValue("uk") }));
import { guardAiRoute } from "@/lib/ai/api-guard";
import { getSpeciesSource } from "@/lib/outside/species-source";
import { draftSpeciesLearning } from "@/lib/ai/species-learning";
import { requestLocale } from "@/lib/request-locale";
import { POST } from "@/app/api/species-learning/route";
const request = (value: unknown = { commonName: "Ladybird", scientificName: "Coccinella septempunctata" }) => new Request("https://natureclass.education/api/species-learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requestLocale).mockResolvedValue("uk"); vi.mocked(guardAiRoute).mockResolvedValue({ ok: true, teacher: { id: "teacher", email: "teacher@example.test", name: null } }); });
it("keeps the existing guard and does no work when denied", async () => {
  vi.mocked(guardAiRoute).mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });
  expect((await POST(request())).status).toBe(401); expect(getSpeciesSource).not.toHaveBeenCalled();
});
it("rejects uploaded images and arbitrary extra facts", async () => {
  expect((await POST(request({ commonName: "Ladybird", scientificName: null, image: "photo" }))).status).toBe(400);
});
it("returns no story when the source or child fields are absent", async () => {
  vi.mocked(getSpeciesSource).mockResolvedValue(null);
  expect(await (await POST(request())).json()).toEqual({ result: null, reason: "source-unavailable" });
  vi.mocked(getSpeciesSource).mockResolvedValue({ title: "Ladybird", url: "https://en.wikipedia.org/wiki/Ladybird", text: "Source text" });
  vi.mocked(draftSpeciesLearning).mockResolvedValue(null);
  expect(await (await POST(request())).json()).toEqual({ result: null, reason: "story-unavailable" });
});
it("returns only sourced child fields, never teacher prose", async () => {
  const source = { title: "Ladybird", url: "https://en.wikipedia.org/wiki/Ladybird", text: "Source text" };
  const learning = { introduction: "A little beetle.", lookFor: "Look for spots.", question: "What do you notice?" };
  vi.mocked(getSpeciesSource).mockResolvedValue(source);
  vi.mocked(draftSpeciesLearning).mockResolvedValue(learning);
  const response = await POST(request());
  expect(await response.json()).toEqual({ result: { learning, source: { title: source.title, url: source.url } } });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});


it("distinguishes a post-generation locale failure in the diagnostic", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    vi.mocked(getSpeciesSource).mockResolvedValue({ title: "Ladybird", url: "https://en.wikipedia.org/wiki/Ladybird", text: "Source text" });
    vi.mocked(draftSpeciesLearning).mockResolvedValue({ introduction: "A little beetle.", lookFor: "Look for spots.", question: "What do you notice?" });
    vi.mocked(requestLocale).mockRejectedValue(new Error("details must not be logged"));
    expect((await POST(request())).status).toBe(503);
    expect(warn).toHaveBeenCalledExactlyOnceWith("[species-learning] request-failed", "locale");
  } finally { warn.mockRestore(); }
});
