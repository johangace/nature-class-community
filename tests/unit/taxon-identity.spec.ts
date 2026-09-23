import { describe, expect, it } from "vitest";
import {
  TaxonKeyring,
  collapseByTaxon,
  sameTaxon,
  taxonIdentity,
} from "@/lib/cast/taxon-identity";

/**
 * The rule for "these two rows are the same creature" (#1030), on its own.
 *
 * Every pair below is a shape the data actually takes. The names are real
 * because the rules are about real naming practice — a subspecies under its
 * species, a genus-rank identification, a genus transfer — and inventing names
 * to test a naming rule would prove nothing about the names we receive.
 */

const row = (name: string, scientificName?: string | null, taxonId?: string) => ({
  name,
  scientificName: scientificName ?? null,
  presence: taxonId ? { taxonId } : null,
});

const identityOf = (...args: Parameters<typeof row>) => taxonIdentity(row(...args));

describe("what one row says about which taxon it is", () => {
  it("splits a binomial into genus and epithet", () => {
    expect(identityOf("Rock Pigeon", "Columba livia")).toMatchObject({
      genus: "columba",
      epithet: "livia",
      binomial: "columba livia",
      common: "rock pigeon",
    });
  });

  it("drops the infraspecific rank, so a subspecies is its species", () => {
    expect(identityOf("Feral Pigeon", "Columba livia domestica").binomial).toBe("columba livia");
    expect(identityOf("Barn Swallow", "Hirundo rustica subsp. rustica").binomial).toBe(
      "hirundo rustica"
    );
    expect(identityOf("Sessile Oak", "Quercus petraea var. petraea").binomial).toBe(
      "quercus petraea"
    );
  });

  it("keeps a hybrid distinct from the name it qualifies", () => {
    expect(identityOf("Hybrid oak", "Quercus × rosacea").binomial).toBe("quercus ×rosacea");
    expect(identityOf("Hybrid oak", "Quercus × rosacea").binomial).not.toBe("quercus rosacea");
  });

  it("reads a bare genus as a genus and nothing more", () => {
    expect(identityOf("Pieris", "Pieris")).toMatchObject({
      genus: "pieris",
      epithet: null,
      binomial: "pieris",
    });
  });

  it("still places a row whose scientific name never arrived", () => {
    expect(identityOf("Rock Dove", null, "3017")).toMatchObject({
      taxonId: "3017",
      binomial: null,
      common: "rock dove",
    });
  });

  it("reads a common name past its punctuation", () => {
    expect(identityOf("Common Wood-Pigeon").common).toBe(
      identityOf("common wood pigeon").common
    );
  });
});

describe("whether two rows are the same accepted taxon", () => {
  it("matches on the provider's own taxon id, whatever the rows are called", () => {
    expect(
      sameTaxon(identityOf("Rock Pigeon", "Columba livia", "3017"), identityOf("Rock Dove", null, "3017"))
    ).toBe("taxon-id");
  });

  it("matches a subspecies to its species", () => {
    expect(
      sameTaxon(identityOf("Rock Pigeon", "Columba livia"), identityOf("Feral Pigeon", "Columba livia domestica"))
    ).toBe("binomial");
  });

  it("matches a genus-rank identification to a species of that genus", () => {
    expect(sameTaxon(identityOf("Pieris", "Pieris"), identityOf("Cabbage White", "Pieris rapae"))).toBe(
      "rank"
    );
  });

  it("matches a genus transfer, when the epithet AND the common name agree", () => {
    // Cooper's Hawk reaches us as `Astur cooperii` in the recorded Phoenix
    // payload and as `Accipiter cooperii` wherever the older combination is
    // still in use.
    expect(
      sameTaxon(identityOf("Cooper's Hawk", "Astur cooperii"), identityOf("Cooper's Hawk", "Accipiter cooperii"))
    ).toBe("synonym");
  });

  it("refuses a shared epithet under a different common name", () => {
    // An epithet repeats across genera constantly; on its own it says nothing.
    expect(
      sameTaxon(identityOf("Common Frog", "Rana temporaria"), identityOf("A moth", "Cerastis temporaria"))
    ).toBeNull();
  });

  it("keeps two real species of one genus apart", () => {
    expect(
      sameTaxon(identityOf("Cabbage White", "Pieris rapae"), identityOf("Large White", "Pieris brassicae"))
    ).toBeNull();
  });

  it("falls back to the common name only when nothing can be placed", () => {
    expect(sameTaxon(identityOf("Dawn Chorus"), identityOf("dawn chorus"))).toBe("common-name");
    expect(sameTaxon(identityOf("Dawn Chorus"), identityOf("Autumn Colour"))).toBeNull();
  });
});

describe("the keyring a cast takes its members through", () => {
  it("takes a taxon once, under whichever version arrives first", () => {
    const ring = new TaxonKeyring();
    expect(ring.claim(row("Rock Pigeon", "Columba livia", "3017"))).toBe(true);
    expect(ring.claim(row("Feral Pigeon", "Columba livia domestica"))).toBe(false);
    expect(ring.claim(row("Rock Dove", null, "3017"))).toBe(false);
    expect(ring.claim(row("Common Wood-Pigeon", "Columba palumbus"))).toBe(true);
    expect(ring.size).toBe(2);
  });

  it("cannot place a row that carries neither a name it can parse nor an id", () => {
    // Honest limit, stated: with no scientific name and no taxon id, "Rock
    // Dove" is a string. The keyring says so rather than guessing, which is
    // why the payload-level collapse — where `presence.taxonId` is still on
    // the row — runs before members are ever built.
    const ring = new TaxonKeyring();
    ring.claim(row("Rock Pigeon", "Columba livia"));
    expect(ring.claim(row("Rock Dove"))).toBe(true);
  });
});

describe("collapsing a list of rows to one row per organism", () => {
  it("keeps the more specific identification as the survivor", () => {
    const collapsed = collapseByTaxon(
      [row("Pieris", "Pieris"), row("Cabbage White", "Pieris rapae")],
      (entry) => entry
    );
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.scientificName).toBe("Pieris rapae");
  });

  it("recognises a later row against any version already folded in", () => {
    // Order is the producer's, not ours: the id-only row may arrive before the
    // subspecies, and the group must still recognise both.
    const collapsed = collapseByTaxon(
      [
        row("Rock Dove", null, "3017"),
        row("Rock Pigeon", "Columba livia", "3017"),
        row("Feral Pigeon", "Columba livia domestica"),
      ],
      (entry) => entry
    );
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.scientificName).toBe("Columba livia");
  });

  it("carries a missing field across from the same name, and never across a rollup", () => {
    const carried = collapseByTaxon(
      [
        { name: "Cabbage White", scientificName: "Pieris rapae", photo: null },
        { name: "Pieris", scientificName: "Pieris", photo: "a photo of some Pieris" },
      ],
      (entry) => entry,
      {
        merge: (representative, duplicate, match) =>
          match === "binomial" || match === "taxon-id"
            ? { ...representative, photo: representative.photo ?? duplicate.photo }
            : representative,
      }
    );
    // The rows are one creature; the photograph is still not of that creature.
    expect(carried).toHaveLength(1);
    expect(carried[0]?.photo).toBeNull();
  });

  it("leaves a list of genuinely different creatures alone", () => {
    const rows = [
      row("Cabbage White", "Pieris rapae"),
      row("Large White", "Pieris brassicae"),
      row("Red Admiral", "Vanessa atalanta"),
    ];
    expect(collapseByTaxon(rows, (entry) => entry)).toHaveLength(3);
  });
});
