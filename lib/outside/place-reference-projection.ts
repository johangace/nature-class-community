/** Source-bound reference context for city pages; never current presence or phase. */
export interface PlaceReferenceCard {
  id: string
  scientificName?: string
  title: string
  detail: string
  scope: string
  date: string
  attribution: string
  links: { label: string; url: string }[]
}
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
const str = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length < 6000
const num = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const url = (v: unknown): v is string => {
  if (!str(v)) return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password
  } catch {
    return false
  }
}
const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(v))
const bound = (v: unknown, lat: number, lon: number) => {
  const c = obj(v)
  return (
    num(c?.latitude) &&
    num(c?.longitude) &&
    Math.abs(c.latitude - lat) < 0.00001 &&
    Math.abs(c.longitude - lon) < 0.00001
  )
}
const fresh = (at: unknown, until: unknown, now: number) =>
  date(at) &&
  date(until) &&
  Date.parse(String(at)) <= now &&
  now < Date.parse(String(until))
const recent = (at: unknown, ttl: number, now: number) =>
  date(at) &&
  Date.parse(String(at)) <= now &&
  now - Date.parse(String(at)) < ttl
const DAY = 86400000
export function projectPlaceEvidence(
  value: unknown,
  lat: number,
  lon: number,
  now = new Date(),
): PlaceReferenceCard[] {
  const snapshot = obj(value),
    clock = now.getTime(),
    cards: PlaceReferenceCard[] = []
  if (!snapshot || !Number.isFinite(clock) || !num(lat) || !num(lon))
    return cards
  const camera = obj(snapshot.cameraEvidence)
  if (
    camera &&
    camera.silent === false &&
    camera.source === 'phenocam' &&
    camera.evidenceKind === 'camera-derived' &&
    camera.spatialScope === 'camera-roi-only' &&
    camera.localConditionConfirmed === false &&
    camera.footprint === null &&
    camera.siteId === 'harvard' &&
    camera.roiId === '1000' &&
    bound(camera.cameraPosition, 42.5378, -72.1715) &&
    camera.vegetationType === 'DB' &&
    bound(camera.center, lat, lon) &&
    camera.license === 'CC-BY-4.0' &&
    camera.licenseUrl === 'https://creativecommons.org/licenses/by/4.0/' &&
    recent(camera.retrievedAt, 6 * 3600000, clock) &&
    recent(camera.sourceUpdatedOn, 7 * DAY, clock) &&
    url(camera.sourceUrl) &&
    url(camera.siteUrl) &&
    url(camera.termsUrl) &&
    str(camera.attribution) &&
    num(camera.distanceKm) &&
    camera.distanceKm >= 0 &&
    camera.distanceKm <= 150 &&
    Array.isArray(camera.samples)
  ) {
    const samples = camera.samples
      .map(obj)
      .filter(
        (s): s is Record<string, unknown> =>
          !!s &&
          date(s.date) &&
          recent(s.date, 32 * DAY, clock) &&
          num(s.gccMean) &&
          s.gccMean >= 0 &&
          s.gccMean <= 1 &&
          num(s.imageCount) &&
          s.imageCount > 0 &&
          ['unavailable', 'not-flagged'].includes(String(s.outlierCheck)),
      )
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const last = samples[samples.length - 1]
    if (last && recent(last.date, 7 * DAY, clock))
      cards.push({
        id: 'camera-harvard',
        title: 'A forest camera to compare',
        detail: `Harvard Forest's camera recorded a canopy green-colour index of ${Number(last.gccMean).toFixed(3)} on ${String(last.date)} from ${last.imageCount} images. Compare its dated view with what you notice where you are.`,
        scope: `Regional reference, ${camera.distanceKm.toFixed(1)} km away. Camera viewing region 1000, deciduous broadleaf canopy. This does not establish conditions here or a species' seasonal phase. Provisional measurements; outlier check ${last.outlierCheck === 'unavailable' ? 'unavailable' : 'not flagged'}.`,
        date: String(last.date),
        attribution: camera.attribution,
        links: [
          { label: 'Camera and site', url: camera.siteUrl },
          { label: 'Daily measurements', url: camera.sourceUrl },
          { label: 'CC BY 4.0', url: camera.licenseUrl },
          { label: 'Source terms', url: camera.termsUrl },
        ],
      })
  }
  const inventory = obj(snapshot.treeInventory)
  if (
    inventory &&
    inventory.silent === false &&
    inventory.source === 'boston-bprd' &&
    inventory.evidenceKind === 'inventory' &&
    inventory.spatialScope === 'publisher-tree-points' &&
    inventory.localPresenceConfirmed === false &&
    inventory.radiusMeters === 500 &&
    bound(inventory.center, lat, lon) &&
    inventory.license === 'ODC-PDDL-1.0' &&
    url(inventory.sourceUrl) &&
    inventory.licenseUrl === 'https://opendatacommons.org/licenses/pddl/1-0/' &&
    str(inventory.attribution) &&
    recent(inventory.retrievedAt, DAY, clock) &&
    typeof inventory.truncated === 'boolean' &&
    Array.isArray(inventory.records)
  ) {
    for (const candidate of inventory.records.slice(0, 25)) {
      const r = obj(candidate)
      if (
        !r ||
        !str(r.entityId) ||
        !num(r.publisherId) ||
        r.entityId !== `boston-bprd:${r.publisherId}` ||
        !str(r.scientificName) ||
        !num(r.distanceKm) ||
        r.distanceKm < 0 ||
        r.distanceKm > 0.5 ||
        r.inventoryObservedOn !== null ||
        r.coordinateUncertaintyMeters !== null ||
        r.access !== 'not-verified'
      )
        continue
      cards.push({
        id: r.entityId,
        scientificName: r.scientificName,
        title: r.scientificName,
        detail: `Boston's tree inventory lists this tree about ${Math.round(r.distanceKm * 1000)} metres from the requested location. A teacher must locate and identify it and check access before choosing it for a class return visit.`,
        scope: `Publisher record ${r.entityId}. Survey date, position accuracy, public access and continued presence are unverified. This is a limited inventory sample${inventory.truncated ? ', with further records omitted' : ''}.`,
        date: `Inventory retrieved ${String(inventory.retrievedAt).slice(0, 10)}; survey date unknown`,
        attribution: inventory.attribution,
        links: [
          { label: 'Boston inventory', url: inventory.sourceUrl },
          { label: 'PDDL licence', url: inventory.licenseUrl },
        ],
      })

    }
  }
  const gbif = obj(snapshot.gbifSeasonal)
  if (
    gbif &&
    gbif.provider === 'gbif' &&
    gbif.evidenceKind === 'historical-occurrence-sample' &&
    ['resolved', 'partial'].includes(String(gbif.resolutionStatus)) &&
    gbif.findability === 'not-assessed' &&
    bound(gbif.window, lat, lon) &&
    fresh(gbif.readAt, gbif.validUntil, clock) &&
    obj(gbif.sampling)?.nonInaturalistOnly === true &&
    Array.isArray(gbif.candidates)
  ) {
    const w = obj(gbif.window)!
    if (
      !num(w.month) ||
      !Number.isInteger(w.month) ||
      w.month < 1 ||
      w.month > 12 ||
      !num(w.yearStart) ||
      !num(w.yearEnd) ||
      w.yearStart > w.yearEnd ||
      w.yearEnd >= now.getUTCFullYear() ||
      !num(w.radiusKm) ||
      w.radiusKm <= 0 ||
      w.radiusKm > 50
    ) {
      /* omit only GBIF */
    } else
      for (const candidate of gbif.candidates.slice(0, 40)) {
        const r = obj(candidate)
        if (
          !r ||
          !str(r.scientificName) ||
          !num(r.gbifSpeciesKey) ||
          !Array.isArray(r.references)
        )
          continue
        const ref = r.references
          .map(obj)
          .find(
            (v) =>
              v &&
              num(v.occurrenceKey) &&
              str(v.datasetKey) &&
              v.sourceUrl ===
                `https://www.gbif.org/occurrence/${v.occurrenceKey}` &&
              v.datasetUrl === `https://www.gbif.org/dataset/${v.datasetKey}` &&
              new Date(String(v.eventDate)).getUTCFullYear() >=
                Number(w.yearStart) &&
              new Date(String(v.eventDate)).getUTCFullYear() <=
                Number(w.yearEnd) &&
              new Date(String(v.eventDate)).getUTCMonth() + 1 === w.month &&
              url(v.sourceUrl) &&
              url(v.datasetUrl) &&
              date(v.eventDate) &&
              Date.parse(String(v.eventDate)) <= clock &&
              ['CC0-1.0', 'CC-BY-4.0'].includes(String(v.license)),
          )
        if (!ref) continue
        cards.push({
          id: `gbif:${r.gbifSpeciesKey}`,
          scientificName: r.scientificName,
          title: `Past record: ${r.scientificName}`,
          detail: `A published occurrence record is dated ${String(ref.eventDate).slice(0, 10)}. It can help you explore the area's recorded biodiversity.`,
          scope: `Historical sample for month ${w.month}, ${w.yearStart}–${w.yearEnd}, within ${w.radiusKm} km. This does not establish current presence or whether you can find the species. Sampling is incomplete for product purposes.`,
          date: String(ref.eventDate).slice(0, 10),
          attribution: `GBIF occurrence ${String(ref.occurrenceKey)}; dataset ${String(ref.datasetKey)}. ${ref.license}.`,
          links: [
            { label: 'Original occurrence', url: String(ref.sourceUrl) },
            { label: 'Original dataset', url: String(ref.datasetUrl) },
          ],
        })

      }
  }
  for (const [key, provider, kind, scope] of [
    [
      'soilContext',
      'soilgrids',
      'modelled-soil-context',
      'reference-cell-only',
    ],
    [
      'vegetationComparison',
      'copernicus-sentinel-2',
      'satellite-derived-vegetation',
      'reference-plot-only',
    ],
  ] as const) {
    const b = obj(snapshot[key]),
      r = obj(b?.reference)
    if (
      !b ||
      b.silent !== false ||
      b.provider !== provider ||
      b.evidenceKind !== kind ||
      b.scope !== scope ||
      !bound(b.center, lat, lon) ||
      !fresh(b.retrievedAt, b.refreshAfter, clock) ||
      !r ||
      !str(r.name) ||
      !str(r.id) ||
      !num(r.distanceKm) ||
      r.distanceKm < 0 ||
      r.distanceKm > 10 ||
      !str(b.attribution) ||
      !url(b.termsUrl)
    )
      continue
    if (
      key === 'soilContext' &&
      b.localSoilMeasured === false &&
      b.license === 'CC-BY-4.0' &&
      b.spatialResolutionM === 250 &&
      Array.isArray(b.properties)
    ) {
      const properties = b.properties
        .map(obj)
        .filter(
          (p): p is Record<string, unknown> =>
            !!p &&
            p.property === 'phh2o' &&
            p.unit === 'pH' &&
            Array.isArray(p.depthCm) &&
            p.depthCm.length === 2 &&
            p.depthCm.every(num) &&
            p.depthCm[0]! >= 0 &&
            p.depthCm[1]! > p.depthCm[0]! &&
            num(p.mean) &&
            num(p.q05) &&
            num(p.q95) &&
            p.q05 >= 0 &&
            p.q95 <= 14 &&
            p.q05 <= p.mean &&
            p.mean <= p.q95 &&
            Array.isArray(p.receipts) &&
            p.receipts.length >= 3 &&
            ['mean', 'Q0.05', 'Q0.95'].every((suffix) =>
              (p.receipts as unknown[]).some(
                (v) =>
                  obj(v)?.coverageId ===
                  `phh2o_${(p.depthCm as number[]).join('-')}cm_${suffix}`,
              ),
            ) &&
            p.receipts.every(
              (v) =>
                url(obj(v)?.url) &&
                str(obj(v)?.coverageId) &&
                /^[a-f0-9]{64}$/.test(String(obj(v)?.sha256)),
            ),
        )
      if (properties.length)
        cards.push({
          id: `soil-reference:${String(r.id)}`,
          title: 'Soil in a reference map cell',
          detail: properties
            .slice(0, 2)
            .map(
              (p) =>
                `${(p.depthCm as number[]).join('–')} cm: modelled pH ${Number(p.mean).toFixed(1)}, with a 5th–95th percentile range of ${Number(p.q05).toFixed(1)}–${Number(p.q95).toFixed(1)}.`,
            )
            .join(' '),
          scope: `${r.name}, ${r.distanceKm.toFixed(1)} km away; 250 m map cell. This is a model estimate, not a soil measurement at your location.`,
          date: `Model retrieved ${String(b.retrievedAt).slice(0, 10)}; model vintage unknown`,
          attribution: b.attribution,
          links: [{ label: 'SoilGrids terms', url: b.termsUrl }, ...properties.slice(0, 2).flatMap(p => (p.receipts as Record<string, unknown>[]).map(receipt => ({ label: String(receipt.coverageId), url: String(receipt.url) })))],
        })
    }
    if (
      key === 'vegetationComparison' &&
      b.localPhenophaseConfirmed === false &&
      b.license === 'Copernicus-free-open' &&
      b.index === 'NDVI'
    ) {
      const c = obj(b.comparison),
        q = obj(b.quality)
      if (
        c &&
        q &&
        date(c.from) &&
        date(c.to) &&
        Date.parse(String(c.from)) < Date.parse(String(c.to)) &&
        Date.parse(String(c.to)) <= clock &&
        num(c.fromMean) &&
        num(c.toMean) &&
        num(c.delta) &&
        Math.abs(c.fromMean) <= 1 &&
        Math.abs(c.toMean) <= 1 &&
        Math.abs(c.toMean - c.fromMean - c.delta) < 0.00001 &&
        q.cloudsAndShadowsExcluded === true &&
        q.smallSchoolyardSupported === false &&
        num(q.commonValidPixels) &&
        num(q.minCommonValidPixels) &&
        Number.isSafeInteger(q.commonValidPixels) &&
        Number.isSafeInteger(q.minCommonValidPixels) &&
        q.minCommonValidPixels >= 20 &&
        num(q.totalPixels) &&
        Number.isSafeInteger(q.totalPixels) &&
        q.totalPixels >= q.commonValidPixels &&
        q.commonValidPixels / q.totalPixels >= 0.8 &&
        q.commonValidPixels >= q.minCommonValidPixels &&
        Array.isArray(b.scenes) &&
        b.scenes.length >= 2 &&
        b.scenes.every((v) => url(obj(v)?.catalogUrl))
      )
        cards.push({
          id: `vegetation-reference:${String(r.id)}`,
          title: 'A satellite view across two dates',
          detail: `Vegetation index changed from ${c.fromMean.toFixed(3)} on ${String(c.from).slice(0, 10)} to ${c.toMean.toFixed(3)} on ${String(c.to).slice(0, 10)}.`,
          scope: `${r.name}, ${r.distanceKm.toFixed(1)} km away. Reference plot only; this does not establish a local seasonal phase or resolve a small schoolyard. Clouds and shadows excluded on common valid pixels.`,
          date: String(c.to).slice(0, 10),
          attribution: b.attribution,
          links: [
            { label: 'Copernicus terms', url: b.termsUrl },
            ...b.scenes.slice(0, 2).map((s, i) => ({
              label: `Scene ${i + 1}`,
              url: String(obj(s)?.catalogUrl),
            })),
          ],
        })
    }
  }
  return cards
}

