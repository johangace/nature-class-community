import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrimerPage } from "@/app/session/primer/PrimerPage";
import { localizeDeep } from "@/lib/localization";
import { sessionSchema } from "@/schema/pack";
import { groupStandardsCitations } from "@/lib/standards";
import type { LessonViewProps } from "@/app/session/PlanPageFrame";

/**
 * THE CITATION ON THE PAGE, not just in the pack (#464).
 *
 * The lesson of #350: a matcher's own tests all passed while the feature
 * reached nobody. The whole point of this field is that a teacher can PRINT
 * the reference and get her signoff, so the assertion that matters is about
 * the markup she receives — including that the quoted statutory wording
 * survives the US render intact, which is the failure mode a schema test
 * cannot see.
 */

const SUMMER = JSON.parse(readFileSync("packs/summer.json", "utf8"));

function primerHtml(sessionId: string, locale: "uk" | "us") {
  const raw = SUMMER.sessions.find((s: { id: string }) => s.id === sessionId);
  const session = localizeDeep(sessionSchema.parse(raw), locale);
  const props = {
    journey: {
      title: "Summer",
      objective: session.objective,
      route: [{ key: "one", title: "Go outside", durationMinutes: 5 }],
    },
    weekOf: "2026-06-01",
    session,
    activeClass: null,
    locale,
  } as unknown as LessonViewProps;
  return renderToStaticMarkup(<PrimerPage {...props} />);
}

describe("a teacher can read the citation before she teaches", () => {
  it("prints the statutory reference and its published wording", () => {
    const html = primerHtml("summer-w2-minibeast-hunting", "uk");

    expect(html).toContain("Curriculum links");
    expect(html).toContain("Year 2 · Living things and their habitats");
    expect(html).toContain(
      "identify and name a variety of plants and animals in their habitats, including microhabitats"
    );
  });

  it("prints the NGSS code for the US system too", () => {
    const html = primerHtml("summer-w2-minibeast-hunting", "uk");

    expect(html).toContain("2-LS4-1");
    expect(html).toContain("NGSS");
    expect(html).toContain(
      "Make observations of plants and animals to compare the diversity of life in different habitats."
    );
  });

  it("leaves the quoted English wording alone on a US render", () => {
    const html = primerHtml("summer-w2-minibeast-hunting", "us");

    // The lesson prose around it IS localized ("minibeasts" -> "bugs")...
    expect(html).toContain("bugs");
    expect(html).not.toContain("minibeasts");
    // ...and the citation is not.
    expect(html).toContain(
      "identify and name a variety of plants and animals in their habitats, including microhabitats"
    );
    expect(html).toContain("Year 2 · Living things and their habitats");
  });

  it("prints one heading for two objectives that share a subheading", () => {
    const html = primerHtml("summer-w2-minibeast-hunting", "uk");
    const headings = html.split("Year 2 · Living things and their habitats").length - 1;
    expect(headings).toBe(1);
  });

  it("says nothing at all when a session has no mapping yet", () => {
    const html = primerHtml("summer-w3-a5-leaf-collage", "uk");

    // Absent means absent: no empty heading, no "not yet mapped" placeholder.
    expect(html).not.toContain("Curriculum links");
    expect(html).not.toContain("primer-standards");
  });
});

/**
 * AND ON PAPER (#464). The primer is where she reads; the printable is what
 * leaves her hands and goes to a head. Asserted against the pack data rather
 * than by rendering the whole server component, which needs a database, a
 * teacher and a place context — the citation block's own inputs are the
 * session's `standards`, and this is the level at which the paper claim is
 * checkable without standing up all of that.
 */
describe("what the printable carries", () => {
  it("prints a session's citation on the sheet a head reads", () => {
    const raw = SUMMER.sessions.find(
      (s: { id: string }) => s.id === "summer-w2-minibeast-hunting"
    );
    const session = sessionSchema.parse(raw);
    const codes = session.standards.map((c) => c.code);

    expect(codes).toContain("Year 2 · Living things and their habitats");
    expect(codes).toContain("2-LS4-1");
  });

  it("groups repeated subheadings so a head reads one heading, not three", () => {
    const raw = SUMMER.sessions.find(
      (s: { id: string }) => s.id === "summer-w2-minibeast-hunting"
    );
    const session = sessionSchema.parse(raw);
    const england = session.standards.filter((c) => c.system === "england");

    // Two objectives, one subheading — the case the grouping exists for.
    expect(england.length).toBeGreaterThan(1);
    expect(new Set(england.map((c) => c.code)).size).toBe(1);
  });
});

/**
 * ONE GROUPING, TWO SURFACES (#464).
 *
 * The primer and the printable shipped with the same reduce written out in
 * both. That is the drift the one-component rule exists to stop, and a
 * citation is a stronger case than a spoken line: these two surfaces are the
 * screen a teacher reads and the paper she hands to a head, and they must not
 * disagree about what a session covers.
 */
describe("the primer and the printable group citations identically", () => {
  it("is one function, not two copies", () => {
    const primer = readFileSync("app/session/primer/PrimerPage.tsx", "utf8");
    const print = readFileSync("app/print/page.tsx", "utf8");

    expect(primer).toContain("groupStandardsCitations");
    expect(print).toContain("groupStandardsCitations");
    // Neither surface may grow its own copy back.
    expect(primer).not.toContain(".reduce<");
    expect(print).not.toContain(".reduce<");
  });

  it("collapses two objectives under one England subheading", () => {
    const raw = SUMMER.sessions.find(
      (s: { id: string }) => s.id === "summer-w2-minibeast-hunting"
    );
    const grouped = groupStandardsCitations(sessionSchema.parse(raw).standards);

    const england = grouped.filter((g) => g.system === "england");
    expect(england).toHaveLength(1);
    expect(england[0]?.texts.length).toBeGreaterThan(1);
    // and NGSS stays its own heading
    expect(grouped.filter((g) => g.system === "ngss")).toHaveLength(1);
  });

  it("keeps the authored order, because that order is a content decision", () => {
    const raw = SUMMER.sessions.find(
      (s: { id: string }) => s.id === "summer-w2-minibeast-hunting"
    );
    const session = sessionSchema.parse(raw);
    const grouped = groupStandardsCitations(session.standards);
    const authored = session.standards
      .filter((s) => s.system === "england")
      .map((s) => s.text);

    expect(grouped.find((g) => g.system === "england")?.texts).toEqual(authored);
  });
});
