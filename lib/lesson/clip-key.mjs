import { createHash } from "node:crypto";

/**
 * THE CONTENT ADDRESS OF A RECORDING (nc#570).
 *
 * One implementation, imported by the app and by the preview synthesis script
 * alike.
 *
 * It used to be two. `lib/lesson/preview-audio.ts` and
 * `scripts/synthesize-lesson-preview.mjs` each carried their own copy, held in
 * agreement by a spec that compared them across the whole corpus — and that
 * spec earned its place on its first run, catching a drift where the script
 * passed raw control characters as separators and the app did not. The two
 * hashes disagreed on every card. Nothing looked wrong in the diff, and what
 * it would have shipped is every Preview row vanishing from every lesson at
 * once, silently.
 *
 * A test that catches a class of bug is worth keeping. A design that keeps
 * producing that class of bug is worth removing. So the duplication is gone
 * and the cross-implementation spec stays, now asserting that the app and the
 * scripts reach the same function rather than that two copies happen to agree.
 *
 * WHY PLAIN .mjs RATHER THAN THE TYPESCRIPT THE APP IS WRITTEN IN.
 *
 * The synthesis scripts are plain node: a maintainer runs them by hand, they
 * reach the ElevenLabs client in a sibling checkout, and nothing compiles
 * them. They cannot import a `.ts` module behind the `@/` alias. The app can
 * import an `.mjs` with a declaration beside it, which is the direction that
 * works, and it is the pattern this repo already uses for `scripts/*.d.mts`.
 *
 * `node:crypto` makes this server-only. It is reached from server components
 * and from scripts; keep it out of anything a client component imports — see
 * `previewLength`, which lives apart for exactly that reason.
 *
 * The runner's spoken lines (#358) are deliberately NOT folded in here. That
 * corpus is keyed on the authored line itself rather than on a hash, and its
 * script salts a filename differently (`model + space + line`, no voice).
 * Unifying the two salts would rename all 225 of its recordings and force a
 * re-voice of a corpus that has not changed, which is a cost with no defect
 * behind it. It has no duplication to remove: only its script hashes anything.
 *
 * WHAT THE ADDRESS IS OVER.
 *
 * The words, their silences, the model and the voice. Salting with the tier
 * and the voice means changing either renames every file, rather than serving
 * yesterday's recording under today's manifest.
 *
 * The separators are C0 control characters, chosen because authored pack prose
 * cannot contain them. A separator a sentence could contain is a separator two
 * different narrations can collide on: without them a 500ms rest before "Four
 * parts." would hash the same as a 50ms one before "0Four parts.".
 *
 * WRITTEN AS ESCAPES, NEVER PASTED. Raw control characters are invisible in a
 * diff, in a review and in a terminal, which is precisely how the two former
 * implementations came to disagree while looking identical.
 *
 * Their VALUES cannot change without re-voicing all 526 recordings, because
 * the filename is the hash.
 */
const GAP_SEPARATOR = "\u0001";
const SEGMENT_SEPARATOR = "\u0002";
const SALT_SEPARATOR = "\u0003";

/**
 * @param {{ gapAfterMs: number, text: string }[]} narration
 * @param {{ model: string, voice: string }} at
 * @returns {string} sixteen hex characters
 */
export function clipKeyOf(narration, at) {
  const spec = narration
    .map((segment) => `${segment.gapAfterMs}${GAP_SEPARATOR}${segment.text}`)
    .join(SEGMENT_SEPARATOR);
  return createHash("sha256")
    .update(`${at.model}${SALT_SEPARATOR}${at.voice}${SALT_SEPARATOR}${spec}`)
    .digest("hex")
    .slice(0, 16);
}
