import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonPackSection } from "@/app/season/SeasonPackSection";
import { loadPack } from "@/lib/pack";
import { shelfSessionView } from "@/app/season/shelf-view";

describe("the Season shelf's product boundary", () => {
  it("shows every Premium lesson by name without presenting it as included", () => {
    const pack = loadPack("autumn-garden");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="premium"
        led={new Set()}
        nextUp={null}
      />
    );

    expect(html).toContain("Premium");
    expect(html).toContain("Plant environment");
    for (const session of pack.sessions) expect(html).toContain(session.title);
    expect(html).not.toContain("/session?session=garden-w1-autumn-detectives");
  });

  it("keeps Community lessons usable from the same shelf", () => {
    const pack = loadPack("autumn-starter");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="community"
        led={new Set()}
        nextUp={pack.sessions[0]?.id ?? null}
      />
    );

    expect(html).toContain(
      `/session?session=${pack.sessions[0]?.id}`
    );
    expect(html).toContain("next up");
    expect(html).toContain("shelf-card next-up");
    expect(html).toContain("shelf-action-play");
    expect(html).not.toContain("shelf-collection");
  });

  it("opens exactly one signed-out lesson and presents the rest as sign-in doors", () => {
    const pack = loadPack("autumn-starter");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="community"
        led={new Set()}
        nextUp={pack.sessions[0]?.id ?? null}
        openOnly={pack.sessions[0]?.id ?? null}
      />
    );

    expect(html).toContain("shelf-action-play");
    expect(html).toContain("shelf-action-lock");
    expect(html).toContain("shelf-card-locked");
    expect(html).toContain("sign in to open");
    expect(html.match(/\/session\?session=/g)).toHaveLength(1);
    expect(html.match(/href="\/sign-in"/g)).toHaveLength(
      pack.sessions.length - 1
    );
  });
});

describe("a season that has not come round yet", () => {
  it("lists its sessions by title with the month it unlocks, and nothing to press", () => {
    const pack = loadPack("winter-starter");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={pack}
        tier="community"
        led={new Set()}
        nextUp={null}
        open={false}
        opensIn="December"
      />
    );

    expect(html).toContain("shelf-season-locked");
    expect(html).toMatch(/<details class="shelf shelf-season-locked"><summary/);
    expect(html).toContain("Unlocks December");
    for (const session of pack.sessions) expect(html).toContain(session.title);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("shelf-action-play");
  });
});

describe("the labels a session earns", () => {
  it("shows one or two subject labels as small pills, sentence case", () => {
    const pack = loadPack("autumn-starter");
    const recycling = pack.sessions.find((s) => s.id === "nature-recycling-system")!;
    expect(recycling.labels).toEqual(["sustainability", "science"]);
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={{ ...pack, sessions: [recycling] }}
        tier="community"
        led={new Set()}
        nextUp={null}
      />
    );
    expect(html).toContain('<span class="shelf-label">Sustainability</span>');
    expect(html).toContain('<span class="shelf-label">Science</span>');
  });

  it("every session on the shelf carries at least one label, and never more than two", async () => {
    const { shelfPacksAllSeasons } = await import("@/lib/pack");
    for (const shelfPack of shelfPacksAllSeasons({ date: new Date(2026, 8, 17), lat: 51.5 })) {
      for (const session of shelfPack.sessions) {
        expect(session.labels, session.id).toBeDefined();
        expect(session.labels!.length, session.id).toBeGreaterThanOrEqual(1);
        expect(session.labels!.length, session.id).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("planned titles on a locked season (2026-09-07)", () => {
  it("lists the titles still to be written after the sessions, numbered on, with no minutes", () => {
    const pack = loadPack("winter-starter");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={{ id: pack.id, title: pack.title, sessions: pack.sessions.map(shelfSessionView) }}
        tier="community"
        led={new Set()}
        nextUp={null}
        open={false}
        opensIn="December"
        planned={["Winter survival sort"]}
      />
    );
    expect(html).toContain("Winter survival sort");
    expect(html).toContain("shelf-card-planned");
    expect(html).toContain(`Session ${pack.sessions.length + 1}`);
    expect(html).toContain(`${pack.sessions.length + 1} sessions`);
    // A title is a promise, not a lesson: nothing to press, no minutes.
    expect(html).not.toMatch(/shelf-card-planned[\s\S]*?shelf-mins/);
  });

  it("is ignored on an open season", () => {
    const pack = loadPack("winter-starter");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={{ id: pack.id, title: pack.title, sessions: pack.sessions.map(shelfSessionView) }}
        tier="community"
        led={new Set()}
        nextUp={null}
        planned={["A lesson still to write"]}
      />
    );
    expect(html).not.toContain("A lesson still to write");
  });
});
