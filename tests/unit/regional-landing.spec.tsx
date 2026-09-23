import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { Landing } from "@/app/welcome/Landing";
import { landingMetadata } from "@/app/welcome/landing-metadata";
import { preferredLocale } from "@/lib/locale-policy";
import { localeHref, VISITOR_LOCALE_COOKIE } from "@/lib/locale-links";
import { middleware } from "@/middleware";
import { landingScriptPhase } from "@/app/welcome/landing-lesson";

const london = { lat: 51.5, lng: -0.1 };
const berkeley = { lat: 37.87, lng: -122.27 };

describe("language follows the school after the first visit", () => {
  it("uses the browser before a place or edition is selected", () => {
    expect(preferredLocale({ language: "en-US,en;q=0.9" })).toBe("us");
    expect(preferredLocale({ language: "en-GB" })).toBe("uk");
  });
  it("remembers the visitor edition but lets the school location win", () => {
    expect(preferredLocale({ visitor: "us", language: "en-GB" })).toBe("us");
    expect(preferredLocale({ visitor: "us", location: london })).toBe("uk");
    expect(preferredLocale({ visitor: "uk", location: berkeley })).toBe("us");
    expect(preferredLocale({ explicit: "us", location: london })).toBe("us");
    expect(preferredLocale({ explicit: "invalid", visitor: "invalid", location: london })).toBe("uk");
  });
  it("carries language without losing lesson identity or anchors", () => {
    expect(localeHref("/run?session=summer-w1&at=settle#lesson", "us"))
      .toBe("/run?session=summer-w1&at=settle&locale=us#lesson");
  });
});

describe("the two public editions", () => {
  it("renders US school language and lesson wording without rewriting a quote or moving London", () => {
    const original = JSON.stringify(landingScriptPhase);
    const markup = renderToStaticMarkup(<Landing locale="us" />);
    const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(markup).toContain('lang="en-US"');
    expect(text).toContain("For schools");
    expect(text).toContain("schoolyard");
    expect(text).toContain("Fall");
    expect(text).toContain("Bring your program in.");
    expect(text).not.toMatch(/\b(grounds|headteachers|governors|programme|programmes|kinaesthetic|A4|minibeasts)\b/);
    expect(text).toContain("An example day in London");
    expect(markup).toContain('href="/start?locale=us"');
    expect(markup.match(/href="\/season\?locale=us"/g)).toHaveLength(4);
    expect(markup).not.toContain('href="/season"');
    expect(markup).toContain('&amp;at=settle&amp;locale=us');
    expect(JSON.stringify(landingScriptPhase)).toBe(original);
  });
  it("retains the UK copy and makes both editions accessible", () => {
    const markup = renderToStaticMarkup(<Landing locale="uk" />);
    expect(markup).toContain("For schools");
    expect(markup).toContain("Bring your programme in.");
    const ukLink = markup.match(/<a[^>]*aria-label="English \(UK\)"[^>]*>/)?.[0];
    expect(ukLink).toBeDefined();
    for (const attribute of ['href="/uk"', 'lang="en-GB"', 'hrefLang="en-GB"', 'aria-current="page"']) expect(ukLink).toContain(attribute);
    expect(markup).toContain('href="/us"');
  });
  it("publishes stable regional canonicals and reciprocal language alternatives", () => {
    for (const locale of ["us", "uk"] as const) {
      const metadata = landingMetadata(locale);
      expect(metadata.alternates?.canonical).toBe(`https://natureclass.education/${locale}`);
      expect(metadata.alternates?.languages).toEqual({
        "en-US": "https://natureclass.education/us", "en-GB": "https://natureclass.education/uk",
        "x-default": "https://natureclass.education/",
      });
    }
  });
});

describe("edition continuity through sign-in and navigation", () => {
  it("remembers an actual visit using a first-party, HTTP-only cookie", () => {
    const response = middleware(new NextRequest("https://natureclass.education/us"));
    expect(response.cookies.get(VISITOR_LOCALE_COOKIE)?.value).toBe("us");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("does not change preferences when Next prefetches the other edition", () => {
    const response = middleware(new NextRequest("https://natureclass.education/uk", { headers: { "next-router-prefetch": "1" } }));
    expect(response.cookies.get(VISITOR_LOCALE_COOKIE)).toBeUndefined();
  });
});

it("shows accessible flags only while keeping automatic onward links", () => {
  const html = renderToStaticMarkup(<Landing locale="us" automatic />);
  expect(html).not.toContain('>Auto');
  expect(html).toContain('aria-label="English (US)"');
  expect(html).toContain('aria-hidden="true">🇺🇸</span>');
  expect(html).toContain('aria-hidden="true">🇬🇧</span>');
  expect(html).toContain('href="/start"');
  expect(html).not.toContain('locale=us');
  expect(localeHref("/run?session=leaf&locale=uk#lesson", "us", true)).toBe("/run?session=leaf#lesson");
});
it("clears the manual edition on Auto, but never on prefetch", () => {
  const url = "https://natureclass.education/?locale=auto";
  expect(middleware(new NextRequest(url)).headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
  expect(middleware(new NextRequest(url, { headers: { purpose: "prefetch" } })).headers.get("set-cookie")).toBeNull();
});
