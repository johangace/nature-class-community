import { describe, expect, it } from "vitest";
import {
  afterSearchResults,
  schoolOfRecord,
  type LocationState,
} from "@/app/start/location-state";

/**
 * The stale denial (usability round, I4).
 *
 * A teacher refused the browser's location prompt, typed her school's name
 * instead, got a list of addresses back — and was still reading "Location
 * permission was declined", in red, underneath them. An error about a road she
 * had already stopped walking down, on the keystone screen of onboarding.
 */

describe("results clear the denial", () => {
  it("clears a denied permission once there is something to pick", () => {
    expect(afterSearchResults("denied", 3)).toBe("empty");
  });

  it("clears a failed geolocation the same way", () => {
    expect(afterSearchResults("error", 1)).toBe("empty");
  });
});

describe("nothing found leaves the denial standing", () => {
  it("keeps the denial when the search came back empty", () => {
    // Then the permission really IS still the open problem, and "allow
    // location, then try again" is the only guidance on the screen. Clearing
    // it would leave her with nothing.
    expect(afterSearchResults("denied", 0)).toBe("denied");
    expect(afterSearchResults("error", 0)).toBe("error");
  });

  it("treats a negative or missing count as nothing found", () => {
    expect(afterSearchResults("denied", -1)).toBe("denied");
  });
});

describe("it never undoes a state that is not a complaint", () => {
  it("leaves a grounded location alone", () => {
    // A success this has no business touching: she has coordinates.
    expect(afterSearchResults("grounded", 5)).toBe("grounded");
  });

  it("leaves a request still in flight alone", () => {
    expect(afterSearchResults("prompting", 5)).toBe("prompting");
  });

  it("leaves an untouched step alone", () => {
    expect(afterSearchResults("empty", 5)).toBe("empty");
  });

  it("is idempotent for every state", () => {
    const states: LocationState[] = ["empty", "prompting", "grounded", "denied", "error"];
    for (const s of states) {
      const once = afterSearchResults(s, 3);
      expect(afterSearchResults(once, 3)).toBe(once);
    }
  });
});

/**
 * The school, asked once (#905).
 *
 * First run used to ask for the school on screen 1 and then ask her to find
 * the same school on screen 2 to place it. `Class.school` and `Grounds.school`
 * are non-null, so the name is needed — but the location step already holds
 * it, in the words she is most entitled to trust.
 */
describe("the school name a class is saved with", () => {
  it("defaults to the place she confirmed, so she types nothing", () => {
    expect(schoolOfRecord("", false, "St Mary's Primary, Ealing")).toBe(
      "St Mary's Primary, Ealing"
    );
  });

  it("defaults to a park or a street just the same", () => {
    // The place a class goes outside is often not the school building, and a
    // teacher who picked Walpole Park should see Walpole Park in the field
    // rather than an empty one she has to fill.
    expect(schoolOfRecord("", false, "Walpole Park")).toBe("Walpole Park");
  });

  it("keeps her own name once she has given one", () => {
    expect(schoolOfRecord("St Mary's Primary", true, "Walpole Park")).toBe(
      "St Mary's Primary"
    );
  });

  it("keeps her own name when she changes the place afterwards", () => {
    // The flag, not the string, is what holds this: her name survives a new
    // pick, and a different pick does not quietly rename her school.
    expect(schoolOfRecord("St Mary's Primary", true, "Lammas Park")).toBe(
      "St Mary's Primary"
    );
  });

  it("returns empty when the point could not be named and she has not named it", () => {
    // The one answer the caller must not save. The location step holds on it
    // and asks, rather than writing a coordinate string into a school column.
    expect(schoolOfRecord("", false, null)).toBe("");
    expect(schoolOfRecord("", true, "St Mary's Primary")).toBe("");
  });
});
