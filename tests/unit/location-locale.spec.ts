import { describe, expect, it } from "vitest";
import { countryForCoords, localeForCoords } from "@/lib/location-locale";
import { localizeText } from "@/lib/localization";

describe("country based English defaults", () => {
  it.each([
    ["Seattle", 47.6062, -122.3321, "US", "us"],
    ["Vancouver", 49.2827, -123.1207, "CA", "uk"],
    ["Detroit", 42.3314, -83.0458, "US", "us"],
    ["Windsor", 42.3149, -83.0364, "CA", "uk"],
    ["Toronto", 43.6532, -79.3832, "CA", "uk"],
    ["Anchorage", 61.2181, -149.9003, "US", "us"],
    ["Whitehorse", 60.7212, -135.0568, "CA", "uk"],
    ["Honolulu", 21.3099, -157.8581, "US", "us"],
    ["San Diego", 32.7157, -117.1611, "US", "us"],
    ["Tijuana", 32.5149, -117.0382, "MX", "uk"],
    ["San Juan", 18.4655, -66.1057, "PR", "us"],
    ["London", 51.5074, -0.1278, "GB", "uk"],
  ])("resolves %s without broad continent boxes", (_name, lat, lng, country, locale) => {
    expect(countryForCoords(lat as number, lng as number)).toBe(country);
    expect(localeForCoords(lat as number, lng as number)).toBe(locale);
  });
  it.each([[NaN, 0], [91, 0], [0, 181], [undefined, undefined]])("rejects invalid coordinates", (lat, lng) => {
    expect(countryForCoords(lat, lng)).toBeNull();
  });
});

it("localizes descriptive prose while preserving supplied species names", () => {
  expect(localizeText("The Grey heron has grey feathers and neighbours.", "us", ["Grey heron"]))
    .toBe("The Grey heron has gray feathers and neighbors.");
  expect(localizeText("Conkers are not buckeyes.", "us")).toBe("Conkers are not buckeyes.");
});
