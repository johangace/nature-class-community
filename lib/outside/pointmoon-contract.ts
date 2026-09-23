/**
 * Nature Class' narrow, versioned projection of Pointmoon nature evidence.
 *
 * Pointmoon owns a much larger field-truth response. This module deliberately
 * validates only the observation slice Nature Class consumes, then returns a
 * new object containing only values that crossed this boundary. Renderers
 * should consume this projection, never the raw response.
 */

export const POINTMOON_SOURCE_SCHEMA_VERSION = "field-truth@1.1.0" as const;
export const POINTMOON_NATURE_CONTRACT_VERSION = "nature-class-pointmoon@1.1.0" as const;

export type PointmoonPhotoRole = "observation" | "taxon-reference";

/**
 * Whatever licence travelled with the photograph, recorded and not judged.
 *
 * This used to be `"cc0" | "cc-by"`, and it was the ceiling on every image in
 * the product. iNaturalist's most common photo licence is `cc-by-nc`, so the
 * majority of what Pointmoon serves was discarded HERE, at the contract
 * boundary, before any renderer saw it — silently, with no error and no log,
 * looking exactly like a school with nothing photographed nearby.
 *
 * Johan, 2026-08-17: "if pointmoon is passing those photos dont add stupid
 * gates... keep attribution but accept any photos we can get."
 *
 * So the licence is carried rather than gated. Credit and source are still
 * required, because those are what make a photograph publishable at all and
 * they cost one line under the image. Nothing here decides what a licence
 * permits; it records what it says so a surface can print it.
 */
export type PointmoonPhotoLicense = string;

/** @deprecated The old two-licence ceiling. Kept so existing imports compile. */
export type PointmoonOpenPhotoLicense = PointmoonPhotoLicense;

/** A display candidate whose URL, role, credit, rights and source all passed together. */
export interface PointmoonPhotoAsset {
  url: string;
  role: PointmoonPhotoRole;
  /** Named creator when Pointmoon could resolve one. Legacy records may omit it. */
  creator?: string;
  attribution: string;
  license: PointmoonPhotoLicense;
  sourceUrl: string;
  observationId?: string;
  observedAt?: string;
}

/** Evidence that a taxon was present inside one named iNaturalist read window. */
export interface PointmoonPresenceEvidence {
  provider: "inaturalist";
  /** Opaque provider identifier. It is a string even when it contains digits. */
  taxonId: string;
  observationCount: number;
  radiusKm: number;
  windowStart: string;
  windowEnd: string;
}

export type PointmoonObservationSource = "nearby" | "notable-bird" | "historical-absence";

export type PointmoonPlaceHintStatus = "coarse" | "withheld-obscured" | "unavailable";

/**
 * Per-species freshness from Pointmoon's direct-observations sample (#959).
 *
 * `latestObservedAt` is THE RECORD'S OWN instant, never the read time, and
 * never a phrase: "2 days ago" is a sentence Nature Class writes from this
 * token and its own clock. `placeHint` is one record's coarse place — the
 * freshest sampled one — so it belongs to the sighting stamped beside it and
 * to no other. A surface may print it only when `placeHintStatus` is
 * `"coarse"`; the other two statuses say why nothing is there.
 */
export interface PointmoonSpeciesRecency {
  provider: "inaturalist";
  latestObservedAt: string | null;
  recordCount: number;
  observerCount: number;
  sampledRecordCount: number;
  placeHint: string | null;
  placeHintStatus: PointmoonPlaceHintStatus;
}

