// Validate reusable source references and select lesson context; run: npm test -- place-evidence.
import { projectPlaceEvidence, projectCompiledSeasonalReference, COMPILED_REFERENCE_TAXA, type PlaceReferenceCard } from "./place-reference-projection";
import { projectDietRelationships } from "./diet-relationships";
import { projectRelationships } from "./relationship-projection";
export type TeacherReference = PlaceReferenceCard;
export type PlaceSource = "gbif" | "globi" | "phenocam" | "inventory" | "soilgrids" | "copernicus" | "bsbi";
export const sourceFields = { gbif: "gbifSeasonal", globi: "relationships", phenocam: "cameraEvidence", "inventory": "treeInventory", soilgrids: "soilContext", copernicus: "vegetationComparison", bsbi: "compiledSeasonalReference" } as const;
export interface PlaceQuery { lat: number; lng: number; sources: PlaceSource[] }
export function placeEvidenceEnabled() { return process.env.POINTMOON_PLACE_EVIDENCE_ENABLED === "1"; }
export function lessonPlaceSources(tags: readonly string[]): PlaceSource[] {
  if (!placeEvidenceEnabled()) return [];
  const has = (...values: string[]) => values.some(v => tags.includes(v));
  return [has("plants", "trees", "animals", "birds", "minibeasts") && "gbif", has("plants", "trees", "minibeasts", "birds", "animals") && "globi", has("trees", "seasons") && "phenocam", has("trees") && "inventory", has("soil") && "soilgrids", has("plants", "trees", "seasons") && "copernicus", has("plants", "trees", "seasons") && "bsbi"].filter(Boolean) as PlaceSource[];
}
/** Revalidated on every cache/fallback read, independently of observation health. */
export function validPlaceEvidence(raw: unknown, query: PlaceQuery, now = new Date()): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const source of query.sources) {
    const field = sourceFields[source], value = input[field];
    const valid = source === "bsbi" ? projectCompiledSeasonalReference(value, Object.keys(COMPILED_REFERENCE_TAXA), now).length : source === "globi" ? (projectRelationships(value, now).length + projectDietRelationships(value, now).length) : projectPlaceEvidence({ [field]: value }, query.lat, query.lng, now).length;
    if (valid) result[field] = value;
  }
  return result;
}
export function lessonReferences(raw: unknown, query: PlaceQuery, scientificNames: string[]): TeacherReference[] {
  const evidence = validPlaceEvidence(raw, query), names = new Set(scientificNames.map(s => s.trim().toLowerCase()));
  const cards = [...projectPlaceEvidence(evidence, query.lat, query.lng), ...projectCompiledSeasonalReference(evidence.compiledSeasonalReference, scientificNames)].filter(card => !card.scientificName || names.has(card.scientificName.toLowerCase()));
  const relationships = projectRelationships(evidence.relationships).filter(row => names.has(row.plant.toLowerCase()) || names.has(row.visitor.toLowerCase())).slice(0, 2).map(row => ({
    id: `globi:${row.id}`, title: "A published flower-visit relationship", detail: `${row.visitor} has been reported visiting flowers of ${row.plant}. Use the study to form a question to investigate.`, scope: "Published study context. Neither organism nor this interaction is confirmed at the class location.", date: `Reference retrieved ${row.retrievedAt.slice(0,10)}; not an observation date`, attribution: `${row.studyCitation} ${row.datasetCitation}`, links: [{label:"Original study",url:row.studyUrl},{label:"Original dataset",url:row.datasetArchiveUrl},{label:row.license,url:row.licenseUrl}]
  }));
  const diets = projectDietRelationships(evidence.relationships).filter(row => names.has(row.sourceScientificName.toLowerCase()) || names.has(row.targetScientificName.toLowerCase())).slice(0, 2).map(row => ({
    id: `globi:diet:${row.id}`, title: "A published diet relationship", detail: `${row.eater} has been reported eating ${row.food}. If you encounter an animal you can identify, record what it picks up and compare your observation with this research.`, scope: "Published study context. Neither organism nor this feeding interaction is confirmed at the class location.", date: `${row.eventDate ? `Source event date ${row.eventDate.slice(0,10)}; ` : "Source event date not supplied; "}reference retrieved ${row.retrievedAt.slice(0,10)}`, attribution: `${row.studyCitation} ${row.datasetCitation}`, links: [{label:"Cited dataset archive (no study URL supplied)",url:row.datasetArchiveUrl},{label:row.license,url:row.licenseUrl}]
  }));
  const counts = new Map<string, number>();
  return [...cards, ...relationships, ...diets].filter(card => { const source = card.id.split(":")[0]!; const count = counts.get(source) ?? 0; counts.set(source, count + 1); return count < 2; });
}
