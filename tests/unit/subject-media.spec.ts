vi.mock("server-only", () => ({}));
vi.mock("@/lib/outside/place-photos", () => ({ readSubjectEntity: vi.fn() }));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSubjectEntity } from "@/lib/outside/place-photos";
import { subjectMediaFor } from "@/lib/lesson/subject-media";

/**
 * THE EXACT-TAXON GATE (#233).
 *
 * Johan, 2026-08-24: the public Counting Life introduction rendered a
 * Wikimedia image titled "American Bird Grasshopper" under a link to
 * `/species/chorthippus-brunneus` (Common field grasshopper). The broad,
 * common-name search ("grasshopper") is a keyword match over an
 * encyclopaedia and can resolve to a different, related species, while the
 * surrounding entity kept the specific one's scientific name and slug.
 *
 * A named species — one that carries a scientific name — may only be
 * illustrated by a lookup keyed on that exact identifier. When that lookup
 * fails, the honest answer is no picture for that subject, never a fallback
 * to the broad common-name search that produced the mismatch. A subject with
 * no scientific name (a topic, a rock, a season) makes no species-level
 * claim, so the broad search stays exactly as it was for it.
 */

function entityWithPhoto(id: string) {
  return {
    asked: id,
    title: id,
    definition: `${id}, defined.`,
    sourceUrl: `https://en.wikipedia.org/wiki/${id}`,
    photo: {
      id,
      title: id,
      url: `https://upload.wikimedia.org/${id}.jpg`,
      sourceUrl: `https://commons.wikimedia.org/wiki/${id}`,
      credit: "Someone",
      license: "cc-by-sa-2.0",
      locality: "anywhere" as const,
    },
  };
}

beforeEach(() => {
  vi.mocked(readSubjectEntity).mockReset();
});

describe("a named species is looked up by its exact identity", () => {
  it("searches the scientific name, not the common name, when one is known", async () => {
    vi.mocked(readSubjectEntity).mockResolvedValue(entityWithPhoto("Chorthippus brunneus"));

    const items = await subjectMediaFor({
      names: [{ name: "Common field grasshopper", scientificName: "Chorthippus brunneus" }],
    });

    expect(readSubjectEntity).toHaveBeenCalledWith("Chorthippus brunneus");
    expect(readSubjectEntity).not.toHaveBeenCalledWith("Common field grasshopper");
    // The row still prints the name a child would say, never the Latin string
    // used to find the picture.
    expect(items[0]?.name).toBe("Common field grasshopper");
    expect(items[0]?.scientificName).toBe("Chorthippus brunneus");
  });

  it("shows nothing for that subject when the exact lookup fails, rather than guessing broadly", async () => {
    // The common-name search is never tried for a named species: if it were,
    // this stub would need a second branch to prove it stays unused.
    vi.mocked(readSubjectEntity).mockResolvedValue(null);

    const items = await subjectMediaFor({
      names: [{ name: "Common field grasshopper", scientificName: "Chorthippus brunneus" }],
    });

    expect(readSubjectEntity).toHaveBeenCalledTimes(1);
    expect(readSubjectEntity).toHaveBeenCalledWith("Chorthippus brunneus");
    expect(items).toEqual([]);
  });

  it("still searches the common name for a subject with no scientific name at all", async () => {
    // A topic ("acorn") or a phenology row with no scientificName makes no
    // species-level claim, so the broad search is the honest, unchanged
    // behaviour for it.
    vi.mocked(readSubjectEntity).mockResolvedValue(entityWithPhoto("Acorn"));

    const items = await subjectMediaFor({ names: [{ name: "Acorn" }] });

    expect(readSubjectEntity).toHaveBeenCalledWith("Acorn");
    expect(items[0]?.name).toBe("Acorn");
    expect(items[0]?.scientificName).toBeNull();
  });

  it("falls back to the topic only when there are no named-week subjects at all", async () => {
    vi.mocked(readSubjectEntity).mockResolvedValue(entityWithPhoto("Seeds"));

    const items = await subjectMediaFor({ names: [], topic: "Seeds" });

    expect(readSubjectEntity).toHaveBeenCalledWith("Seeds");
    expect(items[0]?.name).toBe("Seeds");
  });
});

