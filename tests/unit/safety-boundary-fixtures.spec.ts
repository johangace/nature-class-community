import { describe, expect, it } from "vitest";
import { UNSAFE_FIELD_ADVICE, crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";

/**
 * One isolating fixture per deny-list pattern (#229, deliverable 3).
 *
 * WHY ISOLATING, AND WHY IT MATTERS HERE
 *
 * The coverage that existed was seven sentences lifted from the phenology
 * corpus, and every one of them trips several patterns at once — "Free sweets
 * from the hedge! Pick the fat shiny black ones." fires the free-food pattern
 * AND the picking pattern. A suite like that goes green with half the list
 * broken, which is exactly what the #220 audit found: two patterns proven to
 * work, and eight nobody had ever seen fire on its own.
 *
 * So each fixture below matches ITS pattern and no other, and the suite
 * asserts that. A pattern that stops working now fails one named test instead
 * of hiding behind a neighbour.
 *
 * This guard is a BACKSTOP and the tests should be read that way: the prompt
 * forbids this material, the teacher reads the draft before she speaks it, and
 * the authored lesson is untouched either way. What it defends is the last
 * step, where a model sentence reaches a page a teacher reads aloud to
 * four-to-six-year-olds.
 */

/** A fixture per pattern, in the order the patterns are declared. */
const ISOLATING_FIXTURES: { pattern: string; text: string }[] = [
  { pattern: "mouth verbs", text: "Ask each child to lick the sap" },
  { pattern: "free food", text: "Free snacks are hanging on the branch" },
  { pattern: "eat or drink a thing", text: "Eat them straight off the bush" },
  { pattern: "swallow verbs", text: "Encourage the class to nibble a leaf edge" },
  { pattern: "into the mouth", text: "Pop a petal on your tongue" },
  { pattern: "fruit picking", text: "Blackberry picking is best after rain" },
  { pattern: "pull the flower apart", text: "Pull the thread out of the seed head" },
  { pattern: "pocketing", text: "Fill your pockets with acorns" },
  { pattern: "picking the living", text: "Let the class gather fresh stems" },
  { pattern: "touch the unknown", text: "Have a child touch an unknown fungus" },
  { pattern: "handle anything at all", text: "Let them hold any beetle they find" },
  { pattern: "climb a thing", text: "Ask a child to climb the fence" },
  { pattern: "into the water", text: "The group may enter the water at the edge" },
  { pattern: "past the boundary", text: "Let one child cross the safe boundary" },
  { pattern: "climb onto a thing (#229)", text: "Let them climb onto the log" },
  { pattern: "wade in a named water body (#229)", text: "Children can wade in the stream" },
];

const matching = (text: string) =>
  UNSAFE_FIELD_ADVICE.map((pattern, index) => (pattern.test(text) ? index : -1)).filter(
    (index) => index >= 0,
  );

describe("crossesSafetyBoundary — one isolating fixture per pattern", () => {
  it.each(ISOLATING_FIXTURES.map((f, index) => ({ ...f, index })))(
    "pattern $index ($pattern) fires alone on: $text",
    ({ index, text }) => {
      expect(matching(text)).toEqual([index]);
      expect(crossesSafetyBoundary(text)).toBe(true);
    },
  );

  it("has a fixture for every pattern, so a new pattern cannot arrive unproven", () => {
    // The failure this closes is not a broken pattern, it is an UNCHECKED one.
    // Adding a regex above without a sentence here should turn this red.
    expect(ISOLATING_FIXTURES).toHaveLength(UNSAFE_FIELD_ADVICE.length);
  });
});

describe("the two bypasses the #220 audit proved", () => {
  // Written against the real function, and both were GREEN (i.e. the guard let
  // them through) against the patterns as they stood before this change.
  it.each([
    "Let them climb onto the log",
    "Children can wade in the stream",
  ])("no longer walks past the guard: %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(true);
  });

  it.each([
    "Let them climb up the trunk",
    "Have a child climb over the wall",
    "The class can paddle in the pond",
    "Let them wade into the river",
  ])("and neither does the same instruction reworded: %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(true);
  });

  /**
   * A third, found in review of the PR that closed the first two.
   *
   * The water pattern read `wade into|go into`, so the plainest unsafe
   * sentence in this whole domain walked straight past it on a missing "to".
   * The named-body pattern above does not catch it either: that one is about
   * streams and ponds, and this one says the literal word.
   */
  it.each([
    "Children may go in the water",
    "Let them go in the water at the edge",
  ])("and neither does the missing 'to': %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(true);
  });
});

