// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantSheet } from "@/app/run/AssistantSheet";
import type { Session } from "@/schema/pack";

vi.mock("@/app/run/useModalFocus", () => ({ useModalFocus: () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/**
 * The sentence under the answer is rendered from the matched record's own
 * evidence tier (#401), not from one fixed string. A seasonal-only record is
 * a regional this-time-of-year claim and must never reach a teacher as a
 * local sighting, and a recent claim names a window only when the producer
 * gave one.
 */
it.each([
  ["Grass", null, null, "A closer view of the seed head would help.", "Possible identification."],
  ["Common frog", "recent", 7, "Look at the dark patch behind its eye.", "Possible match to a species recorded nearby within the last 7 days."],
  ["Common frog", "recent", null, "Look at the dark patch behind its eye.", "Possible match to a species recorded nearby recently."],
  ["Hawthorn", "seasonal", 7, "The lobed leaves are visible.", "Possible match to a species recorded in this region at this time of year."],
  [null, null, null, "Move closer to the organism you want to identify.", "Move closer"],
])("shows a useful answer for %s (%s) after uploading a photo", async (name, evidence, recentWindowDays, note, expected) => {
  vi.stubGlobal("Image", class { width = 512; height = 512; decode = async () => {}; });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/species-learning" ? Response.json({ result: { learning: { introduction: "A story about the possible match.", lookFor: "Look for a pattern.", question: "What shape can you see?" }, source: { title: "Source", url: "https://en.wikipedia.org/wiki/Grass" } } }) : Response.json({
    available: true, answer: { name, scientificName: null, note, evidence, recentWindowDays },
  })));
  vi.stubGlobal("URL", Object.assign(class {}, {
    createObjectURL: () => "blob:specimen", revokeObjectURL: vi.fn(),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,aGVsbG8=");
  Element.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AssistantSheet open onClose={() => {}}
      ability="reception" hazards={null} phaseKey="notice" session={{ id: "test" } as Session} />));
    const input = host.querySelector('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["photo"], "grass.jpg", { type: "image/jpeg" })] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain(expected);
    expect(host.textContent).toContain(note);
    if (name) {
      expect(host.textContent).toContain(name);
      const explore = [...host.querySelectorAll("button")].find((button) => button.textContent === "Explore this possible match")!;
      await act(async () => explore.click());
      expect(host.textContent).toContain("A story about the possible match.");
      expect(host.textContent).toContain(expected);
      expect(host.querySelector('img[src="blob:specimen"]')).not.toBeNull();
    } else {
      expect(host.textContent).not.toContain("Explore this possible match");
    }
    // The exact false claim #401 is named for: no answer, at any tier, may
    // describe a record as local unless it is one, and a seasonal record may
    // not borrow the recent tier's "near here" or its window.
    expect(host.textContent).not.toContain("locally recorded");
    if (evidence !== "recent") {
      expect(host.textContent).not.toContain("nearby");
      expect(host.textContent).not.toMatch(/within the last \d+ days/);
    }
    expect(host.textContent).not.toContain("I could not match this photo to the local species list");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});


it("closes with the X and can reopen", async () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return <><button data-reopen onClick={() => setOpen(true)}>Open assistant</button>
      <AssistantSheet open={open} onClose={() => setOpen(false)} ability="reception"
        hazards={null} phaseKey="notice" session={{ id: "test" } as Session} /></>;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    const close = host.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Back to the lesson"]')!;
    expect(close.textContent).toContain("✕");
    await act(async () => close.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-reopen]')!.click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
