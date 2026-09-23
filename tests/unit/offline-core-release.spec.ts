import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack, RETIRED_SESSION_IDS } from "@/lib/pack";
import {
  buildCoreLessonRelease,
  buildCoreLessonReleaseFromSource,
  loadOpenCoreShelfSource,
} from "@/lib/offline/core-release";
import { parseCoreLessonReleaseV1 } from "@/lib/offline/contracts";

// The whole Community shelf, every season, in the shelf's authored order:
// autumn (with Minibeast hunting borrowed from summer), winter, spring, summer.
// Meet your tree and Leaves and their trees are archived off the shelf and are not released.
const RELEASED_SESSION_IDS = [
  "summer-w2-minibeast-hunting",
  "seed-searchers",
  "animal-leaf-masks",
  "nature-recycling-system",
  "conker-acorn-maths-trail",
  "bird-watching",
  "making-bird-feeders",
  "bark-rubbings",
  "winter-survival-sort",
  // Spring and summer are title-only drawers for now (2026-09-07).
] as const;

function withoutAuthoringMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAuthoringMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "nid" && key !== "nodeSeq" && key !== "authorNotes")
    .map(([key, child]) => [key, withoutAuthoringMetadata(child)]));
}

function conditionFallbacks(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(conditionFallbacks);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const here =
    record.type === "conditions-line" && typeof record.fallbackText === "string"
      ? [record.fallbackText]
      : [];
  return [...here, ...Object.values(record).flatMap(conditionFallbacks)];
}

describe("CoreLessonReleaseV1", () => {
  it("contains exactly the nine released shelf sessions from open-core packs", () => {
    const release = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    expect(Object.keys(release.sessions)).toEqual(RELEASED_SESSION_IDS);
    expect(release.shelf.flatMap((entry) => entry.sessionIds)).toEqual(
      RELEASED_SESSION_IDS
    );
    // Spring and summer are title-only drawers (2026-09-07): not released.
    expect(release.shelf.map((entry) => entry.packId)).toEqual(["autumn-starter", "winter-starter"]);
    expect(JSON.stringify(release)).not.toContain("garden-w1-autumn-detectives");
    expect(JSON.stringify(release)).not.toContain("spring-w5-first-signs");
  });

  it("carries authored content without repository identity or author context, including settle and fallbacks", () => {
    const release = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });
    const source = loadOpenCoreShelfSource();

    for (const { pack } of source) {
      for (const session of pack.sessions) {
        expect(release.sessions[session.id]).toEqual(withoutAuthoringMetadata(session));
      }
    }

    const fallbacks = conditionFallbacks(Object.values(release.sessions));
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.every((line) => line.trim().length > 0)).toBe(true);
  });

  it("identity-only changes do not alter released bytes or the fingerprint", () => {
    const source = loadOpenCoreShelfSource();
    const changed = structuredClone(source);
    const session = changed[0]!.pack.sessions[0]!;
    session.nodeSeq = 99999;
    session.phases[0]!.nid = "p99999";
    session.phases[0]!.blocks[0]!.nid = "b99998";
    const options = {generatedAt: new Date("2026-08-29T12:00:00.000Z")};
    expect(buildCoreLessonReleaseFromSource(changed, options))
      .toEqual(buildCoreLessonReleaseFromSource(source, options));
    expect(source[0]!.pack.sessions[0]!.nodeSeq).not.toBe(99999);
  });

  it("new authoring fields on a session or node are not implicitly published", () => {
    const source = structuredClone(loadOpenCoreShelfSource());
    const before = buildCoreLessonReleaseFromSource(source);
    const session = source[0]!.pack.sessions[0]!;
    Object.assign(session, {futureAuthorMetadata: "private draft"});
    Object.assign(session.phases[0]!, {futureAuthorMetadata: "private draft"});
    Object.assign(session.phases[0]!.blocks[0]!, {futureAuthorMetadata: "private draft"});
    const after = buildCoreLessonReleaseFromSource(source);
    expect(after.contentFingerprint).toBe(before.contentFingerprint);
    expect(JSON.stringify(after)).not.toContain("futureAuthorMetadata");
  });

  it("ships only retired aliases whose current target is in the release", () => {
    const release = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });
    const released = new Set(Object.keys(release.sessions));
    const expected = Object.fromEntries(
      Object.entries(RETIRED_SESSION_IDS).filter(([, current]) =>
        released.has(current)
      )
    );

    expect(release.retiredSessionIds).toEqual(expected);
    for (const [retired, current] of Object.entries(release.retiredSessionIds)) {
      expect(release.sessions[retired]).toBeUndefined();
      expect(release.sessions[current]).toBeDefined();
    }
  });

  it("fingerprints content deterministically without generatedAt", () => {
    const morning = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T08:00:00.000Z"),
    });
    const evening = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T18:00:00.000Z"),
    });

    expect(morning.generatedAt).not.toBe(evening.generatedAt);
    expect(morning.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(morning.contentFingerprint).toBe(evening.contentFingerprint);
  });

  it("refuses collection content at the public release boundary", () => {
    expect(() =>
      buildCoreLessonReleaseFromSource(
        [
          {
            pack: loadPack("autumn-garden"),
            season: "autumn",
          },
        ],
        { generatedAt: new Date("2026-08-29T12:00:00.000Z") }
      )
    ).toThrow(/collection-marked pack "autumn-garden"/i);
  });

  it("publishes a data-only universal safety projection", () => {
    const release = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    expect(release.universalSafety.length).toBeGreaterThan(0);
    for (const entry of release.universalSafety) {
      expect(Object.keys(entry).sort()).toEqual(["id", "name", "note"]);
    }
  });

  it("parses strictly and rejects undeclared release fields", () => {
    const release = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    expect(parseCoreLessonReleaseV1(release)).toEqual(release);
    expect(() =>
      parseCoreLessonReleaseV1({ ...release, ownerScope: "must-not-ship" })
    ).toThrow();
  });

  it("keeps the committed public artifact in step with authored core content", () => {
    const artifact = parseCoreLessonReleaseV1(
      JSON.parse(
        readFileSync(
          new URL("../../public/offline/core-v1.json", import.meta.url),
          "utf8"
        )
      )
    );
    const current = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    expect(artifact.contentFingerprint).toBe(current.contentFingerprint);
    expect(artifact.shelf).toEqual(current.shelf);
    expect(artifact.sessions).toEqual(current.sessions);
  });
});
