// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { LessonPictures } from "@/app/run/LessonPictures";
import type { LessonPictures as PictureSet } from "@/schema/pack";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("looking closer without leaving the lesson", () => {
  it.each(["example", "how-to", "choose-from"] as const)("opens and closes %s pictures and restores focus", async (purpose) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const pictures: PictureSet = {
      purpose,
      items: [{ src: "/woodlice.webp", alt: "Two woodlice beneath a log", caption: "Look under the log" }],
    };
    try {
      await act(async () => root.render(<LessonPictures pictures={pictures} />));
      const trigger = host.querySelector("button")!;
      trigger.focus();
      await act(async () => trigger.click());
      const dialog = host.querySelector('[role="dialog"]')!;
      expect(dialog.getAttribute("aria-label")).toBe("Look under the log");
      expect(dialog.querySelector("img")!.getAttribute("alt")).toBe("Two woodlice beneath a log");
      expect(dialog.contains(document.activeElement)).toBe(true);
      await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      await act(async () => trigger.click());
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Put the picture away"]')!.click());
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
