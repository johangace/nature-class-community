"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { SpokenClip } from "@/lib/lesson/spoken-audio";
import styles from "./journey.module.css";

/**
 * PLAY ALOUD (nc#358) — the option, never the mode.
 *
 * Johan's ruling: "a play control on the spoken lines in the runner, so a
 * teacher can press play instead of reading aloud... Teacher-led stays the
 * default. The button is an option she takes, not a mode she is put in."
 *
 * WHAT THIS IS NOT, AND WHY IT WAS REBUILT.
 *
 * The first cut reused the March prototype's `.lead-audio-strip` — a padded
 * container holding a terracotta disc, a two-line label and a progress rule.
 * Johan, seeing it: "the play button should be more subtle maybe without the
 * bar.. maybe just play aloud or a smaller play button on the side of the
 * sentence?" He is right, and the reason is written into this product's own
 * history: nc#231 and nc#232 took exactly that kind of block out of the lesson
 * to make it a book page. Putting one back — under every spoken line, on every
 * page — would have undone that a screen at a time.
 *
 * A RING AT THE END OF THE LINE, AND NOT ONE WORD OF EXPLANATION. He named a
 * glyph or the words and did not choose; then, on the choice: "just play or
 * something elegant.. i have the tendency to do so much explaining". Then, on
 * the first cut of the mark: "put the button in a circle or something should
 * be at the end of the sentence not the beginning".
 *
 * Both halves of that are one point. A loose triangle leading the line put a
 * control where her eye lands before it lands on the words she is about to
 * say, and after a quotation mark it is punctuation-shaped enough to miss.
 * Enclosed and trailing, it reads the way a full stop does: the sentence
 * finishes, then the option appears.
 *
 * The deciding argument is repetition. The curriculum carries 225 spoken lines
 * and the control sits beside every one of them. Words are READ every time they
 * appear — a label next to the sentence would be a second thing to read on a
 * page whose entire design says there is one. A glyph is recognised once and
 * skipped thereafter, which is exactly what a control has to do when it will be
 * there two hundred times. It also cannot be read to the class by mistake,
 * which is the same argument the say-aloud renderer already makes for having no
 * "say aloud" caption on the line itself.
 *
 * So there is no visible word at all, and the accessible name is one: "Play",
 * then "Stop". Our own drafts said "Play aloud to class" — "aloud" and "to
 * class" were us telling a teacher what a play triangle beside a sentence
 * already tells her.
 *
 * SUBTLE AND STILL HITTABLE. The posture is a tablet outdoors, in glare, one
 * hand, standing up, and a control small enough to be quiet is usually too
 * small to hit. The ring resolves that rather than trading it away: it is 44px
 * on both axes, the touch floor exactly, so what she aims at is what she can
 * see — the earlier bare mark hid a 44 by 56 box behind an 18px glyph and
 * asked her to aim at something invisible.
 *
 * No fill, no rule, no waveform, no label, no countdown, no second colour. The
 * ring is a hairline; the glyph takes `--action`, the one slot this
 * system has for "the thing you press". Terracotta is a reserved accent and a
 * control appearing on 225 lines is not what it is reserved for.
 *
 * NO AUDIO MEANS NO CONTROL. A line that has not been voiced, or whose
 * recording will not load, renders nothing at all. There is never a glyph here
 * that does not play — a dead control outdoors costs a teacher a tap, a wait,
 * and her confidence in the surface, and this feature exists for the teacher
 * who is not yet sure of herself.
 */

const playGlyph = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M7.5 4.7a1 1 0 0 1 1.53-.85l10 7.3a1 1 0 0 1 0 1.7l-10 7.3a1 1 0 0 1-1.53-.85z" />
  </svg>
);

/**
 * Playing state is carried by the glyph and nothing else. She needs to know it
 * is running and how to stop it; a countdown or a progress rule would be more
 * chrome on the page to say what the shape already says.
 */
const pauseGlyph = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
);

/**
 * Whether a rejected `play()` means the recording is unusable, or only that
 * this teacher was faster than the promise.
 *
 * Found in the browser, not in a test: press play and then press it again
 * straight away, and `pause()` rejects the still-pending `play()` with an
 * AbortError. Treating that as a fault made the control VANISH under a quick
 * thumb — the one hand, standing up, outdoors thumb this whole feature is
 * built for. An interruption is the teacher working the control correctly and
 * must leave it exactly where it was.
 *
 * Exported for the test, because the difference is the bug.
 */
export function isPlaybackInterruption(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function PlayAloud({
  clip,
  onFirstPlay,
}: {
  /** The recording for the line beside this control, or null when there is not one. */
  clip: SpokenClip | null;
  /** Fired once, the first time a teacher presses play in this lesson. */
  onFirstPlay?: () => void;
}): ReactElement | null {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);

  /**
   * Stop on the way out. She taps next mid-sentence and the recording must stop
   * with the page it belonged to — a voice carrying on over the next moment's
   * line is the worst thing this control could do.
   */
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, [clip?.src]);

  if (!clip || broken) return null;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio
      .play()
      .then(() => {
        setPlaying(true);
        onFirstPlay?.();
      })
      .catch((error: unknown) => {
        if (isPlaybackInterruption(error)) return;
        setBroken(true);
      });
  };

  return (
    <>
      <button
        type="button"
        className={styles.playAloud}
        onClick={toggle}
        aria-label={playing ? "Stop" : "Play"}
      >
        {playing ? pauseGlyph : playGlyph}
      </button>
      {/*
       * `preload="none"` on purpose: most teachers will read the line
       * themselves, and a runner that fetched every recording on sight would
       * spend a shared iPad's data on audio nobody asked for. The warming that
       * matters happens after she presses play once — see `onFirstPlay`.
       */}
      <audio
        ref={audioRef}
        src={clip.src}
        preload="none"
        onEnded={() => setPlaying(false)}
        onError={() => setBroken(true)}
      />
    </>
  );
}
