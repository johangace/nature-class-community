import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_TEMPLATE,
  MAP_ATTRIBUTION,
  mapMosaic,
  metresPerPixel,
  roundStored,
  tileCoords,
  tileUrl,
} from "@/lib/outside/static-map";

/**
 * THE STILL MAP AROUND A SAVED POSITION (#876).
 *
 * Tile arithmetic checked against a published example, the window checked
 * for gaps, and the ring checked against the rounding the store applies.
 */

describe("tile arithmetic", () => {
  it("lands on the tile the OpenStreetMap wiki gives for Chicago at zoom 3", () => {
    // wiki.openstreetmap.org/wiki/Slippy_map_tilenames worked example.
    const { x, y } = tileCoords(41.85, -87.65, 3);
    expect(Math.floor(x)).toBe(2);
    expect(Math.floor(y)).toBe(2);
  });

  it("puts the equator and the meridian at the exact centre of the world", () => {
    const { x, y } = tileCoords(0, 0, 1);
    expect(x).toBeCloseTo(1, 9);
    expect(y).toBeCloseTo(1, 9);
  });

  it("clamps latitudes beyond the projection instead of returning NaN", () => {
    const { y } = tileCoords(89.9, 0, 4);
    expect(Number.isFinite(y)).toBe(true);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it("fills a template", () => {
    expect(tileUrl("https://t.example/{z}/{x}/{y}.png", 16, 32745, 21774)).toBe(
      "https://t.example/16/32745/21774.png"
    );
  });

  it("rounds a position the way the class store does", () => {
    expect(roundStored(51.50741)).toBe(51.507);
    expect(roundStored(-0.12785)).toBe(-0.128);
  });
});

describe("the window", () => {
  const london = mapMosaic({ lat: 51.50741, lng: -0.12785 });

  it("is drawn around the rounded position, not the raw one", () => {
    expect(london.lat).toBe(51.507);
    expect(london.lng).toBe(-0.128);
    expect(mapMosaic({ lat: 51.507, lng: -0.128 }).tiles.map((t) => t.key)).toEqual(
      london.tiles.map((t) => t.key)
    );
  });

  it("covers itself with no gap on any edge", () => {
    const lefts = london.tiles.map((t) => t.left);
    const tops = london.tiles.map((t) => t.top);
    const size = london.tiles[0]!.size;
    expect(Math.min(...lefts)).toBeLessThanOrEqual(0);
    expect(Math.max(...lefts) + size).toBeGreaterThanOrEqual(100);
    expect(Math.min(...tops)).toBeLessThanOrEqual(0);
    expect(Math.max(...tops) + size).toBeGreaterThanOrEqual(100);
    expect(london.tiles.length).toBeGreaterThanOrEqual(4);
    expect(london.tiles.length).toBeLessThanOrEqual(9);
  });

  it("uses the default OpenStreetMap layer unless a template is supplied", () => {
    for (const tile of london.tiles) {
      expect(tile.url.startsWith("https://tile.openstreetmap.org/16/")).toBe(true);
    }
    const keyed = mapMosaic({ lat: 51.507, lng: -0.128, template: "https://k.example/{z}/{x}/{y}@2x.png?key=abc" });
    for (const tile of keyed.tiles) expect(tile.url).toMatch(/^https:\/\/k\.example\/16\/\d+\/\d+@2x\.png\?key=abc$/);
    expect(DEFAULT_TILE_TEMPLATE).toContain("openstreetmap.org");
  });

  it("wraps longitude at the date line rather than asking for a tile that does not exist", () => {
    const edge = mapMosaic({ lat: 0, lng: 179.9999 });
    const n = 2 ** 16;
    for (const tile of edge.tiles) {
      const x = Number(tile.key.split("/")[1]);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
    }
  });
});

describe("the ring says how coarse the saved position is", () => {
  it("is about 111 metres wide on the ground, whatever the latitude", () => {
    for (const lat of [0, 40.7, 51.5, 60]) {
      const m = mapMosaic({ lat, lng: 10 });
      const groundMetres = (m.ringPercent / 100) * m.windowMetres;
      expect(groundMetres).toBeGreaterThan(100);
      expect(groundMetres).toBeLessThan(125);
    }
  });

  it("shows a school-sized window at the default zoom", () => {
    const m = mapMosaic({ lat: 51.5, lng: -0.1 });
    expect(m.zoom).toBe(16);
    expect(m.windowMetres).toBeGreaterThan(600);
    expect(m.windowMetres).toBeLessThan(900);
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
  });

  it("carries the attribution the default layer requires", () => {
    expect(MAP_ATTRIBUTION).toContain("OpenStreetMap");
  });
});
