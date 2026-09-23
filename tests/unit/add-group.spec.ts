import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ teacher: vi.fn(), create: vi.fn(), grounds: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/teacher", () => ({ getTeacher: mocks.teacher, ACTIVE_CLASS_COOKIE: "class" }));
vi.mock("@/lib/db", () => ({ prisma: { class: { create: mocks.create }, grounds: { findFirst: mocks.grounds } } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect ${path}`); } }));
import { createClass } from "@/app/classes/actions";
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.teacher.mockResolvedValue({ id: "owner" });
  mocks.create.mockResolvedValue({ id: "created" });
  mocks.grounds.mockResolvedValue({ id: "park", school: "Park", lat: 51, lng: 0, climate: "temperate" });
});
describe("adding another group", () => {
  it("saves a family without a grade or school and activates it", async () => {
    await expect(createClass(form({ name: "", groupType: "family", ageRange: "7–9", groundsId: "park" }))).rejects.toThrow("redirect /classes");
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({ name: "My family", groupType: "family", ageRange: "7–9", yearGroup: "", abilityBand: null, school: "Park", groundsProfile: { connect: { id: "park" } } });
    expect(mocks.grounds.mock.calls[0]![0].where).toEqual({ id: "park", teacherId: "owner" });
    expect(mocks.cookie).toHaveBeenCalledWith("class", "created", expect.any(Object));
  });
  it("preserves a legacy school's explicit grade", async () => {
    await expect(createClass(form({ name: "Oak", yearGroup: "Year 1", school: "Primary" }))).rejects.toThrow("redirect /classes");
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({ name: "Oak", yearGroup: "Year 1", abilityBand: "y1" });
  });
  it("rejects a place owned by somebody else", async () => {
    mocks.grounds.mockResolvedValue(null);
    await expect(createClass(form({ name: "", groupType: "family", ageRange: "4–6", groundsId: "foreign" }))).rejects.toThrow("redirect /classes?bad=1");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects unoffered ages", async () => {
    await expect(createClass(form({ name: "", groupType: "family", ageRange: "unknown", school: "Park" }))).rejects.toThrow("redirect /classes?bad=1");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
