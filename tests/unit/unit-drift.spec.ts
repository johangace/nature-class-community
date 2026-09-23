import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeConditionsLine } from "@/lib/conditions";
import {
  formatFeltTemperature,
  spokenTemperature,
  summarizeConditions,
} from "@/lib/outside/conditions";
import { feltTemperature } from "@/lib/cast/conditions";
import { getOutsideNow } from "@/lib/outside";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * UNIT DRIFT: the same class, two screens, two scales.
 *
 * QA walked a Berkeley class through onboarding and then Today. The bloom said
 * "13 degrees"; the daily card said "55°F" ninety seconds later. Same data,
 * same teacher, same coordinates. The card had learned about locale and the
 * composers underneath it had not, so the product contradicted itself on the
 * one number a teacher checks before deciding whether thirty children go out.
 *
 * These pin BOTH halves of the fix: one owner for the conversion, and the
 * locale actually threaded down to it.
 */

/** Berkeley, as Pointmoon reported it that morning. */
function payload(apparentC: number): FieldTruth {
  return {
    facts: {
      fieldSnapshot: {
        weather: {
          current: { skyCondition: "fog", windKph: 6.3, felt: { apparentC } },
        },
      },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

/**
 * Every file allowed to touch a temperature. The owner is
 * lib/outside/conditions.ts; the rest must delegate to it.
 */
const TEMPERATURE_FILES = [
  "../../lib/outside/conditions.ts",
  "../../lib/cast/conditions.ts",
  "../../lib/conditions.ts",
  "../../lib/grounding.ts",
] as const;

describe("one owner for the temperature", () => {
  it("formats each locale in its own scale, with the unit carried", () => {
    expect(formatFeltTemperature(12.8, "uk")).toBe("13°C");
    expect(formatFeltTemperature(12.8, "us")).toBe("55°F");
  });

  it("defaults to the product's native voice", () => {
    expect(formatFeltTemperature(12.8)).toBe("13°C");
  });

  it("rounds AFTER converting, once", () => {
    // Rounding to 13°C first and converting gives 55°F; the honest answer for
    // 12.8°C is 55°F, but for 13.4°C it is 56°F where a pre-rounded 13 gives
    // 55. A degree out for no reason is how a card stops being trusted.
    expect(formatFeltTemperature(13.4, "us")).toBe("56°F");
    expect(spokenTemperature(13.4, "us")).toBe(56);
  });

  it("is the SAME owner the daily card uses, not a second copy", () => {
    // The card delegates. If these ever disagree, the drift is back.
    for (const c of [-4, 0, 12.8, 21.5, 37]) {
      expect(feltTemperature(payload(c), "us")).toBe(formatFeltTemperature(c, "us"));
      expect(feltTemperature(payload(c), "uk")).toBe(formatFeltTemperature(c, "uk"));
    }
  });

  it("has exactly one conversion in the codebase", () => {
    // The literal that would mean somebody wrote a second converter.
    // lib/grounding.ts joined this list after the usability round: it still
    // hardcoded Celsius in the block of facts handed to the MODEL, which is
    // the worst place to keep one. Every deterministic surface can be right
    // and the AI-composed line will still say the wrong number, in the one
    // register a teacher reads aloud.
    const conversions = TEMPERATURE_FILES.map((f) =>
      readFileSync(new URL(f, import.meta.url), "utf8")
    )
      .join("\n")
      .match(/1\.8\s*\+\s*32|\*\s*9\s*\/\s*5/g) ?? [];
    expect(conversions).toHaveLength(1);
  });

  it("has no hardcoded unit suffix anywhere but the owner", () => {
    // The other shape the bug takes: not the arithmetic, but a literal
    // "°C"/"°F" glued onto a number by a file that is not the formatter.
    for (const file of TEMPERATURE_FILES) {
      if (file.endsWith("outside/conditions.ts")) continue;
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(code).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*°[CF]/);
    }
  });
});

describe("the spoken sentence reads in the teacher's own scale", () => {
  it("says 13 degrees in London and 55 degrees in Berkeley", () => {
    expect(composeConditionsLine(payload(12.8), "uk")).toContain("13 degrees");
    expect(composeConditionsLine(payload(12.8), "us")).toContain("55 degrees");
  });

  it("carries no unit symbol, because it is read aloud", () => {
    const line = composeConditionsLine(payload(12.8), "us");
    expect(line).not.toContain("°");
    expect(line).not.toContain("F");
  });

  it("leaves every existing caller unchanged by defaulting to UK", () => {
    expect(composeConditionsLine(payload(12.8))).toBe(
      composeConditionsLine(payload(12.8), "uk")
    );
  });
});

describe("the quiet instrument row carries its unit", () => {
  it("no longer prints a bare degree sign, which is a puzzle in Phoenix", () => {
    const uk = summarizeConditions(payload(12.8), "uk");
    const us = summarizeConditions(payload(12.8), "us");
    expect(uk.meta).toContain("13°C");
    expect(us.meta).toContain("55°F");
    expect(uk.meta).not.toMatch(/\d+°(?![CF])/);
  });

  it("agrees with the sentence above it in both locales", () => {
    for (const locale of ["uk", "us"] as const) {
      const { line, meta } = summarizeConditions(payload(12.8), locale);
      const spoken = String(spokenTemperature(12.8, locale));
      expect(line).toContain(spoken);
      expect(meta).toContain(spoken);
    }
  });
});

describe("the onboarding path: Berkeley must read Fahrenheit", () => {
  it("composes the bloom's conditions in the locale it was given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload(12.8)), { status: 200 }))
    );

    // The exact coordinates QA walked, and the locale /api/outside now derives
    // from them.
    const us = await getOutsideNow({ lat: 37.871, lng: -122.273, locale: "us" });
    expect(us.conditions.line).toContain("55 degrees");
    expect(us.conditions.meta).toContain("55°F");

    const uk = await getOutsideNow({ lat: 37.872, lng: -122.274, locale: "uk" });
    expect(uk.conditions.line).toContain("13 degrees");
    expect(uk.conditions.meta).toContain("13°C");
  });
});
