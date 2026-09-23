/**
 * WHICH ROWS ARE THE SAME CREATURE (#1030).
 *
 * Pure: names in, an identity out. No I/O, no network, no clock — so the whole
 * rule can be replayed against a recorded payload.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * Johan, 2026-09-07: "Up to four species? This is also a bug. We don't need to
 * limit, we need to make it contextual. That's why we have gotten bad data
 * lately where iNaturalist has so many versions."
 *
 * One organism reaches us as several rows. A recorded London read carries
 * `Columba livia` from the nearby list and the same taxon again from the
 * notable-birds list; a payload with a subspecies identification carries
 * `Columba livia domestica` beside it; someone who did not take an
 * identification past the genus contributes a bare `Pieris` next to
 * `Pieris rapae`; a row that lost its scientific name upstream arrives as the
 * species' other common name with nothing but a taxon id to say what it is.
 *
 * The resolver used to dedupe on `(scientificName ?? commonName).toLowerCase()`,
 * which sees none of those as duplicates. Every extra version then competed
 * for a capped board and pushed a genuinely different creature off it. On the
 * fixture recorded for this ticket, two of a four-slot minibeast board were
 * the same butterfly.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 *
 * Two rows are the same accepted taxon when ANY of these holds. They are
 * checked in this order, and the winning one is reported so a caller can treat
 * a rank rollup differently from an exact identity:
 *
 *   1. `taxon-id`   — both carry iNaturalist's own id for what they were
 *                     identified as, and the ids are equal. The strongest
 *                     statement available, and the only one that survives a
 *                     row with no scientific name at all.
 *   2. `binomial`   — the accepted binomials agree once infraspecific rank is
 *                     dropped. This is what collapses subspecies, varieties
 *                     and forms into their species: `Columba livia domestica`
 *                     and `Columba livia` are one creature to a class.
 *   3. `rank`       — one row is identified only to a genus that the other row
 *                     belongs to. A genus-rank row is a LESS PRECISE reading of
 *                     the same sighting, not a second creature; a class cannot
 *                     be sent to find "a Pieris" separately from the small
 *                     white in the same hedge.
 *   4. `synonym`    — the specific epithet AND the common name agree while the
 *                     genus does not. That is a genus transfer, the dominant
 *                     kind of synonym in this data (Cooper's Hawk arrives as
 *                     `Astur cooperii` in one recorded payload and as
 *                     `Accipiter cooperii` in older references). Both halves
 *                     are required: an epithet alone repeats across genera.
 *   5. `common-name` — neither row can be placed taxonomically at all and the
 *                     common names agree. This is the old string rule, kept
 *                     for the rows it was the only answer for.
 *
 * WHAT IS DELIBERATELY NOT HERE: a hand-written synonym table. Writing down
 * that two names are the same organism is a claim about nature, and this
 * product does not author those. Rules 1 to 5 read what the payload already
 * says. A synonym the producer does not evidence stays two rows, honestly.
 */

/** The fields any row must offer to be placed. All optional; none is trusted. */
export interface TaxonRow {
  /** The common name, as an observer typed it. */
  name?: string | null;
  scientificName?: string | null;
  /** Pointmoon's presence evidence, which carries iNaturalist's taxon id. */
  presence?: { taxonId?: string | null } | null;
}

/** What a row says about which taxon it is. Every field may be null. */
export interface TaxonIdentity {
  /** The provider's own id for the taxon this row was identified as. */
  taxonId: string | null;
  /** Lowercased first name-part: the genus, or whatever higher rank stands there. */
  genus: string | null;
  /** Lowercased specific epithet, when the row got that far. */
  epithet: string | null;
  /** `genus epithet`, or the bare genus when that is all there is. */
  binomial: string | null;
  /** The common name, lowercased and stripped of punctuation. */
  common: string | null;
}

/** How two rows were found to be the same taxon. */
export type TaxonMatch = "taxon-id" | "binomial" | "rank" | "synonym" | "common-name";

/**
 * Name-parts that mark the rank BELOW species rather than a name of their own.
 * Dropping them is what turns a trinomial into its accepted binomial.
 */
const INFRASPECIFIC = new Set([
  "subsp",
  "subsp.",
  "ssp",
  "ssp.",
  "spp",
  "spp.",
  "var",
  "var.",
  "f",
  "f.",
  "forma",
  "cv",
  "cv.",
  "nothosubsp",
  "nothosubsp.",
  "sp",
  "sp.",
]);

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * A common name reduced to its letters and digits, so "Common Wood-Pigeon" and
 * "common wood pigeon" are one name. Punctuation is the only thing removed;
 * no word is stripped, because a taxon word carries meaning here ("Cabbage
 * White" and "Cabbage" are not interchangeable).
 */
function normalizeCommon(value: unknown): string | null {
  const text = trimmed(value);
  if (text === null) return null;
  const collapsed = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * Split a scientific name into the parts that identify the taxon.
 *
 * The hybrid marker stays attached to the name it qualifies: `Quercus × rosacea`
 * is a real taxon and is not the same thing as `Quercus rosacea`.
 */
function scientificParts(value: unknown): { genus: string | null; epithet: string | null } {
  const text = trimmed(value);
  if (text === null) return { genus: null, epithet: null };

  const raw = text
    .toLowerCase()
    // Author citations and qualifiers travel in brackets when they travel.
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}×\-. ]+/gu, " ")
    .split(/\s+/)
    .filter((part) => part.length > 0);

  const parts: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const part = raw[index]!;
    if (INFRASPECIFIC.has(part)) continue;
    if (part === "×" || part === "x") {
      const next = raw[index + 1];
      if (next !== undefined && !INFRASPECIFIC.has(next)) {
        parts.push(`×${next}`);
        index += 1;
      }
      continue;
    }
    // A bare rank abbreviation is not a name; anything else is.
    if (/^[\p{L}×]/u.test(part)) parts.push(part);
  }

  const genus = parts[0] ?? null;
  const epithet = parts[1] ?? null;
  return { genus, epithet };
}

