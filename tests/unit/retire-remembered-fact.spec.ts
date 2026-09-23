import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: vi.fn(), get: vi.fn(), set: vi.fn() })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (work: Promise<unknown>[]) => Promise.all(work)),
    class: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    grounds: { updateMany: vi.fn() },
    worldFact: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/teacher", () => ({
  ACTIVE_CLASS_COOKIE: "nc-class",
  START_FLOW_COOKIE: "nc-start-flow",
  START_FLOW_MAX_AGE: 7200,
  getTeacher: vi.fn(),
}));

import { retireRememberedFact } from "@/app/worldMemoryActions";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";

/**
 * RETIRING IS THE OTHER HALF (#509).
 *
 * "They mowed the wild corner" is the case the strip exists for: a remembered
 * fact that was true and is not any more. These tests run the REAL `setWorld`
 * against a stand-in database, rather than mocking the write, because the
 * claim being made is precisely that the retire goes through the write path
 * that already exists — a mocked `setWorld` would pass whether it did or not.
 */

/** The class row the mocked Prisma answers from, and that the writes mutate. */
let world: { siteFeatures: string[]; siteNotes: string[]; reach: string | null };
let owned: boolean;
/** Null is the unmigrated class that owns its own place; a string is shared. */
let groundsId: string | null;

beforeEach(() => {
  vi.clearAllMocks();
  world = {
    siteFeatures: ["a log pile", "a bug hotel"],
    siteNotes: ["a shallow pond behind the sheds", "the oak came down in the storm"],
    reach: "grounds",
  };
  owned = true;
  groundsId = null;

  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(prisma.class.findMany).mockResolvedValue([{ id: "willow" }] as never);
  vi.mocked(prisma.worldFact.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.class.findFirst).mockImplementation((async (args: {
    where: { teacherId?: string };
  }) => {
    if (!owned || args.where.teacherId !== "teacher-1") return null;
    // `setWorld` reads a two-field row; the strip's own read wants the place.
    return {
      id: "willow",
      groundsId,
      school: "Willow Primary",
      lat: null,
      lng: null,
      climate: null,
      grounds: [],
      siteFeatures: world.siteFeatures,
      siteNotes: world.siteNotes,
      reach: world.reach,
      placeRead: null,
      placeReadAt: null,
      groundsProfile: groundsId
        ? {
            id: groundsId,
            name: "Willow Primary",
            school: "Willow Primary",
            lat: null,
            lng: null,
            climate: null,
            habitats: [],
            siteFeatures: world.siteFeatures,
            siteNotes: world.siteNotes,
            reach: world.reach,
            placeRead: null,
            placeReadAt: null,
          }
        : null,
    };
  }) as never);
  vi.mocked(prisma.class.updateMany).mockImplementation((async (args: {
    data: { siteFeatures?: string[]; siteNotes?: string[]; reach?: string | null };
  }) => {
    if (args.data.siteFeatures) world.siteFeatures = args.data.siteFeatures;
    if (args.data.siteNotes) world.siteNotes = args.data.siteNotes;
    if ("reach" in args.data) world.reach = args.data.reach ?? null;
    return { count: 1 };
  }) as never);
});

describe("retiring one remembered fact", () => {
  it("drops the note she retired and leaves everything else standing", async () => {
    const result = await retireRememberedFact({
      classId: "willow",
      kind: "note",
      value: "the oak came down in the storm",
    });

    expect(result).toEqual({ ok: true });
    expect(world.siteNotes).toEqual(["a shallow pond behind the sheds"]);
    expect(world.siteFeatures).toEqual(["a log pile", "a bug hotel"]);
    expect(world.reach).toBe("grounds");
  });

  it("drops a feature by its own value, not by its position", async () => {
    await retireRememberedFact({ classId: "willow", kind: "feature", value: "a log pile" });

    expect(world.siteFeatures).toEqual(["a bug hotel"]);
    expect(world.siteNotes).toHaveLength(2);
  });

  it("clears reach rather than leaving a stale answer behind", async () => {
    await retireRememberedFact({ classId: "willow", kind: "reach", value: "grounds" });

    expect(world.reach).toBeNull();
  });

  it("writes through setWorld, so shared Grounds and the vocabularies still hold", async () => {
    await retireRememberedFact({ classId: "willow", kind: "feature", value: "a log pile" });

    // The write `setWorld` makes, with all three columns, not a targeted edit
    // of one array by a second path that would have to re-learn the rest.
    expect(prisma.class.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          siteFeatures: ["a bug hotel"],
          siteNotes: world.siteNotes,
          reach: "grounds",
        }),
      })
    );
  });

  it("marks the ledger retired, keeping every word of what she said", async () => {
    await retireRememberedFact({
      classId: "willow",
      kind: "note",
      value: "the oak came down in the storm",
    });

    // Only the status moves. Her words, the provenance and the date she
    // decided are not in `data`, so they cannot be rewritten by this.
    expect(prisma.worldFact.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        kind: "note",
        value: "the oak came down in the storm",
        status: "confirmed",
      }),
      data: { status: "retired" },
    });
    expect(prisma.worldFact.createMany).not.toHaveBeenCalled();
  });

  it("does not mark the ledger when the write did not land", async () => {
    world.siteFeatures = ["a feature retired from the vocabulary", "a log pile"];

    const result = await retireRememberedFact({
      classId: "willow",
      kind: "feature",
      value: "a log pile",
    });

    // A ledger marked retired against a write that failed would describe a
    // correction nobody made.
    expect(result.ok).toBe(false);
    expect(prisma.worldFact.updateMany).not.toHaveBeenCalled();
  });

  it("marks the ledger across every class sharing the grounds", async () => {
    // `setWorld` empties the value from all of them, so the rows behind it in
    // all of them are the ones that just stopped being true.
    vi.mocked(prisma.class.findMany).mockResolvedValue([
      { id: "willow" },
      { id: "oak" },
    ] as never);
    groundsId = "main-ground";

    await retireRememberedFact({ classId: "willow", kind: "feature", value: "a log pile" });

    expect(prisma.worldFact.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ classId: { in: ["willow", "oak"] } }),
      data: { status: "retired" },
    });
  });

  it("refuses a class that is not hers, and writes nothing", async () => {
    owned = false;

    const result = await retireRememberedFact({
      classId: "someone-elses",
      kind: "note",
      value: "a shallow pond behind the sheds",
    });

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when nobody is signed in", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null as never);

    const result = await retireRememberedFact({
      classId: "willow",
      kind: "note",
      value: "a shallow pond behind the sheds",
    });

    expect(result).toEqual({ ok: false, reason: "not-signed-in" });
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });

  it("says so when the write did not land, instead of animating a lie", async () => {
    // A class still holding a value the closed vocabulary no longer offers:
    // `setWorld` validates the whole answer and silently writes nothing.
    world.siteFeatures = ["a feature retired from the vocabulary", "a log pile"];

    const result = await retireRememberedFact({
      classId: "willow",
      kind: "feature",
      value: "a log pile",
    });

    expect(result).toEqual({ ok: false, reason: "not-written" });
    expect(world.siteFeatures).toContain("a log pile");
  });

  it("refuses a kind that is not one of the three columns it may write", async () => {
    const result = await retireRememberedFact({
      classId: "willow",
      kind: "habitat",
      value: "trees",
    });

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });
});
