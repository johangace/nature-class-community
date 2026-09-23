"use client";

import { useEffect, useRef, useState } from "react";
import { evidenceLabel } from "@/app/session/LessonMediaStrip";
import { photoCreditText } from "@/app/PhotoCredit";
import type { LessonMediaItem } from "@/lib/lesson/media";
import { useModalFocus } from "./useModalFocus";
import { useGroupNoun } from "./GroupNoun";
import styles from "./journey.module.css";

/**
 * Show the kids (#375). The photo references were already fetched, labelled
 * and rights-complete — and then folded behind a disclosure triangle sized for
 * a teacher checking a source, not for holding a phone up to thirty children.
 * This is the promotion: tap a name, one photograph full-bleed at the size the
 * moment needs, swipe between the few there are, one tap out.
 *
 * The honesty wording travels with the promotion: `evidenceLabel` is the same
 * function the preparation strip prints, so "Recorded within 4 km" and a
 * reference photo can never drift into two vocabularies for one claim.
 *
 * Zero model calls at tap time. Everything here was resolved at lesson open.
 *
 * `visible` is the moment-level gate from `shouldShowFieldMedia` (#403): a
 * phase can hold an open counting/noticing task where naming candidate
 * species first would prime the answer, so nothing renders on screen for it
 * — but the cache-warming effect below still runs unconditionally, keyed
 * only on `items`, so a session with a later phase that DOES show this same
 * media (or the offline-ready check) never has to wait on a network fetch
 * that a hidden phase skipped.
 */
export function FieldPhotos({
  items,
  visible = true,
}: {
  items: LessonMediaItem[];
  visible?: boolean;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const groupNoun = useGroupNoun();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(openAt !== null, dialogRef, () => setOpenAt(null));

  /**
   * Warm the photograph cache at lesson open (#375). The strip used to load
   * images lazily inside a closed <details>, which meant nothing was fetched
   * until the tray was opened — so the service worker's media cache had
   * nothing to serve when the field had no signal. A hidden Image() per item
   * makes the request now, while the wifi is still there; the worker's
   * cache-first rule does the keeping.
   */
  useEffect(() => {
    for (const item of items) {
      const img = new Image();
      img.src = item.photo.url;
    }
  }, [items]);

  // Land the viewer on the photograph she tapped, not the first one.
  useEffect(() => {
    if (openAt === null) return;
    const track = trackRef.current;
    track?.children[openAt]?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [openAt]);

  if (items.length === 0 || !visible) return null;

  return (
    <>
      <div className={styles.photoRow} role="group" aria-label={`Photographs to show the ${groupNoun}`}>
        {items.map((item, index) => (
          <button
            key={`${item.id}:${item.sourceUrl}`}
            type="button"
            className={styles.photoThumb}
            onClick={() => setOpenAt(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.photo.url} alt="" loading="lazy" decoding="async" />
            <span>{item.name}</span>
          </button>
        ))}
      </div>

      {openAt !== null && (
        <div
          ref={dialogRef}
          className={styles.viewer}
          role="dialog"
          aria-modal="true"
          aria-label="Photograph"
        >
          <div className={styles.viewerTrack} ref={trackRef}>
            {items.map((item) => (
              <figure key={`${item.id}:${item.sourceUrl}`} className={styles.viewerItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.photo.url} alt={item.name} />
                <figcaption className={styles.viewerCaption}>
                  <span className={styles.viewerEvidence}>{evidenceLabel(item)}</span>
                  <strong>{item.name}</strong>
                  {item.scientificName && <em>{item.scientificName}</em>}
                  {photoCreditText(item.photo) && (
                    <span className={styles.viewerCredit}>{photoCreditText(item.photo)}</span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          {items.length > 1 && (
            <p className={styles.viewerHint} aria-hidden="true">
              Swipe for the next photograph
            </p>
          )}
          <button
            type="button"
            className={styles.viewerClose}
            aria-label="Put the photograph away"
            onClick={() => setOpenAt(null)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
