import { describe, expect, it } from "vitest";
import { setupProgress, type SetupInput } from "@/lib/setup-progress";

/**
 * THE OPTIONAL WORK AFTER FIRST RUN SAYS ONLY WHAT IS STORED (#878).
 *
 * The first cut of the post-signup list marked the class "ready" with a
 * hard-coded tick, whatever the row held. A legacy class with no
 * coordinates, which is exactly the class the cohort reviewer was holding
 * when he hit "Set the location", would have been told it had a location.
 * This pins the reading to the data.
 */

const lean: SetupInput = {
  classId: "cls_1",
  name: "Willow class",
  yearGroup: "Year 1",
  lat: 51.507,
  lng: -0.128,
  habitats: [],
  siteFeatures: [],
  reach: null,
};

describe("a class straight out of the two-question first run", () => {
  const progress = setupProgress(lean);
  const byId = Object.fromEntries(progress.tasks.map((t) => [t.id, t]));

  it("has its location and class done, and the grounds work open", () => {
    expect(byId.location?.state).toBe("done");
    expect(byId.class?.state).toBe("done");
    expect(byId.grounds?.state).toBe("open");
    expect(byId.reach?.state).toBe("open");
    expect(progress.done).toBe(2);
    expect(progress.open).toBe(2);
    expect(progress.complete).toBe(false);
  });

  it("lists the required things first and the optional things after", () => {
    expect(progress.tasks.map((t) => t.id)).toEqual(["location", "class", "grounds", "reach"]);
  });

  it("sends the optional work to Grounds for that class, never back to /start", () => {
    expect(byId.grounds?.href).toBe("/world?classId=cls_1");
    expect(byId.reach?.href).toBe("/world?classId=cls_1");
    for (const task of progress.tasks) expect(task.href).not.toContain("/start");
  });
});

describe("a legacy class with no coordinates", () => {
  const progress = setupProgress({ ...lean, lat: null, lng: null });
  const location = progress.tasks.find((t) => t.id === "location");

  it("is told plainly that it has no location and reads a sample patch", () => {
    expect(location?.state).toBe("open");
    expect(location?.status).toContain("sample patch");
  });

  it("never claims a location it does not hold", () => {
    expect(progress.tasks.filter((t) => t.state === "done").map((t) => t.id)).toEqual(["class"]);
  });
});

describe("grounds count as mapped from either half of the world", () => {
  it("from the ticked grounds", () => {
    const p = setupProgress({ ...lean, habitats: ["trees", "pond"] });
    expect(p.tasks.find((t) => t.id === "grounds")?.state).toBe("done");
    expect(p.tasks.find((t) => t.id === "grounds")?.status).toContain("2 things");
  });

  it("from the features she named, on their own", () => {
    const p = setupProgress({ ...lean, siteFeatures: ["log pile"] });
    expect(p.tasks.find((t) => t.id === "grounds")?.state).toBe("done");
    expect(p.tasks.find((t) => t.id === "grounds")?.status).toContain("1 thing ");
  });

  it("not from a blank reach", () => {
    const p = setupProgress({ ...lean, reach: "   " });
    expect(p.tasks.find((t) => t.id === "reach")?.state).toBe("open");
  });

  it("everything set reads complete", () => {
    const p = setupProgress({
      ...lean,
      habitats: ["meadow"],
      reach: "Our own grounds",
    });
    expect(p.complete).toBe(true);
    expect(p.tasks.find((t) => t.id === "reach")?.status).toBe("Our own grounds.");
  });
});

describe("the register", () => {
  const p = setupProgress(lean);

  it("has no photo task, because a photo is never stored", () => {
    expect(p.tasks.map((t) => t.id)).not.toContain("photo");
    for (const task of p.tasks) expect(task.title.toLowerCase()).not.toContain("photo");
  });

  it("promises nothing it cannot name a seam for, and prints no em dash or badge", () => {
    for (const task of p.tasks) {
      expect(task.improves.length).toBeGreaterThan(20);
      for (const text of [task.title, task.status, task.improves]) {
        expect(text).not.toContain("—");
        expect(text.toLowerCase()).not.toMatch(/badge|expert|level up|points/);
      }
      // Sentence case: the title opens with one capital and is not shouted.
      expect(task.title).not.toMatch(/[A-Z]{3,}/);
    }
  });
});
