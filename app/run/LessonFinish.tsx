"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogSession } from "./LogSession";

/**
 * Finishing a lesson, on the scrolled lesson screen (nc#232).
 *
 * The scroll deleted the paging, and the clock went with it, because the old
 * runner started counting on the first FORWARD TAP — deliberately, so that an
 * accidental open left no trace. A page with no forward tap has no such moment,
 * so the rule has to be restated rather than ported.
 *
 * The rule here: the clock starts on the first sign she is actually teaching —
 * the first time she opens a part of the lesson, or scrolls the page. Merely
 * landing on the screen starts nothing. That keeps the old guarantee (an
 * accidental open leaves no trace) without needing a Next button to hang it on,
 * and it keeps the minutes honest, which matters because they are written to
 * the class record and shown back to her.
 *
 * This is the ONLY client component on the lesson screen, and it is deliberately
 * small. The lesson itself renders on the server so it can never be blank
 * (nc#253); if this component fails to mount, she loses the ability to log a
 * finish but she does NOT lose the lesson she is standing there teaching.
 */
export function LessonFinish({
  classId,
  className,
  homeHref = "/today",
  nextTitle,
  sessionId,
}: {
  classId: string;
  className: string;
  homeHref?: "/" | "/today";
  nextTitle?: string | null;
  sessionId: string;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // The clock starts on the first real sign of teaching, once, and never
  // restarts. Passive listeners so this cannot cost a frame on scroll.
  useEffect(() => {
    if (startedAt !== null) return;
    const begin = () => setStartedAt(Date.now());
    const options = { once: true, passive: true } as const;
    window.addEventListener("scroll", begin, options);
    document.addEventListener("toggle", begin, { once: true, capture: true });
    return () => {
      window.removeEventListener("scroll", begin);
      document.removeEventListener("toggle", begin, { capture: true } as never);
    };
  }, [startedAt]);

  /**
   * A readout, once the clock is actually running.
   *
   * It was tracking silently: the minutes existed, were written to the class
   * record and shown back to her afterwards, but she could not see them while
   * teaching. A teacher pacing a twenty-minute lesson outdoors with thirty
   * four-year-olds needs to know she is at minute six, and the old runner gave
   * her that. Losing it was a regression the scroll made quietly.
   *
   * Minutes only, and no seconds ticking: a second-by-second counter in the
   * corner of a lesson is a pressure device, and this is meant to be a glance,
   * not a stopwatch. It updates every 15s so a minute never sits visibly stale.
   */
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 60000));
    tick();
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (finishing) {
    return (
      <div className="run-finish">
        <LogSession
          sessionId={sessionId}
          classId={classId}
          className={className}
          homeHref={homeHref}
          runStartedAt={startedAt}
          startedAt={startedAt}
          nextTitle={nextTitle}
          onStartAgain={() => {
            setFinishing(false);
            setStartedAt(Date.now());
          }}
          onCompleted={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="run-finish">
      {/*
       * Ending a lesson is not a detail, so it is not hidden behind a
       * disclosure the way the old runner hid End and Pause behind "More
       * details" (inventory C15). It is also not a thing an elbow should do,
       * which is why it is plain text at the foot of a long scroll rather than
       * a large button under her thumb: to reach it she has to have got to the
       * end of the lesson.
       */}
      {startedAt !== null && (
        <p className="run-elapsed" aria-live="off">
          {elapsed === 0 ? "Just started" : `${elapsed} min so far`}
        </p>
      )}
      <button type="button" className="run-finish-open" onClick={() => setFinishing(true)}>
        Finish the lesson
      </button>
      <Link href={homeHref} className="run-leave">
        Leave without finishing
      </Link>
    </div>
  );
}
