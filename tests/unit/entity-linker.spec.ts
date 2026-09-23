import { describe, expect, it } from "vitest";
import { linkEntities, hasEntities } from "@/lib/lesson/entities";

const members = [
  { commonName: "Garden Spider", scientificName: "Araneus diadematus" },
  { commonName: "Spider", scientificName: null },
  { commonName: "Red Admiral", scientificName: "Vanessa atalanta" },
  { commonName: "Fox", scientificName: "Vulpes vulpes" },
];

describe("the deterministic entity linker (nc#219/#223)", () => {
  it("recognises a cast species inside an authored sentence, case-insensitively", () => {
    const segments = linkEntities("Look for the red admiral on the ivy.", members);
    expect(segments).toEqual([
      { kind: "text", text: "Look for the " },
      {
        kind: "entity",
        text: "red admiral",
        slug: "vanessa-atalanta",
        commonName: "Red Admiral",
      },
      { kind: "text", text: " on the ivy." },
    ]);
  });

  it("prefers the longest name so 'garden spider' never links as bare 'spider'", () => {
    const segments = linkEntities("A garden spider waits.", members);
    const entity = segments.find((segment) => segment.kind === "entity");
    expect(entity).toMatchObject({ commonName: "Garden Spider" });
    // Exactly one entity: the inner word must not double-link.
    expect(segments.filter((segment) => segment.kind === "entity")).toHaveLength(1);
  });

  it("tolerates a plural without linking substrings of other words", () => {
    const segments = linkEntities("Count the foxes, not the foxgloves.", members);
    const entities = segments.filter((segment) => segment.kind === "entity");
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ text: "foxes", commonName: "Fox" });
  });

  it("invents nothing: a sentence naming no cast species passes through whole", () => {
    const segments = linkEntities("Look under the log and wait.", members);
    expect(segments).toEqual([{ kind: "text", text: "Look under the log and wait." }]);
    expect(hasEntities(segments)).toBe(false);
  });

  it("never matches scientific names — labels stay labels", () => {
    const segments = linkEntities("Vanessa atalanta was seen here.", members);
    expect(hasEntities(segments)).toBe(false);
  });

  it("is deterministic: the same sentence links identically twice", () => {
    const sentence = "The fox and the red admiral share the hedge.";
    expect(linkEntities(sentence, members)).toEqual(linkEntities(sentence, members));
  });
});
