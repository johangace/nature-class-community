import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveDoor } from "@/lib/lesson/door";
import type { CastMember } from "@/lib/cast/member";

/**
 * THE COUNT FOLLOWS THE MOMENT, AND THE ACTION STAYS REACHABLE (#1079).
 *
 * `MAX_SPECIMENS = 3` was a relevance cap standing on a layout measurement,
 * and the measurement (#350) is about cards SHRINKING — three across a 375px
 * phone gives each 98px, under the floor a child can use. Wrapping shrinks
 * nothing; it adds rows. So the number follows what the moment asks a child
 * to do, which is the distinction #1078 gave the runner a word for.
 */

const member = (over: Partial<CastMember>): CastMember =>
  ({
    commonName: "Buff-tailed Bumblebee",
    scientificName: "Bombus terrestris",
    photoUrl: "https://inat.example/bee.jpg",
    photoRole: "observation",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
    ...over,
  }) as CastMember;

/** Ten distinct creatures, more than either bound, so both can be measured. */
const members = Array.from({ length: 10 }, (_, index) =>
  member({
    commonName: `Creature ${index}`,
    scientificName: `Genus species${index}`,
    sortRank: index,
  })
);

const specimens = (purpose?: "glance" | "choose") => {
  const evidence = resolveDoor({ members, located: true, purpose });
  return evidence.kind === "none" ? [] : evidence.specimens;
};

describe("how many creatures a moment shows", () => {
  it("sends three to a glance, which is the shipped row", () => {
    expect(specimens().length).toBe(3);
    expect(specimens("glance").length).toBe(3);
  });

  it("fills the board when a child is going to walk up and tap one", () => {
    expect(specimens("choose").length).toBe(8);
  });

  it("still shows what there is when there is less than the bound", () => {
    const thin = resolveDoor({ members: members.slice(0, 2), located: true, purpose: "choose" });
    expect(thin.kind === "none" ? 0 : thin.specimens.length).toBe(2);
  });

  it("never repeats a creature to reach the number", () => {
    const names = specimens("choose").map((entry) => entry.member.commonName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the board's layout", () => {
  const css = readFileSync(new URL("../../app/run/journey.module.css", import.meta.url), "utf8");

  it("wraps rather than pinning three columns, so an eighth card has somewhere to go", () => {
    // A wrapping flex row since 2026-09-08 (a grid's empty tracks left a
    // short row hanging off the left of a centred slide); the property that
    // matters is that it wraps and never caps.
    expect(css).toMatch(/\.journey\[data-display="board"\] \.slotRow \{[^}]*flex-wrap: wrap/s);
    expect(css).toMatch(/\.journey\[data-display="board"\] \.slotRow \{[^}]*justify-content: center/s);
    expect(css).not.toMatch(
      /\.journey\[data-display="board"\] \.slotRow \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s
    );
  });

  it("holds every card above the floor a child can use", () => {
    const rule = css.match(
      /\.journey\[data-display="board"\] \.slotRow > \.slotItem \{[^}]*min-width: (\d+(?:\.\d+)?)rem/s
    );
    expect(rule).toBeTruthy();
    // #350's floor is 155px; 14rem is 224px at the default root size.
    expect(Number(rule![1]) * 16).toBeGreaterThanOrEqual(155);
  });
});

describe("the runner's footer", () => {
  const css = readFileSync(new URL("../../app/run/journey.module.css", import.meta.url), "utf8");

  it("stays put on a screen taller than the viewport", () => {
    expect(css).toMatch(/\.foot \{[^}]*position: sticky/s);
    expect(css).toMatch(/\.foot \{[^}]*bottom: 0/s);
    // The body scrolls underneath it, so it cannot be transparent.
    expect(css).toMatch(/\.foot \{[^}]*background: var\(--paper\)/s);
  });

  it("shows the fade only when something is actually below it", () => {
    expect(css).toContain('.journey[data-more="true"] .foot::before');
    // Never unconditionally: a gradient on a screen with nothing under it
    // reads as a rendering fault, which is the whole reason for the boolean.
    expect(css).not.toMatch(/^\.foot::before/m);
  });
});
