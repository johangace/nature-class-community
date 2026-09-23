import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  findClasses: vi.fn(),
  createMany: vi.fn(),
  fetchArchive: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    class: { findMany: mocked.findClasses },
    pointmoonRead: { createMany: mocked.createMany },
  },
}));

vi.mock("@/lib/outside/pointmoon", () => ({
  fetchFieldTruthArchivePayload: mocked.fetchArchive,
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  mocked.findClasses.mockReset();
  mocked.createMany.mockReset();
  mocked.fetchArchive.mockReset();
  mocked.findClasses.mockResolvedValue([
    { id: "class-1", lat: 51.5, lng: -0.1 },
    { id: "class-2", lat: 51.5, lng: -0.1 },
  ]);
  mocked.createMany.mockResolvedValue({ count: 2 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nightly Pointmoon archive", () => {
  it("stores one raw fetch per location verbatim for every class, with its source version", async () => {
    const raw = {
      schemaVersion: "field-truth@1.1.0",
      facts: { fieldSnapshot: { observations: { nearby: [] } } },
      futureRuleInput: { untouched: true },
    };
    mocked.fetchArchive.mockResolvedValue(raw);

    const { GET } = await import("@/app/api/cron/record-reads/route");
    const response = await GET(
      new Request("https://nature-class.test/api/cron/record-reads", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(mocked.fetchArchive).toHaveBeenCalledTimes(1);
    expect(mocked.fetchArchive).toHaveBeenCalledWith({ lat: 51.5, lng: -0.1 });
    expect(mocked.createMany).toHaveBeenCalledTimes(1);

    const call = mocked.createMany.mock.calls[0]?.[0] as {
      data: Array<{ classId: string; payload: unknown; schemaVersion: string | null }>;
    };
    expect(call.data.map((row) => row.classId)).toEqual(["class-1", "class-2"]);
    for (const row of call.data) {
      expect(row.payload).toBe(raw);
      expect(row.schemaVersion).toBe("field-truth@1.1.0");
    }
  });
});
