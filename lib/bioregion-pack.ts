import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bioregionPackSchema, type BioregionPack, type PackKey } from "@/schema/bioregion";

/**
 * The bioregion pack registry: which pack file answers for a place.
 *
 * Packs live in `packs/bioregion/<key>.json`, one file per pack key, the same
 * way curriculum packs are plain files on disk — no DB, no API, no network.
 *
 * ── THE DIRECTORY IS EMPTY, AND THAT IS THE SHIPPED STATE ──────────────────
 *
 * Wave 1 declares all 26 dimensions and fills none of them (J1). So no pack
 * file exists yet, every lookup walks the whole chain and finds nothing, and
 * `bioregionPackFor` returns a pack that is DECLARED and EMPTY — carrying the
 * key we resolved for the place, and nothing else.
 *
 * That return value is the point. An empty-but-keyed pack means every consumer
 * downstream behaves correctly today (the validity resolver excludes nothing,
 * the habitat seam falls back to the authored base) and correctly tomorrow,
 * with no code change, the moment #209 writes the first file. The alternative
 * — leaving the consumers unwired until data exists — is how a seam rots
 * between being built and being used.
 *
 * ── WHY IT NEVER RETURNS NULL ──────────────────────────────────────────────
 *
 * A null pack and an empty pack would mean the same thing to every caller
 * today and different things later, which is the ambiguity this whole wave
 * exists to remove. `source` is what actually carries the distinction: the
 * key of the file that answered, or null when none did.
 */

const PACK_DIR = "bioregion";

export interface ResolvedBioregionPack {
  pack: BioregionPack;
  /**
   * The key of the file that answered, or null when no file did and the pack
   * below is the empty declaration. Provenance, and the honest way to tell
   * "this place has a pack that says nothing" from "this place has no pack".
   */
  source: string | null;
  /** The chain that was walked, for a report or a debug line. */
  chain: string[];
}

function packPath(key: string): string {
  return join(process.cwd(), "packs", PACK_DIR, `${key}.json`);
}

/**
 * Read one pack file by key, or null when there is none.
 *
 * A malformed pack file returns null rather than throwing. A bioregion pack is
 * an enrichment: failing to read one must never take down the lesson a teacher
 * is standing in front of a class to lead. Same paper-grade rule the rest of
 * the server helpers run on.
 */
export function loadBioregionPack(key: string): BioregionPack | null {
  const file = packPath(key);
  if (!existsSync(file)) return null;
  try {
    return bioregionPackSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/**
 * How the walk finds a pack for one key. The disk reader is the only
 * implementation that ships; it is a parameter so the chain's behaviour can be
 * proven against a pack that EXISTS.
 *
 * That matters more than it looks. The directory is empty in wave 1, so every
 * assertion about this walk would otherwise be an assertion about finding
 * nothing — and a walk that was never connected at all would pass every one of
 * them. Injecting a lookup lets the guard show the same call producing a
 * different, correct answer once a pack is there, which is the only evidence
 * that the wiring is real.
 */
export type BioregionPackLookup = (key: string) => BioregionPack | null;

/**
 * Walk the chain and return the first pack that answers, or the empty
 * declaration keyed to the most specific link we resolved.
 */
export function bioregionPackFor(
  chain: readonly PackKey[],
  lookup: BioregionPackLookup = loadBioregionPack
): ResolvedBioregionPack {
  const keys = chain.map((key) => key.value);

  for (const key of chain) {
    const pack = lookup(key.value);
    if (pack) {
      // The file's own key is replaced by the one that RESOLVED it, so a pack
      // authored at `global` and reached from an arid school reports the walk
      // that got there rather than implying it was written for a desert.
      return { pack: { ...pack, key }, source: key.value, chain: keys };
    }
  }

  const mostSpecific = chain[0] ?? {
    resolution: "global" as const,
    value: "global",
    resolvedBy: "pack-key@none",
  };
  return {
    pack: bioregionPackSchema.parse({ key: mostSpecific }),
    source: null,
    chain: keys,
  };
}
