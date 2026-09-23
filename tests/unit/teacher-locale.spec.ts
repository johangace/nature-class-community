import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abilityBands } from "@/schema/pack";
import {
  abilityLabel,
  abilityOptions,
  bandForYearGroup,
} from "@/lib/ability";
import { formatLocaleDate, localeForLanguageTag } from "@/lib/localization";

describe("the pre-location locale preference", () => {
  it("uses an explicit US browser language before a class has coordinates", () => {
    expect(localeForLanguageTag("en-US,en;q=0.9")).toBe("us");
  });

  it("keeps the native UK voice for UK and unknown browser languages", () => {
    expect(localeForLanguageTag("en-GB,en;q=0.9")).toBe("uk");
    expect(localeForLanguageTag("fr-FR,fr;q=0.9")).toBe("uk");
    expect(localeForLanguageTag(null)).toBe("uk");
  });
});

describe("teacher-facing curriculum labels", () => {
  it("maps every authored ability band to the UK labels teachers use", () => {
    expect(abilityOptions("uk")).toEqual([
      { band: "reception", value: "Reception", label: "Reception" },
      { band: "y1", value: "Year 1", label: "Year 1" },
      { band: "y2", value: "Year 2", label: "Year 2" },
    ]);
  });

  it("maps the same ability bands to US labels without creating another curriculum", () => {
    expect(abilityOptions("us")).toEqual([
      { band: "reception", value: "Reception", label: "Pre-K" },
      { band: "y1", value: "Year 1", label: "Kindergarten" },
      { band: "y2", value: "Year 2", label: "Grade 1" },
    ]);

    for (const band of abilityBands) {
      const option = abilityOptions("us").find((candidate) => candidate.band === band);
      expect(option, band).toBeDefined();
      expect(bandForYearGroup(option?.value), band).toBe(band);
    }
  });

  it("keeps the internal ability identity separate from the displayed label", () => {
    expect(abilityLabel("reception", "us")).toBe("Pre-K");
    expect(abilityLabel("reception", "uk")).toBe("Reception");
    expect(abilityLabel("y1", "us")).toBe("Kindergarten");
    expect(abilityLabel("y1", "uk")).toBe("Year 1");
  });
});

describe("teacher-facing dates", () => {
  const THURSDAY = new Date(2026, 8, 3, 12);

  it("formats a US class date in month-day order", () => {
    expect(formatLocaleDate(THURSDAY, "us")).toBe("Thursday, September 3");
  });

  it("formats a UK class date in day-month order", () => {
    expect(formatLocaleDate(THURSDAY, "uk")).toBe("Thursday 3 September");
  });
});

describe("the lean first run's locale (#60, #878)", () => {
  /**
   * #878 removes the old success screen entirely. The only locale-sensitive
   * copy left in first run is the ability picker on the class question; the
   * location question then saves and goes directly to localized Today.
   */
  const flow = readFileSync(
    new URL("../../app/start/StartFlow.tsx", import.meta.url),
    "utf8"
  );

  it("carries no hardcoded date locale or obsolete success screen", () => {
    expect(flow).not.toContain('toLocaleDateString("en-GB"');
    expect(flow).not.toContain("SuccessStep");
  });

  it("uses the same age ranges in every locale for onboarding", () => {
    expect(flow).toContain("AGE_RANGES.map");
    expect(flow).not.toContain("abilityOptions(locale)");
  });
});
