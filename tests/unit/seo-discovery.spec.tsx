import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { GET } from "../../app/llms.txt/route";
import { landingMetadata } from "../../app/welcome/landing-metadata";
import ResourcePage, { generateMetadata } from "../../app/resources/[slug]/page";
import { TEACHING_RESOURCES } from "../../lib/teaching-resources";
import { SITE_ORIGIN, jsonLd } from "../../lib/seo";
import { readFileSync } from "node:fs";

describe("public search discovery", () => {
  it("keeps public HTML and rendering assets crawlable under one shared bot policy", () => {
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/"] });
    expect(robots().sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
  });
  it("lists only public canonical pages, without fabricated freshness or query variants", () => {
    const rows = sitemap();
    // home, /uk, /us, schools, the Nature Park package, parents, children, resources, privacy, terms
    expect(rows).toHaveLength(10 + TEACHING_RESOURCES.length);
    expect(new Set(rows.map((row) => row.url)).size).toBe(rows.length);
    for (const row of rows) {
      expect(new URL(row.url).origin).toBe(SITE_ORIGIN);
      expect(new URL(row.url).search).toBe("");
      expect(row.lastModified).toBeUndefined();
      expect(row.url).not.toMatch(/\/(welcome|season|session|start|sign-in|api|classes|journal)(\/|$)/);
    }
    for (const row of rows.slice(0, 3)) expect(row.alternates?.languages).toEqual(landingMetadata().alternates?.languages);
  });
  it("gives regional pages reciprocal language links and indexable, descriptive metadata", () => {
    for (const locale of [undefined, "uk", "us"] as const) {
      const metadata = landingMetadata(locale);
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
      // The title names educators, not a school stage (Johan, 2026-09-15).
      expect(metadata.title).toBe("Outdoor lessons for educators | Nature Class");
      expect(metadata.alternates?.canonical).toBe(`${SITE_ORIGIN}${locale ? `/${locale}` : "/"}`);
      expect(metadata.openGraph).toMatchObject({ images: [{ width: 1200, height: 630 }] });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    }
  });
  it("defaults classroom screens to noindex and permanently redirects the landing alias", () => {
    const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
    expect(layout).toContain("robots: { index: false, follow: true }");
    const config = readFileSync(new URL("../../next.config.mjs", import.meta.url), "utf8");
    expect(config).toContain('{ source: "/welcome", destination: "/", permanent: true }');
  });
  it("escapes script-closing content in structured data", () => {
    const value = { name: "</script><script>alert(1)</script>" };
    expect(jsonLd(value)).not.toContain("<");
    expect(JSON.parse(jsonLd(value))).toEqual(value);
  });
  it("renders every resource and matching schema without a browser or teacher session", async () => {
    for (const resource of TEACHING_RESOURCES) {
      const params = Promise.resolve({ slug: resource.slug });
      const markup = renderToStaticMarkup(await ResourcePage({ params }));
      expect(markup).toContain("<h1");
      expect(markup).toContain(resource.sections[0]!.heading);
      expect(markup).toContain('href="/resources"');
      const schema = JSON.parse(markup.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!);
      expect(schema["@graph"][0].name).toBe(resource.title);
      expect(schema["@graph"][0].description).toBe(resource.description);
      const metadata = await generateMetadata({ params });
      expect(metadata.robots).toMatchObject({ index: true });
      expect(metadata.alternates?.canonical).toBe(schema["@graph"][0].url);
    }
  });
  it("keeps the optional agent index aligned with the public resource library", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    for (const resource of TEACHING_RESOURCES) expect(text).toContain(`${SITE_ORIGIN}/resources/${resource.slug}`);
    expect(text).not.toContain("/api/");
  });
});
