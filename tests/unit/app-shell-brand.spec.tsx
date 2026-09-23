import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/today"),
}));

import { AppNavClient as AppNav } from "@/app/AppNavClient";
import { StartFlow } from "@/app/start/StartFlow";

describe("the signed-in Nature Class mark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("puts the supplied seed lockup in the authenticated shell", () => {
    const markup = renderToStaticMarkup(<AppNav place={null} />);

    expect(markup).toContain('aria-label="Nature Class, back to today"');
    expect(markup).toContain('href="/today"');
    expect(markup).toContain('data-logo="nature-class"');
    expect(markup).toContain('class="wordmark-seed"');
    expect(markup.match(/class="wordmark-seed"/g)).toHaveLength(1);
  });

  it("includes Profile with the teaching destinations", () => {
    const markup = renderToStaticMarkup(<AppNav place={null} />);

    expect(markup).toContain('href="/account"');
    expect(markup).toContain(">Profile</span>");
    expect(markup).toContain(">Lessons</span>");
    expect(markup).not.toContain("app-shell-account");
  });

  it("aligns the shell mark with Today's content gutter", () => {
    const styles = readFileSync(
      new URL("../../app/today.module.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.today\s*>\s*:global\(\.app-shell-head\)\s*\{[^}]*padding:\s*0 var\(--gutter\)/s,
    );
  });

  it("uses the brand blue for the lockup and keeps the seed green", () => {
    const styles = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.wordmark\s*\{[^}]*color:\s*var\(--brand\)/s,
    );
    expect(styles).toMatch(
      /\.app-shell-brand\s*\{[^}]*padding-top:\s*1\.5rem;[^}]*color:\s*var\(--brand\)/s,
    );
    expect(styles).toMatch(
      /\.app-shell-brand\s+\.wordmark-first\s*\{[^}]*opacity:\s*1/s,
    );
    expect(styles).toMatch(
      /\.app-shell-brand\s+\.wordmark-seed\s*\{[^}]*color:\s*var\(--seed\)/s,
    );
  });

  it("uses the proper lockup on the first signed-in setup screen", () => {
    const markup = renderToStaticMarkup(
      <StartFlow
        shelf={{
          sessionCount: 4,
          firstTitle: "Counting life",
          packTitle: "Summer",
        }}
      />
    );

    expect(markup).toContain('class="wordmark start-brand"');
    expect(markup).toContain('data-logo="nature-class"');
    expect(markup).toContain('class="wordmark-seed"');
  });

  it("shows age ranges for every locale, independent of lesson ability", () => {
    const markup = renderToStaticMarkup(
      <StartFlow
        locale="us"
        shelf={{
          sessionCount: 4,
          firstTitle: "Bug hunting",
          packTitle: "Fall",
        }}
      />
    );

    expect(markup).toContain(">4–6<");
    expect(markup).toContain(">7–9<");
    expect(markup).toContain(">10–12<");
    expect(markup).toContain(">13+<");
    expect(markup).not.toContain(">Reception<");
    expect(markup).not.toMatch(/\bages?\s*\d/i);
  });

  it("keeps the standalone seed and its use direction with the product", () => {
    const seed = new URL("../../public/brand/nature-class-seed.svg", import.meta.url);
    const guide = new URL("../../public/brand/README.md", import.meta.url);

    expect(existsSync(seed)).toBe(true);
    expect(existsSync(guide)).toBe(true);
    expect(readFileSync(guide, "utf8")).toContain("<Wordmark seed />");
  });
});
