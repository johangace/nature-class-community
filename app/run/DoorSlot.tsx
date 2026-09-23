"use client";

import Link from "next/link";
import { SpeciesLearning } from "@/app/species/SpeciesLearning";
import { useRef, useState } from "react";
import { useModalFocus } from "./useModalFocus";
import { FieldGuidePlate } from "@/app/FieldGuidePlate";
import { photoCreditText } from "@/app/PhotoCredit";
import { speciesHref, tierLabel } from "@/lib/cast/member";
import { markCaption, type DoorEvidence } from "@/lib/lesson/door";
import type { DoorLine } from "@/lib/ai/door-line";
import type { TopicTag } from "@/schema/pack";
import styles from "./journey.module.css";

/**
 * WHAT IS STANDING OUTSIDE — the evidence half of introduce-today (#324).
 *
 * Sophia: a lesson about trees currently shows zero trees. This is the strip
 * that fixes that. #233 supplies the presentation rule: species are small,
 * labeled, tappable list entities at every count. One surviving species never
 * expands into a hero and three never become a specimen gallery.
 *
 * The resolver still refuses padding. If one photograph clears the evidence
 * bar, one entity renders rather than two drawings standing in for a set we do
 * not have. Absence ships as absence here exactly as it does everywhere else.
 *
 * A DRAWN MARK SAYS WHAT IT IS. `FieldGuidePlate` has always chosen its mark
 * by iconic taxon rather than by species, which is the honest design — it does
 * not claim to show you this coot, it shows you that this is a bird. It has
 * never said so out loud, and on this page that silence is the failure Johan
 * named: two birds rendering identically reads as a portrait that is wrong.
 * The caption under each mark now names the category, so the drawing is
 * legible as a category mark rather than as a likeness. The per-kind
 * illustration this is standing in for is #321.
 */
