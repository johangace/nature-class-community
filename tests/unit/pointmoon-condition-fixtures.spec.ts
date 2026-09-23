import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { conditionsBucket } from "@/lib/outside/bucket";
import { cardCondition } from "@/lib/cast/conditions";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * Pins the demo-rehearsal fixtures to the bucket they must land on.
 *
 * These four payloads are what a QA walk uses to force the daily card
 * through each of its condition states by hand, offline, without waiting on
 * a real storm. Before this test existed, that rehearsal was silent: the
 * `thin_patch` fixture sat untracked, so a fresh checkout (the demo's launch
 * config included) never had it on disk, the fetch it stood in for came back
 * empty, and the card fell through to the dead-signal shape — the SAME
 * screen a genuine Pointmoon outage renders. Two of the three forced
 * failure states were indistinguishable from "we couldn't see outside"
 * and nobody knew, because nothing pinned the fixture to the bucket it was
 * authored to force.
 *
 * If lib/outside/bucket.ts's thresholds ever drift, this is the test that
 * breaks, not the demo.
 */

async function loadFixture(name: string): Promise<FieldTruth> {
  const raw = await readFile(
    new URL(`../fixtures/pointmoon/${name}.json`, import.meta.url),
    "utf8"
  );
  return JSON.parse(raw) as FieldTruth;
}

describe("condition-rehearsal fixtures, pinned to their bucket", () => {
  it("thin_patch reads as mild, not the dead-signal shape", async () => {
    // Zero observations, a real weather.current — a thin payload, but not an
    // absent one. This is the fixture the launch config on 3527 rehearses;
    // it must never be confused with "no read at all".
    const data = await loadFixture("thin_patch");
    expect(conditionsBucket(data)).toBe("mild");
    const condition = cardCondition(data);
    expect(condition?.state).toBe("fine");
    expect(condition?.adjustment).toBeNull();
  });

  it("rain_patch forces the wet bucket", async () => {
    const data = await loadFixture("rain_patch");
    expect(conditionsBucket(data)).toBe("wet");
    expect(cardCondition(data)?.state).toBe("rain");
  });

  it("cold_patch forces the cold bucket", async () => {
    const data = await loadFixture("cold_patch");
    expect(conditionsBucket(data)).toBe("cold");
    expect(cardCondition(data)?.state).toBe("cold");
  });

  it("wind_patch forces the windy bucket", async () => {
    const data = await loadFixture("wind_patch");
    expect(conditionsBucket(data)).toBe("windy");
    expect(cardCondition(data)?.state).toBe("wind");
  });

  it("keeps the three forced failure states visibly distinct from each other and from mild", async () => {
    const [rain, cold, wind, thin] = await Promise.all([
      loadFixture("rain_patch"),
      loadFixture("cold_patch"),
      loadFixture("wind_patch"),
      loadFixture("thin_patch"),
    ]);
    const buckets = [rain, cold, wind, thin].map((d) => conditionsBucket(d));
    expect(new Set(buckets).size).toBe(4);
  });
});
