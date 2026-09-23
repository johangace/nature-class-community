import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    class: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/teacher", () => ({
  ACTIVE_CLASS_COOKIE: "nature-class-active",
  getTeacher: vi.fn(),
}));

import { openClassGrounds } from "@/app/classes/actions";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
});

describe("opening a class's Grounds profile", () => {
  it("opens an owned inactive class's Grounds without making the class active", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue({ id: "oak" } as never);
    const formData = new FormData();
    formData.set("classId", "oak");

    await expect(openClassGrounds(formData)).rejects.toThrow("redirect:/world?classId=oak");

    expect(prisma.class.findFirst).toHaveBeenCalledWith({
      where: { id: "oak", teacherId: "teacher-1" },
      select: { id: true },
    });
  });

  it("does not change class or open Grounds for an unowned class id", async () => {
    vi.mocked(prisma.class.findFirst).mockResolvedValue(null);
    const formData = new FormData();
    formData.set("classId", "someone-elses-class");

    await expect(openClassGrounds(formData)).rejects.toThrow("redirect:/classes");

  });

  it("sends a signed-out visitor to sign in before reading a class", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null);
    const formData = new FormData();
    formData.set("classId", "oak");

    await expect(openClassGrounds(formData)).rejects.toThrow("redirect:/sign-in");

    expect(prisma.class.findFirst).not.toHaveBeenCalled();
  });
});
