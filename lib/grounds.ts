/**
 * The expand-phase adapter for shared Grounds (#827).
 *
 * The database migration leaves the old Class columns in place so deploy and
 * rollback are additive. Every reader comes through this small boundary:
 * linked Grounds wins when present; an unmigrated/partially restored row keeps
 * working from its lossless legacy fields.
 */
export interface GroundsPlace {
  id: string | null;
  name: string;
  school: string;
  lat: number | null;
  lng: number | null;
  climate: string | null;
  habitats: string[];
  siteFeatures: string[];
  siteNotes: string[];
  reach: string | null;
  placeRead: unknown;
  placeReadAt: Date | null;
  source: "shared" | "legacy";
}

interface ClassPlaceSource {
  school: string;
  lat: number | null;
  lng: number | null;
  climate: string | null;
  grounds: string[];
  siteFeatures: string[];
  siteNotes: string[];
  reach: string | null;
  placeRead: unknown;
  placeReadAt: Date | null;
  groundsProfile: {
    id: string;
    name: string;
    school: string;
    lat: number | null;
    lng: number | null;
    climate: string | null;
    habitats: string[];
    siteFeatures: string[];
    siteNotes: string[];
    reach: string | null;
    placeRead: unknown;
    placeReadAt: Date | null;
  } | null;
}

export const groundsPlaceSelect = {
  id: true,
  name: true,
  school: true,
  lat: true,
  lng: true,
  climate: true,
  habitats: true,
  siteFeatures: true,
  siteNotes: true,
  reach: true,
  placeRead: true,
  placeReadAt: true,
} as const;

export function groundsPlaceForClass(source: ClassPlaceSource): GroundsPlace {
  if (source.groundsProfile) {
    return { ...source.groundsProfile, source: "shared" };
  }
  return {
    id: null,
    name: source.school,
    school: source.school,
    lat: source.lat,
    lng: source.lng,
    climate: source.climate,
    habitats: source.grounds,
    siteFeatures: source.siteFeatures,
    siteNotes: source.siteNotes,
    reach: source.reach,
    placeRead: source.placeRead,
    placeReadAt: source.placeReadAt,
    source: "legacy",
  };
}
