// Validate dated USA-NPN reports at the Pointmoon boundary; run: npm test -- seasonal-observations.
import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) =>
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const identifier = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const label = z.string().trim().min(1).max(240);
const record = z.object({
  observationId: identifier,
  siteId: identifier,
  speciesId: identifier,
  individualId: identifier.nullable(),
  datasetId: identifier,
  datasetName: label,
  scientificName: label,
  commonName: label.nullable(),
  phenophaseId: identifier,
  phenophase: label,
  observedOn: calendarDate,
  status: z.enum(["present", "absent", "uncertain"]),
  distanceKm: z.number().finite().min(0).max(5),
  quality: z.literal("observer-report-unverified"),
});
const report = z.object({
  source: z.literal("usa-npn"),
  evidenceKind: z.literal("observation"),
  coverage: z.literal("US-observation-sites"),
  silent: z.literal(false),
  center: z.object({ latitude: z.number().finite().min(24).max(50), longitude: z.number().finite().min(-125).max(-66) }),
  radiusKm: z.literal(5),
  window: z.object({ startDate: calendarDate, endDate: calendarDate }),
  records: z.array(record).min(1).max(50),
  retrievedAt: z.iso.datetime(),
  ttlMinutes: z.literal(1440),
  sourceUrl: z.url().refine((s) => {
    const url = new URL(s);
    return url.protocol === "https:" && url.hostname === "services.usanpn.org" && !url.username && !url.password && !url.port && url.pathname === "/npn_portal/observations/getObservations.json";
  }),
  license: z.literal("CC-BY-4.0"),
  attribution: z.string().trim().min(1).max(1500),
  citations: z.array(z.string().trim().min(1).max(1500)).min(1).max(10),
  termsUrl: z.literal("https://www.usanpn.org/about/terms"),
  truncated: z.boolean(),
  excludedRecordCount: z.number().int().min(0),
});
export type SeasonalObservations = z.infer<typeof report>;
export type SeasonalObservation = SeasonalObservations["records"][number];

/** A missing, stale, wrong-place or modelled block cannot enter a teacher's brief. */
export function parseSeasonalObservations(value: unknown, expected: { lat: number; lng: number; now?: number }): SeasonalObservations | null {
  const parsed = report.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  const now = expected.now ?? Date.now();
  if (!Number.isFinite(expected.lat) || !Number.isFinite(expected.lng) || !Number.isFinite(now)) return null;
  if (Math.abs(data.center.latitude - expected.lat) > 0.000001 || Math.abs(data.center.longitude - expected.lng) > 0.000001) return null;
  const retrieved = Date.parse(data.retrievedAt);
  if (retrieved > now + 5 * 60_000 || now - retrieved >= 86_400_000) return null;
  const end = Date.parse(data.window.endDate);
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  // US local day can still be yesterday in UTC. This surface consumes a current
  // observation window, never silently substitutes a historical-year sample.
  if (end > today || today - end > 86_400_000 || end - Date.parse(data.window.startDate) !== 6 * 86_400_000) return null;
  if (data.records.some((r) => r.observedOn < data.window.startDate || r.observedOn > data.window.endDate)) return null;
  if (new Set(data.records.map((r) => r.observationId)).size !== data.records.length) return null;
  return data;
}

/** Default off until the producer opt-in is deployed. Only explicit US-extent reads opt in. */
export function seasonalObservationsEnabled(lat: number, lng: number): boolean {
  return process.env.POINTMOON_USANPN_ENABLED === "1" && lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
}

/** Match the existing lesson reference species; preserve each record's own status and date. */
export function lessonSeasonalObservations(data: SeasonalObservations | null | undefined, species: readonly { scientificName?: string | null }[]): SeasonalObservations | null {
  if (!data) return null;
  const names = new Set(species.flatMap((s) => s.scientificName ? [s.scientificName.trim().toLowerCase()] : []));
  const seen = new Set<string>();
  const records = [...data.records].sort((a, b) => b.observedOn.localeCompare(a.observedOn)).filter((r) => {
    const key = `${r.siteId}:${r.speciesId}:${r.phenophaseId}:${r.individualId ?? r.observationId}`;
    if (!names.has(r.scientificName.toLowerCase()) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
  return records.length ? { ...data, records } : null;
}
