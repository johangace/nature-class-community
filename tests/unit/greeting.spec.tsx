import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayClock } from "@/app/today/TodayClock";
import { approximateLocalTime, greetingFor } from "@/lib/greeting";
import { formatLocaleDate } from "@/lib/localization";

/**
 * THE GREETING READS A CLOCK (2026-09-07).
 *
 * Johan, opening Today at noon: *"good morning is stale now is midday"*. The
 * page had said "Good morning." in every hour of every day since it was
 * built. These pin the three words, the hours they turn on, and the two
 * clocks the page reads them from: the school's longitude for the first
 * paint, and the device after that.
 */
describe("the greeting", () => {
  it("turns at noon and at six", () => {
    expect(greetingFor(0)).toBe("Good morning.");
    expect(greetingFor(11)).toBe("Good morning.");
    expect(greetingFor(12)).toBe("Good afternoon.");
    expect(greetingFor(17)).toBe("Good afternoon.");
    expect(greetingFor(18)).toBe("Good evening.");
    expect(greetingFor(23)).toBe("Good evening.");
  });

  it("falls back to the morning on a broken hour rather than inventing one", () => {
    expect(greetingFor(Number.NaN)).toBe("Good morning.");
    expect(greetingFor(24)).toBe("Good morning.");
    expect(greetingFor(-1)).toBe("Good morning.");
  });

  it("never says it with an exclamation mark or an em dash", () => {
    for (const hour of [3, 13, 21]) expect(greetingFor(hour)).toMatch(/^Good [a-z]+\.$/);
  });
});

describe("the school's clock, approximated from its longitude", () => {
  const noonUtc = new Date("2026-09-07T12:00:00Z");

  it("puts London within its own hour", () => {
    expect(approximateLocalTime(noonUtc, -0.12).getUTCHours()).toBe(12);
  });

  it("puts Massachusetts in the morning while London is at noon", () => {
    // 71°W is five hours behind; the server, in UTC, would have said afternoon.
    const boston = approximateLocalTime(noonUtc, -71.06);
    expect(boston.getUTCHours()).toBe(7);
    expect(greetingFor(boston.getUTCHours())).toBe("Good morning.");
  });

  it("crosses the date line on the calendar too, so the date is hers and not the server's", () => {
    // Half past ten at night in UTC on the 7th is already the 8th in Sydney.
    const late = new Date("2026-09-07T22:30:00Z");
    const sydney = approximateLocalTime(late, 151.2);
    expect(formatLocaleDate(sydney, "uk", "UTC")).toBe("Tuesday 8 September");
    expect(formatLocaleDate(late, "uk", "UTC")).toBe("Monday 7 September");
  });

  it("is the server's clock when the class has no longitude", () => {
    expect(approximateLocalTime(noonUtc, null).getTime()).toBe(noonUtc.getTime());
    expect(approximateLocalTime(noonUtc, undefined).getTime()).toBe(noonUtc.getTime());
  });
});

describe("the clock on Today", () => {
  it("paints the server's words first, so hydration has nothing to disagree with", () => {
    const markup = renderToStaticMarkup(
      <TodayClock locale="uk" greeting="Good afternoon." dateLine="Monday 7 September" />
    );
    expect(markup).toContain("Good afternoon.");
    expect(markup).toContain("Monday 7 September");
  });
});
