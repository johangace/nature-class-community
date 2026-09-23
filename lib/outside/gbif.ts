// Server-only: talks to GBIF over HTTP. Never import from a client component.

/**
 * Seasonal truth from the occurrence record, not from a file somebody typed.
 *
 * ── WHY THIS EXISTS (#305) ─────────────────────────────────────────────────
 *
 * Johan, 2026-08-17, after onboarding told a class in Albania it was looking
 * for *"Apple, European Garden Spider, Common Pear near you this week"*:
 *
 *   *"I've been converting sentences to AI all afternoon while the facts
 *   underneath them came from a hand-typed file. That's the more important
 *   layer and I went past it."*
 *
 * The layer underneath was `lib/outside/data/phenology/*.json`: 15 files, 550
 * species, 4,388 rows, a median of FIVE species per week per region, with one
 * file (`western-europe.json`) covering Portugal, Ireland, Norway, Poland,
 * Greece and Albania. A Tirana schoolyard and a Dutch one read the same five
 * rows and three of them were orchard fruit.
 *
 * ── WHAT WE MEASURED BEFORE WRITING THIS ───────────────────────────────────
 *
 * Two readings, both taken live on 2026-08-17, both of which changed the plan:
 *
 * 1. **Pointmoon's own phenology is the same file.** `fieldSnapshot.phenology`
 *    returns `regionKey: "western-europe"`, week 34, entries `[Apple/peak,
 *    Fire Salamander/peak, European Garden Spider/peak, Woodland
 *    Mushrooms/emerging, Horse Chestnut/emerging]` — identical species, phases
 *    AND order to our `western-europe.json["34"]`, with `previouslyFeatured`
 *    drawn from the same file's week 33. Verified again at London/uk-south.
 *    So "let Pointmoon serve the seasonal layer" would have moved the hand-
 *    typed file into a repo we also own and changed nothing underneath.
 *
 * 2. **Live observations are not a seasonal answer.** Pointmoon's
 *    `observations.nearby`, measured the same hour: London 15, Porto 4, Tirana
 *    city 1, rural Albania 0, Tulsa Oklahoma 0. That list is *recent uploads*,
 *    which is a recency question. Phenology is a question about the historical
 *    record, and we had been asking a recency API a seasonality question.
 *
 * GBIF answers the question that was actually being asked. Same hour, same
 * coordinates, August, ~15km box: Tirana 845 occurrences, rural Elbasan 78,
 * Tulsa 35,977 — real records, in the places where the live feed was empty.
 *
 * ── WHAT THIS FILE IS ALLOWED TO DO ────────────────────────────────────────
 *
 * Retrieval. Nothing here decides what is true; it reports what was recorded.
 * No model is called from this file and no model may add to its output. The
 * counts, the months and the species names are GBIF's. Ranking and phrasing
 * happen downstream, over a list that is already true.
 */

/** One species actually recorded near this point, in this month, across years. */
export interface SeasonalSpecies {
  /** GBIF speciesKey. Stable, and the join key for anything downstream. */
  key: number;
  /** The common name where GBIF has one, otherwise the canonical binomial. */
  name: string;
  /** Always present; the binomial is what a teacher can look up. */
  scientificName: string;
  /** GBIF class, e.g. Aves, Insecta, Magnoliopsida. The findability handle. */
  taxonClass: string | null;
  /** Which stratum surfaced it, so birds cannot crowd out plants and bugs. */
  stratum: StratumId;
  /** Records in this month within the box, all years pooled. */
  occurrencesInMonth: number;
  /** Records in every month within the box. The denominator. */
  occurrencesAllYear: number;
  /**
   * Share of this species' local records that fall in this month. High share
   * means the month is when it is actually about, not merely when somebody
   * happened to log it.
   */
  monthShare: number;
  /** Twelve counts, January first. The phenology curve, as recorded. */
  monthHistogram: readonly number[];
  /**
   * Derived from the histogram, never asserted. `peak` when this month is at
   * or near the species' local maximum, `emerging` and `fading` when the
   * neighbouring months say which way it is going.
   */
  phase: "emerging" | "peak" | "fading" | "steady";
  /** What the list is ordered by, with every input it was computed from. */
  findability: Findability;
}

/**
 * Why this species sits where it sits, carried on the species rather than
 * hidden inside a comparator (#312).
 *
 * Every field here is a reading of GBIF's own metadata for this taxon, in this
 * box, in this month. `score` is arithmetic over the rest, so a reader holding
 * one of these rows can recompute the sort by hand and disagree with it.
 */
export interface Findability {
  /** 0-1. The sort key. Higher means more people found it, in daylight. */
  score: number;
  /**
   * How many different PEOPLE recorded this species here this month: GBIF's
   * free-text `recordedBy` labels normalised by `recorderIdentities`, never
   * more than the number of attributed records.
   */
  distinctObservers: number;
  /**
   * The largest single recorder's share of this month's ATTRIBUTED records,
   * 0-1. One person holding the whole record is the signature of a trap run or
   * a site survey, not of a thing a passer-by notices. Measured over records
   * that name a recorder, because a record naming nobody is not evidence of a
   * second person (#1211 review).
   */
  topObserverShare: number;
  /**
   * Share of this month's records that name a recorder at all, 0-1. The
   * observer-spread term is only as strong as this: see `findabilityScore`.
   * Null when the `recordedBy` facet was still running at its paging bound, so
   * the attributed total is unknown; the spread term then abstains.
   */
  observerCoverage: number | null;
  /**
   * Share of sampled records timed outside the dark window, 0-1, or null when
   * too few records carry a time to say anything. Null is a real answer and is
   * scored by dropping the term, never by assuming daylight — see
   * `findabilityScore`.
   */
  daylightShare: number | null;
  /**
   * GBIF's own `samplingProtocol` names a trap on the records that declare a
   * protocol at all. This is evidence, not inference: the values are strings
   * like "skinner trap with mixed light of 160 w".
   */
  lightTrapped: boolean;
  /** The open class-level prior applied, from `CLASS_PRIOR`. 1 when neutral. */
  classPrior: number;
}

export type StratumId =
  | "birds"
  | "insects"
  | "plants"
  | "fungi"
  | "herptiles"
  | "spiders";

/**
 * GBIF backbone taxonKeys. Fixed identifiers in an external taxonomy, not
 * editorial judgement about what is alive — this is the one kind of constant
 * that stays a constant.
 */
