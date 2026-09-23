import { isModelAvailable } from "./model";
import { draft, stringField } from "./draft";
import { loadPrompt } from "./prompt-registry";

/**
 * What a map can see around a school, said by the model (#277 zoom two).
 *
 * Johan, 2026-08-17: *"add ai intelligence instead of hard coded
 * intelligence"*.
 *
 * ── THE THIRD TIME THIS PATTERN HAS APPEARED, AND MY OWN CODE THIS TIME ────
 *
 * `readPlace` maps each Pointmoon signal to a fixed sentence: "Tree canopy
 * over part of the site.", "No open water we can see.", "The grounds look
 * closely kept." I wrote those this morning while replacing somebody else's
 * hardcoded sentences, which is the whole lesson in one file.
 *
 * A teacher reads these on the screen where she is being asked to correct
 * what we think we know about her school. Six clauses in a fixed order, and
 * they never notice that canopy plus water plus low management is a wooded
 * damp place worth saying in one breath rather than three.
 *
 * ── THE SPLIT, SAME AS THE OTHER TWO ───────────────────────────────────────
 *
 *   OBSERVED, never the model's: which OSM-derived signals came back and what
 *   each one says. `readPlace` still does that, still refuses to infer, and
 *   still says nothing about a signal that was absent.
 *
 *   THE MODEL'S: how to tell her, in one short paragraph, in a way that
 *   invites her to disagree.
 *
 * ── AND IT IS CHECKED THE SAME WAY ─────────────────────────────────────────
 *
 * Output, not prompt. A draft that claims a feature nobody observed, names a
 * species, carries a number, or slips the register is discarded, and the
 * plain observed lines render instead. That fallback is not a defeat: a list
 * of flat true sentences is a perfectly good way to be asked "is this right?"
 */

export interface PlaceDescriptionInput {
  /** One plain sentence per signal that answered. The facts, already filtered. */
  observations: readonly string[];
  /** The school's name, so it reads as being about them. Never a person. */
  school?: string | null;
}



function buildUser(input: PlaceDescriptionInput): string {
  return [
    input.school ? `The school: ${input.school}` : "",
    "",
    "What the map shows:",
    ...input.observations.map((o) => `- ${o}`),
    "",
    "Tell her, so she can correct it.",
  ]
    .filter(Boolean)
    .join("\n");
}

const LOOKS_LIKE_A_SPECIES =
  /\b(beetle|spider|worm|ants?\b|bees?\b|wasp|butterfl|moth|snail|slug|woodlouse|woodlice|birds?\b|robin|sparrow|fox|squirrel|frog|toad|newt|oaks?\b|beech|birch|nettle|bramble|blackberr|dandelion|dais(y|ies)|clover|fern|moss|lichen|cact(us|i))\w*/i;

export interface DescriptionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * What must hold before a drafted description is shown to a teacher.
 *
 * The hard one is INVENTED FEATURES. A model given "no open water we can see"
 * and "tree canopy over part of the site" will happily produce "a wooded spot
 * with a stream nearby", because that is a better sentence. She would then be
 * asked to confirm a stream that no data ever reported.
 *
 * So every feature word in the draft has to be traceable to the observations
 * it was given. Broad and blunt on purpose: the cost of a false positive is
 * the plain list, which is fine, and the cost of a false negative is a teacher
 * correcting us about a stream we made up.
 */
export function checkDescription(
  draft: string,
  input: PlaceDescriptionInput
): DescriptionCheck {
  const text = draft.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > 320) return { ok: false, reason: "too long" };
  if (text.split(/\s+/).length > 55) return { ok: false, reason: "too many words" };
  if (/[—–]/.test(text)) return { ok: false, reason: "em dash" };
  if (/!/.test(text)) return { ok: false, reason: "exclamation" };
  if (/\b[A-Z]{2,}\b/.test(text)) return { ok: false, reason: "all caps" };
  if (/https?:\/\/|[<>]/.test(text)) return { ok: false, reason: "markup or link" };
  if (/\d/.test(text)) return { ok: false, reason: "carries a number" };

  const species = text.match(LOOKS_LIKE_A_SPECIES);
  if (species) return { ok: false, reason: `names a species: ${species[0]}` };

  // Every feature word must appear somewhere in what we supplied.
  const source = input.observations.join(" ").toLowerCase();
  const FEATURES = [
    "canopy", "tree", "water", "pond", "stream", "river", "lake", "wood",
    "hedge", "meadow", "grass", "garden", "park", "field", "wall", "fence",
    "coast", "shore", "beach", "marsh", "wetland", "hill", "slope",
  ];
  for (const feature of FEATURES) {
    if (!new RegExp(`\\b${feature}\\w*`, "i").test(text)) continue;
    if (!source.includes(feature)) {
      return { ok: false, reason: `claims a feature nobody observed: ${feature}` };
    }
  }

  return { ok: true };
}

/** Draft it, or null so the plain observed lines render. */
export async function draftPlaceDescription(
  input: PlaceDescriptionInput
): Promise<string | null> {
  if (input.observations.length === 0) return null;
  if (!isModelAvailable()) return null;

  const prompt = loadPrompt("place-description");
  if (!prompt) return null;

  return draft({
    prompt: { ...prompt, user: buildUser(input) },
    facts: input,
    maxTokens: 250,
    parse: stringField("description"),
    check: checkDescription,
  });
}
