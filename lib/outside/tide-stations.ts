/** Reviewed station references; city association never implies local coastline. */
export const tideStations = [
  { id: '8443970', name: 'Boston', label: 'Boston Harbor', city: 'boston', latitude: 42.35389, longitude: -71.05028, timezone: 'America/New_York' },
  { id: '8518750', name: 'The Battery', label: 'The Battery, New York Harbor', city: 'nyc', latitude: 40.700554, longitude: -74.01417, timezone: 'America/New_York' },
  { id: '9414290', name: 'San Francisco', label: 'San Francisco, Golden Gate', city: 'sf', latitude: 37.806305, longitude: -122.46589, timezone: 'America/Los_Angeles' },
] as const
export type TideStationId = (typeof tideStations)[number]['id']
export function tideStationForCity(city: string) { return tideStations.find(s => s.city === city) }
export function selectedTideStation(city: string, requested: unknown) { const s = tideStationForCity(city); return s?.id === requested ? s : undefined }
export const tideDay = (timezone: string, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
