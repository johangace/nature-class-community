import { isRegionId } from "./regions";
import type { FieldTruth } from "./pointmoon";
import type { PhenologyEntry, HabitatTag } from "./types";
import { asHabitatTags } from "./grounds";
import { phenologyMetadata } from "./phenology";
import { producerWeek } from "./producer-week";

/** Producer expectations are regional reference, never an observation. */
export interface CuratedPhenology {
  epistemicType: "curated";
  provider: "hand-authored";
  regionKey: string;
  week: number;
  readAt: string;
  entries: Array<PhenologyEntry & { epistemicType: "curated" }>;
}
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;

/** Narrow at the transport boundary; malformed or undeclared lineage is silence. */
export function parseCuratedPhenology(value: unknown, readAt: unknown): CuratedPhenology | undefined {
  const p = object(value);
  const date = text(readAt);
  if (!p || p.epistemicType !== "curated" || p.provider !== "hand-authored" ||
      !text(p.regionKey) || !date || !/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date)) ||
      !Number.isInteger(p.week) || Number(p.week) < 1 || Number(p.week) > 53 ||
      producerWeek(new Date(date)).week !== p.week || !Array.isArray(p.entries)) return undefined;
  const entries: CuratedPhenology["entries"] = [];
  for (const raw of p.entries) {
    const e = object(raw);
    if (!e || e.epistemicType !== "curated" || !text(e.id) || !text(e.species) ||
        (e.scientificName !== undefined && e.scientificName !== null && !text(e.scientificName)) ||
        !text(e.description) || !Array.isArray(e.habitats) || !Array.isArray(e.senses) ||
        !["high", "medium", "low"].includes(String(e.confidence)) ||
        (e.kind !== undefined && e.kind !== "species" && e.kind !== "event")) continue;
    entries.push({
      id: text(e.id)!, species: text(e.species)!, scientificName: text(e.scientificName) ?? undefined,
      kind: e.kind as PhenologyEntry["kind"], description: text(e.description)!,
      habitats: asHabitatTags(e.habitats.filter((h): h is string => typeof h === "string")),
      senses: e.senses.filter((s): s is PhenologyEntry["senses"][number] => ["sight", "sound", "smell", "touch"].includes(String(s))),
      confidence: e.confidence as PhenologyEntry["confidence"],
      narrativePhase: ["emerging", "peak", "fading"].includes(String(e.narrativePhase)) ? e.narrativePhase as PhenologyEntry["narrativePhase"] : undefined,
      childFriendlyNote: text(e.childFriendlyNote) ?? undefined, epistemicType: "curated",
    });
  }
  return { epistemicType: "curated", provider: "hand-authored", regionKey: text(p.regionKey)!, week: Number(p.week), readAt: date, entries };
}

/** An exact metadata match classifies a producer row; it never supplies a row. */
export function classifyCuratedEntries(p: CuratedPhenology | undefined, metadata: readonly PhenologyEntry[], date: Date): PhenologyEntry[] {
  const requested = producerWeek(date);
  if (!p || p.week !== requested.week || producerWeek(new Date(p.readAt)).year !== requested.year) return [];
  return p.entries.flatMap(e => {
    const matches = metadata.filter(m => m.id === e.id);
    const identity = (m: PhenologyEntry) => m.species === e.species && (m.scientificName ?? "") === (e.scientificName ?? "");
    if (matches.some(m => !identity(m))) return [];
    const kinds = new Set(matches.map(m => m.kind ?? "species"));
    if (kinds.size > 1) return [];
    const known = kinds.size === 1 ? [...kinds][0] : undefined;
    if (e.kind && known && e.kind !== known) return [];
    const kind = e.kind ?? known;
    return kind ? [{ ...e, kind }] : [];
  });
}

export async function curatedEntries(data: FieldTruth | null, date = new Date(), habitats?: readonly HabitatTag[], limit = Infinity): Promise<PhenologyEntry[]> {
  const p = data?.facts?.fieldSnapshot?.phenology;
  if (!p) return [];
  // loadRegion's filename boundary accepts only the authored region vocabulary.
  const metadata = isRegionId(p.regionKey) ? await phenologyMetadata(p.regionKey) : [];
  return classifyCuratedEntries(p, metadata, date)
    .filter(e => !habitats?.length || e.habitats.some(h => habitats.includes(h)))
    .slice(0, limit);
}

/** Observation last-good may recover observations, never the previous calendar. */
export function curatedAlongsideFallback(selected: FieldTruth | null, current: FieldTruth | null): FieldTruth | null {
  if (!selected || selected === current) return selected;
  // Only the calendar's curated signals are replaced. Historical observation
  // signals belong to the observation last-good policy, not this calendar.
  const curatedSignal = (s: NonNullable<NonNullable<FieldTruth["facts"]>["signals"]>[number]) =>
    s.epistemicType === "curated" && s.id?.startsWith("nature.phenology.");
  const signals = [
    ...(selected.facts?.signals ?? []).filter(s => !curatedSignal(s)),
    ...(current?.facts?.signals ?? []).filter(s => curatedSignal(s)),
  ];
  return { ...selected, facts: { ...selected.facts, signals, fieldSnapshot: { ...selected.facts?.fieldSnapshot,
    phenology: current?.facts?.fieldSnapshot?.phenology } } };
}
