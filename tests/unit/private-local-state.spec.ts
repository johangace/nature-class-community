import { describe, expect, it } from "vitest";
import { isPrivateLocalStateKey } from "@/lib/run/private-local-state";

describe("shared-device private local state", () => {
  it("recognises current and legacy run, queue, and held-question keys", () => {
    for (const key of [
      "nature-class:run-progress:v2:class%3Aoak:lesson",
      "nature-class:run-progress:v3:class%3Aoak:lesson",
      "nature-class:journey-progress:v1:class%3Aoak:lesson",
      "nature-class:completion-queue:v1:oak",
      "nature-class-run-old-lesson",
      "nature-class-pending-completions",
      "nature-class-held-old-lesson",
    ]) {
      expect(isPrivateLocalStateKey(key)).toBe(true);
    }
  });

  it("keeps non-private display and first-time preferences", () => {
    expect(isPrivateLocalStateKey("nature-class-outdoor")).toBe(false);
    expect(isPrivateLocalStateKey("nature-class-led")).toBe(false);
  });
});
