import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The origin allowlist is the whole door. Better Auth refuses any request
 * whose Origin is neither its base URL nor a named trusted origin, and it
 * refuses it before it sends anything — which is how sign-in broke on the day
 * natureclass.education became canonical while the base URL still named the
 * old vercel.app host (#568). Every magic-link post came back "Invalid
 * origin", and the teacher saw only "that didn't go through".
 *
 * A source scan rather than a call: the failure was configuration, so what
 * needs guarding is that the canonical domain is still written down here after
 * the next redesign of this file.
 */
describe("sign-in trusted origins", () => {
  const source = () => readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8");

  it("trusts the canonical domain the teacher actually types", () => {
    const text = source();
    expect(text).toContain("trustedOrigins");
    expect(text).toContain("https://natureclass.education");
    expect(text).toContain("https://www.natureclass.education");
  });

  it("keeps the vercel.app host trusted while it still serves", () => {
    // natureclass.education is canonical, but nature-class-iota.vercel.app is
    // still live and is the host every deploy is verified against.
    expect(source()).toContain("https://nature-class-iota.vercel.app");
  });
});
