import type { FieldTruth } from "./pointmoon";
import type { PhenologyEntry, ResolvedPlace } from "./types";

/**
 * Zoom two: what a map can see around a school.
 *
 * Pointmoon already serves this. It carries roughly thirty-five
 * `outdoor.place.*` signals derived from OpenStreetMap, with provenance and a
 * TTL, and its landcover vocabulary includes `schoolyard-edge` and
 * `campus-mosaic` — categories somebody shaped for exactly this. Nature Class
 * reads five signals in total and none of them are these (#277).
 *
 * This module reads the slice a teacher can sensibly be asked to confirm. It
 * reads, it never infers: a signal that is absent stays absent, and the
 * onboarding screen says nothing about it rather than guessing at an empty
 * schoolyard. That is the same rule the conditions line and the cast run on.
 *
 * WHY IT IS SEPARATE FROM WHAT SHE SAYS. A map fact and a teacher fact are
 * known in different ways and must never render as each other. She is standing
 * in the place, so she wins on anything inside the fence. The map is better
 * than she is on what surrounds it, and it is also five years stale sometimes.
 * The disagreements between the two are the useful part, so nothing here
 * merges them.
 */

/** One thing the map can see, phrased for a teacher to confirm or deny. */
export interface PlaceObservation {
  /** The Pointmoon signal id this came from. Provenance, never decoration. */
  signalId: string;
  /** What it says, in plain words a teacher reads. */
  says: string;
  /** The site-feature or grounds value this suggests, when it maps to one. */
  suggests?: string;
}

export interface PlaceRead {
  observations: PlaceObservation[];
  /** True when Pointmoon answered at all. False means say nothing, not "none". */
  answered: boolean;
}

/**
 * ── WHAT THIS FILE GOT WRONG UNTIL #284, AND HOW ───────────────────────────
 *
 * Two of the six signals below did not exist. `outdoor.place.managed_level`
 * and `outdoor.place.landcover_type` are not in Pointmoon's vocabulary and
 * never were, so those two lines could not fire on any payload ever served.
 *
 * Worse, three of the four that DID exist were read as if they carried words.
 * Pointmoon returns most `outdoor.place.*` signals as PROXIES: a number from 0
 * to 1, not "high" or "adjacent". On the live London read that meant:
 *
 *   canopy_proxy       0.14 → "Tree canopy over part of the site."  FALSE, and
 *                             it prefilled "trees" into her answers.
 *   water_adjacency    0.12 → "Open water close by."                FALSE, and
 *                             it prefilled "pond".
 *   horizon_openness   0.4  → nothing, ever. `/open|wide/` cannot match "0.4".
 *
 * So the one signal that worked was `habitat_type`, and the module was quietly
 * inventing two site features for a built-up London school. The old unit tests
 * passed because they fed it "high" and "adjacent" — a vocabulary the producer
 * does not speak. Testing against a shape nobody serves is how a module stays
 * green for months while being wrong on every real request.
 *
 * The reader below is proxy-aware and has a DEAD BAND. Above `PRESENT` it says
 * the thing is there; at or below `ABSENT` it says it is not; in between it
 * says NOTHING. A 0.2 canopy proxy is genuinely ambiguous — some trees at the
 * edge of the tile, maybe — and the honest answer to an ambiguous number is
 * silence, not a sentence a teacher has to argue with.
 */

/**
 * A proxy at or above this reads as present.
 *
 * Deliberately high. London's live `horizon_openness` is 0.4, and "open sky
 * overhead, not much blocking it" is not a true sentence about a built-up
 * street in Islington. A middling proxy is a middling place, and the surface
 * has nothing useful to tell a teacher who is standing in it.
 */
const PRESENT = 0.5;
/** A proxy at or below this reads as confidently absent. Between the two: silence. */
const ABSENT = 0.05;

/** The signals worth putting in front of a teacher, and how each one reads. */
const READABLE: Array<{
  id: string;
  /** Turn a raw value into a sentence, or null to skip this signal entirely. */
  read: (value: string) => { says: string; suggests?: string } | null;
}> = [
  {
    id: "outdoor.place.canopy_proxy",
    read: (v) =>
      proxy(v, {
        present: { says: "Tree canopy over part of the site.", suggests: "trees" },
        absent: null,
      }),
  },
  {
    id: "outdoor.place.water_adjacency",
    read: (v) =>
      proxy(v, {
        present: { says: "Open water close by.", suggests: "pond" },
        absent: { says: "No open water we can see." },
      }),
  },
  {
    // Replaces the non-existent `managed_level`. Structural complexity is the
    // signal that actually separates a mown rectangle from a corner left to
    // grow, and unlike "managed level" it is a thing Pointmoon serves.
    id: "outdoor.place.habitat_complexity",
    read: (v) =>
      proxy(v, {
        // No `suggests`. The prefill vocabulary is GROUNDS (trees, meadow,
        // hedgerow, pond, playground, coast) and structural complexity does
        // not name any of them. Guessing "meadow" off a complexity proxy would
        // be the same invention this pass is removing.
        present: { says: "Parts of the grounds look layered and left to grow." },
        absent: { says: "The grounds look closely kept." },
      }),
  },
  {
    // Replaces the non-existent `landcover_type`. Edges — a hedge line, a
    // fence, the side of a path — are where a class actually finds things, so
    // this is the more useful question anyway.
    id: "outdoor.place.edge_density",
    read: (v) =>
      proxy(v, {
        present: { says: "Plenty of edges here: hedges, fences, path sides." },
        absent: null,
      }),
  },
  {
    id: "outdoor.place.habitat_type",
    read: (v) => (v ? { says: `Nearest habitat: ${humanise(v)}.` } : null),
  },
  {
    // Pointmoon serves this as a word, not a proxy: "open", "restricted",
    // "permit". Read as a word, and say nothing about a value we do not know.
    id: "nature.management.access_mode",
    read: (v) =>
      /^open$/i.test(v.trim())
        ? { says: "The map has this as open ground you can walk into." }
        : /restrict|permit|private|closed/i.test(v)
          ? { says: "The map thinks getting in here may need permission." }
          : null,
  },
  {
    id: "outdoor.place.horizon_openness",
    read: (v) =>
      proxy(v, {
        present: { says: "Open sky overhead, not much blocking it." },
        absent: { says: "Buildings and trees close the sky in here." },
      }),
  },
];

