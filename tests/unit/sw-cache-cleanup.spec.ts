import { describe, expect, it } from "vitest";

import { cacheNamesToDelete } from "@/lib/sw-cache-cleanup";

describe("cacheNamesToDelete", () => {
  it("removes retired precache and public caches on an upgraded install", () => {
    const currentPrecache = "serwist-precache-v2-https://nature-class.example/";

    expect(
      cacheNamesToDelete(
        [
          "serwist-precache-v1-https://nature-class.example/",
          currentPrecache,
          "nc-public-v1",
          "nc-public-v2",
          "nc-public-v3",
          "nc-audio-v1",
          "nc-media-v1",
        ],
        {
          currentPrecache,
          currentPublicCache: "nc-public-v3",
          persistentRuntimeCaches: ["nc-audio-v1", "nc-media-v1"],
        },
      ),
    ).toEqual([
      "serwist-precache-v1-https://nature-class.example/",
      "nc-public-v1",
      "nc-public-v2",
    ]);
  });

  it("does not trust a cache merely because its name starts with serwist", () => {
    const currentPrecache = "serwist-precache-v2-https://nature-class.example/";

    expect(
      cacheNamesToDelete(
        [
          currentPrecache,
          "serwist-precache-v2-https://old-scope.example/",
          "serwist-runtime-https://nature-class.example/",
          "serwist-mutation-probe",
        ],
        {
          currentPrecache,
          currentPublicCache: "nc-public-v2",
          persistentRuntimeCaches: ["nc-audio-v1", "nc-media-v1"],
        },
      ),
    ).toEqual([
      "serwist-precache-v2-https://old-scope.example/",
      "serwist-runtime-https://nature-class.example/",
      "serwist-mutation-probe",
    ]);
  });

  it("deduplicates persistent cache names without changing deletion order", () => {
    expect(
      cacheNamesToDelete(
        ["legacy-pages", "nc-audio-v1", "legacy-rsc", "nc-public-v2"],
        {
          currentPrecache: "serwist-precache-v2-app",
          currentPublicCache: "nc-public-v2",
          persistentRuntimeCaches: ["nc-audio-v1", "nc-audio-v1"],
        },
      ),
    ).toEqual(["legacy-pages", "legacy-rsc"]);
  });
});
