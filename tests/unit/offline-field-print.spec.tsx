import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import { FieldPrint } from "@/app/field/print/FieldPrint";

describe("the data-free field print fallback", () => {
  it("prints the complete authored script, universal safety, and child sheet", () => {
    const release = buildCoreLessonRelease({
      generatedAt: new Date("2026-08-29T08:00:00.000Z"),
    });
    const sessionId = release.shelf[0]!.sessionIds[0]!;
    const session = release.sessions[sessionId]!;
    const markup = renderToStaticMarkup(
      <FieldPrint initialRelease={release} initialSessionId={sessionId} />,
    );

    expect(markup).toContain(session.title);
    expect(markup).toContain(session.phases[0]!.title);
    expect(markup).toContain(release.universalSafety[0]!.name);
    expect(markup).toContain("Look at the sky, feel the air and check the ground together");
    expect(markup).toContain("children’s sheet");
    expect(markup).not.toMatch(/teacherId|classId|latitude|longitude|schoolName/);
  });
});