// Pinned reviewed mappings; expanding them requires a source and consumer review.
export const COMPILED_REFERENCE_TAXA: Record<string, string> = {"Quercus robur": "2cd4p9h.1y5", "Aesculus hippocastanum": "2cd4p9h.cpk", "Betula pendula": "2cd4p9h.v93", "Corylus avellana": "2cd4p9h.r9", "Sambucus nigra": "2cd4p9h.fyz", "Fraxinus excelsior": "2cd4p9h.yxr", "Fagus sylvatica": "2cd4p9h.fa2", "Ilex aquifolium": "2cd4p9h.yp2", "Urtica dioica": "2cd4p9h.9c0", "Bellis perennis": "2cd4p9h.xbs", "Trifolium repens": "2cd4p9h.m5y", "Ranunculus repens": "2cd4p9h.vt4", "Plantago lanceolata": "2cd4p9h.1xk", "Hyacinthoides non-scripta": "2cd4p9h.z9", "Dryopteris filix-mas": "2cd4p9h.bv1", "Pteridium aquilinum": "2cd4p9h.y9r", "Equisetum arvense": "2cd4p9h.es0"}
/** A selected taxon's published reference. Never a discovery or current-phase signal. */
export function projectCompiledSeasonalReference(raw: unknown, selectedNames: readonly string[], now = new Date()): PlaceReferenceCard[] {
  const e = obj(raw), clock = now.getTime()
  if (!e || e.source !== 'bsbi-plant-atlas-2020' || e.evidenceKind !== 'compiled-seasonal-reference' || e.status !== 'resolved' || e.reason !== 'exact-reference-match' || e.localPresenceConfirmed !== false || e.geographicScope !== 'Britain and Ireland' || e.referencePeriod !== 'approximately-twentieth-century' || e.license !== 'CC-BY-4.0' || e.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/' || e.datasetUrl !== 'https://doi.org/10.5281/zenodo.11092846' || !str(e.archiveSha256) || !/^[a-f0-9]{64}$/.test(e.archiveSha256) || !str(e.citation) || !date(e.reviewedAt) || !date(e.readAt) || !date(e.validUntil) || Date.parse(String(e.reviewedAt)) > clock || Date.parse(String(e.readAt)) > clock || Date.parse(String(e.validUntil)) <= clock || Date.parse(String(e.validUntil)) > Date.parse(String(e.reviewedAt)) + 365 * 86400000 || !Number.isFinite(clock) || !Array.isArray(e.entries) || e.entries.length > 17) return []
  const names = new Set(selectedNames.map(name => name.trim().toLowerCase()))
  const month = (v: unknown): v is number => num(v) && Number.isInteger(v) && v >= 1 && v <= 12
  const optionalText = (v: unknown): v is string | null => v === null || str(v)
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const cards: PlaceReferenceCard[] = [], seen = new Set<string>()
  for (const rawEntry of e.entries) {
    const r = obj(rawEntry)
    if (!r || !str(r.scientificName) || !names.has(r.scientificName.toLowerCase()) || !str(r.taxonId) || COMPILED_REFERENCE_TAXA[r.scientificName] !== r.taxonId || seen.has(r.taxonId) || r.sourceUrl !== `https://plantatlas2020.org/atlas/${r.taxonId}` || !Array.isArray(r.phases) || r.phases.length !== 2) continue
    const spores = ['Dryopteris filix-mas','Pteridium aquilinum','Equisetum arvense'].includes(r.scientificName)
    const phases = r.phases.map(obj)
    if (phases.some((p, i) => !p || p.kind !== (i === 0 ? 'leafing' : spores ? 'spore-bearing-structures' : 'flowering') || !(p.startMonth === null || month(p.startMonth)) || !(p.rawEndMonth === null || month(p.rawEndMonth)) || !(p.endMonth === null || month(p.endMonth)) || !str(p.reference) || !optionalText(p.note) || (p.endInterpretation === 'explicit' ? p.endMonth !== p.rawEndMonth : p.endInterpretation !== 'same-as-start-per-publisher-metadata' || p.rawEndMonth !== null || !month(p.startMonth) || p.endMonth !== p.startMonth))) continue
    const range = (p: Record<string, unknown>) => p.startMonth === null || p.endMonth === null ? 'range not specified' : p.startMonth === p.endMonth ? monthNames[Number(p.startMonth)-1] : `${monthNames[Number(p.startMonth)-1]} to ${monthNames[Number(p.endMonth)-1]}`
    const detail = phases.map(p => `${p!.kind === 'spore-bearing-structures' ? 'Spore-bearing structures' : p!.kind === 'leafing' ? 'Leaves' : 'Flowers'}: ${range(p!)}${p!.note ? ` (${p!.note})` : ''}${p!.endInterpretation === 'same-as-start-per-publisher-metadata' ? '; source end month missing, interpreted as start month under publisher rule' : ''}.`).join(' ')
    cards.push({ id: `bsbi:${r.taxonId}`, scientificName: r.scientificName, title: `Historical reference: ${r.scientificName}`, detail,
      scope: 'Compiled literature for Britain and Ireland, approximately twentieth-century averages. Compare this reference with your own dated observations; it does not confirm presence or the current phase here.',
      date: 'Historical literature reference', attribution: `${e.citation}. ${phases.map(p => `${p!.kind}: ${p!.reference}`).join(' ')} CC-BY4.0.`,
      links: [{label:'Plant Atlas source',url:String(r.sourceUrl)},{label:'Dataset and methods',url:String(e.datasetUrl)},{label:'CC-BY4.0',url:String(e.licenseUrl)}] })
    seen.add(r.taxonId)
  }
  return cards
}