/** What one row says about which taxon it is. */
export function taxonIdentity(row: TaxonRow): TaxonIdentity {
  const { genus, epithet } = scientificParts(row.scientificName);
  return {
    taxonId: trimmed(row.presence?.taxonId),
    genus,
    epithet,
    binomial: genus === null ? null : epithet === null ? genus : `${genus} ${epithet}`,
    common: normalizeCommon(row.name),
  };
}

/**
 * Whether two identities are the same accepted taxon, and by which rule.
 * Null means they are two different creatures as far as this data can say.
 */
export function sameTaxon(a: TaxonIdentity, b: TaxonIdentity): TaxonMatch | null {
  if (a.taxonId !== null && b.taxonId !== null && a.taxonId === b.taxonId) return "taxon-id";
  if (a.binomial !== null && b.binomial !== null && a.binomial === b.binomial) return "binomial";
  if (
    a.genus !== null &&
    b.genus !== null &&
    a.genus === b.genus &&
    (a.epithet === null) !== (b.epithet === null)
  ) {
    return "rank";
  }
  if (
    a.epithet !== null &&
    b.epithet !== null &&
    a.epithet === b.epithet &&
    a.common !== null &&
    b.common !== null &&
    a.common === b.common
  ) {
    return "synonym";
  }
  if (
    a.binomial === null &&
    b.binomial === null &&
    a.taxonId === null &&
    b.taxonId === null &&
    a.common !== null &&
    b.common !== null &&
    a.common === b.common
  ) {
    return "common-name";
  }
  return null;
}

/**
 * The set of taxa a cast has already taken.
 *
 * A linear scan rather than a hash: the rules above are relational — a genus
 * row and a species row hash differently and are still one creature — and a
 * cast is tens of rows, not thousands.
 */
export class TaxonKeyring {
  private readonly claimed: TaxonIdentity[] = [];

  /** True when this row is a taxon already taken. */
  has(row: TaxonRow): boolean {
    const identity = taxonIdentity(row);
    return this.claimed.some((held) => sameTaxon(held, identity) !== null);
  }

  /** Take this row's taxon. False when it was already taken and nothing changed. */
  claim(row: TaxonRow): boolean {
    const identity = taxonIdentity(row);
    if (this.claimed.some((held) => sameTaxon(held, identity) !== null)) return false;
    this.claimed.push(identity);
    return true;
  }

  get size(): number {
    return this.claimed.length;
  }
}

/**
 * How specific an identification is. Higher wins the right to represent the
 * group, because the more precise reading is the one a class can act on: "a
 * small white" sends a child to a creature, "a Pieris" sends them to a
 * taxonomy.
 */
function specificity(identity: TaxonIdentity): number {
  if (identity.epithet !== null) return 2;
  if (identity.genus !== null) return 1;
  return 0;
}

export interface CollapseOptions<T> {
  /**
   * Tie-break between two equally specific versions of one taxon. Negative
   * keeps `a`. Ties keep the earlier row, so the collapse is deterministic and
   * a recorded payload replays identically.
   */
  prefer?: (a: T, b: T) => number;
  /**
   * Fold a dropped version's evidence into the surviving one. `match` says HOW
   * the two were found to be one taxon, so a caller can refuse to carry
   * anything across a rank rollup — a photograph taken of "some Pieris" is not
   * a photograph of a small white, even though the rows collapse.
   */
  merge?: (representative: T, duplicate: T, match: TaxonMatch) => T;
}

/**
 * One row per accepted taxon, in first-appearance order.
 *
 * COLLAPSE BEFORE RANKING, always. Ranking un-collapsed rows compares
 * fragments of one organism against whole ones: a species split across three
 * taxon versions has its count, its recurrence and its freshness split three
 * ways, so it ranks below a genuinely commoner species AND still spends three
 * slots when it does get in. See `docs/decisions/0005-*` for the reasoning.
 */
export function collapseByTaxon<T>(
  rows: readonly T[],
  read: (row: T) => TaxonRow,
  options: CollapseOptions<T> = {}
): T[] {
  /**
   * Every version seen of one taxon is kept, not just the survivor's. A group
   * that met a row by its taxon id must still recognise the next row that only
   * shares the binomial, whatever order the producer happened to send them in.
   */
  const groups: Array<{ row: T; best: TaxonIdentity; seen: TaxonIdentity[] }> = [];

  for (const row of rows) {
    const identity = taxonIdentity(read(row));
    let index = -1;
    let match: TaxonMatch | null = null;
    for (let i = 0; i < groups.length && index === -1; i += 1) {
      for (const held of groups[i]!.seen) {
        const found = sameTaxon(held, identity);
        if (found !== null) {
          index = i;
          match = found;
          break;
        }
      }
    }

    if (index === -1 || match === null) {
      groups.push({ row, best: identity, seen: [identity] });
      continue;
    }

    const group = groups[index]!;

    // The more specific identification represents the taxon; among equals, the
    // caller's evidence order decides, and a tie keeps the row we met first.
    const finer = specificity(identity) - specificity(group.best);
    const keepHeld =
      finer < 0 || (finer === 0 && (options.prefer?.(group.row, row) ?? 0) <= 0);
    const winner = keepHeld ? group.row : row;
    const loser = keepHeld ? row : group.row;

    groups[index] = {
      row: options.merge ? options.merge(winner, loser, match) : winner,
      best: keepHeld ? group.best : identity,
      seen: [...group.seen, identity],
    };
  }

  return groups.map((group) => group.row);
}
