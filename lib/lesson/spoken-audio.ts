import type { Block, Phase, Session } from "@/schema/pack";
import type { SourceFieldRef } from "@/schema/prepared-day";
import { spokenLine } from "@/lib/text";
import manifest from "./spoken-audio.manifest.json";

/**
 * RECORDED SPEECH FOR THE LESSON'S SPOKEN LINES (nc#358).
 *
 * Johan's ruling: a teacher may press play instead of reading aloud. This is
 * the seam between the recordings and the runner, and every rule the ticket
 * cares about is enforced here rather than remembered downstream.
 *
 * ONLY `say-aloud` IS EVER VOICED, AND THE LOOKUP IS THE GUARD.
 *
 * The manifest is keyed on the SPOKEN LINE ITSELF — the exact string the
 * runner puts on the page — not on a session id, a phase key, or a block
 * index. Three things follow from that, and they are the whole design:
 *
 *   1. A `teacher-note` cannot be spoken by accident. Its text was never
 *      offered to the synthesiser, so it has no key, so there is nothing to
 *      look up. Putting a note into a child's ears would take somebody adding
 *      the note type to `collectSpokenLines` below, which is one line under a
 *      test that fails the moment it moves.
 *   2. The verbatim guard holds for free. If a single character of an
 *      authored line changes, the key changes, the lookup misses, and the
 *      control disappears rather than speaking the old words over the new
 *      ones. Audio can drift out of existence; it can never drift out of
 *      agreement with the page.
 *   3. Identical lines across packs share one recording. The five settle
 *      lines are the same everywhere, and so is their file.
 *
 * The key is the line AFTER `spokenLine` unwrapping, because that is what is
 * actually said out loud — an authored wrapping quote is punctuation for the
 * page, and nobody reads quotation marks to a class.
 *
 * WHAT IS DELIBERATELY NOT VOICED, AND WHY:
 *
 *   `teacher-note`  — direction to the teacher. Never. See above.
 *   `demo`          — `technique` is a move she makes with her hands, written
 *                     to her ("hold the leaf up so the class can see the
 *                     veins"). It is not addressed to the children and would
 *                     be nonsense in their ears.
 *   `conditions-line` — about the actual sky that day, and
 *                     `groundSessionConditions` replaces its text on the server
 *                     with today's grounded sentence before the run starts. A
 *                     recording made months ago cannot honestly speak today's
 *                     weather, so it is not offered one. (Until #672 this note
 *                     also said the hybrid runner "does not even render it",
 *                     which was true and was the whole bug: the sentence was
 *                     composed at model cost on every session start and the
 *                     default surface showed none of it. It now renders once,
 *                     at the threshold — see `lib/run/threshold-conditions.ts`.
 *                     The reason it stays unvoiced is unchanged and is the
 *                     first one, not the second.)
 *   `circle-question` — spoken, but the circle is a discussion the teacher
 *                     leads in her own voice, opening questions in place. Left
 *                     out of the first version on purpose, not by oversight.
 */

export type SpokenClip = {
  /** Same-origin path to the mp3, under /lesson-audio. */
  src: string;
  /** Estimated spoken length, for the control's countdown. */
  seconds: number;
};

/** Spoken line → its recording. A line with no recording is simply absent. */
export type SpokenAudio = Record<string, SpokenClip>;

/** Where the pre-generated mp3s are served from. */
export const SPOKEN_AUDIO_BASE = "/lesson-audio";

type Manifest = {
  voice: string;
  model: string;
  lines: Record<string, { file: string; seconds: number }>;
};

const loaded = manifest as Manifest;

/** The voice and tier every shipped recording was made at. */
export const spokenAudioVoice = { voice: loaded.voice, model: loaded.model };

/**
 * Every line this session could read aloud — under any ability band and any
 * condition variant, because the runner picks the band at render time and a
 * wet-day phase carries its own blocks.
 *
 * Exported so the generation script and the runtime agree on the corpus by
 * construction: the script voices exactly what this returns.
 */
export function collectSpokenLines(session: Session, provenance?: {
  lineSource(line: string, source: SourceFieldRef): void;
  sharedSettleInserted?: boolean;
}): string[] {
  const lines: string[] = [];

  const fromBlock = (block: Block, path: string, shared: boolean): void => {
    if (block.type !== "say-aloud") return;
    const variants = block.abilityVariants;
    for (const [field, text] of [
      ["text", block.text],
      ["abilityVariants.reception", variants?.reception],
      ["abilityVariants.y1", variants?.y1],
      ["abilityVariants.y2", variants?.y2],
    ] as const) {
      if (typeof text !== "string" || !text.trim()) continue;
      const line = spokenLine(text); lines.push(line);
      const source: SourceFieldRef = shared
        ? {scope: "shared", sourceId: "settle", field: `${path}.${field}`}
        : block.nid ? {scope: "node", sessionId: session.id, nid: block.nid, field}
        : {scope: "session", sessionId: session.id, field: `${path}.${field}`};
      provenance?.lineSource(line, source);
    }
  };
  const fromPhase = (phase: Phase, path: string, shared: boolean): void => {
    phase.blocks.forEach((block, i) => fromBlock(block, `${path}.blocks.${i}`, shared));
    phase.conditionVariants?.forEach((variant, i) => fromPhase(variant.phase, `${path}.conditionVariants.${i}.phase`, shared));
  };
  session.phases.forEach((phase, i) => {
    const shared = provenance?.sharedSettleInserted === true && i === 0;
    fromPhase(phase, shared ? "phase" : `phases.${i}`, shared);
  });
  return [...new Set(lines)];
}

/**
 * The recordings this session actually has, ready to hand to the runner.
 *
 * Resolved on the server so the client never carries the whole manifest and
 * never hashes anything: a session's map is a handful of entries. A line with
 * no recording is missing from the result, and the control renders nothing —
 * which is the honest state before the synthesis script has been run, and the
 * state a changed line falls back to on its own.
 */
export function spokenAudioForSession(session: Session): SpokenAudio {
  const found: SpokenAudio = {};
  for (const line of collectSpokenLines(session)) {
    const entry = loaded.lines[line];
    if (entry) {
      found[line] = {
        src: `${SPOKEN_AUDIO_BASE}/${entry.file}`,
        seconds: entry.seconds,
      };
    }
  }
  return found;
}
