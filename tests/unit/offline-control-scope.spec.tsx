import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfflineLessonControl } from "@/app/run/OfflineLessonControl";

const css = readFileSync(
  new URL("../../app/run/journey.module.css", import.meta.url),
  "utf8",
);
const todaySource = readFileSync(
  new URL("../../app/today/page.tsx", import.meta.url),
  "utf8",
);
const entrySource = readFileSync(
  new URL("../../app/run/OfflineLessonEntry.tsx", import.meta.url),
  "utf8",
);

describe("the reusable offline lesson control", () => {
  it("owns the style variables its dialog needs outside the journey runner", () => {
    const start = css.indexOf(".offlineControlScope {");
    const rule = css.slice(start, css.indexOf("}", start));

    expect(start).toBeGreaterThan(-1);
    for (const variable of [
      "--space-1",
      "--space-2",
      "--space-3",
      "--space-4",
      "--edge",
      "--measure",
      "--tone-green-soft",
      "--card",
    ]) {
      expect(rule).toContain(variable);
    }
  });

  it("renders its saved-lesson action without a journey ancestor", () => {
    const markup = renderToStaticMarkup(
      <OfflineLessonControl
        connectionState="online"
        initialReadiness="ready"
        sessionId="summer-w1-counting-life"
      />,
    );

    expect(markup).toContain("offlineControlScope");
    expect(markup).toContain(">Go offline</button>");
    expect(markup).toContain("Go offline with this lesson");
    expect(markup).toContain("Open offline lesson");
    expect(markup).not.toContain("Available offline");
    expect(markup).toContain(
      'href="/field#session=summer-w1-counting-life&amp;view=run"',
    );
  });

  it("carries a teacher's Today return into the saved field address", () => {
    const markup = renderToStaticMarkup(
      <OfflineLessonControl
        connectionState="online"
        homeHref="/today"
        initialReadiness="ready"
        sessionId="summer-w1-counting-life"
      />,
    );

    expect(markup).toContain(
      'href="/field#session=summer-w1-counting-life&amp;view=run&amp;home=today"',
    );
  });

  it("keeps offline readiness in the session view after Today gains view and run actions", () => {
    expect(todaySource).not.toContain("<OfflineLessonEntry");
    const sessionSource = readFileSync(new URL("../../app/session/SessionModes.tsx", import.meta.url), "utf8");
    expect(sessionSource).toContain("<SessionOfflineControl");
    expect(entrySource).toMatch(/<OfflineLessonControl[\s\S]{0,180}homeHref=\{homeHref\}/);
  });

  it("explains what a lost signal means for this lesson", () => {
    const readyMarkup = renderToStaticMarkup(
      <OfflineLessonControl
        connectionState="offline"
        initialReadiness="ready"
        sessionId="summer-w1-counting-life"
      />,
    );
    const unavailableMarkup = renderToStaticMarkup(
      <OfflineLessonControl
        connectionState="offline"
        initialReadiness="unavailable"
        sessionId="summer-w1-counting-life"
      />,
    );

    expect(readyMarkup).toContain("Offline. Saved lesson ready.");
    expect(unavailableMarkup).toContain(
      "Offline. Reconnect to save this lesson.",
    );
  });
});
