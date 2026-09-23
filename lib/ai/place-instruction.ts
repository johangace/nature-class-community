import { isModelAvailable } from "./model";
import { draft, stringField } from "./draft";
import { loadPrompt } from "./prompt-registry";

/**
 * The lesson's place-bearing instruction, written by the model for THIS place,
 * THIS week, THIS class (#266).
 *
 * Johan, 2026-08-17: *"each context lesson place needs to pass by ai"*, *"no
 * deterministic machine!"*
 *
 * ── WHY THE DETERMINISTIC VERSION WAS ALSO WRONG ───────────────────────────
 *
 * The first attempt at this replaced six hardcoded climate sentences with
 * thirteen hardcoded habitat fragments and a joiner. That is better — the
 * fragments describe things that physically exist rather than stereotypes
 * about regions — but it is still a fixed vocabulary. There is no fourteenth
 * sentence such a system can produce, so a school whose situation nobody
 * anticipated gets the nearest phrase somebody happened to type. Adaptive
 * means the words follow the place, not that the place picks from a menu.
 *
 * ── THE BOUNDARY, WHICH IS THE POINT ───────────────────────────────────────
 *
 * office#330: **the config grounds, the model beautifies.** Both halves.
 *
 *   GROUNDED, and never the model's to decide: which habitats hold life this
 *   week (regional phenology), which the class can actually reach (their
 *   grounds and the features they told us about), what the lesson is for.
 *   These arrive as facts and the model may not add to them.
 *
 *   THE MODEL'S, and nobody else's: the sentence. Which of those places to
 *   lead with, how to say it to a four-year-old, what to leave out.
 *
 * So the model never learns a species name, never sees coordinates, and is
 * never asked what is outside. It is asked how to SAY what we already know.
 *
 * ── AND IT IS CHECKED ──────────────────────────────────────────────────────
 *
 * Every draft passes `checkInstruction` before it can reach a child. A draft
 * that names a habitat nobody supplied, names a species, breaks the register,
 * or runs long is discarded and the authored line renders instead. The model
 * gets one bounded attempt; a teacher may be standing in front of a class.
 */

export interface PlaceInstructionInput {
  /** The authored line, which is what renders if anything at all goes wrong. */
  authored: string;
  /** Habitats holding life this week, commonest first. Grounded, not guessed. */
  aliveIn: readonly string[];
  /** Habitats this class can actually reach. Grounded: their own answers. */
  reachable: readonly string[];
  /** What the children are doing, so the instruction serves the lesson. */
  objective: string;
  /** The ability band, for register. Never a child, never a name. */
  abilityBand?: string | null;
}

/** Habitat words the model is allowed to use, because we supplied them. */
function permitted(input: PlaceInstructionInput): string[] {
  return [...new Set([...input.aliveIn, ...input.reachable])];
}



