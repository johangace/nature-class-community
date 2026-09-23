import { tideStations } from "./tide-stations";
// Validate NOAA station references from Pointmoon; run: npm test -- coastal-tides.
import { z } from "zod";
const stamp = z.iso.datetime();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const height = z.number().finite().gt(-100).lt(100);
function sourceUrl(product: string) {
  return z.url().refine((s) => { const u = new URL(s); return u.protocol === "https:" && u.hostname === "api.tidesandcurrents.noaa.gov" && !u.username && !u.password && !u.port && u.pathname === "/api/prod/datagetter" && tideStations.some(station => station.id === u.searchParams.get("station")) && u.searchParams.get("datum") === "MLLW" && u.searchParams.get("units") === "metric" && u.searchParams.get("time_zone") === "gmt" && u.searchParams.get("product") === product; });
}
const prediction = z.object({ silent: z.literal(false), evidenceKind: z.literal("prediction"), issuedAt: z.null(), issuedAtStatus: z.literal("not-published"), retrievedAt: stamp, validDate: day, window: z.object({ startAt: stamp, endAt: stamp }), sourceUrl: sourceUrl("predictions"), ttlMinutes: z.literal(60), events: z.array(z.object({ at: stamp, heightMeters: height, type: z.enum(["high", "low"]) })).min(1).max(8) });
const measurement = z.object({ silent: z.literal(false), evidenceKind: z.literal("measurement"), observedAt: stamp, heightMeters: height, quality: z.enum(["preliminary", "verified"]), validUntil: stamp, retrievedAt: stamp, sourceUrl: sourceUrl("water_level"), ttlMinutes: z.literal(1) });
const envelope = z.object({
  source: z.literal("noaa-coops"), scope: z.literal("station-reference-only"), silent: z.literal(false),
  center: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }),
  localDate: day, selectedBy: z.literal("caller"), stationDistanceKm: z.number().finite().min(0).max(20020),
  station: z.object({ id: z.string(), name: z.string(), latitude: z.number(), longitude: z.number(), timezone: z.string(), datum: z.literal("MLLW"), datumEpoch: z.string().regex(/^\d{4}-\d{4}$/), units: z.literal("m"), metadataRetrievedAt: stamp, metadataUrl: z.string() }).refine(s => tideStations.some(known => known.id === s.id && known.name === s.name && known.latitude === s.latitude && known.longitude === s.longitude && known.timezone === s.timezone && s.metadataUrl === `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${known.id}.json?expand=details,datums&units=metric`)),
  attribution: z.string().trim().min(1).max(1000), license: z.literal("US-government-public-domain"), termsUrl: z.literal("https://tidesandcurrents.noaa.gov/disclaimers.html"),
});
export type CoastalTides = z.infer<typeof envelope> & { predictions: z.infer<typeof prediction> | null; measured: z.infer<typeof measurement> | null };
export interface CoastalTideQuery { lat: number; lng: number; stationId: string; date: string; now?: number }
export function noaaReferenceEnabled(): boolean { return process.env.POINTMOON_NOAA_ENABLED === "1"; }
function localDay(at: number, timezone: string): string { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
function fresh(at: string, now: number, ttl: number): boolean { return Date.parse(at) <= now + 300_000 && now - Date.parse(at) < ttl; }
/** Independent product validation means a stale reading cannot erase a future prediction. */
export function parseCoastalTides(value: unknown, expected: CoastalTideQuery): CoastalTides | null {
  const top = envelope.safeParse(value); if (!top.success || !value || typeof value !== "object") return null;
  const data = top.data, now = expected.now ?? Date.now();
  if (!Number.isFinite(now) || !Number.isFinite(expected.lat) || !Number.isFinite(expected.lng) || expected.stationId !== data.station.id || expected.date !== data.localDate || Math.abs(data.center.latitude - expected.lat) > 0.000001 || Math.abs(data.center.longitude - expected.lng) > 0.000001 || !fresh(data.station.metadataRetrievedAt, now, 86_400_000)) return null;
  const raw = value as Record<string, unknown>;
  const p = prediction.safeParse(raw.predictions), m = measurement.safeParse(raw.measured);
  let predictions = p.success ? p.data : null, measured = m.success ? m.data : null;
  if (predictions && new URL(predictions.sourceUrl).searchParams.get("station") !== data.station.id) predictions = null;
  if (measured && new URL(measured.sourceUrl).searchParams.get("station") !== data.station.id) measured = null;
  if (predictions) {
    const start = Date.parse(predictions.window.startAt), end = Date.parse(predictions.window.endAt);
    const duration = end - start;
    const midnight = (at: number) => new Intl.DateTimeFormat("en-GB", { timeZone: data.station.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at) === "00:00";
    const nextDay = new Date(Date.parse(data.localDate) + 86_400_000).toISOString().slice(0, 10);
    if (predictions.validDate !== expected.date || !fresh(predictions.retrievedAt, now, 3_600_000) || ![23,24,25].includes(duration / 3_600_000) || localDay(start, data.station.timezone) !== expected.date || localDay(end, data.station.timezone) !== nextDay || !midnight(start) || !midnight(end) || predictions.events.some(e => Date.parse(e.at) < start || Date.parse(e.at) >= end) || new Set(predictions.events.map(e => e.at)).size !== predictions.events.length) predictions = null;
  }
  if (measured && (data.localDate !== localDay(now, data.station.timezone) || localDay(Date.parse(measured.observedAt), data.station.timezone) !== data.localDate || Date.parse(measured.observedAt) > now || now - Date.parse(measured.observedAt) >= 18 * 60_000 || Date.parse(measured.validUntil) !== Date.parse(measured.observedAt) + 18 * 60_000 || !fresh(measured.retrievedAt, now, 60_000))) measured = null;
  return predictions || measured ? { ...data, predictions, measured } : null;
}
