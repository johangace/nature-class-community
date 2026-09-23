vi.mock("@/lib/request-locale", () => ({ requestLocaleChoice: async () => ({ locale: "uk", automatic: true }), requestLocale: async (explicit?: string, location?: {lat: number; lng: number}) => { const { preferredLocale } = await import("@/lib/locale-policy"); return preferredLocale({explicit, location}); } }));
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teacher", () => ({
  getTeacher: vi.fn(),
}));
vi.mock("@/app/Analytics", () => ({
  IdentifyTeacher: ({ teacherId }: { teacherId: string }) => (
    <span data-identified-teacher={teacherId} />
  ),
}));

import HomePage from "@/app/page";
import WelcomePage from "@/app/welcome/page";
import { getTeacher } from "@/lib/teacher";

async function renderWelcome() {
  return renderToStaticMarkup(await WelcomePage({}));
}

async function renderHome() {
  return renderToStaticMarkup(await HomePage({}));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the stable landing alias auth state", () => {
  it("keeps the public sign-in door for a signed-out visitor", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null);

    const markup = await renderWelcome();

    expect(markup).toContain("Sign in");
    // Sign-in stays in the header; every lesson action opens the public start flow.
    expect(markup.match(/href="\/sign-in"/g)).toHaveLength(2);
    expect(markup.match(/href="\/start"/g)).toHaveLength(3);
    expect(markup).not.toContain("teacherAvatar");
  });

  it("recognises a signed-in teacher with an avatar and workspace continuations", async () => {
    vi.mocked(getTeacher).mockResolvedValue({
      id: "teacher-1",
      email: "johan@example.com",
      name: "Johan Gace",
    });

    const markup = await renderWelcome();

    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain('href="/sign-in"');
    expect(markup).toContain('aria-label="Continue as Johan Gace to Today"');
    expect(markup).toMatch(/data-avatar="teacher"[^>]*>J<\/span>/);
    expect(markup).toContain("Today");
    expect(markup).toContain("Continue with your class");
    expect(markup).toContain("Open today’s lesson");
    expect(markup.match(/href="\/today"/g)).toHaveLength(4);

    const homeMarkup = await renderHome();
    expect(homeMarkup).toContain('data-identified-teacher="teacher-1"');
  });

  it("falls back to the email initial when the teacher has no display name", async () => {
    vi.mocked(getTeacher).mockResolvedValue({
      id: "teacher-2",
      email: "teacher@example.com",
      name: null,
    });

    const markup = await renderWelcome();

    expect(markup).toContain('aria-label="Continue as teacher@example.com to Today"');
    expect(markup).toMatch(/data-avatar="teacher"[^>]*>T<\/span>/);
  });
});