/**
 * One annotation's evidence: how many sampled records, the freshest one's own
 * instant, its licence — and, since pointmoon#122 (PR pointmoon#126), THAT
 * RECORD'S OWN coarse place and id.
 *
 * The place here belongs to the sighting stamped beside it in this same slot
 * and to no other. It is not `recency.placeHint`: that one belongs to the
 * freshest SAMPLED record, which is a different record, and carrying it onto
 * an annotation is precisely the defect pointmoon#122 exists to prevent (#967).
 *
 * The three keys are optional because a payload from before pointmoon#126
 * carries none of them, and an absent key is honestly "the producer said
 * nothing" rather than an invented null. `placeHint` is set ONLY under
 * `placeHintStatus: "coarse"` — the withholding statuses never reach memory
 * carrying a string — and `slotPlace()` below is the only sanctioned way to
 * read it.
 */
export interface PointmoonPhenophaseEvidence {
  recordCount: number;
  latestObservedAt: string | null;
  license: string;
  placeHint?: string;
  placeHintStatus?: PointmoonPlaceHintStatus;
  observationId?: string;
}

/**
 * THE ONLY WAY TO A PRINTABLE PLACE ON AN OBSERVED LINE (#967).
 *
 * Takes an annotated slot, never a sample receipt: `PointmoonSpeciesRecency`
 * has no `license`, so it does not satisfy this parameter and a renderer that
 * tries to pass one does not compile. That is the point — the rule "never
 * `recency.placeHint`" is a type error here, not a comment somebody has to
 * remember.
 *
 * The coarse check is repeated even though `projectPhenophaseEvidence` already
 * nulls a withheld hint, so a slot built by hand in a test or a future caller
 * cannot print what the producer withheld.
 */
export function slotPlace(evidence: PointmoonPhenophaseEvidence): string | null {
  if (evidence.placeHintStatus !== "coarse") return null;
  return evidence.placeHint ?? null;
}

export type PointmoonLeafState = "breaking-buds" | "green" | "coloured" | "no-live-leaves";

export interface PointmoonLeavesEvidence extends PointmoonPhenophaseEvidence {
  state: PointmoonLeafState;
}

/**
 * The OBSERVED leg of phenology (#959): volunteer annotations on dated,
 * research-grade records, read off the same sample as `recency`.
 *
 * Each slot is independent evidence, not one "current state" — two sampled
 * records may disagree and both are kept, each with its own instant. The
 * typed negative `noFlowersOrFruits` is not the same fact as `flowering:
 * null`: null-and-null is "unchecked", evidence in the negative is "checked
 * and found nothing". Never collapse the two, and never say the negative to a
 * child. A row Pointmoon did not annotate carries NO object at all, and this
 * projection keeps it that way rather than inventing one of nulls.
 */
export interface PointmoonPhenophase {
  provider: "inaturalist";
  flowering: PointmoonPhenophaseEvidence | null;
  fruiting: PointmoonPhenophaseEvidence | null;
  flowerBudding: PointmoonPhenophaseEvidence | null;
  noFlowersOrFruits: PointmoonPhenophaseEvidence | null;
  leaves: PointmoonLeavesEvidence | null;
  sampledRecordCount: number;
  epistemicType: "observed";
}

/** One narrow observation projection. No legacy photoUrl or coordinates can appear here. */
export interface PointmoonObservation {
  commonName: string;
  scientificName: string | null;
  count: number | null;
  iconicTaxon: string | null;
  yearsObserved: number | null;
  sampledYears: number | null;
  historicalAvgCount: number | null;
  ratioToHistorical: number | null;
  presenceRate: number | null;
  emerged: boolean | null;
  source: PointmoonObservationSource;
  presence: PointmoonPresenceEvidence | null;
  photo: PointmoonPhotoAsset | null;
  /**
   * Every picture Pointmoon holds of this species, best claim first, of which
   * `photo` above is element zero (pointmoon#153, #984).
   *
   * ORDER IS THE CLAIM, and it is upstream's: observation photographs (newest
   * record first), then the species' reference photographs. Taking the first
   * N takes the strongest N. `role` on each element still says which it is,
   * and a surface showing several of them must go on labelling them — a
   * species door with eight pictures is not better evidence that the animal
   * is here than one with one, and #33 is the whole reason that sentence is
   * written down rather than assumed.
   *
   * Absent, never empty. A cast resolved before this contract carries none,
   * and those rows must render exactly as they did.
   */
  photos?: PointmoonPhotoAsset[];
  /**
   * Present only when Pointmoon's direct sample saw this taxon AND the object
   * survived projection. Absent is "not sampled", never "not seen lately".
   */
  recency?: PointmoonSpeciesRecency;
  /** Present only when at least one sampled record carried an annotation. */
  phenophase?: PointmoonPhenophase;
}