export function DoorSlot({
  evidence,
  line = null,
  topic = null,
  fromRun = null,
  board = false,
  compact = false,
}: {
  evidence: DoorEvidence;
  /**
   * ON THE BOARD (#1004). The picture leads and is the tap target, and a tap
   * opens it full-bleed with its name, its child line and its credit, then
   * closes back to where it opened — it never leaves the run, because a child
   * at the board tapping a picture must not navigate thirty people away from
   * the lesson. The same viewer is used in the handheld runner; preparation links to the species profile.
   */
  board?: boolean;
  /** The small row under a question: pictures and names only. */
  compact?: boolean;
  /** The server's joining sentence, if it was written over THESE creatures. */
  line?: DoorLine | null;
  /** The producer scope that selected these specimens, when taxonomy can express it. */
  topic?: TopicTag | null;
  /** The live run this door is part of, so the profile can lead back (#874). */
  fromRun?: string | null;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(openAt !== null, dialogRef, () => setOpenAt(null));

  if (evidence.kind === "none") return null;

  const showViewer = board || fromRun !== null;
  const names = evidence.specimens.map(({ member }) => member.commonName);
  const open = openAt === null ? null : evidence.specimens[openAt] ?? null;

  /*
   * THE SENTENCE HAS TO BE ABOUT WHAT IS ON THE SCREEN (#342).
   *
   * The line was drafted on the server, from `resolveDoor` run over the same
   * cast this component resolves again on the client. Pure function, same
   * inputs, same answer — but the failure mode if that ever stops being true
   * is a warm sentence about two creatures nobody can see, read aloud to a
   * class, which is a worse version of the line this whole page exists to
   * delete. So the names travel with it and are compared in order, and a
   * mismatch drops the sentence in silence. The strip is still true.
   */
  const joined =
    line &&
    line.over.length === names.length &&
    line.over.every((name, index) => name === names[index])
      ? line.line
      : null;

  return (
    <section className={styles.slot}>
      {/*
        NO TIER HEADING (Johan, 2026-09-06: "Seen near your school lately, we
        don't need this line"). The claim does not go with it: each card now
        carries its own tier word beside its credit, so a recorded creature
        and a regional one read differently at every size (#233, #324).
      */}
      {showViewer && !compact && (
        <p className={styles.boardHint}>Tap a picture to see it big</p>
      )}
      {/* Above the pictures, because its job is to introduce them. Below, it
          would be a third caption competing with the two already under each
          specimen. */}
      {joined && !compact && <p className={styles.slotLine}>{joined}</p>}
      <ul className={styles.slotRow} data-compact={compact ? "true" : undefined}>
        {evidence.specimens.map(({ member, asset }, index) => (
          <li key={member.sortRank} className={styles.slotItem}>
            {/*
              THE SPECIMEN IS THE TAP TARGET (Johan, #341: "maybe make them
              clickable about the news?"). The profile is the middle tier of
              the disclosure Johan asked for on round 2 — "I like species
              profiles when we click on them rather than all info upfront" —
              and this strip is the one place a species appeared with no way
              through to it.

              THE DESTINATION IS NOT FAKED. /species/[slug] deliberately 404s
              on anything outside today's cast rather than falling back to a
              generic encyclopaedia entry, so a link here is only honest if the
              member is certain to be in the cast that page reads. This link
              carries the lesson's closed-vocabulary producer scope, and the
              profile asks the resolver to protect its requested slug before
              the eight-member display cap. The resolver still has to find it
              in today's scoped evidence; an arbitrary slug stays a 404.
              The picture and the name are one target, and the credit line is
              left outside it so a licence is never mistaken for a tap.
            */}
            {showViewer ? (
              <button
                type="button"
                className={`${styles.slotLink} ${styles.slotButton}`}
                onClick={() => setOpenAt(index)}
              >
                <div className={styles.slotPlate}>
                  {asset ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={asset.url} alt={member.commonName} decoding="async" />
                  ) : (
                    <FieldGuidePlate
                      name={member.commonName}
                      iconicTaxon={member.iconicTaxon}
                      compact
                    />
                  )}
                </div>
                <p className={styles.slotName}>{member.commonName}</p>
              </button>
            ) : (
              <Link href={speciesHref(member, topic, fromRun)} className={styles.slotLink}>
                <div className={styles.slotPlate}>
                  {asset ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={asset.url} alt={member.commonName} decoding="async" />
                  ) : (
                    <FieldGuidePlate
                      name={member.commonName}
                      iconicTaxon={member.iconicTaxon}
                      compact
                    />
                  )}
                </div>
                <p className={styles.slotName}>{member.commonName}</p>
              </Link>
            )}
            {/*
              THE CHILD LINE, UNDER THE NAME (#1004). `member.line` is the
              phenology's own child note through `calmLine` — one clause a
              child can hold, capped at 64 characters, the same cap on a board
              as in a hand (Sophia, D4: the cap is a register rule, not a
              layout one). A species with no note has no line and the entity
              is complete without it; absence ships as absence.
            */}
            {/*
              PRESENTED, A CARD IS A PICTURE AND A NAME (Johan, 2026-09-06:
              "remove credits, the images should be more like cards"). The
              credit and the tier word travel with the picture to the
              full-bleed viewer a tap opens, the rule CastFace's tile has
              always kept. In the hand, her guide keeps them under the card.
              The one caption that stays when presenting is under a DRAWN
              mark: a category word ("a drawn insect") keeps a drawing legible
              as a category rather than a likeness (#321).
            */}
            {!compact && (board ? !asset : true) && (
              <p className={styles.slotNote}>
                {board
                  ? markCaption(member)
                  : [tierLabel(member), !asset ? markCaption(member) : null]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
      {evidence.kind === "named" && !compact && (
        <p className={styles.slotGap}>{evidence.gap}</p>
      )}
      {/*
        THE PICTURE, BIG (#1004). Not a step in the walk: it opens over the
        beat and closes back to it, so a child tapping never moves the lesson.
        Same dialog chrome and focus trap as FieldPhotos; the caption is the
        name, the child line, and the same claim the small entity made — the
        credit under a photograph, the drawn-mark caption under a plate. A
        projector is not a reason to promote a claim (#233).
      */}
      {open && (
        <div
          ref={dialogRef}
          className={styles.viewer}
          role="dialog"
          aria-modal="true"
          aria-label={open.member.commonName}
        >
          <div className={styles.viewerTrack}>
            <figure className={`${styles.viewerItem} ${styles.speciesViewerItem}`}>
              {open.asset ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={open.asset.url} alt={open.member.commonName} />
              ) : (
                <div className={styles.viewerPlate}>
                  <FieldGuidePlate
                    name={open.member.commonName}
                    iconicTaxon={open.member.iconicTaxon}
                  />
                </div>
              )}
              <figcaption className={styles.viewerCaption}>
                <span className={styles.viewerEvidence}>{tierLabel(open.member)}</span>
                <strong>{open.member.commonName}</strong>
                <SpeciesLearning key={open.member.scientificName ?? open.member.commonName}
                  commonName={open.member.commonName} scientificName={open.member.scientificName} />
                <span className={styles.viewerCredit}>
                  {open.asset ? photoCreditText(open.asset) : markCaption(open.member)}
                </span>
              </figcaption>
            </figure>
          </div>
          <button
            type="button"
            className={styles.viewerClose}
            aria-label="Put the picture away"
            onClick={() => setOpenAt(null)}
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
