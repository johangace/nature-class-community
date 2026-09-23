import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getTodayRead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outside/today", () => ({
  getTodayRead,
}));

import { TodayDoor } from "@/app/TodayDay";

describe("Today sample scope", () => {
  it("labels the outside door as a sample rather than a school", async () => {
    getTodayRead.mockResolvedValue({
      outsideAvailable: true,
      doorFaces: [],
      scope: "sample",
    });

    const html = renderToStaticMarkup(
      await TodayDoor({ query: {}, sessionId: "summer-w1-counting-life" })
    );

    expect(html).toContain("sample patch");
    expect(html).not.toContain("your school");
    expect(html).toContain('href="/outside?session=summer-w1-counting-life"');
  });
});
