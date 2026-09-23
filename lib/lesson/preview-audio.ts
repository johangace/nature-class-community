import { clipKeyOf } from "./clip-key.mjs";
import type { Session } from "@/schema/pack";
import { cardSeconds, previewDeck, type NarrationSegment, type PreviewCard } from "./preview";
import manifest from "./preview-audio.manifest.json";

/**
 * THE SEAM BETWEEN THE PREVIEW DECK AND ITS RECORDINGS (nc#515).
 *
 * Server-only, and resolved once in `app/run/page.tsx`: the client is handed a
 * dozen card objects with a src on each, and never sees the manifest, never
 * hashes anything, and never decides what may be spoken.
 *
 * NO RECORDINGS MEANS NO PREVIEW ROW. `previewForSession` returns null when
 * nothing in this session has been voiced, and the doorway renders no row at
 * all rather than a control that opens onto silence. That is the same rule the
 * runner's play control already follows (#358), for the same reason: a dead
 * control costs a teacher a tap, a wait, and her confidence in the surface.
 *
 * A card that is voiced when its NEIGHBOURS are not is a different case, and it
 * is not an error. The key is content-addressed over the words and their
 * silences, so a pack edit retires that one card's recording and leaves the
 * rest standing; the deck falls to tap-to-advance on the card that lost its
 * voice. The failure state is a mode, not an error screen.
 */


export type PreviewClip = {
  /** Same-origin path under /lesson-preview. */
  src: string;
  /** Measured, from ffprobe at generation time. The progress bar sizes on it. */
  seconds: number;
  /**
   * Where each narration segment starts inside the clip, in seconds, measured
   * at splice time (nc#625). Aligned with the card's `narration` by index; the
   * drawer on the shape card opens the section a segment names when the clip
   * crosses its mark. Absent on clips recorded before marks existed — the card
   * shows its static list until the corpus is regenerated.
   */
  marks?: number[];
};

export type LessonPreview = {
  cards: PreviewCard[];
  /** Card id → its recording. A card with no entry is played silently. */
  clips: Record<string, PreviewClip>;
  /** Measured total, for the doorway row's caption. */
  seconds: number;
};

/** Where the pre-generated preview recordings are served from. */
export const PREVIEW_AUDIO_BASE = "/lesson-preview";

type Manifest = {
  voice: string;
  model: string;
  clips: Record<
    string,
    { file: string; seconds: number; text: string; marks?: number[] }
  >;
};

const loaded = manifest as Manifest;

/** The voice and tier every shipped preview recording was made at. */
export const previewAudioVoice = { voice: loaded.voice, model: loaded.model };

/**
 * The content address of a card's recording.
 *
 * One line, because the hash itself now lives in `clip-key.mjs` and the
 * synthesis script imports the same function (#570). It used to be a second
 * implementation of the same sha256, kept honest by a spec — which caught a
 * real drift on its first run, where the script passed raw control characters
 * as separators and this did not. Every card disagreed, nothing looked wrong
 * in the diff, and the failure it would have shipped is every Preview row
 * disappearing at once.
 */
export function clipKey(narration: NarrationSegment[]): string {
  return clipKeyOf(narration, previewAudioVoice);
}

/**
 * This session's deck and whatever of it has been voiced, or null when none of
 * it has.
 *
 * Given the session the page will actually RENDER — localized, place-adapted
 * and grounded — so what is looked up is what is on screen. A place pack that
 * swaps an instruction changes the words, changes the key, and retires that
 * card's recording rather than speaking the London version over the Miami one.
 */
export function previewForSession(session: Session): LessonPreview | null {
  const cards = previewDeck(session);
  const clips: Record<string, PreviewClip> = {};

  for (const card of cards) {
    if (card.narration.length === 0) continue;
    const entry = loaded.clips[clipKey(card.narration)];
    if (!entry) continue;
    clips[card.id] = {
      src: `${PREVIEW_AUDIO_BASE}/${entry.file}`,
      seconds: entry.seconds,
      ...(entry.marks ? { marks: entry.marks } : {}),
    };
  }

  if (Object.keys(clips).length === 0) return null;
  // The deck's own clock, not the sum of the recordings: the caption on the
  // doorway and the bar inside the deck are the same number.
  const seconds = cards.reduce(
    (total, card) => total + cardSeconds(card, clips[card.id]?.seconds ?? 0),
    0
  );
  return { cards, clips, seconds: Math.round(seconds) };
}
