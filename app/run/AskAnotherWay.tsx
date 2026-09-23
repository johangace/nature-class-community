"use client";

import { useState } from "react";
import type { AbilityBand } from "@/schema/pack";
import {
  askAnotherWayLabels,
  askAnotherWayOptions,
  type AskAnotherWayOption,
} from "@/lib/ai/ask-another-way-contract";
import { QUIET } from "./AssistantSheet";
import styles from "./journey.module.css";

/**
 * ASK IT ANOTHER WAY (#390) — the row under an open circle question.
 *
 * A question falls flat and the class goes quiet. She taps one of three fixed
 * ways in and gets ONE other way to ask the same question; a second tap puts
 * it on the plate in place of the authored one.
 *
 * NO FREE TEXT, which is the whole reason the shape changed: outdoors, in a
 * silence she is trying to end, a row of three chips is a decision and a
 * keyboard is a task. The teacher picks the axis and the model writes the
 * sentence.
 *
 * THE ORIGINAL IS THE ONLY THING EVER REPHRASED. This component sends the
 * question's ADDRESS — session, phase, index — and never its words, so a
 * second tap after a swap rephrases what the author wrote rather than what the
 * model last said. There is no drift chain to break because there is nothing
 * for one to be made of.
 *
 * A MISS IS SILENT TO THE CLASS. No model, a failed call, a refused draft: the
 * authored question stays exactly where it is and the teacher sees the shipped
 * quiet sentence in her own small type. Nothing about the plate changes, so
 * there is nothing for a child to notice.
 */
export function AskAnotherWay({
  ability,
  locale,
  onUse,
  onRestore,
  phaseKey,
  questionIndex,
  sessionId,
  swapped,
}: {
  /**
   * The class's band, or undefined when nobody knows it (#860). Sent as
   * absent, which is how the route resolves the question's BASE wording —
   * the words the plate beside her is showing.
   */
  ability: AbilityBand | undefined;
  locale?: string;
  /** Put this wording on the plate in place of the authored question. */
  onUse: (question: string) => void;
  /** Put the authored question back. */
  onRestore: () => void;
  phaseKey: string;
  /** Which circle question on the phase, in the order the plate renders. */
  questionIndex: number;
  sessionId: string;
  /** True when the plate is currently showing a rephrasing, not the author's. */
  swapped: boolean;
}) {
  const [busy, setBusy] = useState<AskAnotherWayOption | null>(null);
  const [offer, setOffer] = useState<string | null>(null);
  const [quiet, setQuiet] = useState(false);

  async function ask(option: AskAnotherWayOption) {
    if (busy) return;
    setBusy(option);
    setQuiet(false);
    setOffer(null);
    try {
      const response = await fetch("/api/ask-another-way", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, phaseKey, questionIndex, option, ability, locale }),
      });
      const body = (await response.json()) as {
        available?: boolean;
        question?: string | null;
      };
      if (!response.ok || !body.available || !body.question) {
        setQuiet(true);
        return;
      }
      setOffer(body.question);
    } catch {
      setQuiet(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.askAnother}>
      <p className={styles.askAnotherLead}>Ask it another way</p>
      <div className={styles.askAnotherRow} role="group" aria-label="Ask it another way">
        {askAnotherWayOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.askAnotherChip}
            disabled={busy !== null}
            onClick={() => void ask(option)}
          >
            {askAnotherWayLabels[option]}
          </button>
        ))}
      </div>

      {busy && (
        <p className={styles.askAnotherQuiet} role="status">
          Thinking&hellip;
        </p>
      )}

      {quiet && !busy && <p className={styles.askAnotherQuiet}>{QUIET}</p>}

      {offer && !busy && (
        <div className={styles.askAnotherOffer}>
          <p className={styles.askAnotherOfferText}>{offer}</p>
          <button
            type="button"
            className={styles.askAnotherUse}
            onClick={() => {
              onUse(offer);
              setOffer(null);
            }}
          >
            Use this
          </button>
        </div>
      )}

      {swapped && !offer && (
        <button type="button" className={styles.askAnotherBack} onClick={onRestore}>
          Back to the written question
        </button>
      )}
    </div>
  );
}
