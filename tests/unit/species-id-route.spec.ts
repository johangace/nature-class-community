import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/ai/api-guard", () => ({
  guardAiRoute: vi.fn(async () => ({ ok: true })),
  privateJson: (body: unknown, status = 200) => Response.json(body, {
    status, headers: { "cache-control": "private, no-store" },
  }),
}));
vi.mock("@/lib/ai/model", () => ({ isModelAvailable: () => true }));
vi.mock("@/lib/teacher", () => ({ getActiveClassLocation: vi.fn() }));
vi.mock("@/lib/outside/species-allowlist", () => ({ speciesAllowlistFor: vi.fn() }));
vi.mock("@/lib/ai/species-id", () => ({ identifySpecies: vi.fn() }));
import { POST } from "@/app/api/species-id/route";
import { getActiveClassLocation } from "@/lib/teacher";
import { speciesAllowlistFor } from "@/lib/outside/species-allowlist";
import { identifySpecies } from "@/lib/ai/species-id";
const request = () => new Request("http://localhost/api/species-id", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ mediaType: "image/jpeg", image: "aGVsbG8=" }),
});
const answer = { name: "Grass", scientificName: "Poaceae", note: "The branching seed head is visible. A leaf close-up would help.", evidence: null };
const allowlist = (species: { name: string; scientificName: string | null; evidence: "recent" | "seasonal" }[], recentWindowDays: number | null = null) =>
  ({ species, recentWindowDays });

describe("photo identification with optional local context", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getActiveClassLocation).mockResolvedValue({ lat: 51.5, lng: -0.1 } as never);
    vi.mocked(speciesAllowlistFor).mockResolvedValue(allowlist([]));
    vi.mocked(identifySpecies).mockResolvedValue(answer);
  });

  it.each(["missing", "unavailable"])("identifies when location is %s", async (state) => {
    if (state === "missing") vi.mocked(getActiveClassLocation).mockResolvedValue(null);
    else vi.mocked(getActiveClassLocation).mockRejectedValue(new Error("unavailable"));
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ available: true, answer: { name: "Grass", evidence: null } });
    expect(speciesAllowlistFor).not.toHaveBeenCalled();
    expect(identifySpecies).toHaveBeenCalledWith(expect.objectContaining({ candidates: [] }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["empty", "unavailable"])("identifies when nearby records are %s", async (state) => {
    if (state === "unavailable") vi.mocked(speciesAllowlistFor).mockRejectedValue(new Error("unavailable"));
    expect(await (await POST(request())).json()).toMatchObject({ available: true, answer: { name: "Grass", note: answer.note, evidence: null } });
    expect(identifySpecies).toHaveBeenCalled();
  });

  it("passes real local provenance through separately from visual identification", async () => {
    const candidate = { name: "Common frog", scientificName: "Rana temporaria", evidence: "recent" as const };
    vi.mocked(speciesAllowlistFor).mockResolvedValue(allowlist([candidate], 7));
    vi.mocked(identifySpecies).mockResolvedValue({ name: candidate.name, scientificName: candidate.scientificName, note: "Look at the dark eye patch.", evidence: "recent" });
    expect(await (await POST(request())).json()).toMatchObject({
      answer: { name: candidate.name, scientificName: candidate.scientificName, evidence: "recent", recentWindowDays: 7 },
    });
    expect(identifySpecies).toHaveBeenCalledWith({
      image: { mediaType: "image/jpeg", base64: "aGVsbG8=" }, candidates: [candidate],
    });
  });

  /**
   * #401: the route used to answer `tier: "around-here"` for any match, so a
   * seasonal-only record reached the surface as a local one. The tier it emits
   * is now the matched record's own, and the window travels beside it so the
   * surface can bound the recent claim instead of guessing.
   */
  it("answers a seasonal-only match with the seasonal tier, never the recent one", async () => {
    const candidate = { name: "Hawthorn", scientificName: "Crataegus monogyna", evidence: "seasonal" as const };
    vi.mocked(speciesAllowlistFor).mockResolvedValue(allowlist([candidate], 7));
    vi.mocked(identifySpecies).mockResolvedValue({ name: candidate.name, scientificName: candidate.scientificName, note: "The lobed leaves are visible.", evidence: "seasonal" });
    expect(await (await POST(request())).json()).toMatchObject({
      answer: { name: "Hawthorn", evidence: "seasonal", recentWindowDays: 7 },
    });
  });

  it("carries a null window through rather than substituting a number", async () => {
    const candidate = { name: "Common frog", scientificName: "Rana temporaria", evidence: "recent" as const };
    vi.mocked(speciesAllowlistFor).mockResolvedValue(allowlist([candidate], null));
    vi.mocked(identifySpecies).mockResolvedValue({ name: candidate.name, scientificName: candidate.scientificName, note: "Dark eye patch.", evidence: "recent" });
    expect(await (await POST(request())).json()).toMatchObject({
      answer: { evidence: "recent", recentWindowDays: null },
    });
  });

  /**
   * The old response said `tier: "around-here"` for any match at all, which is
   * the shape that could not tell the two records apart. Nothing may read it
   * any more, and nothing may quietly start emitting it again beside the typed
   * field (#401).
   */
  it("no longer emits the untyped tier field, at any tier", async () => {
    for (const evidence of ["recent", "seasonal"] as const) {
      const candidate = { name: "Hawthorn", scientificName: "Crataegus monogyna", evidence };
      vi.mocked(speciesAllowlistFor).mockResolvedValue(allowlist([candidate], 7));
      vi.mocked(identifySpecies).mockResolvedValue({ name: candidate.name, scientificName: candidate.scientificName, note: "Lobed leaves.", evidence });
      const body = await (await POST(request())).json();
      expect(Object.keys(body.answer).sort()).toEqual(
        ["evidence", "name", "note", "recentWindowDays", "scientificName"]
      );
    }
  });

  it("keeps a provider failure separate from a useful uncertain answer", async () => {
    vi.mocked(identifySpecies).mockResolvedValue(null);
    expect(await (await POST(request())).json()).toEqual({ available: true, answer: null });
  });
});