type Read = { says: string; suggests?: string };

/**
 * Read a 0-to-1 proxy, or fall back to the legacy word form.
 *
 * The dead band is the point: a value between ABSENT and PRESENT returns null,
 * so the surface says nothing rather than committing to a half-signal. A value
 * that is not a number at all is read as a word, so a producer that ever
 * switches back to "high"/"none" keeps working instead of going silent.
 */
function proxy(
  value: string,
  outcomes: { present: Read | null; absent: Read | null }
): Read | null {
  const trimmed = value.trim();
  const n = Number(trimmed);
  if (trimmed.length > 0 && Number.isFinite(n)) {
    if (n >= PRESENT) return outcomes.present;
    if (n <= ABSENT) return outcomes.absent;
    return null;
  }
  if (/^(none|absent|no|false)$/i.test(trimmed)) return outcomes.absent;
  if (trimmed.length === 0) return null;
  return outcomes.present;
}

/** "schoolyard-edge" reads as "a schoolyard edge". Hyphens are ours, not hers. */
function humanise(value: string): string {
  return value.replace(/[-_]/g, " ").toLowerCase();
}

/**
 * Read the place slice out of a Pointmoon payload.
 *
 * `answered: false` when the payload carried no signals at all. That is not
 * the same as a place with nothing in it, and the surface must say nothing
 * rather than describe an empty schoolyard.
 */
export function readPlace(data: FieldTruth | null): PlaceRead {
  const signals = data?.facts?.signals;
  if (!Array.isArray(signals) || signals.length === 0) {
    return { observations: [], answered: false };
  }

  const byId = new Map<string, string>();
  for (const signal of signals) {
    if (typeof signal?.id !== "string") continue;
    const value = signal.value;
    if (value === undefined || value === null) continue;
    byId.set(signal.id, String(value));
  }
  if (byId.size === 0) return { observations: [], answered: false };

  const observations: PlaceObservation[] = [];
  for (const entry of READABLE) {
    const raw = byId.get(entry.id);
    if (raw === undefined) continue;
    const read = entry.read(raw);
    if (!read) continue;
    observations.push({ signalId: entry.id, ...read });
  }

  return { observations, answered: true };
}

/**
 * The prefix Pointmoon's geocoder evidence uses for the full address. Evidence
 * is provenance rather than a promised schema, so this is matched leniently
 * and a payload that stops carrying it simply reads as an address we do not
 * have.
 */
const DISPLAY_NAME = /^displayName\s*=\s*(.+)$/;

/**
 * Read where this payload thinks it is.
 *
 * This is the other half of the module. Everything above answers "what is this
 * place like", for the questions onboarding asks a teacher to confirm. This
 * answers "which place is it", which is the question she was never asked
 * (#315): the location step took coordinates from her browser, showed her a
 * sky, and named nothing. A wrong fix from a VPN exit node or a carrier
 * gateway rendered exactly like a right one.
 *
 * Same rule as the rest of the file: it reads, it never infers. Null when the
 * payload carried no place, and either field null when that field is missing.
 * A point the map cannot name is a real answer, and the surface says so.
 */
export function readResolvedPlace(data: FieldTruth | null): ResolvedPlace | null {
  const place = data?.facts?.fieldSnapshot?.place;
  if (!place) return null;

  const name = place.placeName?.trim();
  const address = (place.evidence ?? [])
    .map((line) => DISPLAY_NAME.exec(line.trim())?.[1]?.trim())
    .find((found): found is string => !!found);

  if (!name && !address) return null;
  return { name: name || null, address: address ?? null };
}

/** The values the map suggests a teacher tick, for prefilling her answers. */
export function suggestedFrom(read: PlaceRead): string[] {
  return [...new Set(read.observations.map((o) => o.suggests).filter((s): s is string => !!s))];
}

/**
 * Which habitats this week's life actually occupies, commonest first.
 *
 * This is the number that makes "look under logs" visibly wrong in August: in
 * southern England in week 33 the life is in grassland, meadow and hedgerow,
 * and woodland barely appears. The instruction is not merely wrong in Phoenix,
 * it is wrong in London too, and it is wrong on TIME rather than on place.
 */
export function rankHabitats(entries: readonly PhenologyEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const habitat of entry.habitats ?? []) {
      counts.set(habitat, (counts.get(habitat) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}
