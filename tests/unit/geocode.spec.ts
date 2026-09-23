import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The forward geocoder behind onboarding's typed place search (#56).
 *
 * Run against a stub server on localhost, not the real Nominatim: the contract
 * under test is how we read an answer, and pinning that to a live third party
 * would make the suite fail for their reasons rather than ours. The payload
 * shapes below are the ones Nominatim actually returns, including the awkward
 * one (a row with a name and no coordinate).
 *
 * The invariant that matters most is the three-way answer. "Found these",
 * "searched and there is nothing", and "could not search" are different
 * sentences to a teacher standing at this screen, and #56 asks that a failure
 * be retryable. If the middle and the last collapse into each other she is
 * told to retype a perfectly good address because a network hiccuped.
 */

let server: Server;
let base: string;
/** What the next request will be answered with. Set per test. */
let reply: { status: number; body: string } = { status: 200, body: "[]" };
let hits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1;
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(reply.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/search`;
  process.env.GEOCODER_API_URL = base;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Fresh module per case, so the module-level cache never leaks between them. */
async function freshGeocode(): Promise<(q: string) => Promise<unknown[]>> {
  vi.resetModules();
  const mod = await import("@/lib/outside/geocode");
  return mod.geocodePlace;
}

async function geocode(query: string) {
  return (await freshGeocode())(query);
}

describe("geocodePlace", () => {
  it("maps rows to pickable places and rounds the coordinate to ~100m", async () => {
    reply = {
      status: 200,
      body: JSON.stringify([
        {
          place_id: 1234,
          display_name: "St Mary's Primary School, Ealing, London, W5, England",
          lat: "51.5461234",
          lon: "-0.1054321",
        },
      ]),
    };

    const results = await geocode("st marys primary ealing");

    expect(results).toEqual([
      {
        id: "1234",
        label: "St Mary's Primary School, Ealing, London, W5, England",
        // Three decimals, the same rule createClassFromFlow applies on the way
        // into the database. A school's coordinate never leaves at full
        // resolution, on either route in.
        lat: 51.546,
        lng: -0.105,
      },
    ]);
  });

  it("drops a row it could not turn into a place rather than showing it", async () => {
    reply = {
      status: 200,
      body: JSON.stringify([
        { place_id: 1, display_name: "A place with no coordinate" },
        { place_id: 2, display_name: "", lat: "51.5", lon: "-0.1" },
        { place_id: 3, display_name: "Ealing, London", lat: "51.513", lon: "-0.305" },
      ]),
    };

    const results = await geocode("ealing");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ label: "Ealing, London" });
  });

  it("returns an empty list when the geocoder searched and found nothing", async () => {
    reply = { status: 200, body: "[]" };
    await expect(geocode("qqzzxx not a place")).resolves.toEqual([]);
  });

  it("throws when the geocoder answered badly, so the step can say so", async () => {
    reply = { status: 503, body: "upstream is down" };
    await expect(geocode("ealing")).rejects.toThrow();
  });

  it("throws on a payload that is not a list, rather than reading it as none", async () => {
    // An HTML error page parsed as JSON, or a rate-limit object. Treating this
    // as "no such place" would tell a teacher to retype a good address.
    reply = { status: 200, body: JSON.stringify({ error: "rate limited" }) };
    await expect(geocode("ealing")).rejects.toThrow();
  });

  it("answers a repeated search from cache instead of re-asking OSM", async () => {
    reply = {
      status: 200,
      body: JSON.stringify([
        { place_id: 9, display_name: "Ealing, London", lat: "51.513", lon: "-0.305" },
      ]),
    };

    const lookup = await freshGeocode();

    const before = hits;
    const first = await lookup("Ealing");
    // Same place, typed with different spacing and case: still one request.
    const second = await lookup("  ealing  ");

    expect(second).toEqual(first);
    expect(hits - before).toBe(1);
  });
});