const STRATA: ReadonlyArray<{ id: StratumId; taxonKey: number }> = [
  { id: "birds", taxonKey: 212 },
  { id: "insects", taxonKey: 216 },
  { id: "plants", taxonKey: 6 },
  { id: "fungi", taxonKey: 5 },
  { id: "herptiles", taxonKey: 131 },
  { id: "spiders", taxonKey: 367 },
];

/**
 * Species a class must never be sent to look for, matched on the binomial.
 *
 * This is a SAFETY BACKSTOP, not a taste filter, and it is deliberately
 * deterministic: a model failing open on "go and find the Anopheles" is a real
 * harm, not a style regression. It is not hypothetical either — the top
 * insects actually recorded at rural Elbasan in August are `Culex pipiens`,
 * `Anopheles sacharovi` (a malaria vector) and `Aedes albopictus`.
 *
 * Genus-level prefixes, because the species below them are all the same answer.
 */
const NEVER_SEND_A_CLASS_TO_FIND = [
  "Anopheles ",
  "Aedes ",
  "Culex ",
  "Ixodes ",
  "Vespa ",
  "Heracleum mantegazzianum",
  "Atropa bella-donna",
  "Conium maculatum",
  "Oenanthe crocata",
  "Amanita ",
  "Galerina ",
  "Vipera ",
  "Lymantria dispar",
  "Thaumetopoea ",
];

function isHazard(scientificName: string): boolean {
  return NEVER_SEND_A_CLASS_TO_FIND.some((p) => scientificName.startsWith(p));
}

const GBIF = "https://api.gbif.org/v1";

/**
 * GBIF rate-limits, and returned 429 during this prototype's own measurement
 * at ten concurrent requests. That is a design constraint, not a nuisance: the
 * seasonal record barely changes, so this belongs in a cache keyed by cell and
 * month rather than on the path of a page render. See `seasonalCacheKey`.
 */
const TIMEOUT_MS = 12_000;
const MAX_CONCURRENCY = 3;

/**
 * Waits before each retry of a transient failure (429, 5xx, timeout, network).
 * Two retries, because GBIF's 429s during measurement cleared within a second;
 * a request still failing after that is an outage, not a blip.
 */
const RETRY_DELAYS_MS = [400, 1200] as const;

/**
 * GBIF could not answer a read the result depends on (#1211 review).
 *
 * This exists so that a failure cannot be mistaken for evidence. Before it,
 * every read returned null on a 429 and the caller defaulted the missing
 * numbers to zero — zero recorders, zero records — which scored the species
 * as unfindable and buried it, so the order of the list depended on which
 * request happened to be rate-limited. A read that fails now throws, and
 * `seasonalSpecies` turns that into its documented answer for an unreachable
 * GBIF: nothing, rather than a list whose order was decided by the failure.
 */
