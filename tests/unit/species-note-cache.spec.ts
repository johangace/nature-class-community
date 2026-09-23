import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The profile is read more than once, by more than one person (#218).
 *
 * Measured on the running dev server before this cache existed: three views of
 * the same hoverfly gave three different drafts, each about two seconds. A
 * teacher who scrolls back should find the same words she read out five minutes
 * ago, and a class of thirty tapping one face should not be thirty model calls
 * into a per-instance rate limit (#332).
 */

const callModel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/model", () => ({
  callModel,
  isModelAvailable: () => true,
}));

const source = (name: string) => ({
  title: name,
  url: "https://example.org",
  text: `${name} is a common hoverfly that visits flowers and hovers in one spot.`,
});

function reply(what: string, teacher: string) {
  return { text: JSON.stringify({ whatItIs: what, forTeacher: teacher }), model: "test" };
}

describe("the drafted note is held", () => {
  beforeEach(() => {
    callModel.mockReset();
    vi.useRealTimers();
  });

  it("calls the model once for a species however many times the profile is opened", async () => {
    const { draftSpeciesNote } = await import("@/lib/ai/species-note");
    callModel.mockResolvedValue(
      reply(
        "A common hoverfly that visits flowers.",
        "It hovers in one spot, which is the easiest way to tell it from a wasp."
      )
    );

    const input = {
      commonName: "Held Fly",
      scientificName: "Cachea probata",
      source: source("Cachea probata"),
    };
    const first = await draftSpeciesNote(input);
    const second = await draftSpeciesNote(input);
    const third = await draftSpeciesNote(input);

    expect(first?.whatItIs).toBe("A common hoverfly that visits flowers.");
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("holds each species apart, so one profile cannot serve another's note", async () => {
    const { draftSpeciesNote } = await import("@/lib/ai/species-note");
    callModel
      .mockResolvedValueOnce(reply("The first one.", "A habit of the first one."))
      .mockResolvedValueOnce(reply("The second one.", "A habit of the second one."));

    const a = await draftSpeciesNote({
      commonName: "One",
      scientificName: "Alpha unus",
      source: source("Alpha unus"),
    });
    const b = await draftSpeciesNote({
      commonName: "Two",
      scientificName: "Beta duo",
      source: source("Beta duo"),
    });

    expect(a?.whatItIs).toBe("The first one.");
    expect(b?.whatItIs).toBe("The second one.");
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("retries a rejected draft quickly rather than leaving the poorer profile up", async () => {
    const { draftSpeciesNote } = await import("@/lib/ai/species-note");
    vi.useFakeTimers();

    // A draft that fails the register check. Stochastic, not permanent.
    callModel.mockResolvedValueOnce(reply("It eats flies!", "It hovers."));
    const rejected = await draftSpeciesNote({
      commonName: "Flaky",
      scientificName: "Transiens erratum",
      source: source("Transiens erratum"),
    });
    expect(rejected).toBeNull();

    // Held briefly, so a tapping class does not retry into the rate limit.
    await draftSpeciesNote({
      commonName: "Flaky",
      scientificName: "Transiens erratum",
      source: source("Transiens erratum"),
    });
    expect(callModel).toHaveBeenCalledTimes(1);

    // And released within the minute, not the ten it used to hold for: a
    // profile stuck on "This is a bird." after the model recovered is the
    // sentence this whole ticket exists to remove.
    vi.advanceTimersByTime(61 * 1_000);
    callModel.mockResolvedValueOnce(reply("A hoverfly.", "It hovers in one spot."));
    const second = await draftSpeciesNote({
      commonName: "Flaky",
      scientificName: "Transiens erratum",
      source: source("Transiens erratum"),
    });
    expect(second?.whatItIs).toBe("A hoverfly.");
    expect(callModel).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});


it("shares simultaneous requests and refreshes when the source changes", async () => {
  const { draftSpeciesNote } = await import("@/lib/ai/species-note");
  callModel.mockReset();
  callModel.mockResolvedValue(reply("A hovering fly.", "It visits flowers."));
  const input = { commonName: "Concurrent fly", scientificName: "Testa concurrens", source: source("Testa concurrens") };
  const [first, second] = await Promise.all([draftSpeciesNote(input), draftSpeciesNote(input)]);
  expect(first).toEqual(second);
  expect(callModel).toHaveBeenCalledTimes(1);
  await draftSpeciesNote({ ...input, source: { ...input.source, text: input.source.text + " It rests on leaves." } });
  expect(callModel).toHaveBeenCalledTimes(2);
});

it("holds successful adult notes independently of child generation", async () => {
  const { draftSpeciesNote } = await import("@/lib/ai/species-note");
  callModel.mockReset();
  vi.useFakeTimers();
  try {
    callModel.mockResolvedValue(reply("A hovering fly.", "It visits flowers."));
    const input = { commonName: "Incomplete fly", scientificName: "Testa incompleta", source: source("Testa incompleta") };
    expect((await draftSpeciesNote(input))?.forChildren).toBeNull();
    vi.advanceTimersByTime(61_000);
    await draftSpeciesNote(input);
    expect(callModel).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