export interface PointmoonHistoricalObservation {
  commonName: string;
  scientificName: string | null;
  avgCount: number | null;
  yearsObserved: number | null;
  sampledYears: number | null;
  iconicTaxon: string | null;
  photo: PointmoonPhotoAsset | null;
}

export interface PointmoonHistoricalEvidence {
  resolutionStatus: "resolved" | "partial" | "unresolved" | null;
  resolutionReason: string | null;
  observations: PointmoonHistoricalObservation[];
}

export interface PointmoonNatureReady {
  contractVersion: typeof POINTMOON_NATURE_CONTRACT_VERSION;
  status: "ready";
  sourceSchemaVersion: typeof POINTMOON_SOURCE_SCHEMA_VERSION;
  freshness: "current" | "legacy-unbounded";
  validUntil: string | null;
  recentWindowDays: number | null;
  observations: PointmoonObservation[];
  absences: PointmoonObservation[];
  historical: PointmoonHistoricalEvidence | null;
}

export type PointmoonNatureThinReason =
  | "invalid-payload"
  | "unsupported-version"
  | "missing-observations"
  | "invalid-observations"
  | "stale";

export interface PointmoonNatureThin {
  contractVersion: typeof POINTMOON_NATURE_CONTRACT_VERSION;
  status: "thin";
  reason: PointmoonNatureThinReason;
  sourceSchemaVersion: string | null;
}

export type PointmoonNatureProjection = PointmoonNatureReady | PointmoonNatureThin;

export interface ParsePointmoonNatureOptions {
  /** Injectable clock used only for an explicit observation-slice expiry. */
  now?: Date;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown, maxLength = 300): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function finiteNumber(value: unknown, minimum = 0): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;
}

function integer(value: unknown, minimum = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value
    : null;
}

