import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  teacher: vi.fn(), create: vi.fn(), find: vi.fn(), update: vi.fn(), cookie: vi.fn(),
  userUpdate: vi.fn(), userFind: vi.fn(),
}));
vi.mock("@/lib/teacher", () => ({ getTeacher: mocks.teacher, ACTIVE_CLASS_COOKIE: "class", START_FLOW_COOKIE: "start", START_FLOW_MAX_AGE: 7200 }));
vi.mock("@/lib/db", () => ({ prisma: { class: { create: mocks.create, findFirst: mocks.find, update: mocks.update },
  user: { updateMany: mocks.userUpdate, findUnique: mocks.userFind } } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect ${path}`); } }));
import { createClassFromFlow } from "@/app/start/actions";
const input = { name: "", yearGroup: "", school: "Richmond Park", groupType: "family" as const,
  ageRange: "13+" as const, lat: 51.44251, lng: -0.27341 };
beforeEach(() => {
  vi.clearAllMocks(); mocks.teacher.mockResolvedValue({ id: "owner" });
  mocks.create.mockResolvedValue({ id: "created" }); mocks.find.mockResolvedValue(null);
});
describe("onboarding profile persistence", () => {
  it("saves family and age with a default name and no invented ability", async () => {
    await createClassFromFlow(input);
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({ name: "My family", groupType: "family",
      ageRange: "13+", yearGroup: "", abilityBand: null, lat: 51.443, lng: -0.273,
      teacher: { connect: { id: "owner" } } });
  });
  it("preserves legacy grade behavior and names", async () => {
    await createClassFromFlow({ name: "Oak", yearGroup: "Year 1", school: "School" });
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({ name: "Oak", yearGroup: "Year 1", abilityBand: "y1" });
  });
  it("scopes resume to the signed-in owner and reuses the owned record", async () => {
    mocks.find.mockResolvedValue({ id: "owned", groundsId: null });
    await createClassFromFlow({ ...input, classId: "owned" });
    expect(mocks.find.mock.calls[0]![0].where).toEqual({ id: "owned", teacherId: "owner" });
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ groupType: "family", ageRange: "13+" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("records the invite cohort once, on the owner, and returns what her record holds (#821)", async () => {
    mocks.userFind.mockResolvedValue({ inviteCohort: "autumn-a" });
    const saved = await createClassFromFlow({ ...input, inviteCohort: "autumn-a" });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "owner", inviteCohort: null }, data: { inviteCohort: "autumn-a" } });
    expect(saved).toEqual({ classId: "created", inviteCohort: "autumn-a" });
  });
  it("still saves the class when the cohort is malformed, and stores none", async () => {
    mocks.userFind.mockResolvedValue({ inviteCohort: null });
    const saved = await createClassFromFlow({ ...input, inviteCohort: "Oakfield Primary" });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(saved.inviteCohort).toBeNull();
  });
  it("rejects unoffered profiles and unauthenticated writes", async () => {
    await expect(createClassFromFlow({ ...input, ageRange: "unknown" as never })).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.teacher.mockResolvedValue(null);
    await expect(createClassFromFlow(input)).rejects.toThrow("redirect /sign-in");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
