import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("bounded teacher AI", () => {
  it("ships one authenticated lesson-support route", () => {
    expect(existsSync(resolve(root, "app/api/lesson-support/route.ts"))).toBe(true);
    const route = readFileSync(resolve(root, "app/api/lesson-support/route.ts"), "utf8");
    // Auth, rate-limit and the no-store contract now live in the shared
    // lib/ai/api-guard.ts boundary (#280), reused by every AI route rather
    // than each one carrying its own copy — see the next assertion.
    expect(route).toContain("guardAiRoute");
    expect(route).toContain(".strict()");
  });

  it("keeps the shared AI boundary itself authenticated and closed to caching", () => {
    const guard = readFileSync(resolve(root, "lib/ai/api-guard.ts"), "utf8");
    expect(guard).toContain("getTeacher");
    expect(guard).toContain("withinTeacherLimit");
    expect(guard).toContain('cache-control": "private, no-store');
  });

  it("extends the same AI boundary for the onboarding assistant's intake route, rather than opening a second door", () => {
    const worldIntake = readFileSync(resolve(root, "app/api/world-intake/route.ts"), "utf8");
    expect(worldIntake).toContain("guardAiRoute");
    expect(worldIntake).toContain(".strict()");
  });

  it("extends the same AI boundary for the circle's ask-it-another-way route", () => {
    const route = readFileSync(resolve(root, "app/api/ask-another-way/route.ts"), "utf8");
    expect(route).toContain("guardAiRoute");
    expect(route).toContain(".strict()");
    // The request names WHICH question, never its words. No client-supplied
    // question text means no drift chain and no free text outdoors (#390).
    expect(route).toContain("questionIndex");
    expect(route).not.toMatch(/question:\s*z\.string/);
  });

  it("keeps preparation and in-run helpers in production components", () => {
    expect(existsSync(resolve(root, "app/session/LessonPreparationAssistant.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "app/run/TeachingAssistant.tsx"))).toBe(true);
  });

  it("offers simplification, movement, challenge and child-question help without replacing the runner", () => {
    const runner = readFileSync(resolve(root, "app/run/Runner.tsx"), "utf8");
    const helper = readFileSync(resolve(root, "app/run/TeachingAssistant.tsx"), "utf8");
    expect(runner).toContain("TeachingAssistant");
    expect(helper).toContain("simpler");
    expect(helper).toContain("movement");
    expect(helper).toContain("challenge");
    expect(helper).toContain("child-question");
  });
});
