// Contract fixture derived from the producer's dated Harvard Forest/NEON receipt.
import type { SeasonalObservations } from "@/lib/outside/seasonal-observations";
export const seasonalNow = new Date("2025-05-02T14:00:00.000Z");
export const seasonalLocation = { lat: 42.542778, lng: -72.172127 };
export function seasonalFixture(): SeasonalObservations {
  return {
    source: "usa-npn", evidenceKind: "observation", coverage: "US-observation-sites", silent: false,
    center: { latitude: seasonalLocation.lat, longitude: seasonalLocation.lng }, radiusKm: 5,
    window: { startDate: "2025-04-26", endDate: "2025-05-02" }, retrievedAt: "2025-05-02T13:00:00.000Z", ttlMinutes: 1440,
    sourceUrl: "https://services.usanpn.org/npn_portal/observations/getObservations.json?start_date=2025-04-26&end_date=2025-05-02",
    license: "CC-BY-4.0", attribution: "NEON plant phenology observations via the USA National Phenology Network.",
    citations: ["NEON. Plant phenology observations DP1.10055.001. Accessed via USA-NPN."], termsUrl: "https://www.usanpn.org/about/terms", truncated: true, excludedRecordCount: 0,
    records: [
      { observationId: 52632211, siteId: 57027, speciesId: 102, individualId: 352289, datasetId: 16, datasetName: "NEON plant phenology observations", scientificName: "Quercus rubra", commonName: "northern red oak", phenophaseId: 501, phenophase: "Open flowers", observedOn: "2025-05-01", status: "absent", distanceKm: 0, quality: "observer-report-unverified" },
      { observationId: 52632017, siteId: 57027, speciesId: 791, individualId: 352284, datasetId: 16, datasetName: "NEON plant phenology observations", scientificName: "Aralia nudicaulis", commonName: "wild sarsaparilla", phenophaseId: 482, phenophase: "Initial growth", observedOn: "2025-04-28", status: "present", distanceKm: 0, quality: "observer-report-unverified" },
    ],
  };
}
