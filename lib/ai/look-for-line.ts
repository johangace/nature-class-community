import { isModelAvailable } from "./model";
import { draft } from "./draft";
import { loadPrompt } from "./prompt-registry";
import { namedOutsideSet, normaliseName } from "./species-names";
import type { SeasonalSpecies } from "../outside/gbif";

/**
 * The "what to look for" line, written by the model over species it cannot add to.
 *
 * ── WHERE THE MODEL BELONGS, AND WHERE IT DOES NOT (#305) ──────────────────
 *
 * The founding law is that Nature Class never invents local conditions or
 * species. That law is not softened here, it is enforced mechanically.
 *
 *   NOT THE MODEL'S, EVER: which species are about. Those come from the GBIF
 *   occurrence record (`lib/outside/gbif.ts`) — real records, near this point,
 *   in this month, with counts and a twelve-month histogram. A model asserting
 *   "blackthorn is fruiting near your school" is invention in a confident
 *   voice, and it is unfalsifiable at the exact moment a child is sent to look.
 *
 *   THE MODEL'S: the sentence, and which of the true things to lead with. Of
 *   twelve species genuinely recorded nearby this month, some are findable by a
 *   six-year-old in ten minutes and some are a gull on a landfill four miles
 *   away. Choosing between true options and saying it warmly is a judgement
 *   over a true list, which is the shape of work a model is actually good at.
 *
 * This is the same split already working in `conditions-line.ts`, where the
 * temperature is measured and only the sentence is drafted. There the rule was
 * NUMBERS UNCHANGED. Here the rule is NAMES UNCHANGED.
 *
 * ── THE JSON'S SECOND LIFE ─────────────────────────────────────────────────
 *
 * #305 retires `lib/outside/data/phenology/*.json` as an authority on what is
 * alive. Its 550 species names are still useful, though, for precisely the
 * opposite job: as a vocabulary of things the model must not say unless the
 * occurrence record put them there. The file stops asserting and starts
 * catching. That is the only role it should keep.
 */

/** The grounded facts a line may be written from. Everything here is recorded. */
export interface LookForFacts {
  /** The species GBIF actually recorded here this month, already ranked. */
  species: readonly SeasonalSpecies[];
  /**
   * Species names the model is not allowed to introduce — the retired
   * phenology vocabulary. Supplied rather than imported so the guard stays
   * pure and a test can hand it three words.
   */
  lexicon: readonly string[];
  /** The authored line that renders whenever this path declines. */
  fallback: string;
}



function buildUser(facts: LookForFacts): string {
  const lines = facts.species.map((s) => {
    const share = Math.round(s.monthShare * 100);
    return `- ${s.name} (${s.stratum}, ${s.phase}, ${share}% of its local records are this month)`;
  });
  return [
    "Recorded near this school in this month:",
    ...lines,
    "",
    "Choose one and write the line.",
  ].join("\n");
}

export interface LookForCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Everything that must hold before a drafted look-for line reaches a teacher.
 *
 * Pure and exported, so the rule is a thing with a name that a test can watch
 * reject something, rather than a condition buried in a call site.
 */
export function checkLookForLine(
  draft: { species: string; line: string },
  facts: LookForFacts,
): LookForCheck {
  const line = draft.line.trim();
  const chosen = draft.species.trim();

  if (line.length === 0) return { ok: false, reason: "empty" };
  if (line.length > 160) return { ok: false, reason: "too long" };
  if (line.split(/\s+/).length > 28) return { ok: false, reason: "too many words" };
  if (/[—–]/.test(line)) return { ok: false, reason: "em dash" };
  if (/!/.test(line)) return { ok: false, reason: "exclamation" };
  if (/\b[A-Z]{2,}\b/.test(line)) return { ok: false, reason: "all caps" };
  if (/https?:\/\/|[<>]/.test(line)) return { ok: false, reason: "markup or link" };

  // No number is grounded here. The counts are evidence for us, not copy for a
  // class: "forty-two robins" is a claim about today that the record cannot
  // support, and a share is a statistic nobody reads aloud to a five-year-old.
  if (/\d/.test(line)) return { ok: false, reason: "numbers are not spoken" };

  // THE NAMES CHECK, first half. The chosen species must be one we supplied.
  const allowed = new Map(facts.species.map((s) => [normaliseName(s.name), s.name]));
  if (!allowed.has(normaliseName(chosen))) {
    return { ok: false, reason: `species not in the record: ${chosen}` };
  }

  // The line must actually carry the species it claims to have chosen,
  // otherwise the pick and the sentence are about different things.
  if (!normaliseName(line).includes(normaliseName(chosen))) {
    return { ok: false, reason: "line does not name the chosen species" };
  }

  // THE NAMES CHECK, second half, and the one that catches invention: a
  // species name that appears in the line without being in today's grounded
  // list was added by the model. Shared with the door's drafter (#342), which
  // must agree with this one on what counts as inventing a creature.
  const invented = namedOutsideSet(line, allowed, facts.lexicon);
  if (invented) {
    return { ok: false, reason: `named a species the record did not: ${invented}` };
  }

  return { ok: true };
}

/**
 * Draft the line, or return null so the authored fallback renders.
 *
 * Null on: no model, no grounded species, a slow or failed call, unparseable
 * output, or a draft that fails the check. All of those are ordinary. An empty
 * `facts.species` returns null WITHOUT calling the model, because a place with
 * no records is a place with nothing to say, and the one thing this must never
 * do is ask a model to fill the gap.
 */
export async function draftLookForLine(
  facts: LookForFacts,
): Promise<{ line: string; species: string } | null> {
  if (!isModelAvailable()) return null;
  if (facts.species.length === 0) return null;

  const prompt = loadPrompt("look-for-line");
  if (!prompt) return null;

  return draft({
    prompt: { ...prompt, user: buildUser(facts) },
    facts,
    maxTokens: 200,
    parse: (json) => {
      const reply = json as { species?: unknown; line?: unknown } | null;
      if (typeof reply?.species !== "string" || typeof reply?.line !== "string") {
        return null;
      }
      const species = reply.species.trim();
      const line = reply.line.trim();
      return species && line ? { species, line } : null;
    },
    check: checkLookForLine,
  });
}
