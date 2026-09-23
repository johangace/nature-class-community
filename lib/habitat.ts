import type { PackKey } from "@/schema/bioregion";
import type { Block, HabitatVariants, Phase, Session } from "@/schema/pack";

/**
 * The habitat seam: resolving a habitat-bearing instruction for a place.
 *
 * "Look under logs" is FALSE in Phoenix, and a word map cannot fix it — a noun
 * swap produces a sentence that is grammatical, confident and still wrong. So
 * the seam replaces WHOLE INSTRUCTIONS, keyed by pack key, and resolves them
 * through the fallback chain J4 decided: polygon → koppen → latitude → global,
 * falling back to the authored base text when nothing matches.
 *
 * The base text is never modified. Variants render in parallel with the source
 * string rather than replacing it in the pack, which is the #142 pattern and
 * the reason the verbatim-fidelity guard never sees a diff from this work.
 */

/**
 * The key every pack falls back to. Authoring here means "this holds anywhere",
 * which is a strong claim and mostly the wrong one for a habitat instruction —
 * `global` is the chain's floor, not its default shelf.
 */
export const GLOBAL_PACK_KEY = "global";

/**
 * The lookup order for a pack key: most specific first, `global` last.
 *
 * DELIBERATELY MINIMAL, and this is the seam's honest boundary. The full
 * fallback chain — knowing that a Sonoran polygon sits inside the arid Koppen
 * group which sits inside a latitude band — is its own ticket (the ~1d tail of
 * the wave-1 build order) and needs the resolver that walks a place down to its
 * keys. Until that lands, one key plus `global` is the whole chain, and saying
 * so here is better than a chain that looks complete and silently skips a link.
 *
 * `resolveHabitat` takes a chain rather than a key, so when the real resolver
 * arrives it hands this function a longer array and nothing else changes.
 */
export function packKeyLookupChain(key: PackKey | null): string[] {
  if (!key) return [GLOBAL_PACK_KEY];
  return key.value === GLOBAL_PACK_KEY ? [GLOBAL_PACK_KEY] : [key.value, GLOBAL_PACK_KEY];
}

/**
 * The pack key a class resolves to today.
 *
 * J4 decided the fallback chain and told authors to work at the COARSEST key
 * that changes the teaching, which for habitat instructions is the Koppen
 * group. A class already stores exactly that: `Class.climate` is a Koppen-style
 * group tag derived from its coordinates (lib/outside/climate.ts), and it is
 * the spine Johan confirmed on 2026-08-13 as the region layer for the US.
 *
 * So the seam is keyable today, with no new resolution machinery: an arid
 * school reads the arid variant. `resolvedBy` records that this came from the
 * climate tag rather than from a polygon, so when the real chain lands the
 * provenance distinguishes the two rather than quietly upgrading.
 *
 * Null climate resolves to `global`, which resolves to the base text. A class
 * with no coordinates gets London's instruction, which is a known gap rather
 * than a guess about a place we cannot locate.
 */
export function packKeyForClimate(climate?: string | null): PackKey {
  const value = typeof climate === "string" && climate.trim().length > 0
    ? climate.trim()
    : GLOBAL_PACK_KEY;
  return { resolution: "koppen", value, resolvedBy: "pack-key@climate-group" };
}

/**
 * The instruction to actually show, and where it came from.
 *
 * `resolvedBy` is the key that answered, or null when the base text did. It is
 * provenance for the same reason `PackKey.resolvedBy` is: a wrong instruction
 * in front of a class needs to be traceable to the rule that chose it, and the
 * live Phoenix and Miami spine mislabels were invisible for months precisely
 * because nothing recorded which rule had picked what a school was reading.
 */
export interface ResolvedInstruction {
  text: string;
  resolvedBy: string | null;
}

/**
 * Walk the chain and return the first variant that matches, or the base.
 *
 * Falling back to the base is a real decision rather than a default: a London
 * instruction shown in Phoenix is a known bug with a ticket on it, whereas a
 * generated desert instruction is a new bug with nobody's name on it. We ship
 * the known one.
 */
export function resolveHabitat(
  base: string,
  variants: HabitatVariants | undefined,
  chain: readonly string[]
): ResolvedInstruction {
  if (!variants) return { text: base, resolvedBy: null };
  for (const key of chain) {
    const variant = variants[key];
    if (typeof variant === "string" && variant.length > 0) {
      return { text: variant, resolvedBy: key };
    }
  }
  return { text: base, resolvedBy: null };
}

/** The text alone, for a caller that does not need the provenance. */
export function habitatText(
  base: string,
  variants: HabitatVariants | undefined,
  chain: readonly string[]
): string {
  return resolveHabitat(base, variants, chain).text;
}

// ---------------------------------------------------------------------------
// Resolving a whole session for a place
// ---------------------------------------------------------------------------

/**
 * A session with its habitat-bearing text resolved for one place.
 *
 * ── WHY THIS IS A SESSION AND NOT A PROP EVERY RENDERER THREADS ────────────
 *
 * The alternative was to hand each renderer a pack-key chain and have it call
 * `resolveHabitat` on the text it draws. That means editing every surface that
 * shows a block, and every surface built after this one has to remember to do
 * it — the kind of rule that holds until someone adds a component on a Friday.
 *
 * Instead the resolution happens ONCE at the server boundary and returns the
 * same `Session` shape, so every renderer downstream reads `block.text` and
 * `session.spaceNeeded` exactly as it always has and gets the right words
 * without knowing this seam exists. It also means the #242 rework can delete
 * and rebuild every lesson surface it likes and the habitat seam keeps
 * working, because it was never wired into the surfaces in the first place.
 *
 * It is the #142 pattern held one level up: the PACK still holds the verbatim
 * authored string on disk, the fidelity guard still reads it there, and only
 * the copy travelling to the renderer differs.
 *
 * A chain of `["global"]`, which is what a class with no location resolves to,
 * returns the session unchanged.
 */
export function resolveSessionForPlace(
  session: Session,
  chain: readonly string[]
): Session {
  return {
    ...session,
    spaceNeeded: session.spaceNeeded
      ? habitatText(session.spaceNeeded, session.spaceNeededVariants, chain)
      : session.spaceNeeded,
    phases: session.phases.map((phase) => resolvePhaseForPlace(phase, chain)),
  };
}

function resolvePhaseForPlace(
  phase: Phase,
  chain: readonly string[]
): Phase {
  return {
    ...phase,
    blocks: phase.blocks.map((block) => resolveBlockForPlace(block, chain)),
    // Condition variants carry whole alternate phases, so they resolve too —
    // a wet-weather version of an instruction is still an instruction about a
    // habitat, and missing it would leave one path right and the other wrong.
    conditionVariants: phase.conditionVariants?.map((variant) => ({
      ...variant,
      phase: resolvePhaseForPlace(variant.phase, chain),
    })),
  };
}

function resolveBlockForPlace(
  block: Block,
  chain: readonly string[]
): Block {
  if (!block.habitatVariants) return block;
  // `text` is the primary field on every block kind that carries prose. A
  // block kind without one keeps its variants unused rather than having them
  // applied to a field they were not written for.
  if (!("text" in block)) return block;
  return { ...block, text: habitatText(block.text, block.habitatVariants, chain) };
}