/**
 * An ISO 8601 instant, or null. Shape is checked BEFORE parsing: `Date.parse`
 * accepts "1" as 2001-01-01, and a malformed producer value must become
 * silence, never a real-looking date (Codex review on PR #960, round five).
 */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|([+-])(\d{2}):?(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * An ISO 8601 instant whose calendar fields are real. The shape check alone is
 * not enough: `Date.parse("2026-02-30T09:00:00Z")` succeeds and rolls to
 * March 2, and a producer bug would then cross this boundary as dated
 * evidence. Each component is range-checked before the runtime parser sees it
 * (Codex review on PR #960, round six).
 */
function isoInstant(value: unknown): string | null {
  const candidate = text(value, 100);
  const match = candidate ? ISO_INSTANT.exec(candidate) : null;
  if (!candidate || !match) return null;
  const [, y, mo, d, h, mi, sec, , oh, om] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (Number(h) > 23 || Number(mi) > 59 || (sec !== undefined && Number(sec) > 59)) return null;
  if (oh !== undefined && (Number(oh) > 23 || Number(om) > 59)) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isoDate(value: unknown): string | null {
  const candidate = text(value, 10);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function httpsUrl(value: unknown): string | null {
  const candidate = text(value, 2_048);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

function projectPhoto(value: unknown): PointmoonPhotoAsset | null {
  const photo = asRecord(value);
  if (!photo) return null;

  const url = httpsUrl(photo.url);
  const sourceUrl = httpsUrl(photo.sourceUrl);
  const attribution = text(photo.attribution, 500);
  const role = photo.role;
  const license = photo.license;

  // ONE CONDITION: a usable image address. Everything else is recorded and
  // passed on rather than used to withhold the picture. Johan, 2026-08-17:
  // "all photos no gates! we need any photo we can get".
  if (!url) return null;

  const asset: PointmoonPhotoAsset = {
    url,
    role: role === "observation" || role === "taxon-reference" ? role : "taxon-reference",
    attribution: attribution ?? "",
    // An unstated licence is recorded as unstated rather than invented as open.
    license: text(license, 100) ?? "unstated",
    sourceUrl: sourceUrl ?? "",
  };
  const creator = text(photo.creator, 300);
  const observationId = text(photo.observationId, 200);
  const observedAt = isoInstant(photo.observedAt);
  if (creator) asset.creator = creator;
  if (observationId) asset.observationId = observationId;
  if (observedAt) asset.observedAt = observedAt;
  return asset;
}

/**
 * The gallery, projected one asset at a time through the same single gate.
 *
 * DEDUPED BY URL. Upstream already dedupes, and this does it again because
 * the boundary's job is to be right about what it hands on rather than to
 * trust what it was handed — a surface showing the same photograph twice
 * looks broken in exactly the way a gallery is meant to fix.
 *
 * Capped independently of upstream's cap for the same reason: a bound this
 * side owns cannot be moved by a contract change it did not review.
 */
const MAX_GALLERY_PHOTOS = 8;

function projectPhotos(value: unknown): PointmoonPhotoAsset[] {
  if (!Array.isArray(value)) return [];
  const photos: PointmoonPhotoAsset[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (photos.length >= MAX_GALLERY_PHOTOS) break;
    const asset = projectPhoto(candidate);
    if (!asset || seen.has(asset.url)) continue;
    seen.add(asset.url);
    photos.push(asset);
  }
  return photos;
}

function projectPresence(value: unknown): PointmoonPresenceEvidence | null {
  const presence = asRecord(value);
  if (!presence || presence.provider !== "inaturalist") return null;

  const taxonId = text(presence.taxonId, 100);
  const observationCount = integer(presence.observationCount, 1);
  const radiusKm = finiteNumber(presence.radiusKm, Number.MIN_VALUE);
  const windowStart = isoDate(presence.windowStart);
  const windowEnd = isoDate(presence.windowEnd);

  if (
    taxonId === null ||
    observationCount === null ||
    radiusKm === null ||
    !windowStart ||
    !windowEnd ||
    windowStart > windowEnd
  ) {
    return null;
  }

  return {
    provider: "inaturalist",
    taxonId,
    observationCount,
    radiusKm,
    windowStart,
    windowEnd,
  };
}

/**
 * Recency is projected whole or not at all. A recency object with a bad
 * denominator is a sample that cannot be reasoned about, so it is dropped
 * rather than repaired; the row it sat on is untouched. `latestObservedAt`
 * that fails to parse becomes null — the same thing Pointmoon sends when no
 * sampled record carried a date — rather than sinking the object, because
 * the counts are still a true receipt.
 */
function projectRecency(value: unknown): PointmoonSpeciesRecency | null {
  const recency = asRecord(value);
  if (!recency || recency.provider !== "inaturalist") return null;

  // A receipt for a sample that had no records, no observers, or no size is
  // not a receipt; it is dropped whole so no place or instant can ride on it.
  const recordCount = integer(recency.recordCount, 1);
  const observerCount = integer(recency.observerCount, 1);
  const sampledRecordCount = integer(recency.sampledRecordCount, 1);
  if (recordCount === null || observerCount === null || sampledRecordCount === null) return null;
  // A receipt whose place status is one this consumer does not know is a
  // receipt it cannot reason about, so the whole object goes: the counts are
  // not worth carrying under an unread contract.
  const place = projectPlaceHint(recency);
  if (!place) return null;

  return {
    provider: "inaturalist",
    latestObservedAt: isoInstant(recency.latestObservedAt),
    recordCount,
    observerCount,
    sampledRecordCount,
    ...place,
  };
}

/**
 * The coarse-only rule, written ONCE and shared by the sample receipt and by
 * every annotated slot (#967).
 *
 * A hint is only a hint under the status that vouches for it. Anything riding
 * along under "withheld-obscured" or "unavailable" is dropped here, so no
 * renderer anywhere can print a place the producer said it was not giving —
 * and there is exactly one copy of that judgement to keep true.
 *
 * Returns null for a status this consumer does not recognise; each caller
 * decides what an unread contract costs it.
 */
function projectPlaceHint(
  value: UnknownRecord
): { placeHint: string | null; placeHintStatus: PointmoonPlaceHintStatus } | null {
  const status = value.placeHintStatus;
  if (status !== "coarse" && status !== "withheld-obscured" && status !== "unavailable") {
    return null;
  }
  return {
    placeHint: status === "coarse" ? optionalText(value.placeHint, 200) : null,
    placeHintStatus: status,
  };
}

/**
 * A slot keeps its phase evidence even when its place is unreadable.
 *
 * The asymmetry with `projectRecency` is deliberate: a recency object is a
 * receipt ABOUT A SAMPLE, and an unrecognised status there means the receipt
 * cannot be trusted at all. A phenophase slot is evidence ABOUT A PHASE, and
 * a place this consumer cannot read invalidates the place, not the flowering.
 * So the place keys are simply left off, which is the same shape a payload
 * from before pointmoon#126 arrives in, and the line renders without a place.
 */
function projectPhenophaseEvidence(value: unknown): PointmoonPhenophaseEvidence | null {
  const evidence = asRecord(value);
  if (!evidence) return null;
  const recordCount = integer(evidence.recordCount, 1);
  if (recordCount === null) return null;
  const projected: PointmoonPhenophaseEvidence = {
    recordCount,
    latestObservedAt: isoInstant(evidence.latestObservedAt),
    // Recorded, not judged — an annotation is a fact about the record, not
    // redistributed media, so no licence gate applies here either.
    license: text(evidence.license, 100) ?? "unstated",
  };
  // Absent stays absent: keys appear only for what the producer actually sent,
  // so `in` and a null check agree here as they do on the observation row.
  const place = projectPlaceHint(evidence);
  if (place?.placeHintStatus) projected.placeHintStatus = place.placeHintStatus;
  if (place?.placeHint) projected.placeHint = place.placeHint;
  const observationId = text(evidence.observationId, 100);
  if (observationId) projected.observationId = observationId;
  return projected;
}

function projectLeavesEvidence(value: unknown): PointmoonLeavesEvidence | null {
  const leaves = asRecord(value);
  const evidence = projectPhenophaseEvidence(leaves);
  if (!leaves || !evidence) return null;
  const state = leaves.state;
  if (
    state !== "breaking-buds" &&
    state !== "green" &&
    state !== "coloured" &&
    state !== "no-live-leaves"
  ) {
    return null;
  }
  return { ...evidence, state };
}

/**
 * Each slot is validated on its own, so one malformed annotation loses one
 * slot and not the sibling facts. An object with no surviving slot is
 * dropped whole: an all-null phenophase is exactly the shape Pointmoon
 * promises never to send, and inventing it here would turn "not annotated"
 * into something a renderer might read as checked.
 */
function projectPhenophase(value: unknown): PointmoonPhenophase | null {
  const phenophase = asRecord(value);
  if (!phenophase || phenophase.provider !== "inaturalist") return null;
  // This boundary never manufactures an epistemic classification. Pointmoon
  // declares `observed` on every phenophase it emits; a payload that says
  // otherwise, or says nothing, is not carried as something somebody saw
  // (Codex review on PR #960).
  if (phenophase.epistemicType !== "observed") return null;
  // Present only when at least one sampled record was annotated, so a zero
  // sample is a malformed receipt and is dropped whole.
  const sampledRecordCount = integer(phenophase.sampledRecordCount, 1);
  if (sampledRecordCount === null) return null;

  const projected: PointmoonPhenophase = {
    provider: "inaturalist",
    flowering: projectPhenophaseEvidence(phenophase.flowering),
    fruiting: projectPhenophaseEvidence(phenophase.fruiting),
    flowerBudding: projectPhenophaseEvidence(phenophase.flowerBudding),
    noFlowersOrFruits: projectPhenophaseEvidence(phenophase.noFlowersOrFruits),
    leaves: projectLeavesEvidence(phenophase.leaves),
    sampledRecordCount,
    epistemicType: "observed",
  };
  const anySlot =
    projected.flowering ||
    projected.fruiting ||
    projected.flowerBudding ||
    projected.noFlowersOrFruits ||
    projected.leaves;
  return anySlot ? projected : null;
}

function optionalText(value: unknown, maxLength = 300): string | null {
  return value === undefined || value === null ? null : text(value, maxLength);
}

function optionalNumber(value: unknown): number | null {
  return value === undefined || value === null ? null : finiteNumber(value);
}

function optionalInteger(value: unknown): number | null {
  return value === undefined || value === null ? null : integer(value);
}

function projectObservation(
  value: unknown,
  source: PointmoonObservationSource
): PointmoonObservation | null {
  const entry = asRecord(value);
  if (!entry) return null;
  const commonName = text(entry.name);
  if (!commonName) return null;

  const observation: PointmoonObservation = {
    commonName,
    scientificName: optionalText(entry.scientificName),
    count: optionalNumber(entry.count),
    iconicTaxon: optionalText(entry.iconicTaxon),
    yearsObserved: optionalInteger(entry.yearsObserved),
    sampledYears: optionalInteger(entry.sampledYears),
    historicalAvgCount: optionalNumber(entry.historicalAvgCount),
    ratioToHistorical: optionalNumber(entry.ratioToHistorical),
    presenceRate: optionalNumber(entry.presenceRate),
    emerged: typeof entry.emerged === "boolean" ? entry.emerged : null,
    source,
    presence: projectPresence(entry.presence),
    // Deliberately ignores entry.photoUrl. A URL is never display authority.
    photo: projectPhoto(entry.photo),
  };
  // Set only when upstream actually sent a gallery, so a renderer's `in`
  // check and its length check agree — the same discipline as `recency` and
  // `phenophase` below. `photo` is left exactly as it was: a payload with
  // `photos` and no `photo` is upstream's business, and this boundary does
  // not manufacture one from the other in either direction.
  const photos = projectPhotos(entry.photos);
  if (photos.length) observation.photos = photos;
  // Absent stays absent (#959): the key is set only when Pointmoon sent an
  // object this boundary could stand behind, so a renderer's `in` check and
  // its null check agree.
  const recency = projectRecency(entry.recency);
  const phenophase = projectPhenophase(entry.phenophase);
  if (recency) observation.recency = recency;
  if (phenophase) observation.phenophase = phenophase;
  return observation;
}

function projectHistoricalObservation(value: unknown): PointmoonHistoricalObservation | null {
  const entry = asRecord(value);
  if (!entry) return null;
  const commonName = text(entry.name);
  if (!commonName) return null;

  return {
    commonName,
    scientificName: optionalText(entry.scientificName),
    avgCount: optionalNumber(entry.avgCount),
    yearsObserved: optionalInteger(entry.yearsObserved),
    sampledYears: optionalInteger(entry.sampledYears),
    iconicTaxon: optionalText(entry.iconicTaxon),
    // A bare photoUrl remains non-authoritative on every observation tier.
    photo: projectPhoto(entry.photo),
  };
}

function projectHistoricalEvidence(value: unknown): PointmoonHistoricalEvidence | null {
  const historical = asRecord(value);
  if (!historical) return null;

  const nearby = optionalArray(historical.nearby);
  const status = historical.resolutionStatus;
  const resolutionStatus =
    status === "resolved" || status === "partial" || status === "unresolved" ? status : null;

  const observations = (nearby ?? [])
    .map(projectHistoricalObservation)
    .filter((entry): entry is PointmoonHistoricalObservation => entry !== null);

  return {
    resolutionStatus,
    resolutionReason: optionalText(historical.resolutionReason),
    observations: resolutionStatus === "unresolved" ? [] : observations,
  };
}

function optionalArray(value: unknown): unknown[] | null {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : null;
}

function thin(
  reason: PointmoonNatureThinReason,
  sourceSchemaVersion: string | null
): PointmoonNatureThin {
  return {
    contractVersion: POINTMOON_NATURE_CONTRACT_VERSION,
    status: "thin",
    reason,
    sourceSchemaVersion,
  };
}

/**
 * Parse only the Pointmoon fields Nature Class is entitled to consume.
 * Invalid optional evidence is removed independently; malformed or stale
 * observation containers become an explicit thin state.
 */
export function parsePointmoonNatureProjection(
  payload: unknown,
  options: ParsePointmoonNatureOptions = {}
): PointmoonNatureProjection {
  const root = asRecord(payload);
  if (!root) return thin("invalid-payload", null);

  const sourceSchemaVersion = text(root.schemaVersion, 100);
  if (sourceSchemaVersion !== POINTMOON_SOURCE_SCHEMA_VERSION) {
    return thin("unsupported-version", sourceSchemaVersion);
  }

  const facts = asRecord(root.facts);
  const snapshot = facts ? asRecord(facts.fieldSnapshot) : null;
  if (!facts || !snapshot || snapshot.observations === undefined) {
    return thin("missing-observations", sourceSchemaVersion);
  }

  const observations = asRecord(snapshot.observations);
  if (!observations) return thin("invalid-observations", sourceSchemaVersion);

  const nearby = optionalArray(observations.nearby);
  const absent = optionalArray(observations.absent);
  const birdsValue = observations.birds;
  const birds = birdsValue === undefined || birdsValue === null ? {} : asRecord(birdsValue);
  const notable = birds ? optionalArray(birds.notable) : null;
  if (!nearby || !absent || !birds || !notable) {
    return thin("invalid-observations", sourceSchemaVersion);
  }

  let validUntil: string | null = null;
  let freshness: PointmoonNatureReady["freshness"] = "legacy-unbounded";
  if (observations.validUntil !== undefined && observations.validUntil !== null) {
    validUntil = isoInstant(observations.validUntil);
    if (!validUntil) return thin("invalid-observations", sourceSchemaVersion);
    const suppliedNow = options.now?.getTime();
    const now = typeof suppliedNow === "number" && Number.isFinite(suppliedNow)
      ? suppliedNow
      : Date.now();
    if (Date.parse(validUntil) <= now) return thin("stale", sourceSchemaVersion);
    freshness = "current";
  }

  const projectedNearby = nearby
    .map((entry) => projectObservation(entry, "nearby"))
    .filter((entry): entry is PointmoonObservation => entry !== null);
  const projectedBirds = notable
    .map((entry) => projectObservation(entry, "notable-bird"))
    .filter((entry): entry is PointmoonObservation => entry !== null);
  const projectedAbsences = absent
    .map((entry) => projectObservation(entry, "historical-absence"))
    .filter((entry): entry is PointmoonObservation => entry !== null);

  return {
    contractVersion: POINTMOON_NATURE_CONTRACT_VERSION,
    status: "ready",
    sourceSchemaVersion: POINTMOON_SOURCE_SCHEMA_VERSION,
    freshness,
    validUntil,
    recentWindowDays: optionalInteger(observations.recentWindowDays),
    observations: [...projectedNearby, ...projectedBirds],
    absences: projectedAbsences,
    historical: projectHistoricalEvidence(observations.historical),
  };
}
