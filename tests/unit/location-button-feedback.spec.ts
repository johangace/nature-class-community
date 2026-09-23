import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  locationFailureMessage,
  locationFailureState,
} from "@/app/classes/location-feedback";

const worldCss = readFileSync(
  new URL("../../app/world.module.css", import.meta.url),
  "utf8"
);
const globalCss = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8"
);

describe("the current-location failure", () => {
  it("distinguishes permission, timeout and unavailable position failures", () => {
    expect(locationFailureState(1)).toBe("denied");
    expect(locationFailureState(2)).toBe("unavailable");
    expect(locationFailureState(3)).toBe("timeout");
    expect(locationFailureState(99)).toBe("unavailable");
  });

  it("says what failed and points at the typed way in", () => {
    expect(locationFailureMessage("denied")).toContain("Location access is off");
    expect(locationFailureMessage("timeout")).toContain("timed out");
    expect(locationFailureMessage("unavailable")).toContain("could not provide a location");
    for (const state of ["denied", "timeout", "unavailable"] as const) {
      expect(locationFailureMessage(state)).toMatch(/type the place below/i);
    }
  });

  it("opens the typed search beneath every failure, not a settings errand (#181)", () => {
    const button = readFileSync(
      new URL("../../app/classes/LocationButton.tsx", import.meta.url),
      "utf8"
    );
    expect(button).toContain('import { LocationSearch } from "./LocationSearch"');
    expect(button).toMatch(/role="status"[\s\S]*?<LocationSearch classId=\{classId\} returnTo=\{returnTo\} \/>/);
  });
});

describe("the place chooser", () => {
  it("keeps feedback beneath the location control instead of between actions", () => {
    expect(worldCss).toMatch(
      /\.currentLocation :global\(\.loc\)\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s
    );
    expect(worldCss).not.toMatch(
      /\.currentLocation :global\(\.loc\)\s*\{[^}]*display:\s*contents;/s
    );
  });

  it("uses a secondary-height control and neutral feedback text", () => {
    expect(worldCss).toMatch(
      /\.currentLocation :global\(\.loc-btn\)[\s\S]*?min-height:\s*var\(--touch-secondary\);/
    );
    expect(worldCss).toMatch(
      /\.currentLocation :global\(\.loc-note\)\s*\{[^}]*color:\s*var\(--ink-soft\);[^}]*font-style:\s*normal;/s
    );
    expect(globalCss).toMatch(
      /\.loc-note\s*\{[^}]*font-style:\s*normal;[^}]*color:\s*var\(--ink-soft\);/s
    );
  });
});
