import { beforeEach, expect, it, vi } from "vitest";

const fetchFieldTruth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { class: { findUnique: vi.fn() } } }));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth }));
vi.mock("@/lib/outside/taxon-reference", () => ({
  taxonReferences: vi.fn().mockResolvedValue({}),
}));

import { __clearLiveCastCache, resolveLiveCast } from "@/lib/cast/live";
import { getPhenologyEntries } from "@/lib/outside/phenology";

beforeEach(() => {
  __clearLiveCastCache();
  fetchFieldTruth.mockResolvedValue({ facts: { fieldSnapshot: {} } });
});

it("does not resurrect local calendar presence when the producer supplies no curated entries (#621)", async () => {
  const date = new Date("2026-08-27T12:00:00Z");
  // Establish the adversarial condition using existing teaching metadata:
  // a local event exists this week, but the mocked producer selected nothing.
  const local = await getPhenologyEntries({ region: "uk-north", date, limit: 100 });
  expect(local.some((entry) => entry.species === "Swallow Gathering")).toBe(true);

  const cast = await resolveLiveCast({ lat: 54.9783, lng: -1.6178, date });
  expect(fetchFieldTruth).toHaveBeenCalledOnce();
  expect(cast.members).toEqual([]);
  expect(cast.absences).toEqual([]);
});
