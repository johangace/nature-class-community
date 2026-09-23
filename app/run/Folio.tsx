"use client";

import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { KindIcon } from "@/engine/icons";
import { phaseMinutes } from "@/lib/minutes";
import { useModalFocus } from "./useModalFocus";

/**
 * The Editorial progress device: a book page's foot. A hairline rule
 * carries a small position marker at the session's within-run position;
 * under it a sentence-case folio line ("Collect · 12 min") and, right, the
 * running page number in the display face.
 *
 * Two statements, never three. The foot used to also carry a per-phase count
 * ("page 2 of 3") beside the global one ("2 / 10"), which reset at every
 * phase while the global one climbed — so a teacher glancing down read two
 * numbers that disagreed and could not tell which was their position. The bar
 * and the global count say where you are; the line says what part you are in.
 * No contradiction is possible now.
 *
 * Tapping the folio line opens the index: a minimal typographic list of
 * phase names and minutes — ink on paper, no pills — to jump anywhere.
 * Under each phase its pages run as small tappable numerals, so a teacher
 * can land on any single page, not only a phase's start (the old
 * prototype's step pills, re-set in the book register). While a
 * non-default mode (weather plan / class wording) actually changes a
 * phase, the index says so beside that phase's name in that mode's ink.
 */

export interface FolioPhase {
  key: string;
  /** Planned (base) title, so the folio stays short even when a variant swaps the phase. */
  title: string;
  /** Absent when the pack never authored this phase's length (see lib/minutes.ts). */
  durationMin?: number;
  pageCount: number;
  /** True while an active weather condition swaps this phase's plan. */
  weatherSwapped: boolean;
  /** True while the selected ability band rewords something in this phase. */
  abilityReworded: boolean;
}

export function Folio({
  phases,
  currentPhase,
  currentPage,
  onJump,
}: {
  phases: FolioPhase[];
  currentPhase: number;
  currentPage: number;
  onJump: (phaseIndex: number, pageIndex?: number) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const indexDialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, indexDialogRef, () => setOpen(false));

  const phase = phases[currentPhase];
  const pagesBefore = phases
    .slice(0, currentPhase)
    .reduce((sum, p) => sum + p.pageCount, 0);
  const totalPages = phases.reduce((sum, p) => sum + p.pageCount, 0);
  const sessionPage = pagesBefore + currentPage + 1;
  const progress = totalPages > 0 ? sessionPage / totalPages : 0;
  const pct = Math.min(100, Math.max(0, progress * 100));

  const marks = (p: FolioPhase) =>
    [
      p.weatherSwapped ? "weather plan" : null,
      p.abilityReworded ? "class wording" : null,
    ].filter((t): t is string => t !== null);

  return (
    <div className="folio">
      <div className="folio-rule" aria-hidden="true">
        <span className="folio-fill" style={{ width: `${pct}%` }} />
        <span className="folio-marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="folio-row">
        <button
          type="button"
          className="folio-line"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <KindIcon kind="named-skill" size={15} className="folio-leaf" />
          {phase ? (
            <span>
              {phase.title}
              {phaseMinutes(phase) ? ` · ${phaseMinutes(phase)}` : ""}
            </span>
          ) : (
            <span>Index</span>
          )}
        </button>
        <span className="folio-page">
          {sessionPage}
          <span className="folio-of"> / {totalPages}</span>
        </span>
      </div>

      {open && (
        <div
          className="folio-index"
          ref={indexDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Session index"
          tabIndex={-1}
        >
          <div className="index-inner">
            <div className="index-head">
              <span className="index-eyebrow">In this session</span>
              <button type="button" className="index-close" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <ol className="index-list">
              {phases.map((p, i) => {
                const noted = marks(p);
                return (
                  <li key={p.key}>
                    <button
                      type="button"
                      aria-current={i === currentPhase ? "true" : undefined}
                      onClick={() => {
                        onJump(i);
                        setOpen(false);
                      }}
                    >
                      <span className="index-title">
                        {i === currentPhase && (
                          <KindIcon kind="named-skill" size={15} className="index-now" />
                        )}
                        {p.title}
                      </span>
                      {noted.length > 0 && (
                        <span className="index-marks">
                          {p.weatherSwapped && (
                            <em className="mark-weather">weather plan</em>
                          )}
                          {p.abilityReworded && (
                            <em className="mark-ability">class wording</em>
                          )}
                        </span>
                      )}
                      {phaseMinutes(p) && (
                        <span className="index-mins">{phaseMinutes(p)}</span>
                      )}
                    </button>
                    {p.pageCount > 1 && (
                      <div className="index-pages" role="group" aria-label={`${p.title} pages`}>
                        {Array.from({ length: p.pageCount }, (_, page) => (
                          <button
                            key={page}
                            type="button"
                            aria-current={
                              i === currentPhase && page === currentPage ? "true" : undefined
                            }
                            aria-label={`${p.title}, page ${page + 1}`}
                            onClick={() => {
                              onJump(i, page);
                              setOpen(false);
                            }}
                          >
                            {page + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
