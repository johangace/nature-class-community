"use client";

import { Fragment, type ReactElement } from "react";
import type { AbilityBand, Block } from "@/schema/pack";
import { renderBlock } from "@/engine/registry";
import { useGroupNoun } from "./GroupNoun";

/**
 * Circle time: the closing gather, at the same care as the opening settle.
 *
 * The prototype closed a session on a screen of its own — a "Circle time"
 * head, the invitation to gather, then each question as its own card with
 * its teacher note beneath it, and one footer button to leave. The current
 * build had flattened that into ordinary pages, one question per screen,
 * which loses the thing a circle actually needs: all the questions in view
 * at once, so a teacher can read the room and pick the next one rather than
 * being marched through them.
 *
 * So the circle is one screen, not a walk. The words stay pack data — the
 * questions and their notes are `circle-question` and `teacher-note` blocks
 * straight from the pack, rendered by the same registry renderers the rest
 * of the run uses, so ability variants, the green plate and the eye glyph
 * all behave exactly as they do everywhere else. Only the arrangement is
 * this file's.
 *
 * PAIRING: the port carried each question's note across as a sibling block
 * immediately after it (108 of 112 questions across the shipped packs have
 * one). That adjacency IS the pairing — there is no note field on the
 * question block — so this file reads it positionally: a teacher-note
 * directly after a question belongs to that question; anything else stays
 * where the author put it, as an opening line above the cards or a closing
 * note beneath them. Nothing is invented: a question whose note did not
 * survive simply renders without one.
 */

/** One card: the question, and the note the author left with it (if any). */
interface CircleItem {
  question: Extract<Block, { type: "circle-question" }>;
  note?: Extract<Block, { type: "teacher-note" }>;
}

interface CircleReading {
  /** Blocks before the first question — the invitation to gather in. */
  opening: Block[];
  items: CircleItem[];
  /** Blocks after the questions — the named skill, a closing note. */
  closing: Block[];
}

/** Read a circle phase's blocks into cards, pairing each note to its question. */
export function readCircle(blocks: Block[]): CircleReading {
  const opening: Block[] = [];
  const items: CircleItem[] = [];
  const closing: Block[] = [];

  let i = 0;
  while (i < blocks.length && blocks[i]?.type !== "circle-question") {
    const block = blocks[i];
    if (block) opening.push(block);
    i += 1;
  }
  while (i < blocks.length) {
    const block = blocks[i];
    if (!block) break;
    if (block.type === "circle-question") {
      const next = blocks[i + 1];
      if (next?.type === "teacher-note") {
        items.push({ question: block, note: next });
        i += 2;
        continue;
      }
      items.push({ question: block });
      i += 1;
      continue;
    }
    closing.push(block);
    i += 1;
  }

  return { opening, items, closing };
}

export function CircleTime({
  blocks,
  ability,
}: {
  /** The circle phase's blocks, rendered exactly as authored. */
  blocks: Block[];
  ability: AbilityBand | undefined;
}): ReactElement {
  const { opening, items, closing } = readCircle(blocks);
  const groupNoun = useGroupNoun();

  return (
    <div
      className="run-stage circle-stage"
      role="region"
      aria-labelledby="circle-heading"
    >
      <div className="circle-head">
        <h2 id="circle-heading" className="circle-eyebrow">
          Circle time
        </h2>
        <p className="circle-sub">
          Gather your {groupNoun} in a circle and read these questions aloud.
        </p>
      </div>

      {opening.length > 0 && (
        <div className="circle-opening">
          {opening.map((b, i) => (
            <Fragment key={`o${i}`}>{renderBlock(b, ability)}</Fragment>
          ))}
        </div>
      )}

      <ol className="circle-cards">
        {items.map((item, i) => {
          return (
            <li className="circle-card" key={`q${i}`}>
              {renderBlock(item.question, ability)}
              {item.note && renderBlock(item.note, ability)}
            </li>
          );
        })}
      </ol>

      {closing.length > 0 && (
        <div className="circle-closing">
          {closing.map((b, i) => (
            <Fragment key={`c${i}`}>{renderBlock(b, ability)}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
