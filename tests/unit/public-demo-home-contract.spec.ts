import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

const source = (path: string) => readFileSync(path, "utf8");

const PUBLIC_LESSON_SURFACES = [
  "app/outside/page.tsx",
  "app/read/page.tsx",
  "app/species/[slug]/page.tsx",
  "app/session/SessionModes.tsx",
  "app/session/PlanPageFrame.tsx",
  "app/session/primer/PrimerPage.tsx",
  "app/session/safety/SafetyPage.tsx",
];

describe("public lesson surfaces keep a public way home", () => {
  it("opens an installed Nature Class app at the teacher workspace", () => {
    const installed = manifest();
    expect(installed.id).toBe("/");
    expect(installed.start_url).toBe("/today");
  });

  it.each(PUBLIC_LESSON_SURFACES)("does not hard-code protected Today in %s", (path) => {
    const text = source(path);
    expect(text).not.toContain('href="/today"');
    expect(text).toContain("homeHref");
  });

  it.each(["app/outside/page.tsx", "app/read/page.tsx", "app/species/[slug]/page.tsx"])(
    "derives the home route from the teacher session in %s",
    (path) => {
      const text = source(path);
      expect(text).toContain("getTeacher");
      expect(text).toMatch(/teacher\s*\?\s*"\/today"\s*:\s*"\/"/);
    },
  );
});
