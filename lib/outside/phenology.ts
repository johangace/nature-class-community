// Server-only: reads the regional dataset from disk; never import from a client component.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Confidence, HabitatTag, PhenologyEntry, RegionId } from "./types";

/**
 * Phenology reader — what's stirring near a school this week.
 *
 * The data is a region file per biome (lib/outside/data/phenology/<region>.json),
 * keyed by ISO week (1–52) → the species in season that week. Files are read
 * from disk on demand and cached per server instance, so the 15 regions never
 * all sit in the bundle and a class session never re-reads the file.
 *
 * Server-only: never ship the whole regional dataset to a browser.
 */

type RegionData = Record<string, PhenologyEntry[]>;

const DATA_DIR = path.join(process.cwd(), "lib", "outside", "data", "phenology");
const cache = new Map<RegionId, RegionData | null>();

async function loadRegion(region: RegionId): Promise<RegionData | null> {
  if (cache.has(region)) return cache.get(region) ?? null;
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${region}.json`), "utf8");
    const data = JSON.parse(raw) as RegionData;
    cache.set(region, data);
    return data;
  } catch {
    // A missing or unreadable region resolves to silence, never a broken page.
    cache.set(region, null);
    return null;
  }
}

/** ISO-ish week of the year, 1–52 (week 53 folds into 52). */
export function weekOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return Math.min(52, Math.max(1, Math.floor(day / 7) + 1));
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
const PHASE_RANK: Record<string, number> = { peak: 0, emerging: 1, fading: 2 };

function rank(a: PhenologyEntry, b: PhenologyEntry): number {
  const c = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
  if (c !== 0) return c;
  return (PHASE_RANK[a.narrativePhase ?? "emerging"] ?? 1) - (PHASE_RANK[b.narrativePhase ?? "emerging"] ?? 1);
}

export interface PhenologyQuery {
  region: RegionId;
  date: Date;
  /** A school's habitats, when known; empty means "show everything in season". */
  habitats?: HabitatTag[];
  limit?: number;
}

/**
 * The phenology in season near this school this week, ranked by confidence
 * then narrative phase (peak before emerging before fading) and trimmed.
 * Returns [] when the region or week has nothing — the caller shows less.
 * The card turns these into the "what to look for" lines; index also uses
 * them as the no-photo fallback when Pointmoon has no live observations.
 */
export async function getPhenologyEntries(query: PhenologyQuery): Promise<PhenologyEntry[]> {
  const { region, date, habitats, limit = 5 } = query;
  const data = await loadRegion(region);
  if (!data) return [];

  const week = weekOfYear(date);
  const entries = data[String(week)] ?? [];
  const wanted = habitats && habitats.length > 0 ? new Set(habitats) : null;

  return entries
    .filter((e) => (wanted ? e.habitats.some((h) => wanted.has(h)) : true))
    .slice()
    .sort(rank)
    .slice(0, limit);
}

/** Classification metadata only. These rows must never establish local presence. */
export async function phenologyMetadata(region: RegionId): Promise<PhenologyEntry[]> {
  const data = await loadRegion(region);
  return data ? Object.values(data).flat() : [];
}
