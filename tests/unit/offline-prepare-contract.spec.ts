import { describe, expect, it } from "vitest";
import { findSession } from "@/lib/pack";
import {
  composePreparedFieldOverlay,
  createOfflineOwnerLease,
} from "@/lib/offline/prepare";

const preparedAt = new Date("2026-08-29T08:12:00.000Z");

describe("prepared field ownership and privacy contract", () => {
  it("derives opaque owner and lease identifiers without carrying account ids", () => {
    const lease = createOfflineOwnerLease({
      teacherId: "teacher-private-id",
      classId: "class-private-id",
      authSessionId: "auth-private-id",
      issuedAt: preparedAt,
      expiresAt: new Date("2026-09-28T08:12:00.000Z"),
    });

    const serialised = JSON.stringify(lease);
    expect(lease.ownerScope).toMatch(/^ofs_[a-f0-9]{32}$/);
    expect(lease.leaseId).toMatch(/^ofl_[a-f0-9]{32}$/);
    expect(serialised).not.toContain("teacher-private-id");
    expect(serialised).not.toContain("class-private-id");
    expect(serialised).not.toContain("auth-private-id");
  });

  it("keeps authored observation text leading and stores only a secondary conditions receipt", () => {
    const found = findSession("leaves-and-their-trees");
    if (!found) throw new Error("fixture session not found");

    const lease = createOfflineOwnerLease({
      teacherId: "teacher-private-id",
      classId: "class-private-id",
      authSessionId: "auth-private-id",
      issuedAt: preparedAt,
      expiresAt: new Date("2026-09-28T08:12:00.000Z"),
    });
    const overlay = composePreparedFieldOverlay({
      lease,
      coreFingerprint: "core_fingerprint_123",
      session: found.session,
      hazards: {
        source: "starter",
        entries: [
          {
            id: "slips-and-ground",
            name: "Slips and uneven ground",
            note: "Walk the route first.",
          },
        ],
      },
      spokenAudio: {
        "Look closely.": { src: "/lesson-audio/example.mp3", seconds: 3 },
      },
      conditionsMeta: "18 degrees, a light breeze",
      conditionsSource: "Pointmoon",
      preparedAt,
    });

    const authoredConditions = overlay.session.phases
      .flatMap((phase) => phase.blocks)
      .filter((block) => block.type === "conditions-line")
      .map((block) => block.fallbackText);

    expect(authoredConditions.length).toBeGreaterThan(0);
    expect(authoredConditions.some((line) => /right now/i.test(line))).toBe(false);
    expect(overlay.conditions).toEqual({
      summary: "18 degrees, a light breeze",
      capturedAt: preparedAt.toISOString(),
      source: "Pointmoon",
    });
    expect(overlay.staleAfter).toBe("2026-09-05T08:12:00.000Z");
    expect(overlay.resources).toEqual([
      {
        kind: "audio",
        url: "/lesson-audio/example.mp3",
        required: false,
      },
    ]);
  });

  it("contains no school, class, learner, coordinate, teacher-text, or child fields", () => {
    const found = findSession("leaves-and-their-trees");
    if (!found) throw new Error("fixture session not found");
    const lease = createOfflineOwnerLease({
      teacherId: "teacher-private-id",
      classId: "class-private-id",
      authSessionId: "auth-private-id",
      issuedAt: preparedAt,
      expiresAt: new Date("2026-09-28T08:12:00.000Z"),
    });
    const overlay = composePreparedFieldOverlay({
      lease,
      coreFingerprint: "core_fingerprint_123",
      session: found.session,
      hazards: null,
      spokenAudio: {},
      conditionsMeta: null,
      conditionsSource: "Pointmoon",
      preparedAt,
    });

    const json = JSON.stringify(overlay);
    for (const forbidden of [
      "teacherId",
      "classId",
      "className",
      "school",
      "yearGroup",
      "abilityBand",
      "latitude",
      "longitude",
      "teacherText",
      "childName",
      "teacher-private-id",
      "class-private-id",
    ]) {
      expect(json).not.toContain(`\"${forbidden}\"`);
      expect(json).not.toContain(forbidden.endsWith("-id") ? forbidden : `:${forbidden}`);
    }
  });
});
