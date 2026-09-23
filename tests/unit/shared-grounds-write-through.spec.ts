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
    class: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    grounds: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/teacher", () => ({
  ACTIVE_CLASS_COOKIE: "nc-class",
  START_FLOW_COOKIE: "nc-start-flow",
  START_FLOW_MAX_AGE: 7200,
  getTeacher: vi.fn(),
}));

import { createClassFromFlow, setGrounds, setWorld } from "@/app/start/actions";
import { setClassLocation } from "@/app/classes/actions";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(prisma.class.findFirst).mockResolvedValue({
    id: "willow",
    groundsId: "main-ground",
  } as never);
});

describe("shared Grounds write-through", () => {
  it("writes teacher-authored profile details to Grounds and every linked legacy row", async () => {
    await setWorld({
      classId: "willow",
      features: ["one big tree"],
      notes: ["Pond behind the nursery fence"],
      reach: "grounds",
    });

    expect(prisma.grounds.updateMany).toHaveBeenCalledWith({
      where: { id: "main-ground", teacherId: "teacher-1" },
      data: expect.objectContaining({
        siteFeatures: ["one big tree"],
        siteNotes: ["Pond behind the nursery fence"],
        reach: "grounds",
      }),
    });
    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: { groundsId: "main-ground", teacherId: "teacher-1" },
      data: expect.objectContaining({ siteFeatures: ["one big tree"] }),
    });
  });

  it("writes habitat choices through the same shared profile", async () => {
    await setGrounds("willow", ["trees", "pond"]);

    expect(prisma.grounds.updateMany).toHaveBeenCalledWith({
      where: { id: "main-ground", teacherId: "teacher-1" },
      data: { habitats: ["trees", "pond"] },
    });
    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: { groundsId: "main-ground", teacherId: "teacher-1" },
      data: { grounds: ["trees", "pond"] },
    });
  });

  it("moves the shared Grounds location without changing active-class state", async () => {
    const formData = new FormData();
    formData.set("classId", "willow");
    formData.set("lat", "51.5014");
    formData.set("lng", "-0.1414");

    await expect(setClassLocation(formData)).rejects.toThrow("redirect:/classes");

    expect(prisma.grounds.updateMany).toHaveBeenCalledWith({
      where: { id: "main-ground", teacherId: "teacher-1" },
      data: expect.objectContaining({ lat: 51.501, lng: -0.141 }),
    });
    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: { groundsId: "main-ground", teacherId: "teacher-1" },
      data: expect.objectContaining({ lat: 51.501, lng: -0.141 }),
    });
  });

  it("can return a Today location update to Today", async () => {
    const formData = new FormData();
    formData.set("classId", "willow");
    formData.set("lat", "51.5014");
    formData.set("lng", "-0.1414");
    formData.set("returnTo", "/today");

    await expect(setClassLocation(formData)).rejects.toThrow("redirect:/today");
  });

  it("does not accept an arbitrary location return URL", async () => {
    const formData = new FormData();
    formData.set("classId", "willow");
    formData.set("lat", "51.5014");
    formData.set("lng", "-0.1414");
    formData.set("returnTo", "https://example.com");

    await expect(setClassLocation(formData)).rejects.toThrow("redirect:/classes");
    expect(prisma.grounds.updateMany).not.toHaveBeenCalled();
  });

  it("keeps every linked legacy location in step when a resumable draft moves", async () => {
    vi.mocked(prisma.class.update).mockResolvedValue({ id: "willow" } as never);

    await createClassFromFlow({
      classId: "willow",
      name: "Willow Class",
      yearGroup: "Year 1",
      school: "Test Primary",
      lat: 51.5014,
      lng: -0.1414,
    });

    expect(prisma.class.updateMany).toHaveBeenCalledWith({
      where: { groundsId: "main-ground", teacherId: "teacher-1" },
      data: expect.objectContaining({ lat: 51.501, lng: -0.141 }),
    });
  });

  it("does not write a posted class id the teacher does not own", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue(null);

    await setWorld({
      classId: "foreign-class",
      features: ["one big tree"],
      notes: [],
      reach: null,
    });

    expect(prisma.grounds.updateMany).not.toHaveBeenCalled();
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });
});
