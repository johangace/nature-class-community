/**
 * A small still map around a saved position (#876).
 *
 * "If it could display a map when it localizes, that would be nice. Did it
 * get my location automatically when I didn't type it in? I'm not sure."
 * (cohort reviewer, 2026-09-01). The confirmation in words already exists
 * (app/start/location-state.ts). This is the picture beside it: a few map
 * tiles centred on the point, and a ring rather than a pin.
 *
 * THE RING IS THE HONESTY. Coordinates are rounded to three decimals on the
 * way into the class store (app/start/actions.ts, app/classes/actions.ts),
 * which is about 111 m of latitude. A pin says "here"; a ring the size of
 * that rounding says "somewhere in here", which is what we actually know and
 * is deliberately no finer than #758's child-privacy line allows.
 *
 * NO MAP LIBRARY. Slippy-map tile arithmetic is twenty lines and a tile is an
 * image, so this is plain markup a server component can render with no
 * client bundle. The tile host is a template so a keyed provider can replace
 * the default by environment alone (NEXT_PUBLIC_MAP_TILE_URL). The default
 * is the OpenStreetMap standard tile layer, which requires the attribution
 * this module exports and tolerates light use of the kind a teacher's own
 * confirmation makes; a launch at scale should set the template to a keyed
 * provider rather than lean on that tolerance.
 */

export const DEFAULT_TILE_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_SIZE = 256;
export const MAP_ATTRIBUTION = "Map data © OpenStreetMap contributors";
export const MAP_ATTRIBUTION_HREF = "https://www.openstreetmap.org/copyright";

/** The rounding the class store applies, in metres of latitude. */
export const STORED_PRECISION_METRES = 111;

/** Web Mercator's usable band. Beyond it the projection is undefined. */
const MAX_LAT = 85.0511;

/** Three decimals, exactly as the class store keeps a position. */
export function roundStored(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Fractional tile coordinates for a point at a zoom (slippy map). */
export function tileCoords(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const n = 2 ** zoom;
  const rad = (clamped * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** Ground metres per screen pixel at this latitude and zoom, for a 256px tile. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export interface MapTile {
  key: string;
  url: string;
  /** Percent of the window, so the markup scales with its container. */
  left: number;
  top: number;
  size: number;
}

export interface MapMosaic {
  zoom: number;
  /** The rounded position the map is actually drawn around. */
  lat: number;
  lng: number;
  tiles: MapTile[];
  /** Diameter of the honesty ring, percent of the window. */
  ringPercent: number;
  /** Approximate width of the window on the ground, metres, for a caption. */
  windowMetres: number;
}

export interface MosaicInput {
  lat: number;
  lng: number;
  /** 16 shows a school and the streets around it; 15 shows the neighbourhood. */
  zoom?: number;
  /** Window width in tiles. 2 is 512 px, and a school fills it at zoom 16. */
  span?: number;
  template?: string;
}

/**
 * The tiles that cover a square window of `span` tiles centred on the point,
 * each positioned as a percentage of that window. Between four and nine
 * tiles for a span of two, depending on where the point falls in its tile.
 */
export function mapMosaic(input: MosaicInput): MapMosaic {
  const zoom = input.zoom ?? 16;
  const span = input.span ?? 2;
  const template = input.template ?? DEFAULT_TILE_TEMPLATE;
  const lat = roundStored(input.lat);
  const lng = roundStored(input.lng);

  const n = 2 ** zoom;
  const width = span * TILE_SIZE;
  const { x, y } = tileCoords(lat, lng, zoom);
  const originX = x * TILE_SIZE - width / 2;
  const originY = y * TILE_SIZE - width / 2;

  const firstX = Math.floor(originX / TILE_SIZE);
  const lastX = Math.floor((originX + width - 1) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(originY / TILE_SIZE));
  const lastY = Math.min(n - 1, Math.floor((originY + width - 1) / TILE_SIZE));

  const tiles: MapTile[] = [];
  for (let ty = firstY; ty <= lastY; ty += 1) {
    for (let tx = firstX; tx <= lastX; tx += 1) {
      // Longitude wraps; latitude does not.
      const wrappedX = ((tx % n) + n) % n;
      tiles.push({
        key: `${zoom}/${wrappedX}/${ty}`,
        url: tileUrl(template, zoom, wrappedX, ty),
        left: ((tx * TILE_SIZE - originX) / width) * 100,
        top: ((ty * TILE_SIZE - originY) / width) * 100,
        size: (TILE_SIZE / width) * 100,
      });
    }
  }

  const mpp = metresPerPixel(lat, zoom);
  const ringPx = STORED_PRECISION_METRES / mpp;

  return {
    zoom,
    lat,
    lng,
    tiles,
    ringPercent: Math.min(100, (ringPx / width) * 100),
    windowMetres: Math.round(width * mpp),
  };
}
