"use client";

import { useEffect, useState } from "react";

/**
 * IS THERE MORE BELOW? (#1079)
 *
 * The runner's footer is sticky, so the action is always reachable. The thing
 * a sticky footer cannot say on its own is whether it is covering anything —
 * and on a projector that matters more than it does in an app, because content
 * below the fold is content a room full of children cannot see and nobody but
 * the teacher can scroll.
 *
 * CSS cannot answer it. There is no selector for "this document scrolls", and
 * the honest alternatives are worse: a permanent gradient reads as a rendering
 * fault on the short screens that are the common case, and scroll-driven
 * animations are not something to put on the one surface that has to work on a
 * school iPad of unknown vintage.
 *
 * So: one boolean, measured. Deliberately cheap — the listeners are passive,
 * the work is one comparison behind a rAF, and it only ever changes a data
 * attribute, so nothing re-renders the lesson.
 *
 * A tolerance of one CSS pixel keeps a fractional scroll height (a zoomed page,
 * a device pixel ratio that does not divide) from reporting "more below" on a
 * document already at its end.
 */
export function useScrollCue(): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = document.documentElement;
      const remaining = root.scrollHeight - window.scrollY - window.innerHeight;
      setMore(remaining > 1);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    // A moment changing swaps the whole body, so the answer changes without a
    // scroll or a resize. The observer is what makes this correct on a step
    // rather than merely correct on first paint.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, []);
  return more;
}
