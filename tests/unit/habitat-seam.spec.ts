import { describe, expect, it } from "vitest";
import {
  GLOBAL_PACK_KEY,
  packKeyForClimate,
  packKeyLookupChain,
  resolveHabitat,
} from "@/lib/habitat";
import { findSession, shelfPacksAllSeasons } from "@/lib/pack";
import type { PackKey } from "@/schema/bioregion";
import type { Block, Session } from "@/schema/pack";

/**
 * The habitat seam guard (#207).
 *
 * "Look under logs" is FALSE in Phoenix. The isolating fixture is the shipped
 * summer pack rather than a synthetic string, because the failure this prevents
 * is a real instruction reaching a real desert schoolyard — and because it also
 * catches the wrong fix: if someone ever "solves" Phoenix by editing the London
 * base text, the verbatim assertion below goes red.
 *
 * The second claim under test is the one the ticket turns on: a habitat variant
 * must be a REWRITTEN SENTENCE, not the base with a noun swapped. A word map
 * produces something grammatical, confident and still wrong, and that is worse
 * than the original because it looks handled.
 */

/** The London text as authored. Editing the pack to "fix" Phoenix fails here. */
/** A fixed autumn day in London: these tests read shelf membership, not the clock. */
const SHELF_DAY = { date: new Date(2026, 8, 17), lat: 51.5 };

const LONDON_LOOK_UNDER_LOGS =
  "Take 10 minutes to explore. Look under logs, on leaves, in trees, and up in the sky.";
const LONDON_SPACE_NEEDED = "Soil, a log, a bush or a tree. Any patch where small creatures hide.";

function key(value: string): PackKey {
  return { resolution: "koppen", value, resolvedBy: "pack-key@test" };
}

const PHOENIX = key("arid");
const MIAMI = key("tropical");
/** London's own group. It authors no variant: the base text IS the London text. */
const LONDON = key("oceanic");

function shelfSession(id: string): Session {
  const found = findSession(id);
  expect(found, id).not.toBeNull();
  return found!.session;
}

function block(session: Session, phaseKey: string, text: string): Block {
  const phase = session.phases.find((p) => p.key === phaseKey);
  expect(phase, phaseKey).toBeDefined();
  const match = phase!.blocks.find((b) => "text" in b && b.text === text);
  expect(match, text).toBeDefined();
  return match!;
}

/**
 * NOTE, 2026-08-17 (#266): the shipped packs no longer carry climate-keyed
 * variants. They were retired because a climate key cannot see a calendar —
 * "look under logs" is a damp-spring instruction, and translating it into
 * desert and tropical only propagated the same time-blindness. The composed
 * `lookFor` instruction replaced them (lib/look-for.ts, tests/unit/look-for.spec.ts).
 *
 * THE SEAM ITSELF IS NOT RETIRED and these tests still guard it. It remains the
 * right mechanism for a genuinely place-specific rewrite; it was only ever the
 * INPUT that was wrong. So the fixtures below are synthetic rather than read
 * from a pack, which is also more honest: they test the resolver, and no longer
 * pretend a shipped pack is exercising it.
 */
describe("resolving a habitat-bearing instruction", () => {
  const BASE = "Take 10 minutes to explore. Look under logs, on leaves, in trees, and up in the sky.";
  const variants = {
    arid: "Take 10 minutes to explore. Look under rocks, in the shade of shrubs, on leaves, and up in the sky.",
    tropical: "Take 10 minutes to explore. Look in the leaf litter, under fallen branches, on trunks and leaves, and up in the sky.",
  };

  it("keeps the base text when the chain matches nothing", () => {
    const resolved = resolveHabitat(BASE, variants, packKeyLookupChain(LONDON));
    expect(resolved.text).toBe(BASE);
    expect(resolved.resolvedBy).toBeNull();
  });

  it("resolves the specific key when one is authored", () => {
    const resolved = resolveHabitat(BASE, variants, packKeyLookupChain(PHOENIX));
    expect(resolved.text).not.toBe(BASE);
    expect(resolved.text.toLowerCase()).not.toContain("log");
    expect(resolved.resolvedBy).toBe("arid");
  });

  it("gives two keys their own instructions, never each other's", () => {
    const miami = resolveHabitat(BASE, variants, packKeyLookupChain(MIAMI));
    const phoenix = resolveHabitat(BASE, variants, packKeyLookupChain(PHOENIX));
    expect(miami.text).not.toBe(phoenix.text);
    expect(miami.resolvedBy).toBe("tropical");
  });

  it("leaves the shipped London text exactly as authored", () => {
    // The verbatim half. Whatever a resolver does, the pack still holds what
    // its author typed, and this is the assertion that catches a "fix" applied
    // by editing the source instead of adding a variant.
    const session = shelfSession("summer-w2-minibeast-hunting");
    const b = block(session, "explore-2", BASE);
    expect("text" in b && b.text).toBe(BASE);
  });

  it("carries no climate-keyed variants in the shipped packs any more", () => {
    const session = shelfSession("summer-w2-minibeast-hunting");
    expect(session.spaceNeededVariants).toBeUndefined();
    for (const phase of session.phases) {
      for (const b of phase.blocks) expect(b.habitatVariants).toBeUndefined();
    }
  });
});

