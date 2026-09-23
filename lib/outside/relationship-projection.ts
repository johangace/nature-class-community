/** Pointmoon #191: published relationships, separate from local observations. */
export interface ResearchRelationship {
  id: string
  plant: string
  visitor: string
  studyCitation: string
  studyUrl: string
  datasetCitation: string
  datasetArchiveUrl: string
  license: string
  licenseUrl: string
  retrievedAt: string
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 4000
const instant = (value: unknown): number =>
  typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value)
    ? Date.parse(value)
    : NaN
const safeUrl = (value: unknown): value is string => {
  if (!text(value)) return false
  try {
    const url = new URL(value)
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
const licenses: Record<string, string> = {
  'OGL-UK-3.0':
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
}

export function globiEvidenceEnabled(value: string | undefined): boolean {
  return value === 'true'
}

/** A malformed relationship never removes valid weather or another relationship. */
export function projectRelationships(
  value: unknown,
  now = new Date(),
): ResearchRelationship[] {
  const block = object(value)
  const quality = object(block?.quality)
  const coverage = object(block?.coverage)
  if (
    !block ||
    block.provider !== 'globi' ||
    block.status !== 'resolved' ||
    block.reason !== 'snapshot-subset' ||
    block.evidenceKind !== 'published-relationship' ||
    !text(block.snapshotId) ||
    coverage?.complete !== false ||
    quality?.localInteractionConfirmed !== false ||
    quality?.refutations !== 'checked-snapshot' ||
    quality?.taxonMatch !== 'exact-scientific-name' ||
    !safeUrl(quality?.refutationArchiveUrl) ||
    typeof quality.refutationSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(quality.refutationSha256)
  )
    return []
  const acquired = instant(block.retrievedAt)
  const expires = instant(block.refreshAfter)
  const clock = now.getTime()
  if (
    !Number.isFinite(clock) ||
    !Number.isFinite(acquired) ||
    !Number.isFinite(expires) ||
    acquired > clock ||
    expires <= clock ||
    expires <= acquired ||
    !Array.isArray(block.entries)
  )
    return []
  const result: ResearchRelationship[] = []
  const seen = new Set<string>()
  for (const item of block.entries.slice(0, 200)) {
    const row = object(item)
    const source = object(row?.sourceTaxon)
    const target = object(row?.targetTaxon)
    if (
      !row ||
      row.evidenceKind !== 'published-relationship' ||
      row.spatialScope !== 'study-context-only' ||
      !text(row.id) ||
      seen.has(row.id) ||
      instant(row.retrievedAt) !== acquired ||
      !text(source?.scientificName) ||
      !text(target?.scientificName) ||
      !text(source?.externalId) ||
      !text(target?.externalId) ||
      !/^[A-Za-z][A-Za-z0-9_-]*:/.test(source.externalId) ||
      !/^[A-Za-z][A-Za-z0-9_-]*:/.test(target.externalId) ||
      !text(row.studyCitation) ||
      !text(row.datasetId) ||
      !text(row.datasetCitation) ||
      !safeUrl(row.studyUrl) ||
      !safeUrl(row.datasetArchiveUrl) ||
      !text(row.license) ||
      licenses[row.license] !== row.licenseUrl
    )
      continue
    // Do not upgrade food, habitat, host or generic association into flower visits.
    if (
      row.interactionType !== 'visitsFlowersOf' &&
      row.interactionType !== 'flowersVisitedBy'
    )
      continue
    seen.add(row.id)
    result.push({
      id: row.id,
      plant:
        row.interactionType === 'visitsFlowersOf'
          ? target.scientificName
          : source.scientificName,
      visitor:
        row.interactionType === 'visitsFlowersOf'
          ? source.scientificName
          : target.scientificName,
      studyCitation: row.studyCitation,
      studyUrl: row.studyUrl,
      datasetCitation: row.datasetCitation,
      datasetArchiveUrl: row.datasetArchiveUrl,
      license: row.license,
      licenseUrl: row.licenseUrl as string,
      retrievedAt: row.retrievedAt as string,
    })
  }
  return result
}
