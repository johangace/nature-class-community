import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE LANDING PROMISE LEADS WITH THE TEACHING, NOT THE KIT (#881).
 *
 * "See what to carry" should go third in the list (Assembly Code cohort,
 * 2026-09-01). Equipment is supporting information; what the teacher will
 * say and do is the lesson. Leading with kit made the product sound like a
 * packing list. Same order on the public landing and the invitation.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
    .replace(/\s+/g, " ");

describe("the three-part promise", () => {
  it("puts carry third on app/join/JoinLanding.tsx", () => {
    const source = read("app/join/JoinLanding.tsx");
    const sentence =
      "what to say, what to do with the weather and life around your school today, and what to carry.";
    expect(source).toContain(sentence);
    const say = source.indexOf("what to say");
    const carry = source.indexOf("what to carry");
    expect(say).toBeGreaterThan(-1);
    expect(carry).toBeGreaterThan(say);
  });

  it("keeps kit out of the public landing's promise altogether (#914)", () => {
    // The rebuilt landing (2026-09-02) states the value proposition without a
    // packing list: what to bring lives inside the lesson, where it belongs.
    const source = read("app/welcome/Landing.tsx");
    expect(source).not.toContain("See what to carry");
    expect(source).not.toContain("what to carry");
    expect(source).toContain("Nature Class empowers any adult to facilitate outdoor learning.");
  });
});
