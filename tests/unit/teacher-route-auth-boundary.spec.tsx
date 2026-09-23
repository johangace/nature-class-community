import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  prisma: { class: { findMany: vi.fn() } },
}));
vi.mock("@/lib/teacher", () => ({
  getActiveEnglishLocale: vi.fn().mockResolvedValue(null),
  getActiveClassLocation: vi.fn().mockResolvedValue(null),
  classMinutesOutside: vi.fn(),
  getActiveClass: vi.fn(),
  getTeacher: vi.fn(),
}));
vi.mock("@/app/classes/actions", () => ({
  setClassEnglishLocale: vi.fn(),
  chooseClass: vi.fn(),
  createClass: vi.fn(),
  deleteClass: vi.fn(),
  openClassGrounds: vi.fn(),
  renameClass: vi.fn(),
}));
vi.mock("@/app/classes/LocationButton", () => ({
  LocationButton: () => null,
}));
vi.mock("@/app/classes/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("@/app/AppNav", () => ({ AppNav: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import AccountPage from "@/app/account/page";
import ClassesPage from "@/app/classes/page";
import { prisma } from "@/lib/db";
import { classMinutesOutside, getActiveClass, getTeacher } from "@/lib/teacher";
import { redirect } from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("teacher route auth boundary", () => {
  it("redirects a signed-out visitor from /classes before reading teacher data", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null);

    await expect(ClassesPage({})).rejects.toThrow("redirect:/sign-in");

    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(prisma.class.findMany).not.toHaveBeenCalled();
    expect(getActiveClass).not.toHaveBeenCalled();
  });

  it("redirects a signed-out visitor from /account", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null);

    await expect(AccountPage()).rejects.toThrow("redirect:/sign-in");

    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });

  it("names the signed-in account and keeps the safe sign-out control there", async () => {
    vi.mocked(getTeacher).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.test",
    } as Awaited<ReturnType<typeof getTeacher>>);

    const markup = renderToStaticMarkup(await AccountPage());

    expect(markup).toContain("<h1>Account</h1>");
    expect(markup).toContain("teacher@example.test");
    expect(markup).toContain(">Sign out</button>");
  });

  it("draws a shared place once, and names it from every class that uses it (#913)", async () => {
    const profile = {
      id: "main-ground",
      name: "Hollow Lane main grounds",
      school: "Hollow Lane Primary",
      lat: 51.56,
      lng: -0.13,
    };
    const classes = [
      {
        id: "willow",
        name: "Willow",
        yearGroup: "Year 1",
        school: "Hollow Lane Primary",
        lat: 51.56,
        lng: -0.13,
        groundsProfile: profile,
      },
      {
        id: "oak",
        name: "Oak",
        yearGroup: "Year 2",
        school: "Hollow Lane Primary",
        lat: 51.56,
        lng: -0.13,
        groundsProfile: profile,
      },
    ];
    vi.mocked(getTeacher).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.test",
    } as Awaited<ReturnType<typeof getTeacher>>);
    vi.mocked(prisma.class.findMany).mockResolvedValue(classes as never);
    vi.mocked(getActiveClass).mockResolvedValue(classes[0] as never);
    vi.mocked(classMinutesOutside).mockResolvedValue({
      minutes: 0,
      sessionsLed: 0,
      countedSessions: 0,
    });

    const markup = renderToStaticMarkup(await ClassesPage({}));

    // One place card, one map, and the chips are the only doors to the place page.
    expect(markup.match(/Map around Hollow Lane main grounds/g)).toHaveLength(1);
    expect(markup).not.toContain("Open place");
    expect(markup.match(/OpenStreetMap contributors/g)).toHaveLength(1);
    expect(markup).toContain("Used by <strong>Willow and Oak</strong>");
    // Each class points at it with a chip.
    expect(markup.match(/<\/span>at Hollow Lane main grounds/g)).toHaveLength(2);
    expect(markup).not.toContain("Teaching place:");
    expect(markup).not.toContain("Your world");
  });

  it("is one card, no headings and no second list, for one class at one place", async () => {
    const classes = [
      {
        id: "willow",
        name: "Willow",
        yearGroup: "Year 1",
        school: "Hollow Lane Primary",
        lat: 51.56,
        lng: -0.13,
        groundsProfile: {
          id: "main-ground",
          name: "Hollow Lane main grounds",
          school: "Hollow Lane Primary",
          lat: 51.56,
          lng: -0.13,
        },
      },
    ];
    vi.mocked(getTeacher).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.test",
    } as Awaited<ReturnType<typeof getTeacher>>);
    vi.mocked(prisma.class.findMany).mockResolvedValue(classes as never);
    vi.mocked(getActiveClass).mockResolvedValue(classes[0] as never);
    vi.mocked(classMinutesOutside).mockResolvedValue({
      minutes: 0,
      sessionsLed: 0,
      countedSessions: 0,
    });

    const markup = renderToStaticMarkup(await ClassesPage({}));

    expect(markup).not.toContain("classes-list-title");
    expect(markup).not.toContain("places-list-title");
    expect(markup).not.toContain("Used by");
    expect(markup.match(/<li /g)).toHaveLength(1);
    expect(markup.match(/Map around Hollow Lane main grounds/g)).toHaveLength(1);
    expect(markup).toContain("</span>at Hollow Lane main grounds");
    expect(markup).toContain("teaching now");
  });
});
