"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import Link from "next/link";
import { cardSeconds, type PreviewCard } from "@/lib/lesson/preview";
import type { LessonPreview as LessonPreviewData } from "@/lib/lesson/preview-audio";
import { lessonHref } from "../lesson-links";
import styles from "./preview.module.css";

/**
 * THE LESSON PREVIEW (nc#515) — narrated cards, full screen.
 *
 * An Assembly Code reviewer, after the August demo: *"Teachers really like to know what they're
 * going to do before they decide to do a lesson, but they also don't have much
 * time."* Johan, twice, reframing it: *"more like an autoplay voice
 * flashcard"*, and *"no 60 second ceiling but shouldnt be long"*.
 *
 * So the voice carries her and she does not have to touch anything. Tapping,
 * pausing and reading at her own pace are all there; none of them is required.
 * That was the reviewer's whole point, and it is the difference between this and the
 * pre-read page, which is a good page and the wrong shape for the sixty
 * seconds where the decision actually gets made. This sits ABOVE Pre-reading
 * on the doorway and does not replace it — Johan was explicit that both live.
 *
 * ── FULL SCREEN, AND A ROUTE ───────────────────────────────────────────────
 *
 * Johan, mid-build: *"make it full screen instead of overlay"*. It owns the
 * viewport the way the runner does: no device frame, no card on a backdrop, no
 * doorway showing through. The prototype's 520px frame was how a prototype gets
 * shown in a browser tab, not a design, and carrying it in would have shipped a
 * mockup.
 *
 * THE RETURN PATH IS THE PART THAT STILL MATTERS, and it was the whole reason
 * an overlay was proposed. She came to this lesson to decide about it; a
 * preview that strands her somewhere else has lost the thing she was deciding
 * on. So the ✕ goes back to THIS session's doorway, and the end card's three
 * doors go where they say — `Enter` into the lesson at the settle, `Pre-reading`
 * to the page that holds the depth, `Back to the season` to the shelf.
 *
 * ── HOW A CARD ENDS, AND WHY IT IS NOT JUST THE AUDIO ──────────────────────
 *
 * The obvious build advances when the clip finishes. That is right for the
 * prose cards and wrong for the list cards, where the narration is
 * deliberately shorter than the card: the voice says "Four things to gather"
 * in three seconds and the kit takes six to read. Advancing on the audio would
 * turn the page while she was on the second item — the same defect as a story
 * that ticks every five seconds, arriving from the other direction.
 *
 * So a card is on screen for the longer of its voice and its reading load
 * (`card.readingSeconds`, derived with the deck in `lib/lesson/preview.ts`),
 * and the segment above it is sized on that same figure so the bar cannot
 * promise a length the deck does not keep.
 *
 * ── SILENT IS A MODE, NOT A COURTESY TOGGLE ────────────────────────────────
 *
 * Muting switches the deck to tap-to-advance, because the voice was the thing
 * setting the pace and a card that turns over on a timer she cannot hear
 * vanishes mid-sentence. A staffroom with people in it is the case it exists
 * for.
 *
 * A card whose recording is MISSING keeps its place in the deck and advances
 * on its reading floor. That is the per-card reading of "the failure state is
 * a mode": the deck goes quiet for one card and keeps its shape. It never
 * shows an error, and it never strands her on a card waiting for a voice that
 * is not coming. Where a session has NO recordings at all, the doorway shows
 * no Preview row and this route 404s rather than opening onto silence — see
 * `previewForSession` and `app/session/preview/page.tsx`.
 */

/* The transition, Johan's numbers, after the first cut felt too fast. */
const LEAVE_MS = 340;
/** On screen and settled before a word is spoken. */
const SETTLE_MS = 280;
/**
 * ONE CLOCK FOR THE WHOLE DECK (#8xx).
 *
 * The build this replaces kept two: the audio element's own `ended` event
 * drove the prose cards, and a `setTimeout` on the reading floor drove
 * everything else. Two clocks on one card is how a page turns twice, and it is
 * exactly what a teacher saw as sections skipping — a browser that refused
 * autoplay armed the floor timer, she pressed the ring, the voice started, and
 * the timer nobody had cancelled turned the page over the top of it.
 *
 * So there is one ticker now. It reads the voice's own `currentTime` while the
 * voice is sounding and falls to the wall clock the moment it is not, which
 * means the bar and the clock move on a card with no recording, on a browser
 * that blocked the voice, and through the beat after the last word — all of
 * which used to sit frozen at zero and then jump.
 */