describe("what the guard must keep letting through", () => {
  /**
   * Widening a deny-list is only half a change; the other half is what it now
   * refuses that it should not. These are sentences this product actually
   * writes about the living world — description, not instruction — and the two
   * new patterns are shaped around them.
   */
  it.each([
    "Ivy climbs the wall all summer",
    "Climbing plants use the fence for support",
    "Herons wade in the shallows at dawn",
    "Ducks paddle across the pond",
    "Watch how the water moves in the brook",
    "Look at the stream from the bank",
    "Count how many different leaf shapes you can find",
  ])("stays sayable: %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(false);
  });

});

describe("KNOWN DEFECTS — sentences that SHOULD stay sayable and do not", () => {
  /**
   * Everything in this block is behaviour the guard gets WRONG today.
   *
   * WHY `it.fails` AND NOT A GREEN `toBe(true)`. The first version of this
   * block pinned the defects by asserting what happens — `expect(...)
   * .toBe(true)` — which is character-for-character the assertion two blocks
   * up that says a genuinely unsafe instruction MUST be refused. The only
   * thing separating "must reject" from "wrongly rejects" was a describe
   * string, and when the guard is fixed those tests would go red in a file
   * about child safety, where the safe instinct is to make a red test pass
   * again. `it.fails` gets all three properties instead: the assertion states
   * the DESIRED behaviour, it is green today, and it goes red the moment the
   * guard is fixed — failing in the direction that reads correctly.
   *
   * The measured cost, because "known" is a word that should carry a number:
   * of the 8,776 `childFriendlyNote` and `description` strings across the 15
   * region files in `lib/outside/data/phenology/`, **138 cross this boundary**
   * and are silently replaced at runtime by `safeLookForNote` with "Look
   * closely at {species}. What do you notice?". Some of those 138 are the
   * guard working — the corpus really does contain "Pop one in your mouth" —
   * and some are it misfiring on natural history. Nothing counts them. #1172.
   */

  /** #1172 — safe advice refused for naming a mouth verb. */
  it.fails.each([
    "Smell it, do not taste it",
    // Live in shipped copy, us-southeast.json, suppressed today:
    "It smells sweet but remember, look don't taste!",
  ])("should be sayable, and is refused on the word alone: %s", (text) => {
    // The obvious repair is a negative lookbehind for "not"/"never", and it is
    // worse than the defect: verified in review, it opens "it does not taste
    // bad, try one" AND "Never taste anything you find", a sentence the guard
    // currently gets right. Doing this properly means knowing what the
    // sentence tells a child to DO, which a regex cannot.
    expect(crossesSafetyBoundary(text)).toBe(false);
  });

  /**
   * #1172 — a bird is not a verb, and the fallback falls back.
   *
   * `\bswallow\b` cannot match "Swallows" (the trailing s kills the closing
   * word boundary), so the plural escapes and the singular does not — itself
   * the grammatical-variation failure #1171 is about. The sharp case is
   * `genericNote()` in `lib/outside/live-lookfors.ts`, whose comment says "a
   * generic template cannot itself cross the boundary": it can, for the four
   * swallow species the corpus ships, and the child loses the question.
   */
  it.fails.each([
    "A swallow builds its nest under the eaves",
    "Look closely at Barn Swallow. What do you notice?",
  ])("should be sayable, and is refused because a species is named: %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(false);
  });

  /**
   * #1171 — description refused as though it were instruction.
   *
   * The source documents patterns 14 and 15 as separating instruction from
   * description. They do not: they separate the bare stem from the inflected
   * forms, by accident, because the corpus writes "climbs" and "climbing".
   * These are pure description in this product's own register, and the margin
   * to shipped copy is one word.
   *
   * The last two are newly refused by this change's widening of pattern 12,
   * which is the price of catching "Children may go in the water" — recorded
   * rather than hidden.
   */
  it.fails.each([
    "Watch a squirrel climb up the trunk",
    "Watch a bee climb into the foxglove bell",
    "Ducks paddle in the pond",
    "Herons wade in the river",
    "Ospreys go in the water feet first",
    "Frogs go in the water to lay their eggs",
  ])("should be sayable, and is refused as instruction: %s", (text) => {
    expect(crossesSafetyBoundary(text)).toBe(false);
  });
});
