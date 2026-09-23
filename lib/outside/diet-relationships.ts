/** Validate dataset-cited GloBI diet context; run the diet-relationships tests. */
export interface DietRelationship {
  id: string
  eater: string
  food: string
  sourceScientificName: string
  targetScientificName: string
  interactionType: 'eats' | 'eatenBy'
  studyCitation: string
  datasetCitation: string
  datasetArchiveUrl: string
  license: string
  licenseUrl: string
  retrievedAt: string
  eventDate: string | null
}
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000
const instant = (v: unknown): number => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN
const namespaced = (v: unknown): v is string => text(v) && /^[A-Za-z][A-Za-z0-9_-]*:/.test(v)
const ARCHIVE = 'https://zenodo.org/records/12683972/files/hurlbertlab/dietdatabase-v.1.0.8.zip'
const REFUTATIONS = 'https://zenodo.org/records/20546682/files/refuted-interactions.tsv.gz'
const REFUTATION_SHA = '674e5b069992ab8a7fe98d76d0b9eb531c90c3ca267f434d14aa44a72ebbf8d6'
/** Legacy flower status may be unresolved while this independent envelope resolves. */
export function projectDietRelationships(value: unknown, now = new Date()): DietRelationship[] {
  const block = object(value), envelope = object(block?.datasetReferences), quality = object(block?.quality), coverage = object(block?.coverage)
  if (!block || block.provider !== 'globi' || block.evidenceKind !== 'published-relationship' || block.use !== 'question-to-investigate' || !text(block.snapshotId) ||
      envelope?.status !== 'resolved' || envelope.reason !== 'snapshot-subset' || !Array.isArray(envelope.entries) || coverage?.complete !== false ||
      quality?.localInteractionConfirmed !== false || quality.taxonMatch !== 'exact-scientific-name' || quality.refutations !== 'checked-snapshot' ||
      quality.refutationArchiveUrl !== REFUTATIONS || quality.refutationSha256 !== REFUTATION_SHA) return []
  const acquired = instant(block.retrievedAt), expires = instant(block.refreshAfter), clock = now.getTime()
  if (![acquired, expires, clock].every(Number.isFinite) || acquired > clock || expires <= clock || expires <= acquired || expires - acquired > 30 * 86400000) return []
  const result: DietRelationship[] = [], seen = new Set<string>()
  for (const item of envelope.entries.slice(0, 200)) {
    const row = object(item), source = object(row?.sourceTaxon), target = object(row?.targetTaxon)
    if (!row || row.citationBasis !== 'dataset-archive' || row.studyUrl !== null || row.evidenceKind !== 'published-relationship' || row.spatialScope !== 'study-context-only' ||
        !text(row.id) || seen.has(row.id) || instant(row.retrievedAt) !== acquired || !text(source?.scientificName) || !text(target?.scientificName) ||
        !namespaced(source.externalId) || !namespaced(target.externalId) || !text(row.studyCitation) || !text(row.datasetCitation) ||
        row.datasetId !== 'hurlbertlab/dietdatabase' || row.datasetArchiveUrl !== ARCHIVE || row.license !== 'CC-BY-4.0' || row.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/' ||
        (row.interactionType !== 'eats' && row.interactionType !== 'eatenBy') ||
        (row.eventDate !== null && (!Number.isFinite(instant(row.eventDate)) || instant(row.eventDate) > acquired))) continue
    seen.add(row.id)
    result.push({ id: row.id, eater: row.interactionType === 'eats' ? source.scientificName : target.scientificName,
      food: row.interactionType === 'eats' ? target.scientificName : source.scientificName,
      sourceScientificName: source.scientificName, targetScientificName: target.scientificName, interactionType: row.interactionType,
      studyCitation: row.studyCitation, datasetCitation: row.datasetCitation, datasetArchiveUrl: ARCHIVE,
      license: row.license, licenseUrl: row.licenseUrl, retrievedAt: block.retrievedAt as string, eventDate: row.eventDate as string | null })
  }
  return result
}