const TICK_MS = 50;
/**
 * How far past a card's own length the deck will wait on a voice that has
 * stalled — a clip still buffering on a school's wifi — before it turns the
 * page itself. A stalled `ended` event used to strand her on one card with no
 * way forward but the arrows she could not see.
 */
const STALL_GRACE_MS = 6000;
/** A horizontal drag past this is a page turn; anything shorter is a scroll. */
const SWIPE_PX = 48;
/**
 * HOW FAR THE PAGE FOLLOWS THE THUMB, and it is deliberately not one to one.
 *
 * A card that tracks the finger exactly is a photo carousel, and this is a
 * teacher reading a page. The damping says "yes, I felt that, and this is a
 * page rather than a card on a rail". Capped, so a long drag across a phone
 * does not slide the text out of its own measure.
 */
const DRAG_FOLLOW = 0.32;
const DRAG_CAP_PX = 44;

const playGlyph = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M7.5 4.7a1 1 0 0 1 1.53-.85l10 7.3a1 1 0 0 1 0 1.7l-10 7.3a1 1 0 0 1-1.53-.85z" />
  </svg>
);

const pauseGlyph = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
  </svg>
);

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function PreviewDeck({
  preview,
  sessionId,
  locale,
}: {
  preview: LessonPreviewData;
  sessionId: string;
  locale?: string;
}): ReactElement {
  const { cards, clips } = preview;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** The element that fetches the NEXT card's clip and never speaks. */
  const aheadRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  /** The deck is moving. False on the server and until the first card's ticker
   *  starts, so the ring arrives showing the play mark rather than a pause for
   *  a voice that has not spoken yet. */
  const [playing, setPlaying] = useState(false);
  /**
   * SHE PRESSED PAUSE, AND PAUSE NOW MEANS THE DECK.
   *
   * It used to mean only the audio element: the card kept its own timer and
   * turned over while the voice was stopped, which read as the controls
   * breaking the thing they were meant to hold. Pausing holds the voice, the
   * bar, the clock and the page turn together, and it stays held until she
   * presses it again.
   */
  const [paused, setPaused] = useState(false);
  /**
   * THIS card's recording will not play, for a reason a press cannot fix.
   * Per-card, unlike `voiceWaiting`, which is the deck-wide block a single
   * press lifts. It keeps the part slides' walk off a clip nobody can hear.
   */
  const [clipDead, setClipDead] = useState(false);
  /**
   * Bumped when the card's clock has to start again where it stands — the one
   * case being the press that lifts a blocked voice, which rewinds the card to
   * its first word. The ticker re-anchors on it.
   */
  const [run, setRun] = useState(0);
  /**
   * The browser refused to start the voice on its own (#570).
   *
   * The deck already handled this correctly — it falls to the reading floor
   * and keeps turning rather than stalling on a silent screen. What it did not
   * do was SAY so, and a teacher on a browser that blocks autoplay got a
   * wordless slideshow with no reason to think there was a voice at all. The
   * ring carries the cue until she presses it once, which is all the browser
   * is waiting for; after that the rest of the deck speaks by itself.
   */
  const [voiceWaiting, setVoiceWaiting] = useState(false);
  const [silent, setSilent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /**
   * The deck already drops its card transitions under reduced motion; the
   * part slides' inline expansion (nc#625/#675) is a bigger movement than either, so it
   * degrades the same way — to the static list, not to nothing. False on the
   * server, which also keeps the server-rendered markup the accessible
   * baseline: every part and its minutes in the document.
   */
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  /**
   * How long each card is up, and therefore how wide its segment is. The
   * measured clip plus the beat after it, floored at how long the card takes
   * to read. The end card gets a nominal stripe: she stops there, so it has no
   * length of its own.
   */
  const lengths = useMemo(
    () =>
      cards.map((card) =>
        // The end card has no length of its own, so it gets a nominal stripe.
        card.kind === "end" ? 4 : cardSeconds(card, clips[card.id]?.seconds ?? 0)
      ),
    [cards, clips]
  );
  const total = useMemo(
    () => lengths.slice(0, -1).reduce((sum, length) => sum + length, 0),
    [lengths]
  );
  const before = useMemo(
    () => lengths.map((_, at) => lengths.slice(0, at).reduce((sum, length) => sum + length, 0)),
    [lengths]
  );

  const card = cards[index];
  const clip = card ? (clips[card.id] ?? null) : null;
  /** The clip one card ahead, fetched while this one is speaking. */
  const nextSrc = (() => {
    const next = cards[index + 1];
    return next ? (clips[next.id]?.src ?? null) : null;
  })();
  const last = index >= cards.length - 1;
  /** How long this card is up: its measured voice plus the beat after it,
   *  floored at how long it takes to read. The ticker turns the page on it. */
  const length = lengths[index] ?? 0;

  /**
   * WHICH SECTION THE VOICE IS ON (nc#625/#675). Each part slide's section
   * opens inline as its connective segment is spoken: the segment carries its
   * part index, and the clip's `marks` say where it starts. The last named
   * part at or before the playhead is the open one.
   *
   * `undefined` means there is nothing to follow — no clip, no marks, a
   * pre-marks recording, Silent mode, or reduced motion — and the slide rests
   * with its own section open, which is the readable state. `null` means the
   * walk is on but the part has not been named yet ("How it runs." is still
   * being said on the first slide), so the section holds closed for the beat
   * it takes the voice to reach it.
   */
  let activePart: number | null | undefined = undefined;
  if (
    card?.kind === "phase" &&
    !silent &&
    !reducedMotion &&
    /*
     * A walk with no voice under it is a guess: where the browser REFUSED the
     * clip, the slide rests with its own section open instead of stepping
     * through marks nobody can hear.
     *
     * The gate is the refusal and not "the voice has started", which was the
     * first cut and was worse — a slide would arrive with its own section
     * open, shut it the instant `play()` resolved, and open it again on the
     * first mark, so every part slide blinked once for no reason.
     */
    !voiceWaiting &&
    !clipDead &&
    clip?.marks &&
    clip.marks.length === card.narration.length
  ) {
    activePart = null;
    for (const [at, segment] of card.narration.entries()) {
      const mark = clip.marks[at];
      if (segment.part !== undefined && mark !== undefined && mark <= elapsed) {
        activePart = segment.part;
      }
    }
  }

  /**
   * WHERE SHE IS, IN A REF AS WELL AS IN STATE, AND THAT IS THE BUG FIX.
   *
   * Every mover used to close over `index` from its own render. Four taps on
   * Back inside one frame therefore all computed `index - 1` from the SAME
   * index and moved her exactly one card — the fast-thumb defect nc#358 hit in
   * its own control, arriving here through a different door. The ref is read at
   * the moment of the tap, so four taps are four cards.
   */
  const indexRef = useRef(0);
  indexRef.current = index;
  /** Escape presses the same ✕ a thumb does, rather than a second exit path. */
  const leaveRef = useRef<HTMLAnchorElement | null>(null);
  /**
   * Where the ticker is, in seconds into this card, kept outside React so a
   * pause and a resume pick up the same number rather than a rounded copy of
   * it that has been through a render.
   */
  const elapsedRef = useRef(0);

  const goTo = useCallback(
    (to: number) => {
      const from = indexRef.current;
      if (to < 0 || to >= cards.length || to === from) return;
      indexRef.current = to;
      setLeaving(from);
      setIndex(to);
      elapsedRef.current = 0;
      setElapsed(0);
    },
    [cards.length]
  );

  const step = useCallback((delta: number) => goTo(indexRef.current + delta), [goTo]);

  /* Clear the leaving card once its fade is done. */
  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  /**
   * ARRIVING ON A CARD: point the one audio element at this card's recording.
   *
   * ONE ELEMENT, ITS `src` SET BY HAND, and that is the mobile fix. The build
   * this replaces gave the element a React `key` of the clip's src, so every
   * card turn UNMOUNTED the player and mounted a fresh one. On iOS the gesture
   * that unlocks audio unlocks the element she touched; a brand new element a
   * card later has never been touched, so `play()` was refused again, and again,
   * and the whole deck ran mute on a phone while the same file played fine on a
   * laptop. One element, kept for the life of the deck, stays unlocked.
   */
  useEffect(() => {
    elapsedRef.current = 0;
    setElapsed(0);
    setClipDead(false);
    const audio = audioRef.current;
    if (!audio) return;
    const src = clip?.src;
    if (!src) {
      // A card with no recording keeps its place and is carried by the ticker.
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    if (audio.getAttribute("src") !== src) {
      audio.pause();
      audio.setAttribute("src", src);
      audio.load();
      return;
    }
    try {
      audio.currentTime = 0;
    } catch {
      /* Not seekable yet; `load()` above is the only other way back to zero. */
    }
  }, [index, clip?.src]);

  /**
   * WARMING THE NEXT CARD'S CLIP, AND WHY IT IS NOT GREEDY.
   *
   * One element for the whole deck fixed the mobile unlock, and it left the
   * fetch of every clip starting the instant its own card arrived: a 280ms
   * settle, then a cold request, then the voice, on a shared school's wifi
   * where that request is the slow part. A card can sit mute past its own
   * settle for a reason nothing on screen explains, and the stall deadline is
   * what eventually turns the page.
   *
   * A second element, muted and never played, fetches the clip ONE card ahead.
   * One ahead, not the whole deck: she has already pressed Preview, which is
   * her asking for all of it, but the deck's own recording is still the thing
   * with a deadline on it and a dozen parallel requests would be competing
   * with the voice she is listening to right now.
   *
   * And it waits its turn — `canplaythrough` on the speaking element, so the
   * warm-up starts only once the current card is safely buffered. Fetching
   * ahead by starving the voice would be the same mistake pointed forwards.
   */
  useEffect(() => {
    const ahead = aheadRef.current;
    if (!ahead || !nextSrc) return;
    const warm = () => {
      if (ahead.getAttribute("src") === nextSrc) return;
      ahead.setAttribute("src", nextSrc);
      ahead.load();
    };
    const audio = audioRef.current;
    // No voice on this card, or it is already buffered: nothing to wait for.
    if (!audio || !clip || audio.readyState >= 3) {
      warm();
      return;
    }
    audio.addEventListener("canplaythrough", warm, { once: true });
    return () => audio.removeEventListener("canplaythrough", warm);
  }, [index, nextSrc, clip]);

  /**
   * SPEAKING. Nothing here decides when the card turns — that is the ticker's
   * single job below, which is the whole point of the rewrite.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !clip || silent || paused || !card || card.kind === "end") {
      audio?.pause();
      return;
    }
    let cancelled = false;
    const speak = () => {
      if (cancelled) return;
      // The voice has already finished this card; what is left is the beat
      // after it, and replaying the clip would be a stutter, not a resume.
      if (audio.ended) return;
      void audio
        .play()
        .then(() => {
          if (cancelled) return;
          setVoiceWaiting(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          /*
           * A REFUSAL AND A DEAD FILE ARE NOT THE SAME FAILURE, and the first
           * cut of the one-clock rewrite treated them as one.
           *
           * `NotAllowedError` is the browser saying "ask her first", and the
           * ring's pulse is the right answer: one press lifts it for the whole
           * deck (#570). Anything else — a clip that 404s, a decode that
           * fails — is a voice that is never coming, and pulsing at her then
           * is a lie with teeth: the press rewinds the card to its first word,
           * fails again, and rewinds again, so the one control on screen
           * traps her on the card it claims to fix.
           *
           * So a dead file goes quiet. The card keeps its place and turns on
           * its reading floor, which is the standing rule for a card that lost
           * its recording: the failure state is a mode, not an error.
           */
          const blocked = error instanceof DOMException && error.name === "NotAllowedError";
          setVoiceWaiting(blocked);
          if (!blocked) setClipDead(true);
        });
    };
    /* On screen and settled before a word — but only on arrival. Making her
       wait out the settle again after a pause would read as a lag. */
    const wait = elapsedRef.current > 0 ? 0 : SETTLE_MS;
    const timer = window.setTimeout(speak, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      audio.pause();
    };
    // `clip` and `card` are both derived from `index`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, clip?.src, silent, paused]);

  /**
   * THE TICKER, AND IT IS THE ONLY THING THAT TURNS A PAGE.
   *
   * It reads the voice's own `currentTime` while the voice is sounding, and
   * the wall clock the instant it is not — which covers the beat after the
   * last word, a card with no recording, and a browser that blocked the voice.
   * Those last two used to leave the bar at zero and the clock at 0:00 until
   * the card vanished without warning; they now fill exactly like a spoken one.
   *
   * It never goes backwards, so the handover from wall clock to voice at the
   * end of the settle cannot rewind the bar.
   *
   * And it has a deadline. A clip that stalls mid-buffer on a school's wifi
   * fires no `ended` event, and the build this replaces waited on that event
   * for ever. The deck now turns the page a few seconds past the card's own
   * length rather than stranding her.
   */
  useEffect(() => {
    if (!card || card.kind === "end" || silent || paused) {
      setPlaying(false);
      // Nothing is spoken over the end card, so nothing is playing over it
      // either — the ring showed a pause glyph for a voice that had stopped.
      if (card?.kind === "end") audioRef.current?.pause();
      return;
    }
    setPlaying(true);
    let anchor = performance.now();
    let painted = anchor;
    const deadline =
      anchor + Math.max(0, length - elapsedRef.current) * 1000 + STALL_GRACE_MS;

    const tick = () => {
      const now = performance.now();
      const audio = audioRef.current;
      const live =
        !!audio && !!clip && !audio.paused && !audio.ended && audio.readyState > 0;
      const value = Math.max(
        elapsedRef.current,
        live ? audio.currentTime : elapsedRef.current + (now - anchor) / 1000
      );
      anchor = now;
      elapsedRef.current = value;
      if (now - painted >= TICK_MS) {
        painted = now;
        setElapsed(value);
      }
      if (value >= length || now >= deadline) {
        window.clearInterval(timer);
        step(1);
      }
    };

    /* An interval rather than an animation frame: a frame callback does not
       run in a hidden tab, and a deck that freezes the moment she checks her
       email is a deck that has stopped. */
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(timer);
      setPlaying(false);
    };
    // `clip` and `card` are both derived from `index`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, run, silent, paused, length, step]);

  const toggle = useCallback(() => {
    if (silent) return;
    // On the end card the ring is the only thing left to press, so it replays.
    if (card?.kind === "end") {
      setPaused(false);
      goTo(0);
      return;
    }
    const audio = audioRef.current;
    /*
     * THE BROWSER IS WAITING FOR EXACTLY ONE TAP (#570), and this is it. While
     * the voice is blocked the ring is not a pause control — pausing a deck
     * she cannot hear would be answering a question she did not ask — so the
     * press goes straight to `play()`, which is the one thing that lifts the
     * block for the rest of the deck.
     */
    if (voiceWaiting && !clipDead && audio && clip) {
      /*
       * And the card starts again. The bar has been running on the reading
       * floor while the voice was blocked, so leaving the clock where it
       * stands would turn the page a sentence into the recording she has just
       * asked to hear — the skip, arriving by its last remaining door.
       */
      try {
        audio.currentTime = 0;
      } catch {
        /* Not seekable yet; it will start from the top regardless. */
      }
      elapsedRef.current = 0;
      setElapsed(0);
      setRun((n) => n + 1);
      void audio
        .play()
        .then(() => {
          setVoiceWaiting(false);
        })
        .catch(() => setVoiceWaiting(true));
      return;
    }
    // Otherwise it holds the whole deck: voice, bar, clock and page turn.
    setPaused((was) => !was);
  }, [card?.kind, clip, clipDead, goTo, silent, voiceWaiting]);


  /**
   * Space pauses, arrows step, Escape leaves.
   *
   * Intercepted at the window rather than left to whichever control has focus,
   * so the keys mean the same thing wherever she is — a Space that toggled
   * Silent because focus happened to be there would be a different feature
   * every time she pressed it. Enter still works on every button, which is how
   * a keyboard reaches the rest of the bar.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        leaveRef.current?.click();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === " ") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, toggle]);

  /**
   * SWIPING, WHICH IS HOW A PHONE TURNS A PAGE.
   *
   * The two tap zones are invisible by design and the arrows were hidden on a
   * phone on the reasoning that "a touch screen does not need" them — but the
   * gesture a touch screen actually uses was never wired, so on a phone there
   * was no move she could make that looked like going back. A drag across the
   * card now turns it, in the direction the drag went, and the arrows are back
   * in the foot on a phone as the visible way to do the same thing.
   *
   * Vertical wins ties: a long card scrolls, and `touch-action: pan-y` on the
   * stage keeps that scroll native while the horizontal drag is ours.
   */
  const dragRef = useRef<{ x: number; y: number; turning: boolean } | null>(null);
  /** A drag that turned the page must not also fire the tap zone under it. */
  const swipedRef = useRef(false);
  /**
   * How far the page has followed her thumb, and whether it is following now.
   *
   * Without it the swipe was all or nothing: a drag gave nothing back until
   * the card either turned or did not, so a hesitant thumb read as a dead
   * screen. The page leans, and if she stops short it settles back, which is
   * the answer to "is this thing draggable at all" being asked with a thumb.
   */
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    swipedRef.current = false;
    if (event.pointerType === "mouse") return;
    dragRef.current = { x: event.clientX, y: event.clientY, turning: false };
  }, []);

  const restCard = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    setDragX(0);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const from = dragRef.current;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        from.turning = true;
        setDragging(true);
      }
      if (!from.turning) return;
      // The lean. Under reduced motion the deck does not move for her at all,
      // which is the same call its card transitions already make.
      if (reducedMotion) return;
      const followed = dx * DRAG_FOLLOW;
      setDragX(Math.max(-DRAG_CAP_PX, Math.min(DRAG_CAP_PX, followed)));
    },
    [reducedMotion]
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const from = dragRef.current;
      restCard();
      if (!from || !from.turning) return;
      const dx = event.clientX - from.x;
      // Short of the threshold the page settles back where it was, which is
      // the gesture saying no as clearly as the turn says yes.
      if (Math.abs(dx) < SWIPE_PX) return;
      swipedRef.current = true;
      step(dx < 0 ? 1 : -1);
    },
    [restCard, step]
  );

  /** A tap zone, unless the thumb was on its way somewhere. */
  const tap = useCallback(
    (delta: number) => () => {
      if (swipedRef.current) return;
      step(delta);
    },
    [step]
  );

  /** The ring's press would hold the deck, rather than start something. */
  const running = playing && !paused && !(voiceWaiting && !clipDead);

  /** Back to this lesson's doorway — the thing she was deciding about. */
  const doorway = lessonHref("/session", sessionId, locale);

  return (
    <main className={styles.deck} aria-label="Lesson preview">
      {/* Flush to the top edge: full screen, this is the one piece of chrome
          that says how much is left. */}
      <div className={styles.segments} aria-hidden="true">
        {lengths.map((length, at) => (
          <div
            key={cards[at]?.id ?? at}
            className={styles.segment}
            style={{ flex: length.toFixed(2) }}
          >
            <span
              className={styles.segmentFill}
              style={{
                width:
                  at < index || (silent && at === index)
                    ? "100%"
                    : at === index
                      ? `${Math.min(100, (elapsed / Math.max(length, 0.1)) * 100)}%`
                      : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* The runner's own leave: one ✕, no question, straight back to the
          lesson she opened this from. */}
      <div className={styles.head}>
        <Link ref={leaveRef} className={styles.leave} href={doorway} aria-label="Close">
          ✕
        </Link>
      </div>

      <div
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={restCard}
      >
        {/* The left and right thirds of the whole viewport. */}
        <button
          type="button"
          className={`${styles.tap} ${styles.tapBack}`}
          onClick={tap(-1)}
          aria-label="Back"
        />
        <button
          type="button"
          className={`${styles.tap} ${styles.tapNext}`}
          onClick={tap(1)}
          aria-label="Next"
        />
        <div className={styles.scroll}>
          <div
            className={`${styles.measure} ${dragging ? styles.measureDragging : ""}`}
            style={dragX === 0 ? undefined : { transform: `translateX(${dragX.toFixed(1)}px)` }}
          >
            {/*
              Only the card she is on and the one leaving are rendered. Keeping
              all twelve mounted and hidden with `display: none` would leave the
              end card's three doors in the tab order the whole way through the
              deck, so Tab would walk her onto controls that are not on screen.
            */}
            {cards.map((each, at) =>
              at === index || at === leaving ? (
                <div
                  key={each.id}
                  className={`${styles.card} ${
                    at === index ? styles.cardOn : styles.cardLeaving
                  }`}
                  aria-hidden={at === index ? undefined : true}
                >
                  {/* A leaving part slide gets no walk state, which is its
                      resting pose — own section open — so the fade never
                      collapses what she was just reading. */}
                  <Face
                    card={each}
                    sessionId={sessionId}
                    locale={locale}
                    activePart={at === index ? activePart : undefined}
                  />
                </div>
              ) : null
            )}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        {/* While the voice is blocked the ring's job is to start it, not to
            stop a deck she cannot hear — so it shows the play mark either way. */}
        {!silent && (
          <button
            type="button"
            className={`${styles.ring} ${running ? styles.ringPlaying : ""} ${
              voiceWaiting && !clipDead ? styles.ringWaiting : ""
            }`}
            onClick={toggle}
            aria-label={running ? "Pause" : "Play"}
          >
            {running ? pauseGlyph : playGlyph}
          </button>
        )}
        <span className={styles.clock}>
          {silent
            ? `Card ${index + 1} of ${cards.length}`
            : `${clock((before[index] ?? 0) + elapsed)} / ${clock(total)}`}
        </span>
        <span className={styles.spacer} />
        <button type="button" className={styles.mode} onClick={() => setSilent((was) => !was)}>
          {silent ? "Voice" : "Silent"}
        </button>
        <span className={styles.steps}>
          <button
            type="button"
            className={styles.step}
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Back"
          >
            ←
          </button>
          <button
            type="button"
            className={styles.step}
            onClick={() => step(1)}
            disabled={last}
            aria-label="Next"
          >
            →
          </button>
        </span>
      </div>

      {/*
          One element for the whole deck, its src set by hand per card — never
          keyed, because a keyed element is a NEW element every card and iOS
          hands its audio unlock to the element the teacher actually touched.
          `preload` is "auto" rather than #358's "none": there, most teachers
          read the line themselves and fetching every recording would spend a
          shared iPad's data on audio nobody asked for. Here she has already
          pressed Preview, which is her telling us she wants all of it.
        */}
      <audio ref={audioRef} preload="auto" />
      {/* The warm-up. Muted and never played: its only job is to have the next
          card's recording in the browser's cache before she gets there. */}
      <audio ref={aheadRef} preload="auto" muted aria-hidden="true" />
    </main>
  );
}

/** One card's face. Every string on it comes from the session's own fields. */
function Face({
  card,
  sessionId,
  locale,
  activePart,
}: {
  card: PreviewCard;
  sessionId: string;
  locale?: string;
  /**
   * The part slides' walk (nc#625/#675): the part the voice is on, `null`
   * while it has not been named yet, `undefined` when there is nothing to
   * follow — which rests the slide with its own section open.
   */
  activePart?: number | null;
}): ReactElement {
  const eyebrow = card.eyebrow ? <p className={styles.eyebrow}>{card.eyebrow}</p> : null;

  if (card.kind === "title") {
    return (
      <>
        {/* Verbatim, both of them, and never smoothed for the voice. This is
            the deck's own opening card, so its headline doubles as the page's
            level-1 heading (nc#619) — `main` is labelled "Lesson preview",
            which names the surface, not the lesson, so there is nothing here
            for an h1 to duplicate. `.title`'s styling is class-based, not
            keyed to the tag, so the swap from h2 changes no pixel. */}
        <h1 className={styles.title}>{card.title}</h1>
        {card.prompt && <p className={styles.prompt}>{card.prompt}</p>}
        <p className={styles.meta}>{card.meta}</p>
      </>
    );
  }

  if (card.kind === "prose") {
    return (
      <>
        {eyebrow}
        <p className={styles.lead}>{card.lead}</p>
        {card.body && <p className={styles.body}>{card.body}</p>}
        {card.meta && <p className={styles.meta}>{card.meta}</p>}
      </>
    );
  }

  if (card.kind === "kit") {
    return (
      <>
        {eyebrow}
        <ul className={styles.items}>
          {card.items.map((item) => (
            <li key={item} className={styles.item}>
              <span className={styles.tick} aria-hidden="true">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {card.note && (
          <p className={`${styles.body} ${styles.itemNote}`}>{card.note}</p>
        )}
      </>
    );
  }

  if (card.kind === "phase") {
    /*
     * THE WALK IS THE SLIDES (nc#675), and this is Johan's second correction
     * of the same card. #575 made the shape a picture of the runner; #647
     * made it a drawer the voice drives; his verbatim third: *"i wanted a
     * closer connection between this and the section.. like how the session
     * runs: You will start with settling the class.. And then settle expands
     * inline.. Second slide: -> Count Count expands in line (settle is
     * closed) and so on.with the headers in place"*.
     *
     * So every part slide is the SAME list of section headers, with this
     * slide's own section expanded inline holding what the old chip slide
     * showed — the minutes and the teacher notes. Turning the page is what
     * closes the previous section and opens the next, which is the closer
     * connection he asked for: the structure never leaves the screen.
     *
     * A PICTURE, NOT A CONTROL, still (#575): `<li>`, nothing tappable. A
     * section she could tap would promise a navigation the deck does not
     * have; the deck's own Back/Next already walk it.
     *
     * WHEN THE SECTION OPENS. With a clip and its marks, the section expands
     * AS the voice names it — "Then Count." — which on the first slide means
     * the headers sit closed for the breath it takes to say "How it runs."
     * Everywhere the walk has nothing to follow (`activePart === undefined`:
     * Silent, reduced motion, no clip, a pre-marks recording, the fade of a
     * leaving card), the slide rests with its own section open — the readable
     * state, never a screen of shut drawers.
     */
    const open = activePart === undefined ? card.at : activePart;
    return (
      <>
        {eyebrow}
        <ul className={styles.sections} aria-label="Parts of this lesson">
          {card.parts.map((part, at) => (
            <li
              key={part.title}
              className={`${styles.section} ${
                at === open ? styles.sectionOpen : styles.sectionShut
              }`}
            >
              <p className={styles.sectionHead}>
                <span className={styles.sectionName}>{part.title}</span>
                {/* No minutes authored, no minutes shown. */}
                {part.minutes !== null && (
                  <span className={styles.sectionMinutes}>{part.minutes} min</span>
                )}
              </p>
              {/* Only this slide's own section carries content; the others
                  are headers held in place. */}
              {at === card.at && (
                <div className={styles.sectionReveal}>
                  <div className={styles.sectionBody}>
                    {card.notes.map((note, i) => (
                      <p
                        key={note}
                        className={i === 0 ? styles.sectionLead : styles.sectionNote}
                      >
                        {note}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (card.kind === "words") {
    return (
      <>
        {eyebrow}
        <div className={styles.words}>
          {card.terms.map((term) => (
            <div key={term.term} className={styles.word}>
              <p className={styles.term}>{term.term}</p>
              <p className={styles.definition}>{term.definition}</p>
              {term.forChildren && <p className={styles.forChildren}>{term.forChildren}</p>}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className={styles.endTitle}>Ready when you are.</h2>
      <p className={styles.endBody}>That is the whole lesson. Nothing here you have to remember.</p>
      <div className={styles.actions}>
        {/*
          THREE DOORS THAT GO WHERE THEY SAY. `Enter` lands on the settle, not
          back on the doorway she came from — she has just watched the lesson
          and the ✕ is already the way back, so an Enter that returned her to
          the same screen would be a second name for close.

          "Enter", not "Start": Today already uses that word for this door, on
          Johan's own ruling — "dont do Start lesson here we dont start this is
          enter".
        */}
        <Link className={styles.actionPrimary} href={lessonHref("/run", sessionId, locale)}>
          Enter
        </Link>
        <Link className={styles.action} href={lessonHref("/session/primer", sessionId, locale)}>
          Pre-reading
        </Link>
        <Link className={styles.actionQuiet} href="/season">
          Back to the season
        </Link>
      </div>
    </>
  );
}