class GbifUnavailable extends Error {
  constructor(path: string, reason: string) {
    super(`GBIF read failed after retries (${reason}): ${path}`);
    this.name = "GbifUnavailable";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A read the result depends on. Retries transient failures, then throws. */
async function fetchGbif<T>(path: string): Promise<T> {
  let reason = "unknown";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!);
    try {
      const res = await fetch(`${GBIF}${path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
      if (res.ok) return (await res.json()) as T;
      reason = `HTTP ${res.status}`;
      // A 4xx other than 429 will say the same thing again; do not retry it.
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      reason = err instanceof Error ? err.name : "network";
    }
  }
  throw new GbifUnavailable(path, reason);
}

interface FacetResponse {
  count: number;
  facets?: Array<{ field: string; counts: Array<{ name: string; count: number }> }>;
}

/**
 * The search box, without a `limit` — each caller states its own, because the
 * findability read needs a page of real records where the facet reads want none.
 */
function boxParams(lat: number, lng: number, halfDegrees: number): string {
  const p = new URLSearchParams({
    decimalLatitude: `${lat - halfDegrees},${lat + halfDegrees}`,
    decimalLongitude: `${lng - halfDegrees},${lng + halfDegrees}`,
    hasCoordinate: "true",
  });
  return p.toString();
}

/** Run tasks a few at a time. GBIF 429s under a wide fan-out. */
async function pooled<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += MAX_CONCURRENCY) {
    const slice = items.slice(i, i + MAX_CONCURRENCY);
    out.push(...(await Promise.all(slice.map(worker))));
  }
  return out;
}

/**
 * An English common name for a taxon, or null if it does not have one.
 *
 * `/species/{key}` carries `vernacularName` only sometimes, so the dedicated
 * endpoint is the fallback. Null is a perfectly good answer and the caller
 * drops the species rather than reading a binomial to a class of five-year-olds.
 */
async function englishName(key: number, inline?: string): Promise<string | null> {
  const data = await fetchGbif<{
    results?: Array<{ vernacularName?: string; language?: string }>;
  }>(`/species/${key}/vernacularNames?limit=100`);

  // GBIF's vernacular names are contributed, and the `eng` bucket is dirty in
  // two specific ways this prototype hit on its first real run:
  //
  //   "BASW"                     an eBird four-letter alpha code, not a name
  //   "Sapo de barriga amarela"  Portuguese, mislabelled as English
  //
  // Taking the first match returns whichever landed at the top. Counting them
  // and taking the most frequently contributed one is a better instrument: a
  // real English name is listed by many checklists, an alpha code or a
  // mislabelled Portuguese name by one.
  const votes = new Map<string, { label: string; count: number }>();
  for (const row of data.results ?? []) {
    if (row.language !== "eng") continue;
    const label = row.vernacularName?.trim();
    if (!label) continue;
    if (label.length < 3 || label.length > 40) continue;
    if (/\d/.test(label)) continue;
    // An alpha code shouts; a name does not.
    if (/^[A-Z]{2,}$/.test(label)) continue;
    const slot = votes.get(label.toLowerCase());
    if (slot) slot.count += 1;
    else votes.set(label.toLowerCase(), { label, count: 1 });
  }

  const best = [...votes.values()].sort((a, b) => b.count - a.count)[0];
  if (best) return best.label;

  // The inline name is the last resort, held to the same shape rules.
  const trimmed = inline?.trim();
  if (trimmed && !/^[A-Z]{2,}$/.test(trimmed) && !/\d/.test(trimmed)) return trimmed;
  return null;
}

/**
 * The clock hour a record was made at, 0-23, or null.
 *
 * GBIF's `eventTime` is usually a local wall-clock time with the recorder's own
 * offset ("14:32:50+01:00"), so the leading hour is the hour the person was
 * standing there, which is exactly the question.
 *
 * A time ending in `Z` is UTC, and that is not small noise (#1211 review
 * 4005048440): at California's longitude a 16:30 sighting is stored as
 * 23:30Z and would read as night. Such a time is converted to the cell's local
 * SOLAR time, UTC + longitude / 15 hours. Solar time rather than a civil
 * timezone because the question is whether it was dark, which the sun decides
 * and daylight-saving rules do not, and because it needs no timezone table.
 * Without a longitude a UTC time cannot be placed, so it abstains.
 */
export function hourOfRecord(
  record: {
    eventTime?: unknown;
    eventDate?: unknown;
  },
  longitude?: number,
): number | null {
  // A date-only record is often normalised to `T00:00:00` (and a date range to
  // `T00:00:00/...`), which is not an observation at midnight (#1211 review
  // 4004913506). An `eventDate` fallback therefore
  // abstains on an interval and on an exact midnight. A real midnight in
  // `eventTime` is still read; one carried only in `eventDate` cannot be told
  // apart from a missing time, so it is not.
  const fromDate = (date: string): string | null => {
    if (!date.includes("T") || date.includes("/")) return null;
    const time = date.slice(date.indexOf("T") + 1);
    return /^0?0:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(time.trim()) ? null : time;
  };
  const raw =
    typeof record.eventTime === "string" && record.eventTime
      ? record.eventTime
      : typeof record.eventDate === "string"
        ? fromDate(record.eventDate)
        : null;
  if (!raw) return null;
  const text = raw.trim();
  const match = /^(\d{1,2}):(\d{2})?/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!/z$/i.test(text)) return hour;

  // UTC: place it at the cell's longitude, or say nothing.
  if (longitude === undefined || !Number.isFinite(longitude) || match[2] === undefined) return null;
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  const solar = hour + minutes / 60 + longitude / 15;
  return Math.floor(((solar % 24) + 24) % 24);
}

/** True for 21:00-05:00, the hours a class is not outside. */
function isDarkHour(hour: number): boolean {
  return hour >= DARK_FROM_HOUR || hour < DARK_UNTIL_HOUR;
}

type FacetCounts = Array<{ name: string; count: number }>;

function facetOf(response: { facets?: Array<{ field: string; counts: FacetCounts }> }, field: string): FacetCounts {
  return response.facets?.find((f) => f.field === field)?.counts ?? [];
}

/**
 * A free-text facet read to its end: `first` is the page that rode along with
 * the signal request, and further pages follow until one comes back short or
 * `FACET_MAX_PAGES` is reached. `complete` is false only when the bound cut it.
 */
async function wholeFacet(
  query: string,
  field: "recordedBy" | "samplingProtocol",
  first: FacetCounts,
): Promise<{ counts: FacetCounts; complete: boolean }> {
  const counts = [...first];
  let last = first.length;
  for (let pages = 1; last === FACET_PAGE && pages < FACET_MAX_PAGES; pages++) {
    const next = await fetchGbif<{ facets?: Array<{ field: string; counts: FacetCounts }> }>(
      `${query}&limit=0&facet=${field}&${field}.facetLimit=${FACET_PAGE}` +
        `&${field}.facetOffset=${pages * FACET_PAGE}`,
    );
    const page = facetOf(next, field.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase());
    counts.push(...page);
    last = page.length;
  }
  return { counts, complete: last < FACET_PAGE };
}

interface OccurrenceSample {
  count?: number;
  results?: Array<{ eventTime?: unknown; eventDate?: unknown }>;
  facets?: Array<{ field: string; counts: Array<{ name: string; count: number }> }>;
}

/**
 * The findability readings for one species in one box in one month, in ONE
 * request: the `recordedBy` and `samplingProtocol` facets ride along with a
 * small page of real records, because GBIF has no hour facet and the clock
 * times have to come off the records themselves.
 *
 * A failed read throws `GbifUnavailable`. It used to return the
 * no-observers, no-times reading, which scored the species zero and buried it:
 * an unreachable facet is no more evidence that something is hard to find than
 * that it is easy (#1211 review).
 */
async function findabilitySignals(
  box: string,
  speciesKey: number,
  month: number,
  taxonClass: string | null,
  longitude: number,
): Promise<Findability> {
  const query = `/occurrence/search?${box}&speciesKey=${speciesKey}&month=${month}`;
  const data = await fetchGbif<OccurrenceSample>(
    `${query}&limit=${CLOCK_PAGE}` +
      `&facet=recordedBy&recordedBy.facetLimit=${FACET_PAGE}` +
      `&facet=samplingProtocol&samplingProtocol.facetLimit=${FACET_PAGE}`,
  );
  const total = data.count ?? 0;

  // Both facets are free text and both are read to their end, bounded (#1211
  // reviews 4002123410 and 4004913496). A truncated `recordedBy` facet would
  // make its sum look like the whole attributed record and understate
  // coverage for exactly the species recorded by the most people.
  const observers = await wholeFacet(query, "recordedBy", facetOf(data, "RECORDED_BY"));
  const reading = observerReading(observers.counts, total);
  const { distinctObservers, topObserverShare } = reading;
  const observerCoverage = observers.complete ? reading.observerCoverage : null;

  // Clock times, from records spread across the WHOLE result set (#1211 review
  // 4002123408). GBIF returns records in a stable order that groups a dataset's
  // import together, so the first thirty can be one recorder's night run, or
  // thirty untimed rows ahead of hundreds of timed ones. The first page rides
  // along with the facets; the others sit at evenly spaced offsets. Evenly,
  // not randomly, so the same cell reads the same hours twice.
  const rows = [...(data.results ?? [])];
  for (const offset of clockSampleOffsets(total)) {
    const page = await fetchGbif<OccurrenceSample>(
      `${query}&limit=${CLOCK_PAGE}&offset=${offset}`,
    );
    rows.push(...(page.results ?? []));
  }
  const hours: number[] = [];
  for (const row of rows) {
    const hour = hourOfRecord(row, longitude);
    if (hour !== null) hours.push(hour);
  }
  const daylightShare =
    hours.length >= MIN_TIMED_RECORDS
      ? hours.filter((h) => !isDarkHour(h)).length / hours.length
      : null;

  // A declared protocol is sparse — around one record in twelve carries one on
  // Porto's moths — so the test is not "how many" but "of the records that say
  // how they were collected, do they say a trap". A bird's protocols say
  // "unknown"; a moth's say "skinner trap with mixed light of 160 w".
  //
  // That is a question about EVERY declared protocol, and the values are free
  // text, so the facet is read to its end rather than to its top labels
  // (#1211 review 4002123410): a long tail of trap runs each described in
  // their own words, or a long tail of one-off non-trap strings, changes the
  // answer. Pages until the facet runs out, bounded; a facet still running at
  // the bound abstains (not trapped) rather than deciding on a subset.
  const protocols = await wholeFacet(query, "samplingProtocol", facetOf(data, "SAMPLING_PROTOCOL"));
  const protocolsComplete = protocols.complete;

  let declared = 0;
  let trapped = 0;
  for (const row of protocols.counts) {
    declared += row.count;
    if (TRAP_PROTOCOL.test(row.name)) trapped += row.count;
  }
  const lightTrapped =
    protocolsComplete &&
    trapped >= MIN_TRAP_RECORDS &&
    declared > 0 &&
    trapped >= declared * 0.5;

  const signals: Omit<Findability, "score"> = {
    distinctObservers,
    topObserverShare,
    observerCoverage,
    daylightShare,
    lightTrapped,
    classPrior: classPrior(taxonClass),
  };
  return { ...signals, score: findabilityScore(signals) };
}

/** Month of year, 1-12, in UTC. The GBIF facet is monthly, not weekly. */
export function monthOfYear(date: Date): number {
  return date.getUTCMonth() + 1;
}

/**
 * The phase this month sits in, read off the species' own local curve.
 *
 * The hand-typed files carried `narrativePhase: "peak"` as an authored
 * opinion. Here it is arithmetic over twelve recorded counts, and it can be
 * checked by anyone with the same histogram.
 */
export function phaseFromHistogram(
  histogram: readonly number[],
  month: number,
): SeasonalSpecies["phase"] {
  const max = Math.max(...histogram);
  const current = histogram[month - 1] ?? 0;
  if (max === 0 || current === 0) return "steady";
  if (current >= max * 0.85) return "peak";
  const previous = histogram[(month + 10) % 12] ?? 0;
  const next = histogram[month % 12] ?? 0;
  if (next > current && current >= previous) return "emerging";
  if (next < current && current <= previous) return "fading";
  return "steady";
}

/* ── FINDABILITY: WHY THIS LIST IS NOT SORTED BY ABUNDANCE (#312) ──────────
 *
 * This file used to end on `.sort((a, b) => b.occurrencesInMonth - a.occurrencesInMonth)`.
 * The reasoning was "a child finds the common thing", and it is wrong in a way
 * the #312 audit measured across 50 real cells
 * (`docs/gbif-retrieval-quality-audit-2026-08-21.md`): raw abundance is not a
 * reading of how findable something is, it is a reading of how it was
 * collected. A light trap logs hundreds of moths a night for one recorder; a
 * child watching a hedge logs one bird. Sorting on the count hands the top of
 * the list to the trap.
 *
 * Porto, August, as the audit recorded it: Barn Swallow, and then ten
 * light-trap moths — Scarce Merveille Du Jour, Porter's Rustic, Yellow-tail,
 * Rosy Footman, Riband Wave, Portland Ribbon Wave... Every name true, every
 * count true, and no child will find one. Jotunheimen was worse: nine noctuid
 * moths with no exceptions before a single bird or plant.
 *
 * The English-common-name filter below cannot catch this and the audit says
 * why: moth recorders have named everything in English already. `Rosy Footman`
 * and `Portland Ribbon Wave` both pass it.
 *
 * WHAT REPLACES IT. Four readings of GBIF's own metadata, measured on the
 * failing cells before they were written down here:
 *
 *   1. OBSERVER BREADTH — how many different people recorded it. Porto in
 *      August: Barn Swallow 152 recorders, Scarce Merveille Du Jour 15,
 *      Porter's Rustic 7, Rosy Footman 6. Jotunheimen's Barred Chestnut, 396
 *      records, has ONE. This is the load-bearing signal and it is a facet
 *      query, not a judgement.
 *   2. OBSERVER SPREAD — how much of the record is not one person. The same
 *      reading from the other side, and it is what catches the audit's second
 *      failure mode, the wetland and pelagic species that rank high because
 *      the cell is a conservation site: Connemara's Shoreweed is 157 records
 *      from one recorder, Water Lobelia 92% from one. A survey and a trap look
 *      alike here, which is correct — neither is a passer-by.
 *   3. DAYLIGHT — whether the records that carry a time cluster after dark.
 *      Weaker than the other two and honestly so: moth-trap records are often
 *      timed to when the trap was emptied rather than when the moth flew, and
 *      Jotunheimen's worst species carries no time at all on any sampled
 *      record. The term abstains rather than guessing when the times are not
 *      there, which is why it cannot do harm where it cannot help.
 *   4. AN OPEN CLASS PRIOR — see `CLASS_PRIOR`. Deliberately small, and
 *      written down rather than folded into the comparator, so that its
 *      smallness is visible instead of being a fudge factor nobody can find.
 *
 * Plus one reading that is not inference at all: GBIF's `samplingProtocol`
 * field, which on these records literally says "skinner trap with mixed light
 * of 160 w", "light trap", "mv light". The audit asked for this to be checked
 * before anyone hand-authored a list of trap-collected families, and it is
 * there — sparse, never wrong when present.
 *
 * WHAT THIS DOES NOT FIX, stated here so nobody reads a green sort as a solved
 * problem: a seabird colony and a wetland reserve are recorded by many people,
 * in daylight, honestly. Dingle's gannets and Thessaloniki's shorebirds are
 * real, well-observed, and still not reachable from a tarmac yard. That is an
 * ACCESS question — is this habitat the one the class is standing in — and
 * none of the four signals above asks it. The audit predicted exactly this.
 */

/**
 * How many distinct recorders count as "everybody finds this". Johan's own
 * framing in #312 was "seen by forty different people", and the curve is
 * logarithmic because the step from one recorder to four says far more about
 * findability than the step from forty to eighty.
 */
const OBSERVER_BREADTH_FULL = 40;

/**
 * How many of this month's records to sample for their clock time. GBIF has no
 * hour facet, so the hours have to come off real records, and an occurrence
 * record is a large object — this is the one place in the file where the cost
 * is in bytes rather than round trips. Thirty is enough to see clustering and
 * keeps a cell's whole retrieval inside a few megabytes.
 */
const HOUR_SAMPLE = 30;

/** The clock sample is read as this many pages, spread across the result set. */
const CLOCK_PAGES = 3;
const CLOCK_PAGE = HOUR_SAMPLE / CLOCK_PAGES;

/** GBIF's occurrence search refuses `offset + limit` beyond this. */
const GBIF_MAX_OFFSET = 100_000;

/**
 * Where the second and later clock pages start, for a species with `total`
 * records this month: evenly spaced through the result set, never overlapping
 * the first page, and never past GBIF's paging ceiling. Empty when the first
 * page already holds every record.
 */
export function clockSampleOffsets(total: number): number[] {
  const offsets: number[] = [];
  for (let i = 1; i < CLOCK_PAGES; i++) {
    const at = Math.min(Math.floor((i * total) / CLOCK_PAGES), GBIF_MAX_OFFSET - CLOCK_PAGE);
    const previous = offsets[offsets.length - 1] ?? 0;
    if (at >= previous + CLOCK_PAGE && at < total) offsets.push(at);
  }
  return offsets;
}

/**
 * `recordedBy` and `samplingProtocol` are free text, so their facets are paged
 * to the end. A page of a thousand values is already past every species
 * measured in the audit; five pages bounds the worst case at four extra
 * requests per facet, eight per species.
 */
const FACET_PAGE = 1000;
const FACET_MAX_PAGES = 5;

/** Below this many timed records, `daylightShare` abstains instead of guessing. */
const MIN_TIMED_RECORDS = 8;

/** Dark is 21:00-05:00 local, read off the record's own offset where it has one. */
const DARK_FROM_HOUR = 21;
const DARK_UNTIL_HOUR = 5;

/**
 * The weights, in one place, summing to 1. `daylight` is the smallest on
 * purpose: it is the signal the measurement found weakest, not the one the
 * design liked least.
 */
const FINDABILITY_WEIGHTS = {
  observerBreadth: 0.55,
  observerSpread: 0.3,
  daylight: 0.15,
} as const;

/**
 * What a declared light-trap protocol costs a species. It does not exclude —
 * Porto's moths are real records of real moths and a teacher who trapped one
 * would be right to look it up. It moves them below what the class can find at
 * eleven in the morning, which is the whole ask.
 */
const LIGHT_TRAP_PRIOR = 0.45;

/**
 * A protocol string that describes catching rather than noticing. Matched
 * against GBIF's own `samplingProtocol` values, which in these cells read
 * "skinner trap with mixed light of 160 w", "sheet trap with mixed light of
 * 160 w", "moth trap with uv-a light of 20 w", "light trap", "mv light". The
 * commonest value on a bird or a plant is "unknown", which this does not match.
 */
const TRAP_PROTOCOL = /\btrap\b|\blight\b|\bmv\b|\buv\b|actinic/i;

/** At least this many trap-protocol records before one stray string counts. */
const MIN_TRAP_RECORDS = 2;

/**
 * The open class-level prior.
 *
 * Every row cites the audit cell that earned it. The list is short because the
 * audit's failures are mostly NOT class-shaped, and saying that out loud is the
 * point of writing the prior down instead of hiding it in a comparator.
 *
 * CONSIDERED AND REJECTED, so the next reader does not have to rediscover it:
 *
 *   Insecta — no. The audit's best cells are insect cells: Dublin opens on
 *   twelve day-flying butterflies (EXCELLENT), Serra da Estrela and Zakopane
 *   likewise. Moths and butterflies share a class and mostly share an order;
 *   the thing that separates them here is how they were collected, which is
 *   what the observer signals read directly.
 *
 *   Arachnida — no, and this one is tempting. The audit's two worst single
 *   records are mites: a `Eulaelaps stabularis` in Lofoten and
 *   `Demodex folliculorum`, the mite that lives in human skin pores, in Oslo's
 *   February pull. Both are Arachnida — and so are the Cross Orbweaver and the
 *   garden spiders that make several cells good. A class prior cannot tell
 *   them apart. The observer reading can and does: the Oslo mite is a single
 *   record from a single recorder and sinks on its own.
 *
 *   Aves — no. Birds carry both the best results in the run and one of the
 *   failures (Dingle's pelagic seabirds), and the difference is access, not
 *   class.
 */
const CLASS_PRIOR: ReadonlyArray<{
  taxonClass: string;
  prior: number;
  because: string;
}> = [
  // Audit §4: "species-level ID on a moss patch is unrealistic for a
  // five-year-old even though the moss itself is a findable, touchable thing."
  // Cells 25 (Nordland Feb) and 32 (Białowieża Feb) are half trace-count
  // mosses and liverworts. Findable, genuinely; nameable, no.
  { taxonClass: "Bryopsida", prior: 0.5, because: "moss: findable, not nameable (audit cells 25, 32)" },
  { taxonClass: "Polytrichopsida", prior: 0.5, because: "moss: findable, not nameable (audit cells 25, 32)" },
  { taxonClass: "Sphagnopsida", prior: 0.5, because: "moss: findable, not nameable (audit cells 25, 32)" },
  { taxonClass: "Andreaeopsida", prior: 0.5, because: "moss: findable, not nameable (audit cells 25, 32)" },
  { taxonClass: "Jungermanniopsida", prior: 0.5, because: "liverwort: findable, not nameable (audit cells 25, 32)" },
  { taxonClass: "Marchantiopsida", prior: 0.5, because: "liverwort: findable, not nameable (audit cells 25, 32)" },
  { taxonClass: "Anthocerotopsida", prior: 0.5, because: "hornwort: findable, not nameable (audit cells 25, 32)" },
  // Audit cells 1 and 36: "a few lichens at n=1", "several n=1 lichens, thin
  // at the tail"; cell 20 calls the same shape "visible, hard to name". Less
  // of a penalty than moss because a big map lichen on a wall really is a
  // thing a class can be shown.
  { taxonClass: "Lecanoromycetes", prior: 0.65, because: "lichen: visible, hard to name (audit cells 1, 20, 36)" },
  { taxonClass: "Arthoniomycetes", prior: 0.65, because: "lichen: visible, hard to name (audit cells 1, 20, 36)" },
  { taxonClass: "Candelariomycetes", prior: 0.65, because: "lichen: visible, hard to name (audit cells 1, 20, 36)" },
  { taxonClass: "Lichinomycetes", prior: 0.65, because: "lichen: visible, hard to name (audit cells 1, 20, 36)" },
];

const CLASS_PRIOR_BY_NAME = new Map(CLASS_PRIOR.map((row) => [row.taxonClass, row.prior]));

/** The open prior for a GBIF class. 1 when the table says nothing about it. */
export function classPrior(taxonClass: string | null): number {
  if (!taxonClass) return 1;
  return CLASS_PRIOR_BY_NAME.get(taxonClass) ?? 1;
}

/**
 * Distinct recorders, on a 0-1 curve. One recorder scores 0 — not "a little" —
 * because a single-recorder record carries no evidence at all that a second
 * person can find the thing.
 */
export function observerBreadth(distinctObservers: number): number {
  if (distinctObservers <= 1) return 0;
  const scaled = Math.log(distinctObservers) / Math.log(OBSERVER_BREADTH_FULL);
  return Math.min(1, Math.max(0, scaled));
}

/** Labels that name nobody. Compared after normalisation. */
const NO_RECORDER = new Set([
  "unknown", "anonymous", "anon", "na", "n a", "none", "not recorded", "unrecorded",
  "not specified", "not given", "unidentified", "observer", "recorder",
]);

/** Lowercase, accents off, anything that is not a letter becomes a space. */
function nameTokens(raw: string): string[] {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\bet al\b\.?/g, " ")
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** "J.", "J. P.", "JP" — the given-name half of a "Surname, J." label. */
const INITIALS = /^\s*(?:\p{L}\.?\s*){1,3}$/u;

/**
 * The people a GBIF `recordedBy` label names, as comparable identity keys.
 *
 * `recordedBy` is free text (#1211 review 4002123407). Porto's own August facet
 * for Scarce Merveille Du Jour lists "Jorge Pereira Gomes" and "J P Gomes" as
 * two labels, and group records put several people in one label. Counting
 * labels therefore over-counts a recorder who spells himself three ways and
 * under-counts a group, and observer breadth is the heaviest term in the score.
 *
 * What this does, and no more:
 *   - splits a label on the Darwin Core delimiter `|` and on `;`, `&`, `/` and
 *     a spoken "and";
 *   - reads "Surname, Given" (and "Smith, J., Jones, K.") the way it is meant;
 *   - keys a person as first initial plus surname, so spelling-out and
 *     abbreviating a given name land on one person;
 *   - drops placeholders ("unknown", "anonymous") that name nobody.
 *
 * The key deliberately errs toward MERGING: "João Lima" and "Jorge Lima" are
 * one key. That can only lower breadth, which is the safe direction for a
 * score whose failure mode was promoting one survey operation into many.
 */
export function recorderIdentities(label: string): string[] {
  const people: string[] = [];
  for (const part of label.split(/\s*(?:\||;|&|\/|\band\b)\s*/i)) {
    const commas = part.split(",").map((c) => c.trim()).filter(Boolean);
    if (commas.length === 2 && nameTokens(commas[0]!).length > 1 && nameTokens(commas[1]!).length > 1) {
      people.push(...commas); // "Ana Silva, Rui Costa": two people
    } else if (commas.length === 2) {
      people.push(`${commas[1]} ${commas[0]}`); // "Gomes, Jorge"
    } else if (commas.length > 2) {
      // "Smith, J., Jones, K.": a surname followed by its initials, repeatedly.
      for (let i = 0; i < commas.length; i++) {
        const next = commas[i + 1];
        if (next !== undefined && INITIALS.test(next)) {
          people.push(`${next} ${commas[i]}`);
          i++;
        } else {
          people.push(commas[i]!);
        }
      }
    } else if (commas[0]) {
      people.push(commas[0]);
    }
  }

  const keys = new Set<string>();
  for (const person of people) {
    const tokens = nameTokens(person);
    if (tokens.length === 0 || NO_RECORDER.has(tokens.join(" "))) continue;
    const key = tokens.length === 1 ? tokens[0]! : `${tokens[0]![0]} ${tokens[tokens.length - 1]}`;
    keys.add(key);
  }
  return [...keys];
}

/**
 * The observer readings from GBIF's `recordedBy` facet for one species.
 *
 * Only records that carry a `recordedBy` value appear in that facet, and GBIF
 * returns plenty that carry none. Dividing the top recorder's count by ALL
 * records (as this did first) read every unattributed record as somebody
 * other than the top recorder: one named record among 100 gave a top share of
 * 0.01 and a near-perfect spread (#1211 review 4002123403). So:
 *
 *   - the top share is measured over ATTRIBUTED records only, and
 *   - `observerCoverage` says how much of the record that is, so the score can
 *     weight the spread by it rather than pretend the rest is known.
 *
 * Labels are turned into people first (`recorderIdentities`), and a person's
 * count is every record whose label names them. Two caps keep that honest:
 * distinct observers never exceed attributed records, because a record naming
 * twelve people is one finding, not twelve; and a record that names only a
 * placeholder is not attributed.
 *
 * Breadth needs no coverage correction. It counts people who are named, and an
 * unattributed record can only ever add people, so it is already a floor.
 */
export function observerReading(
  counts: ReadonlyArray<{ name: string; count: number }>,
  total: number,
): Pick<Findability, "distinctObservers" | "topObserverShare" | "observerCoverage"> {
  const perPerson = new Map<string, number>();
  let attributed = 0;
  for (const { name, count } of counts) {
    const people = recorderIdentities(name);
    if (people.length === 0) continue;
    attributed += count;
    for (const person of people) perPerson.set(person, (perPerson.get(person) ?? 0) + count);
  }
  const top = Math.max(0, ...perPerson.values());
  return {
    distinctObservers: Math.min(perPerson.size, attributed),
    topObserverShare: attributed > 0 ? Math.min(1, top / attributed) : 0,
    observerCoverage: total > 0 ? Math.min(1, attributed / total) : 0,
  };
}

/**
 * The score, from the readings. Pure, exported, and the reason the sort can be
 * argued with: hand it a row and it will tell you the same number the sort used.
 *
 * The spread term is `observerCoverage × (1 − topObserverShare)`: the share of
 * the record that is attributed, times how evenly THAT part is spread. The
 * unattributed remainder contributes nothing either way — it is not credited
 * as independent observers and not charged as one recorder.
 *
 * `daylightShare: null` drops the daylight term and renormalises the other two,
 * rather than substituting a neutral 0.5. A species with no timed records has
 * not earned a daylight credit and has not earned a night penalty either; the
 * honest thing is to rank it on what IS known about it.
 */
export function findabilityScore(
  signals: Omit<Findability, "score">,
): number {
  const breadth = observerBreadth(signals.distinctObservers);
  const w = FINDABILITY_WEIGHTS;
  let weighted = w.observerBreadth * breadth;
  let total = w.observerBreadth;
  // Unknown coverage (a recorder facet cut at its bound) drops the spread term
  // and renormalises, exactly as unknown daylight does.
  if (signals.observerCoverage !== null) {
    const spread =
      signals.distinctObservers <= 0
        ? 0
        : Math.min(1, Math.max(0, signals.observerCoverage)) *
          Math.min(1, Math.max(0, 1 - signals.topObserverShare));
    weighted += w.observerSpread * spread;
    total += w.observerSpread;
  }
  if (signals.daylightShare !== null) {
    weighted += w.daylight * Math.min(1, Math.max(0, signals.daylightShare));
    total += w.daylight;
  }

  const base = total > 0 ? weighted / total : 0;
  const trap = signals.lightTrapped ? LIGHT_TRAP_PRIOR : 1;
  return base * signals.classPrior * trap;
}

/**
 * The order. Findability decides it; abundance is a tiebreak and nothing more,
 * which is the whole correction #312 asked for. `key` breaks the remaining ties
 * so that two runs over the same cell return the same list.
 */
export function rankByFindability<T extends SeasonalSpecies>(
  species: readonly T[],
): T[] {
  return [...species].sort(
    (a, b) =>
      b.findability.score - a.findability.score ||
      b.occurrencesInMonth - a.occurrencesInMonth ||
      a.key - b.key,
  );
}

/**
 * The highest score a species with `records` records this month could earn,
 * whatever those records turn out to say. Distinct observers cannot exceed
 * attributed records, and the top recorder holds at least one record in
 * `records`, so breadth and spread are both capped; daylight is assumed
 * perfect, or abstaining, whichever scores higher; class prior and trap
 * prior are assumed to cost nothing. Used to stop paging the candidate facet
 * once nothing further down could reach a stratum's top (#1211 review 4002123412).
 */
export function findabilityCeiling(records: number): number {
  if (records <= 0) return 0;
  const w = FINDABILITY_WEIGHTS;
  const breadth = w.observerBreadth * observerBreadth(records);
  const known = breadth + w.observerSpread * (1 - 1 / records);
  return Math.max(
    known / (w.observerBreadth + w.observerSpread),
    (known + w.daylight) / (w.observerBreadth + w.observerSpread + w.daylight),
    breadth / w.observerBreadth,
    (breadth + w.daylight) / (w.observerBreadth + w.daylight),
  );
}

/**
 * How deep the candidate facet may be paged, as a multiple of `perStratum`.
 * The default query (4 per stratum) scans at most 60 species per stratum
 * instead of the 12 an abundance cut kept. Each scanned species costs three
 * reads (month histogram, taxon, vernacular names) and each one that passes
 * the season and name gates up to eleven more: the findability page, two
 * clock pages, and up to four further pages each of the `recordedBy` and
 * `samplingProtocol` facets. With up to 10 candidate-facet pages per stratum
 * (60 / 12, less with a smaller page), the bound for one cell is
 * 6 x (10 + 60 x 14) = 5,100 reads before retries, and each read may be tried
 * three times (`RETRY_DELAYS_MS`). The old pool's was 6 x (1 + 12 x 4) = 294.
 * Facet paging past 1,000 values has not occurred in any audit cell, so the
 * practical bound is 6 x (10 + 60 x 6) = 2,220. A stratum stops early as soon as
 * its fourth-best score is out of reach of the next species' record count,
 * which in a well-observed stratum is usually the first page. This belongs
 * behind `seasonalCacheKey`, never on a page render.
 */
const CANDIDATE_CEILING_FACTOR = 15;

/**
 * The coverage floor, sized from the audit: only 2 of its 50 cells came in
 * under ten species (Përmet in February at 7, all genuinely usable; Oslo in
 * February at 7, genuinely poor).
 *
 * IT IS A SHOW-FEWER, NOT A CUT. Nothing below this line is removed from what
 * `seasonalSpecies` returns — a seven-species cell returns all seven. What the
 * floor forbids is the other direction: widening the box, lowering the
 * seasonality gate, or padding from a file until ten things exist to say. A
 * thin place is allowed to be thin, and a caller that reads `isThinCell` says
 * less rather than reaching.
 */
export const SEASONAL_COVERAGE_FLOOR = 10;

/** True when this cell is too thin to present as a list. Removes nothing. */
export function isThinCell(species: readonly SeasonalSpecies[]): boolean {
  return species.length < SEASONAL_COVERAGE_FLOOR;
}

export interface SeasonalQuery {
  lat: number;
  lng: number;
  date: Date;
  /**
   * Half-width of the search box in degrees. 0.15 is roughly 15km at these
   * latitudes and is what the #305 measurement used; a school's "near here"
   * is not a point and GBIF coordinates carry their own uncertainty.
   */
  halfDegrees?: number;
  /** How many to keep per stratum before the caller ranks across them. */
  perStratum?: number;
}

/**
 * A cache key with no personal data in it: the point is rounded to the box
 * grid before it is used, so two schools in the same town share one entry and
 * no coordinate survives the key.
 */
export function seasonalCacheKey(query: SeasonalQuery): string {
  const half = query.halfDegrees ?? 0.15;
  const cell = (n: number) => (Math.round(n / half) * half).toFixed(2);
  return `${cell(query.lat)},${cell(query.lng)}@${monthOfYear(query.date)}`;
}

/**
 * What has actually been recorded near this point in this month, by group.
 *
 * Returns [] on any failure, a thin record, or an unreachable GBIF — the
 * caller shows less, exactly as it does when Pointmoon is thin. An empty
 * result is a valid and honest answer: rural Albania has 78 August records
 * across every group, and the right response to that is to say less rather
 * than to reach for a file that would have said five confident things.
 */
export async function seasonalSpecies(
  query: SeasonalQuery,
): Promise<SeasonalSpecies[]> {
  try {
    return await retrieveSeasonal(query);
  } catch (err) {
    // Every read the ranking depends on either answered or threw. A partial
    // list would be ordered by which request failed, so there is no partial
    // list: the caller shows less, exactly as for an empty cell.
    if (err instanceof GbifUnavailable) return [];
    throw err;
  }
}

async function retrieveSeasonal(query: SeasonalQuery): Promise<SeasonalSpecies[]> {
  /** A species with everything but its findability read. */
  type Unranked = Omit<SeasonalSpecies, "findability">;

  const { lat, lng, date } = query;
  const half = query.halfDegrees ?? 0.15;
  const perStratum = Math.floor(query.perStratum ?? 4);
  // Nothing asked for is nothing read, said before any request rather than
  // left to the paging loop's arithmetic (#1211 review 4005048427).
  if (!(perStratum >= 1)) return [];
  const month = monthOfYear(date);
  const box = boxParams(lat, lng, half);

  // Candidates come from one facet query per stratum. Asking each group
  // separately is why a schoolyard list is not eighteen birds: eBird dominates
  // GBIF, and an unstratified top-20 at Tirana returned 18 Aves and no plants.
  //
  // That facet is ordered by record count, so a pool cut at its top page is
  // still chosen by abundance: twelve trap moths could fill it and a butterfly
  // seen by thirty people at the thirteenth place would never be scored
  // (#1211 review 4002123412). So the facet is paged, and paging stops only
  // when nothing further down can reach this stratum's top `perStratum`:
  // `findabilityCeiling` bounds the best score a species with n records could
  // possibly earn, and the facet only gets smaller from here. It also stops at
  // `perStratum * CANDIDATE_CEILING_FACTOR` candidates, so a stratum that
  // never settles costs a known amount. See `CANDIDATE_CEILING_FACTOR` for
  // the request cost.
  type Candidate = { stratum: StratumId; key: number; inMonth: number };
  const scorePage = async (page: readonly Candidate[]): Promise<SeasonalSpecies[]> => {
    // Per candidate: the twelve-month histogram and the name. Both are needed
    // before anything can be said about the species, and both are GBIF's.
    const resolved = await pooled(page, async (candidate) => {
      const [hist, taxon] = await Promise.all([
        fetchGbif<FacetResponse>(
          `/occurrence/search?${box}&limit=0&speciesKey=${candidate.key}&facet=month&facetLimit=12`,
        ),
        fetchGbif<{
          vernacularName?: string;
          canonicalName?: string;
          scientificName?: string;
          class?: string;
        }>(`/species/${candidate.key}`),
      ]);

      const buckets = new Map<number, number>();
      for (const c of hist.facets?.[0]?.counts ?? []) {
        buckets.set(Number(c.name), c.count);
      }
      const histogram = Array.from({ length: 12 }, (_, i) => buckets.get(i + 1) ?? 0);
      const allYear = hist.count;

      const scientificName = taxon.canonicalName ?? taxon.scientificName ?? "";
      if (!scientificName) return null;
      if (isHazard(scientificName)) return null;

      // AN ENGLISH COMMON NAME IS A HARD REQUIREMENT, and this is the single
      // most important filter in the file. The first run of this prototype
      // ranked purely by seasonality and returned `Idaea eugeniata` and `Katha
      // depressa` at the top for Porto — obscure moths that are genuinely,
      // verifiably recorded there in August, and completely useless. A teacher
      // cannot read a binomial to a class and a child cannot look for one, so a
      // species without a name in plain English is not a species we can offer.
      const vernacular = await englishName(candidate.key, taxon.vernacularName);
      if (!vernacular) return null;
      // A slashed GBIF label ("Little Egret/Western Reef-Heron") is an
      // unresolved pair. A teacher cannot use it and a child cannot find it.
      if (vernacular.includes("/")) return null;
      const name = vernacular;

      const entry: Unranked = {
        key: candidate.key,
        name,
        scientificName,
        taxonClass: taxon.class ?? null,
        stratum: candidate.stratum,
        occurrencesInMonth: candidate.inMonth,
        occurrencesAllYear: allYear,
        monthShare: allYear > 0 ? candidate.inMonth / allYear : 0,
        monthHistogram: histogram,
        phase: phaseFromHistogram(histogram, month),
      };
      return entry;
    });

    // SEASONALITY IS A GATE, NOT THE SORT KEY, and this correction came out of
    // running the thing. Sorting by `monthShare` puts whatever is rarest at the
    // top, because a species with three records in its whole local history and
    // all three in August scores 100%. Uniform presence across twelve months is
    // a share of 1/12, so requiring meaningfully more than that keeps only
    // species this month can honestly claim.
    //
    // What FOLLOWED this gate until #312 was `.sort(b.occurrencesInMonth -
    // a.occurrencesInMonth)` — abundance, which is the mechanism that put ten
    // light-trap moths under Porto's Barn Swallow. The gate is unchanged; the
    // sort is now findability. See the FINDABILITY block above.
    const UNIFORM = 1 / 12;
    const inSeason = resolved
      .filter((s): s is Unranked => s !== null)
      .filter((s) => s.monthShare >= UNIFORM * 1.2);

    // The findability read costs one request per species, so it is paid AFTER
    // the gate and the name filter rather than before: only species that could
    // actually be offered to a class are worth asking about.
    return pooled(inSeason, async (s) => ({
      ...s,
      findability: await findabilitySignals(box, s.key, month, s.taxonClass, lng),
    }));
  };