/**
 * THE TOPIC GATE (#1019).
 *
 * Johan, 2026-09-06, from live screenshots of the leaf-mask lesson: the same
 * three thumbnails — Blackberry, Rosehip, Swallow Gathering — under Collect,
 * under Sort 1 of 3 and under Sort 2 of 3, on a lesson about fallen leaves.
 *
 * This row is the fallback that fires at a thinly recorded school, and it was
 * built with no topic parameter at all: `names` is the region's phenology for
 * the week and every name in it went to the strip unread. The names below are
 * the real entries from `lib/outside/data/phenology/uk-*.json` and the taxon
 * reference read is the real one, so this fails on the actual defect rather
 * than on a hand-made stand-in for it.
 */
describe("the week's names are filtered to the lesson's subject", () => {
  const AUTUMN_WEEK = [
    { name: "Blackberry", scientificName: "Rubus fruticosus" },
    { name: "Rosehip", scientificName: "Rosa canina" },
    { name: "Pedunculate Oak", scientificName: "Quercus robur" },
  ];

  it("keeps the tree and drops the autumn fruits on a trees lesson", async () => {
    vi.mocked(readSubjectEntity).mockImplementation(async (subject: string) =>
      entityWithPhoto(subject)
    );

    const items = await subjectMediaFor({ names: AUTUMN_WEEK, primaryTopic: "trees" });

    expect(items.map((item) => item.name)).toEqual(["Pedunculate Oak"]);
    // Rubus and Rosa are Plantae and would have cleared a bare kingdom test.
    // The genus gate (#962, #1012) is what separates them from the oak, and
    // this row now asks it the same way every other surface does.
    expect(readSubjectEntity).not.toHaveBeenCalledWith("Rubus fruticosus");
  });

  it("renders nothing rather than seasonal filler when nothing is on topic", async () => {
    vi.mocked(readSubjectEntity).mockImplementation(async (subject: string) =>
      entityWithPhoto(subject)
    );

    const items = await subjectMediaFor({
      names: [
        { name: "Blackberry", scientificName: "Rubus fruticosus" },
        { name: "Rosehip", scientificName: "Rosa canina" },
      ],
      // The lesson's own subject is still passed, exactly as the runner passes
      // it. It must NOT be reached: the broad common-name search is a keyword
      // match over an encyclopaedia and is the door filler would come back
      // through. #324's rule for the door is this row's rule too.
      topic: "Sorting fallen leaves, making an animal mask from them",
      primaryTopic: "trees",
    });

    expect(items).toEqual([]);
    expect(readSubjectEntity).not.toHaveBeenCalled();
  });

  it("drops a phenology row that names a season rather than a species", async () => {
    vi.mocked(readSubjectEntity).mockImplementation(async (subject: string) =>
      entityWithPhoto(subject)
    );

    // "Autumn Colour" and "First Frost" carry no scientific name and so no
    // taxon to look up. They are not things standing outside the gate, and
    // the door has dropped them on the same rule since #339.
    const items = await subjectMediaFor({
      names: [{ name: "Autumn Colour" }, { name: "Pedunculate Oak", scientificName: "Quercus robur" }],
      primaryTopic: "trees",
    });

    expect(items.map((item) => item.name)).toEqual(["Pedunculate Oak"]);
  });

  it("filters nothing for a lesson taxonomy cannot answer", async () => {
    vi.mocked(readSubjectEntity).mockImplementation(async (subject: string) =>
      entityWithPhoto(subject)
    );

    // Roughly forty per cent of sessions are tagged art / seasons / senses /
    // weather. "Does this creature match `art`?" has no meaning, and filtering
    // on it would empty the row for no reason.
    const items = await subjectMediaFor({ names: AUTUMN_WEEK, primaryTopic: "art" });

    expect(items).toHaveLength(3);
  });

  it("filters nothing when the session authored no primary topic", async () => {
    vi.mocked(readSubjectEntity).mockImplementation(async (subject: string) =>
      entityWithPhoto(subject)
    );

    const items = await subjectMediaFor({ names: AUTUMN_WEEK });

    expect(items).toHaveLength(3);
  });
});
