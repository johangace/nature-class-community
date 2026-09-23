import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonShelfContent } from "@/app/season/SeasonShelf";
import { findSession } from "@/lib/pack";

const communitySession = findSession("summer-w1-counting-life")?.session;
const premiumSession = findSession("garden-w1-autumn-detectives")?.session;

if (!communitySession || !premiumSession) {
  throw new Error("season offline fixtures are missing");
}

const entries = [
  {
    pack: {
      id: "community-fixture",
      title: "Community",
      sessions: [communitySession],
    },
    tier: "community" as const,
  },
  {
    pack: {
      id: "premium-fixture",
      title: "Premium",
      sessions: [premiumSession],
    },
    tier: "premium" as const,
  },
];

describe("the Season shelf when signal changes", () => {
  it("opens each released lesson through its saved field runner while offline", () => {
    const markup = renderToStaticMarkup(
      <SeasonShelfContent
        connectionState="offline"
        entries={entries}
        ledIds={[]}
        nextUp={communitySession.id}
      />,
    );

    expect(markup).toContain("Offline. Saved lessons open here.");
    expect(markup).toContain(
      `href="/field#session=${communitySession.id}&amp;view=run"`,
    );
    expect(markup).not.toContain(
      `/field#session=${premiumSession.id}&amp;view=run`,
    );
  });

  it("keeps a teacher's Today return in offline shelf links", () => {
    const markup = renderToStaticMarkup(
      <SeasonShelfContent
        connectionState="offline"
        entries={entries}
        homeHref="/today"
        ledIds={[]}
        nextUp={communitySession.id}
      />,
    );

    expect(markup).toContain(
      `href="/field#session=${communitySession.id}&amp;view=run&amp;home=today"`,
    );
  });

  it("keeps the normal lesson planning route while online", () => {
    const markup = renderToStaticMarkup(
      <SeasonShelfContent
        connectionState="online"
        entries={entries}
        ledIds={[]}
        nextUp={communitySession.id}
      />,
    );

    expect(markup).toContain(
      `href="/session?session=${communitySession.id}"`,
    );
    expect(markup).not.toContain("Saved lessons open here");
  });

  it("makes a momentary signal loss understandable while it checks", () => {
    const markup = renderToStaticMarkup(
      <SeasonShelfContent
        connectionState="checking"
        entries={entries}
        ledIds={[]}
        nextUp={communitySession.id}
      />,
    );

    expect(markup).toContain("Signal lost. Checking saved lessons…");
  });
});
