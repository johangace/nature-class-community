import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupTasks } from "@/app/SetupTasks";
import { setupProgress, type SetupInput } from "@/lib/setup-progress";

/**
 * A SLEEPING COMPONENT NEEDS ITS TESTS AWAKE (#937).
 *
 * #918 took this list off Today and left it whole and unrendered so that #916
 * could consume it in one line rather than rebuild it. `git grep SetupTasks`
 * over `app` and `lib` returns one hit: the export in its own file. Nothing
 * renders it.
 *
 * That is the hazard this file exists to cover. While the component is mounted
 * nowhere, no page, screenshot or e2e run can show its styling, its heading or
 * its filter rotting — the first person to see a fault will be whoever mounts
 * it. Which already happened once: `d516005` unmounted the component and, in
 * the same diff, deleted `.setupHeading` from `today.module.css` while leaving
 * the JSX still asking for it, so it went to sleep carrying a class that no
 * longer exists (#937). These tests are the only thing between that and #916
 * inheriting a spacing bug in code it did not write.
 *
 * So the pins are:
 *
 *   1. THE STYLING, checked against the stylesheet. Every `styles.x` the
 *      component reaches for still resolves to a rule in `today.module.css`.
 *      This is the one that was red, and it is the reason for #937.
 *   2. THE FILTER, computed from the model rather than from a sample string:
 *      every done task's status line is absent, every open one present, and
 *      the row count equals `progress.open`. This behaviour is already correct
 *      and shipped with #918; the pin is new, because a test that names one
 *      done line by hand passes a component that leaks the other three.
 */

const base = {
  classId: "class-1",
  name: "Willow class",
  yearGroup: "Year 2",
  lat: 51.5,
  lng: -0.1,
  habitats: [] as string[],
  siteFeatures: [] as string[],
  reach: null,
};

describe("the optional setup list", () => {
  it("lists only the open Grounds work, with durable links, and no ticks", () => {
    const html = renderToStaticMarkup(<SetupTasks {...base} />);

    expect(html).toContain("Still to add");
    expect(html).toContain("Describe the place");
    expect(html).toContain("How far the class can go");
    expect(html).toContain('href="/world?classId=class-1"');
    // Recorded details are visible on their own pages; a ticked line here
    // would restate them (Johan, 2026-09-02: once checked they disappear).
    expect(html).not.toContain("Willow class, Year 2.");
    expect(html).not.toContain("✓");
    expect(html).not.toContain("details ready");
    expect(html).not.toContain('href="/classes"');
  });

  it("lists the location when the class has none", () => {
    const html = renderToStaticMarkup(<SetupTasks {...base} lat={null} lng={null} />);
    expect(html).toContain("Location");
    expect(html).toContain('href="/classes"');
  });

  it("goes quiet when every detail has been recorded", () => {
    const html = renderToStaticMarkup(
      <SetupTasks
        {...base}
        habitats={["trees"]}
        siteFeatures={["log pile"]}
        reach="The school grounds"
      />
    );

    expect(html).toBe("");
  });

  it("renders one row per open task and not a word of a recorded one", () => {
    // Half recorded, half not: the case a real teacher is in for most of a
    // term, and the one a single hand-picked "not.toContain" misses.
    const partly: SetupInput = { ...base, habitats: ["trees"] };
    const html = renderToStaticMarkup(<SetupTasks {...partly} />);
    const progress = setupProgress(partly);

    const done = progress.tasks.filter((task) => task.state === "done");
    const open = progress.tasks.filter((task) => task.state === "open");
    expect(done.length).toBeGreaterThan(0);
    expect(open.length).toBeGreaterThan(0);

    for (const task of done) expect(html).not.toContain(task.status);
    for (const task of open) {
      expect(html).toContain(task.title);
      expect(html).toContain(task.status);
    }

    expect(html.split("<li").length - 1).toBe(progress.open);
  });

  it("asks the stylesheet for classes the stylesheet still has", () => {
    const source = readFileSync(new URL("../../app/SetupTasks.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../../app/today.module.css", import.meta.url), "utf8");

    // Comments are stripped before the lookup, so a class named only in prose
    // cannot stand in for a rule. Without this the pin is satisfiable by the
    // very sentence explaining the class's removal — the comment below
    // `.setupTasks` names `.setupHeading`, which would have kept this test
    // green with the deleted wrapper back in the JSX.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

    const wanted = [...source.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
    expect(wanted.length).toBeGreaterThan(0);

    const missing = wanted.filter(
      (name) => !new RegExp(`\\.${name}(?![\\w-])`).test(rules)
    );
    expect(missing).toEqual([]);
  });
});
