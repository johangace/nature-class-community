import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { class: { updateMany: vi.fn() } } }));
vi.mock("@/lib/teacher", () => ({ ACTIVE_CLASS_COOKIE: "active", getTeacher: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
import { prisma } from "@/lib/db";
import { getTeacher } from "@/lib/teacher";
import { setClassEnglishLocale } from "@/app/classes/actions";
function form(locale: string) {
  const value = new FormData();
  value.set("classId", "class-1"); value.set("locale", locale);
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(prisma.class.updateMany).mockResolvedValue({ count: 1 });
});
it.each(["us", "uk", "auto"])("saves %s only for an owned class", async (locale) => {
  await expect(setClassEnglishLocale(form(locale))).rejects.toThrow("/classes");
  expect(prisma.class.updateMany).toHaveBeenCalledWith({
    where: { id: "class-1", teacherId: "teacher-1" },
    data: { englishLocale: locale === "auto" ? null : locale },
  });
});
it("rejects an unsupported preference without writing", async () => {
  await expect(setClassEnglishLocale(form("ca"))).rejects.toThrow("/classes");
  expect(prisma.class.updateMany).not.toHaveBeenCalled();
});
it("requires authentication", async () => {
  vi.mocked(getTeacher).mockResolvedValue(null);
  await expect(setClassEnglishLocale(form("us"))).rejects.toThrow("/sign-in");
  expect(prisma.class.updateMany).not.toHaveBeenCalled();
});
