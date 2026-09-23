import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrivacyPage } from "@/app/(legal)/privacy/PrivacyNotice";
import { TermsPage } from "@/app/(legal)/terms/TermsOfUse";
import { AudiencePage } from "@/app/audiences/AudiencePage";
import { Landing } from "@/app/welcome/Landing";
import sitemap from "@/app/sitemap";

describe("privacy and terms (#61)", () => {
  it("names the operator, what is stored, the services and deletion", () => {
    const html = renderToStaticMarkup(<PrivacyPage locale="uk" />);
    for (const text of ["run by Wyld Way Corp", "Children do not have accounts", "What we store", "PostHog", "Anthropic", "within one month", "mailto:hi@natureclass.education"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Johan Gace");
  });

  it("routes UK law to UK readers and keeps it off the US page", () => {
    const uk = renderToStaticMarkup(<PrivacyPage locale="uk" />);
    const us = renderToStaticMarkup(<PrivacyPage locale="us" />);
    expect(uk).toContain("ico.org.uk");
    expect(uk).toContain("year group");
    expect(us).not.toContain("ico.org.uk");
    expect(us).not.toContain("UK data protection");
    expect(us).toContain("grade");

    const ukTerms = renderToStaticMarkup(<TermsPage locale="uk" />);
    const usTerms = renderToStaticMarkup(<TermsPage locale="us" />);
    expect(ukTerms).toContain("England and Wales");
    expect(ukTerms).toContain("safeguarding");
    expect(usTerms).not.toContain("England and Wales");
    expect(usTerms).toContain("district");
    expect(usTerms).toContain('href="/privacy?locale=us"');
  });

  it("keeps the teacher in charge outside", () => {
    const html = renderToStaticMarkup(<TermsPage locale="uk" />);
    for (const text of ["You are in charge outside", "can be wrong", "run by Wyld Way Corp"]) expect(html).toContain(text);
  });

  it("is linked from the landing and audience footers with the reader's locale, and listed in the sitemap", () => {
    const landing = renderToStaticMarkup(<Landing locale="uk" />);
    const footer = landing.slice(landing.indexOf("<footer"));
    const audience = renderToStaticMarkup(<AudiencePage audience="schools" locale="uk" />);
    for (const html of [footer, audience]) {
      expect(html).toContain('href="/privacy?locale=uk"');
      expect(html).toContain('href="/terms?locale=uk"');
    }
    expect(sitemap().map(({ url }) => url)).toEqual(expect.arrayContaining(["https://natureclass.education/privacy", "https://natureclass.education/terms"]));
  });
});
