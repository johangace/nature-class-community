import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/field",
  useSearchParams: () => new URLSearchParams(),
}));
import { DepartureCheck } from "@/app/field/DepartureCheck";
import {
  FieldShell,
  fieldNavigation,
  fieldShellHome,
} from "@/app/field/FieldShell";
import type { CoreLessonReleaseV1 } from "@/lib/offline/contracts";
import { fieldHomeHref } from "@/lib/offline/field-location";
import { deriveOfflineReadiness } from "@/lib/offline/readiness";
import { findSession } from "@/lib/pack";

function releaseFixture(): CoreLessonReleaseV1 {
  const first = findSession("summer-w1-counting-life")?.session;
  const second = findSession("summer-w2-minibeast-hunting")?.session;
  if (!first || !second) throw new Error("offline fixture sessions are missing");

  return {
    version: 1,
    releaseKind: "open-core",
    contentFingerprint: "fixture-core",
    generatedAt: "2026-08-29T07:00:00.000Z",
    shelf: [
      {
        packId: "summer",
        packTitle: "Summer term",
        subject: "Nature",
        ageBand: "4-6",
        season: "summer",
        sessionIds: [first.id],
      },
    ],
    sessions: { [first.id]: first, [second.id]: second },
    retiredSessionIds: {},
    universalSafety: [],
  };
}

describe("the offline departure check", () => {
  it("places the class observation before any old conditions receipt", () => {
    const readiness = deriveOfflineReadiness({
      isOnline: false,
      basicStatus: "ready",
      preparationStatus: "ready",
      conditionsCapturedAt: "2026-08-29T08:12:00.000Z",
      conditionsSummary: "18 degrees, a light breeze",
      now: new Date("2026-08-29T12:00:00.000Z"),
      timeZone: "UTC",
    });
    const markup = renderToStaticMarkup(
      <DepartureCheck preparedEnabled readiness={readiness} />,
    );

    expect(markup).toContain("Basic lesson ready");
    expect(markup).toContain("Field version ready");
    expect(markup).toContain("Checked at 08:12");
    expect(markup).toContain("18 degrees, a light breeze");
    expect(markup.indexOf("Look at the sky")).toBeLessThan(markup.indexOf("Checked at 08:12"));
  });

  it("keeps the fallback to a small released-lesson chooser", () => {
    const release = releaseFixture();
    const markup = renderToStaticMarkup(
      <FieldShell initialRelease={release} />
    );

    expect(markup).toContain("Counting life");
    expect(markup).not.toContain("Tree bark rubbings");
    expect(markup).toContain("Choose a lesson");
    expect(markup).toContain("Basic lesson, safety, teaching steps and print.");
    expect(markup).toContain("Back to Nature Class");
    expect(markup).toContain('href="/"');
    expect(markup).not.toContain("Departure check");
    expect(markup).not.toContain("Open-core shelf");
    expect(markup).not.toContain("Your lesson does not disappear outside");
  });

  it("returns a public field lesson to the landing when signal is available", () => {
    expect(fieldNavigation("summer-w1-counting-life", "online").exit).toBe("/");
    expect(fieldNavigation("summer-w1-counting-life", "restored").exit).toBe("/");
  });

  it("preserves a teacher's Today return through online and offline field exits", () => {
    expect(fieldHomeHref(null, "/today")).toBe("/today");
    expect(fieldHomeHref(null, "/field")).toBe("/");

    expect(fieldNavigation("summer-w1-counting-life", "online", "/today").exit).toBe(
      "/today",
    );
    expect(fieldNavigation("summer-w1-counting-life", "restored", "/today").exit).toBe(
      "/today",
    );
    expect(fieldNavigation("summer-w1-counting-life", "offline", "/today").exit).toBe(
      "/field#home=today",
    );

    const markup = renderToStaticMarkup(
      <FieldShell initialRelease={releaseFixture()} initialHomeHref="/today" />,
    );
    expect(markup).toContain('href="/today"');
    expect(markup).toContain('href="/field#home=today"');
    expect(markup).toContain("Back to today");

    expect(fieldShellHome("/today", "offline")).toEqual({
      href: "/field#home=today",
      label: "Back to saved lessons",
    });
    expect(fieldShellHome("/today", "checking")).toEqual({
      href: "/field#home=today",
      label: "Back to saved lessons",
    });
    expect(fieldShellHome("/today", "restored")).toEqual({
      href: "/today",
      label: "Back to today",
    });
  });

  it("returns a finished field lesson to the saved chooser while offline", () => {
    expect(fieldNavigation("summer-w1-counting-life", "checking").exit).toBe("/field");
    expect(fieldNavigation("summer-w1-counting-life", "offline").exit).toBe("/field");
  });

  it("opens a selected offline lesson directly, without an offline hub in between", () => {
    const markup = renderToStaticMarkup(
      <FieldShell
        initialRelease={releaseFixture()}
        initialSessionId="summer-w1-counting-life"
      />,
    );

    expect(markup).toContain("Counting life");
    expect(markup).toContain("Introduce today");
    expect(markup).not.toContain("Your lesson does not disappear outside");
    expect(markup).not.toContain("Departure check");
    expect(markup).not.toContain("Open-core shelf");
  });

  it("never substitutes the first lesson for an unknown offline address", () => {
    const markup = renderToStaticMarkup(
      <FieldShell
        initialRelease={releaseFixture()}
        initialSessionId="missing-lesson"
        initialView="run"
      />,
    );

    expect(markup).toContain("This lesson is not available offline.");
    expect(markup).toContain('href="/field"');
    expect(markup).not.toContain("Counting life");
    expect(markup).not.toContain("Introduce today");

    const teacherMarkup = renderToStaticMarkup(
      <FieldShell
        initialHomeHref="/today"
        initialRelease={releaseFixture()}
        initialSessionId="missing-lesson"
        initialView="run"
      />,
    );
    expect(teacherMarkup.match(/href="\/field#home=today"/g)).toHaveLength(2);
  });

  it("keeps the private preparation layer out of the basic chooser", () => {
    const markup = renderToStaticMarkup(
      <FieldShell initialRelease={releaseFixture()} preparedEnabled />,
    );

    expect(markup).not.toContain("Prepare field version");
    expect(markup).not.toContain("Save details");
    expect(markup).not.toContain("Field version");
  });

  it("names every Wi-Fi-only boundary and the exact prepared payload in teacher language", () => {
    const readiness = deriveOfflineReadiness({
      isOnline: false,
      preparationStatus: "not-prepared",
    });
    const markup = renderToStaticMarkup(
      <DepartureCheck preparedEnabled readiness={readiness} />,
    );

    expect(markup).toContain("What still needs Wi-Fi");
    expect(markup).toContain("selected lesson text");
    expect(markup).toContain("selected safety");
    expect(markup).toContain("spoken recordings when available");
    expect(markup).toContain("timestamped conditions receipt");
    expect(markup).toContain("class journal");
    expect(markup).toContain("does not save pictures or local species cards");
  });

  it("does not turn the fallback chooser into a separate lesson record", () => {
    const markup = renderToStaticMarkup(
      <FieldShell initialRelease={releaseFixture()} />,
    );

    expect(markup).not.toContain("Lesson record on this device");
    expect(markup).not.toContain("Mark taught on this device");
  });
});
