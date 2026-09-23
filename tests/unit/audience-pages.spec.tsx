import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AudiencePage } from "@/app/audiences/AudiencePage";
import { Landing } from "@/app/welcome/Landing";
import sitemap from "@/app/sitemap";
import { NatureParkPackage } from "@/app/audiences/NatureParkPackage";
import { ChildrenPage } from "@/app/audiences/ChildrenPage";

describe("public audience journeys", () => {
  it("gives children's work its own page with every story, teacher voice and the long outcome", () => {
    const uk = renderToStaticMarkup(<ChildrenPage locale="uk" />);
    const body = uk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // The page names the section once, in its own h1.
    expect(uk).toMatch(/<h1 id="children-title">What children learn by <span>doing\.<\/span><\/h1>/);
    expect(uk.match(/What children learn by/g)).toHaveLength(1);
    for (const [subject, title] of [
      ["Plant life cycles", "Grow, watch and harvest."],
      ["Sustainability", "Reuse what we have."],
      ["Art and making", "Paint, build and make music."],
    ]) {
      expect(body).toContain(subject);
      expect(body).toContain(title);
    }
    expect(uk.match(/<blockquote>/g)).toHaveLength(3);
    expect(uk.match(/aria-label="Subjects"/g)).toHaveLength(3);
    expect(body).toContain("‘meeting the trees’");
    expect(body).toContain("Primary school teacher, Buxton School, London");
    expect(body).toContain("Every child becomes a guardian of our earth.");
    expect(uk).toMatch(/<a(?=[^>]*href="\/children\?locale=uk")(?=[^>]*aria-current="page")[^>]*>Children<\/a>/);
    expect(uk).toContain('href="/season?locale=uk"');
    expect(uk).not.toContain("—");
    const us = renderToStaticMarkup(<ChildrenPage locale="us" />);
    // Teacher quotes are never rewritten into US spelling.
    expect(us).toContain("The class were hugely excited");
    expect(us).toContain('lang="en-US"');
    expect(sitemap().map(({ url }) => url)).toContain("https://natureclass.education/children");
  });
  it("offers the Nature Park package to schools in England without claiming the grant buys lessons", () => {
    const uk = renderToStaticMarkup(<AudiencePage audience="schools" locale="uk" />);
    const us = renderToStaticMarkup(<AudiencePage audience="schools" locale="us" />);
    expect(uk).toContain('href="/schools/nature-park?locale=uk"');
    expect(uk).toContain("Up to £5,000 for your grounds.");
    expect(uk).toContain("Put your school grounds at the heart of your Climate Action Plan.");
    expect(uk.indexOf("school-climate")).toBeLessThan(uk.indexOf("school-funding"));
    expect(us).not.toContain("Climate Action Plan");
    expect(us).not.toContain("nature-park");
    expect(us).not.toContain("£");
    expect(us).not.toContain("Department for Education");
    // The US edition gets its own frameworks and funding, with no invented dollar figure.
    expect(us).toContain("Put your schoolyard at the heart of your sustainability plan.");
    expect(us).toContain('href="https://www.nwf.org/Eco-Schools-US"');
    expect(us).toContain("Green Ribbon Schools");
    expect(us).toContain("Grants for your schoolyard.");
    expect(us).toContain("mailto:hi@natureclass.education?subject=Schoolyard%20grants");
    expect(us).not.toMatch(/\$\s?\d/);
    expect(us.indexOf("school-climate")).toBeLessThan(us.indexOf("school-funding"));
    expect(uk).not.toContain("Eco-Schools USA");

    const page = renderToStaticMarkup(<NatureParkPackage locale="uk" />);
    expect(page).toContain("Selected schools in England");
    expect(page).toContain("Department for Education selects eligible schools");
    // The grant is for the grounds; the lessons are free and never framed as bought with it.
    expect(page).toContain("The grant is for grounds improvements, equipment and specialist support. Nature Class lessons are free for teachers.");
    expect(page).not.toMatch(/£5,000 into/);
    expect(uk).toContain("selected by the Department for Education");
    expect(page).toContain("gov.uk/government/publications/national-education-nature-park-grant-funding");
    for (const stage of ["Plan", "Improve", "Learn all year"]) expect(page).toContain(`<h3>${stage}</h3>`);
    expect(page).toContain("mailto:hi@natureclass.education?subject=Nature%20Park%20package");
    expect(page).not.toMatch(/grant (pays|covers) for (nature class|lessons)/i);
    expect(page).not.toContain("—");
    expect(sitemap().map(({ url }) => url)).toContain("https://natureclass.education/schools/nature-park");
  });
  it("uses the same page navigation on all public pages without section anchors", () => {
    const pages = [<Landing locale="uk" />, <AudiencePage audience="schools" locale="uk" />, <AudiencePage audience="parents" locale="uk" />];
    for (const page of pages) {
      const html = renderToStaticMarkup(page);
      const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
      expect(header).toContain('aria-label="Main navigation"');
      for (const path of ["schools", "parents", "children", "season"]) expect(header).toContain(`href="/${path}?locale=uk"`);
      expect(header).not.toContain('href="#');
      expect(header).not.toContain("On this page");
    }
  });
  it("keeps regional education claims in the relevant edition", () => {
    const uk = renderToStaticMarkup(<AudiencePage audience="schools" locale="uk" />);
    const us = renderToStaticMarkup(<AudiencePage audience="schools" locale="us" />);
    expect(uk).toContain("For schools in England");
    expect(uk).toContain("For headteachers and school leaders");
    expect(uk).toContain("Ofsted");
    expect(us).toContain("For principals and school leaders");
    expect(us).toContain("state’s standards");
    expect(us).not.toContain("Ofsted");
    expect(us).not.toContain("DfE");
    expect(us).toContain('href="/schools?locale=uk"');
    expect(us).toContain('href="/schools?locale=us"');
  });
  it("shows parents existing resources without inventing a family activity", () => {
    const html = renderToStaticMarkup(<AudiencePage audience="parents" locale="us" />);
    expect(html).not.toContain("leaf game");
    expect(html).toContain("Busy, no garden, not a nature expert? You can still start.");
    expect(html).toContain("homeschooling");
    expect(html.toLowerCase()).not.toContain("some activities need adapting");
    expect(html).toContain('href="/season?locale=us"');
    expect(html).not.toContain('href="/start');
  });
  it("preserves automatic locale on product links and makes pages discoverable in the footer", () => {
    const html = renderToStaticMarkup(<AudiencePage audience="schools" locale="us" automatic />);
    expect(html).toContain('href="/season"');
    const landing = renderToStaticMarkup(<Landing locale="us" />);
    const footer = landing.slice(landing.indexOf("<footer"));
    expect(footer).toContain('href="/schools?locale=us"');
    expect(footer).toContain('href="/parents?locale=us"');
    expect(sitemap().map(({ url }) => url)).toEqual(expect.arrayContaining(["https://natureclass.education/schools", "https://natureclass.education/parents"]));
  });
});
