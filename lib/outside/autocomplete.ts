import { z } from "zod";
import type { GeocodeResult } from "./geocode";

// Photon supports search-as-you-type; the public Nominatim endpoint explicitly
// forbids autocomplete. Keep explicit searches on the existing provider.
// Public Photon permits reasonable project use, without an availability SLA.
// AUTOCOMPLETE_API_URL can point at a dedicated Photon instance as volume grows.
const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.object({
    osm_id: z.union([z.string(), z.number()]).optional(),
    osm_type: z.string().optional(),
    name: z.string().optional(), street: z.string().optional(),
    housenumber: z.string().optional(), postcode: z.string().optional(),
    city: z.string().optional(), district: z.string().optional(),
    state: z.string().optional(), country: z.string().optional(),
  }),
});
const cache = new Map<string, { at: number; results: GeocodeResult[] }>();
const pending = new Map<string, Promise<GeocodeResult[]>>();

export function autocompleteResults(payload: unknown): GeocodeResult[] {
  const collection = z.object({ features: z.array(z.unknown()) }).parse(payload);
  return collection.features.flatMap((feature): GeocodeResult[] => {
    const parsed = featureSchema.safeParse(feature);
    if (!parsed.success) return [];
    const { geometry, properties: p } = parsed.data;
    const label = [...new Set([p.name, [p.housenumber, p.street].filter(Boolean).join(" "),
      p.postcode, p.city ?? p.district, p.state, p.country].filter(Boolean))].join(", ");
    if (!label) return [];
    const [lng, lat] = geometry.coordinates;
    return [{ id: `${p.osm_type ?? "place"}:${p.osm_id ?? `${lat},${lng}`}`,
      label, lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 }];
  }).slice(0, 5);
}

export async function autocompletePlace(query: string): Promise<GeocodeResult[]> {
  const key = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (key.length < 2) return [];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.results;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    const url = new URL(process.env.AUTOCOMPLETE_API_URL ?? "https://photon.komoot.io/api/");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("limit", "5");
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "nature-class/1.0 (https://natureclass.education)" },
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Place suggestions unavailable");
    const results = autocompleteResults(await response.json());
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), results });
    return results;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