describe("the fallback chain", () => {
  const variants = { arid: "desert wording", [GLOBAL_PACK_KEY]: "anywhere wording" };

  it("prefers the specific key over global", () => {
    expect(resolveHabitat("base", variants, packKeyLookupChain(PHOENIX)).text).toBe(
      "desert wording"
    );
  });

  it("falls through to global when the specific key has no variant", () => {
    const resolved = resolveHabitat("base", variants, packKeyLookupChain(key("continental")));
    expect(resolved.text).toBe("anywhere wording");
    expect(resolved.resolvedBy).toBe(GLOBAL_PACK_KEY);
  });

  it("falls back to the authored base when nothing in the chain matches", () => {
    // A London instruction shown in Phoenix is a known bug with a ticket on it.
    // A generated desert instruction is a new bug with nobody's name on it.
    const resolved = resolveHabitat("base", { arid: "desert" }, packKeyLookupChain(MIAMI));
    expect(resolved.text).toBe("base");
    expect(resolved.resolvedBy).toBeNull();
  });

  it("resolves to the base when there is no pack key at all", () => {
    expect(resolveHabitat("base", { arid: "desert" }, packKeyLookupChain(null)).text).toBe("base");
  });

  it("ends every chain at global", () => {
    expect(packKeyLookupChain(PHOENIX)).toEqual(["arid", GLOBAL_PACK_KEY]);
    expect(packKeyLookupChain(key(GLOBAL_PACK_KEY))).toEqual([GLOBAL_PACK_KEY]);
  });
});

describe("every authored variant is reachable", () => {
  /**
   * The typo fixture. A variant keyed "aird" is dead code that never resolves
   * and never fails — the lesson simply keeps shipping the London text to a
   * desert, which is exactly the bug this seam was built to end.
   */
  const KNOWN_KEYS = new Set([
    "tropical",
    "arid",
    "subtropical",
    "mediterranean",
    "oceanic",
    "continental",
    "polar",
    GLOBAL_PACK_KEY,
  ]);

  it("keys every habitat variant on a pack key the resolver can reach", () => {
    const unreachable: string[] = [];
    for (const pack of shelfPacksAllSeasons(SHELF_DAY)) {
      for (const session of pack.sessions) {
        for (const k of Object.keys(session.spaceNeededVariants ?? {})) {
          if (!KNOWN_KEYS.has(k)) unreachable.push(`${session.id}/spaceNeeded/${k}`);
        }
        for (const phase of session.phases) {
          for (const b of phase.blocks) {
            for (const k of Object.keys(b.habitatVariants ?? {})) {
              if (!KNOWN_KEYS.has(k)) unreachable.push(`${session.id}/${phase.key}/${k}`);
            }
          }
        }
      }
    }
    expect(unreachable).toEqual([]);
  });

  it("names no species in any authored variant", () => {
    // Nature Class does not invent local nature. A habitat variant may say
    // where to look; what actually lives there is Pointmoon's to say, and a
    // hand-authored desert species list would be exactly the invention the
    // whole product refuses.
    const SPECIES_WORDS =
      /\b(saguaro|mesquite|palo verde|scorpion|tarantula|javelina|anole|iguana|gecko|cactus wren|roadrunner)\b/i;
    const offending: string[] = [];
    for (const pack of shelfPacksAllSeasons(SHELF_DAY)) {
      for (const session of pack.sessions) {
        const texts = [
          ...Object.values(session.spaceNeededVariants ?? {}),
          ...session.phases.flatMap((p) =>
            p.blocks.flatMap((b) => Object.values(b.habitatVariants ?? {}))
          ),
        ];
        for (const text of texts) {
          if (SPECIES_WORDS.test(text)) offending.push(`${session.id}: ${text}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });
});

describe("keying the seam from a real class", () => {
  it("gives a Sonoran school the arid chain", () => {
    // Class.climate already stores a Koppen-style group (lib/outside/climate.ts),
    // which is exactly the granularity J4 told authors to work at. So the seam
    // is keyable today, with no new resolution machinery.
    expect(packKeyLookupChain(packKeyForClimate("arid"))).toEqual(["arid", GLOBAL_PACK_KEY]);
  });

  it("stamps where the key came from, rather than implying a polygon", () => {
    expect(packKeyForClimate("tropical").resolution).toBe("koppen");
    expect(packKeyForClimate("tropical").resolvedBy).toBe("pack-key@climate-group");
  });

  it("falls to global for a class with no climate tag", () => {
    // A class with no coordinates gets London's instruction, which is a known
    // gap rather than a guess about a place we cannot locate.
    expect(packKeyLookupChain(packKeyForClimate(null))).toEqual([GLOBAL_PACK_KEY]);
    expect(packKeyLookupChain(packKeyForClimate(""))).toEqual([GLOBAL_PACK_KEY]);
  });
});