function buildUser(input: PlaceInstructionInput): string {
  const alive = input.aliveIn.length > 0 ? input.aliveIn.join(", ") : "not known this week";
  const reach =
    input.reachable.length > 0 ? input.reachable.join(", ") : "not known";
  return [
    `The lesson: ${input.objective}`,
    `The line as originally written (for a different place): ${input.authored}`,
    "",
    `Places holding life this week, most first: ${alive}`,
    `Places this class can actually reach: ${reach}`,
    input.abilityBand ? `Ability band: ${input.abilityBand}` : "",
    "",
    "Rewrite the instruction for this class.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Species names the model must never reach for. Deliberately a check on the
 * OUTPUT rather than a plea in the prompt: a ban stated in a prompt is an
 * invisible regex, and the only ban that holds is one that reads what came
 * back. Broad on purpose — a false positive costs the authored line, which is
 * a fine line, while a false negative puts an invented creature in a child's
 * ear.
 */
const LOOKS_LIKE_A_SPECIES =
  /\b(beetle|spider|worm|ants?\b|bees?\b|wasp|butterfl|moth|snail|slug|woodlouse|woodlice|centipede|millipede|ladybird|ladybug|birds?\b|robin|sparrow|blackbird|fox|squirrel|frog|toad|newt|oaks?\b|beech|birch|nettle|bramble|blackberr|dandelion|dais(y|ies)|clover|fern|moss|lichen|cact(us|i)|saguaro|mesquite|lizard|gecko|scorpion|caterpillar|earwig|aphid|fly\b|flies\b)\w*/i;

export interface InstructionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Everything that must be true before a drafted line reaches a child.
 *
 * Exported and pure so it can be tested on its own, and so the guard is a
 * thing with a name rather than a condition buried in a call site.
 */
export function checkInstruction(
  draft: string,
  input: PlaceInstructionInput
): InstructionCheck {
  const text = draft.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length > 220) return { ok: false, reason: "too long" };
  if (text.split(/\s+/).length > 34) return { ok: false, reason: "too many words" };
  if (/[—–]/.test(text)) return { ok: false, reason: "em dash" };
  if (/!/.test(text)) return { ok: false, reason: "exclamation" };
  if (/\b[A-Z]{3,}\b/.test(text)) return { ok: false, reason: "all caps" };
  if (/https?:\/\/|[<>]/.test(text)) return { ok: false, reason: "markup or link" };

  const species = text.match(LOOKS_LIKE_A_SPECIES);
  if (species) return { ok: false, reason: `names a species: ${species[0]}` };

  // A place word it was not given is a place it invented.
  // Each surface word maps to the tag that licenses it. "The water's edge" is
  // a pond claim wearing different clothes, and checking only the tag names
  // walked straight past it — found by a test written to try exactly that.
  const PLACE_WORDS: ReadonlyArray<[RegExp, readonly string[]]> = [
    [/\bponds?\b/i, ["pond"]],
    [/\bwater('s)?\b/i, ["pond", "stream"]],
    [/\bstreams?\b/i, ["stream"]],
    [/\bwoodlands?\b|\bwoods?\b|\blogs?\b|\bbark\b/i, ["woodland"]],
    [/\bhedgerows?\b|\bhedges?\b/i, ["hedgerow"]],
    [/\bmeadows?\b/i, ["meadow"]],
    [/\bgrassland\b|\bgrass\b/i, ["grassland", "meadow"]],
    [/\bgardens?\b|\bplanting\b|\bbeds?\b/i, ["garden"]],
    [/\bcoast\b|\bshore\b|\bbeach\b|\bstrand\b/i, ["coast"]],
    [/\bwalls?\b|\bfences?\b/i, ["wall_fence"]],
    [/\bfield\b|\bpitch\b/i, ["playing_field"]],
    [/\byard\b|\bplayground\b|\btarmac\b|\bpavement\b/i, ["urban", "playing_field"]],
  ];
  const supplied = new Set(permitted(input).map((h) => h.toLowerCase()));
  for (const [pattern, licences] of PLACE_WORDS) {
    if (!pattern.test(text)) continue;
    if (!licences.some((tag) => supplied.has(tag))) {
      return { ok: false, reason: `names a place not supplied: ${pattern.source}` };
    }
  }

  return { ok: true };
}

/**
 * Whether there is anything grounded for the model to adapt to.
 *
 * Its own exported function rather than a line inside `draftPlaceInstruction`,
 * because it could not be tested there: with no API key both this rule and the
 * availability check return null, so deleting this one left every test green.
 * A rule that cannot be observed failing is not a guard, it is a comment.
 *
 * Asking a model to describe a place we know nothing about is the
 * invented-nature failure arriving through the front door, so this is the one
 * that has to hold.
 */
export function hasGroundToStandOn(input: PlaceInstructionInput): boolean {
  return input.aliveIn.length > 0 || input.reachable.length > 0;
}

/**
 * Draft the instruction, or return null and let the authored line render.
 *
 * Null on: no model configured, a failed or slow call, unparseable output, or
 * a draft that fails the guard. Every one of those is a normal outcome rather
 * than an error, because the fallback is a good sentence written by a person.
 */
export async function draftPlaceInstruction(
  input: PlaceInstructionInput
): Promise<string | null> {
  if (!hasGroundToStandOn(input)) return null;
  if (!isModelAvailable()) return null;

  const prompt = loadPrompt("place-instruction");
  if (!prompt) return null;

  return draft({
    prompt: { ...prompt, user: buildUser(input) },
    facts: input,
    maxTokens: 200,
    parse: stringField("instruction"),
    check: checkInstruction,
  });
}
