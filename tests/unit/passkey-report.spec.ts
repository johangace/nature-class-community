import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { endingOf, readClientFamily } from "@/lib/passkey";

/**
 * The instrument, held to the question it was built to answer (#650): keep
 * the passkey, stop offering it, or retire it. It can only answer that if the
 * device families are read correctly, if every ceremony reports, and if the
 * record stays free of anything that identifies a teacher.
 */
describe("reading the device family", () => {
  it("calls an iPad an iPad, though Safari swears it is a Mac", () => {
    // iPadOS 13 and later send a desktop Macintosh user-agent. The iPad is
    // the school device; putting it in the macos bucket would hide the one
    // distinction this field exists to make.
    const ipad =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(readClientFamily(ipad, 5)).toEqual({
      platform: "ios",
      browser: "safari",
    });
    // The same string from a real Mac, which reports no touch points.
    expect(readClientFamily(ipad, 0)).toEqual({
      platform: "macos",
      browser: "safari",
    });
  });

  it("tells the browsers apart, though each names the others", () => {
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    const edge = `${chrome} Edg/120.0`;
    expect(readClientFamily(chrome).browser).toBe("chrome");
    expect(readClientFamily(edge).browser).toBe("edge");
    expect(readClientFamily(chrome).platform).toBe("windows");
  });

  it("reads an iPhone and an Android phone", () => {
    expect(
      readClientFamily(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toEqual({ platform: "ios", browser: "safari" });
    expect(
      readClientFamily(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"
      )
    ).toEqual({ platform: "android", browser: "chrome" });
  });

  it("answers something for a user-agent it has never seen", () => {
    expect(readClientFamily("")).toEqual({ platform: "other", browser: "other" });
  });
});

describe("the ending sent for each outcome", () => {
  it("keeps a failure's kind and leaves its reason to its own column", () => {
    expect(endingOf({ kind: "failed", reason: "wrong-host" })).toBe("failed");
    expect(endingOf({ kind: "cancelled" })).toBe("cancelled");
    expect(endingOf({ kind: "already" })).toBe("already");
    expect(endingOf({ kind: "unavailable" })).toBe("unavailable");
  });
});

describe("what the record may hold", () => {
  const route = () =>
    readFileSync(
      resolve(process.cwd(), "app/api/passkey-report/route.ts"),
      "utf8"
    );

  it("accepts only named values, so nothing free-form can be posted into it", () => {
    const text = route();
    expect(text).toContain(".strict()");
    // The one nearly-free field is the library's code, and it is bounded and
    // character-restricted: it is written by a library, never by a person.
    expect(text).toContain("z\n      .string()\n      .max(64)");
    expect(text).toContain("/^[A-Za-z0-9_]+$/");
  });

  it("refuses a report that did not come from this app", () => {
    expect(route()).toContain("sameOrigin");
  });

  it("stores nothing that identifies a teacher", () => {
    const text = route();
    for (const forbidden of ["email", "userId", "teacher", "userAgent", "ip"]) {
      expect(text.toLowerCase()).not.toContain(`${forbidden.toLowerCase()}:`);
    }
  });
});

describe("every ceremony reports", () => {
  const sites = [
    ["app/sign-in/SignInForm.tsx", 3], // the button, its failure, and the autofill
    ["app/PasskeyStrip.tsx", 2],
  ] as const;

  it.each(sites)(
    "%s reports both the successes and the failures",
    (file, expected) => {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      const calls = text.match(/reportPasskeyCeremony\(/g) ?? [];
      // A site that reports only its failures produces a record with no
      // denominator, which is the exact shape that cannot answer the question.
      expect(calls.length).toBeGreaterThanOrEqual(expected);
      expect(text).toContain('outcome: "ok"');
    }
  );
});