  const pageSize = perStratum * 3;
  const ceiling = perStratum * CANDIDATE_CEILING_FACTOR;
  const species: SeasonalSpecies[] = [];
  // Strata run one after another: each already fans out at MAX_CONCURRENCY,
  // and GBIF 429s under a wider fan-out.
  for (const stratum of STRATA) {
    const scored: SeasonalSpecies[] = [];
    for (let offset = 0; offset < ceiling; offset += pageSize) {
      const limit = Math.min(pageSize, ceiling - offset);
      const data = await fetchGbif<FacetResponse>(
        `/occurrence/search?${box}&limit=0&taxonKey=${stratum.taxonKey}&month=${month}` +
          `&facet=speciesKey&facetLimit=${limit}&facetOffset=${offset}`,
      );
      const counts = data.facets?.[0]?.counts ?? [];
      const page = counts
        .map((c) => ({ stratum: stratum.id, key: Number(c.name), inMonth: c.count }))
        .filter((c) => Number.isFinite(c.key));
      scored.push(...(await scorePage(page)));

      if (counts.length < limit) break;
      const kth = scored.map((s) => s.findability.score).sort((a, b) => b - a)[perStratum - 1];
      const smallest = counts[counts.length - 1]!.count;
      if (kth !== undefined && findabilityCeiling(smallest) <= kth) break;
    }
    // Only the ranks the paging proved (#1211 review 4005048454). Stopping shows
    // that nothing unseen can enter this stratum's top `perStratum`; it says
    // nothing about the rows below them, which an unseen species could outrank.
    // At the hard ceiling the same cut applies to what was scanned.
    species.push(...rankByFindability(scored).slice(0, perStratum));
  }

  return rankByFindability(species);
}
