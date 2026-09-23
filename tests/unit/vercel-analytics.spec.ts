import { describe, expect, it } from "vitest";
import { redactVercelPageview } from "../../lib/analytics/vercel";

describe("Vercel pageview privacy", () => {
  it("removes query, fragment and opaque route identifiers", () => {
    expect(redactVercelPageview({ type: "pageview", url: "https://natureclass.education/classes/abc123def456?email=teacher@example.com#private" }))
      .toEqual({ type: "pageview", url: "https://natureclass.education/classes/:id" });
  });
  it("keeps useful public routes", () => {
    expect(redactVercelPageview({ type: "pageview", url: "https://natureclass.education/today" })?.url).toBe("https://natureclass.education/today");
  });
  it("drops custom events and invalid URLs", () => {
    expect(redactVercelPageview({ type: "event", url: "https://natureclass.education/" })).toBeNull();
    expect(redactVercelPageview({ type: "pageview", url: "invalid" })).toBeNull();
  });
});
