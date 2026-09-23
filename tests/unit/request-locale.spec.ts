import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ saved: null as string | null, location: null as {lat: number; lng: number} | null, visitor: undefined as string | undefined, country: "", language: "en-GB" }));
vi.mock("@/lib/teacher", () => ({ getActiveEnglishLocale: async () => state.saved, getActiveClassLocation: async () => state.location }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => state.visitor ? { value: state.visitor } : undefined }),
  headers: async () => new Headers({ "accept-language": state.language, "x-vercel-ip-country": state.country }),
}));
import { requestLocale, requestLocaleChoice } from "@/lib/request-locale";
beforeEach(() => { state.saved = null; state.location = null; state.visitor = undefined; state.language = "en-GB"; state.country = ""; });
describe("request locale", () => {
  it("uses the visitor edition through a sign-in round trip with no class yet", async () => {
    state.visitor = "us";
    expect(await requestLocale()).toBe("us");
  });
  it("switches to the chosen school's English once located", async () => {
    state.visitor = "uk";
    state.location = { lat: 37.87, lng: -122.27 };
    expect(await requestLocale()).toBe("us");
    expect(await requestLocale("uk")).toBe("uk");
  });
  it("reads browser language when there is no other context", async () => {
    state.language = "en-US,en;q=0.9";
    expect(await requestLocale()).toBe("us");
  });
});

it("persists a class override ahead of location and visitor, with explicit URLs winning", async () => {
  state.location = { lat: 51.5, lng: -0.1 };
  state.saved = "us";
  state.visitor = "uk";
  expect(await requestLocale()).toBe("us");
  expect(await requestLocale("uk")).toBe("uk");
  state.saved = null;
  expect(await requestLocale()).toBe("uk");
});
it("uses an unlocated class preference and switches with the active class", async () => {
  state.saved = "us";
  expect(await requestLocale()).toBe("us");
  state.saved = "uk";
  expect(await requestLocale()).toBe("uk");
});

it("Auto ignores a former visitor choice while respecting class settings", async () => {
  state.visitor = "us";
  expect(await requestLocale("auto")).toBe("uk");
  state.location = { lat: 37.87, lng: -122.27 };
  expect(await requestLocale("auto")).toBe("us");
  state.saved = "uk";
  expect(await requestLocale("auto")).toBe("uk");
});

it("labels the actual source when a school overrides a remembered visitor edition", async () => {
  state.visitor = "us";
  expect(await requestLocaleChoice()).toEqual({ locale: "us", automatic: false });
  state.location = { lat: 51.5, lng: -0.1 };
  expect(await requestLocaleChoice()).toEqual({ locale: "uk", automatic: true });
  expect(await requestLocaleChoice("us")).toEqual({ locale: "us", automatic: false });
});

it("chooses IP country before browser language on a first visit", async () => {
  state.country = "US";
  expect(await requestLocaleChoice()).toEqual({ locale: "us", automatic: true });
  state.country = "GB";
  state.language = "en-US";
  expect(await requestLocale()).toBe("uk");
  state.country = "PR";
  expect(await requestLocale()).toBe("us");
});
it("keeps explicit choices and the school ahead of IP country", async () => {
  state.country = "US";
  expect(await requestLocale("uk")).toBe("uk");
  state.visitor = "uk";
  expect(await requestLocale()).toBe("uk");
  state.visitor = undefined;
  state.location = { lat: 51.5, lng: -0.1 };
  expect(await requestLocale()).toBe("uk");
});
it.each(["", "XX", "unknown"])("falls back to browser language for unavailable IP country %s", async (country) => {
  state.country = country;
  state.language = "en-US";
  expect(await requestLocale()).toBe("us");
});
