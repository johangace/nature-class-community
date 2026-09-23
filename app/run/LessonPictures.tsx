"use client";

import { useRef, useState } from "react";
import type { LessonPictures as PictureSet } from "@/schema/pack";
import { useModalFocus } from "./useModalFocus";
import styles from "./journey.module.css";
import gallery from "./animal-inspiration.module.css";

/** Authored examples, how-to steps and choices all open the same image viewer. */
export function LessonPictures({ pictures }: { pictures: PictureSet | null | undefined }) {
  const [selected, setSelected] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(selected !== null, dialogRef, () => setSelected(null));
  if (!pictures || pictures.items.length === 0) return null;

  const open = selected === null ? null : pictures.items[selected] ?? null;
  return (
    <>
      {pictures.purpose !== "choose-from" ? (
        <section
          className={gallery.making}
          aria-label={pictures.purpose === "how-to" ? "How to make it" : "Example"}
        >
          {pictures.items.map((item, index) => (
            <figure className={gallery.step} key={item.src}>
              <button
                type="button"
                className={gallery.pictureButton}
                aria-label={`Look closer: ${item.caption ?? item.alt}`}
                onClick={() => setSelected(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt={item.alt} loading="lazy" />
              </button>
              {item.caption && <figcaption>{item.caption}</figcaption>}
            </figure>
          ))}
        </section>
      ) : (
        <section className={gallery.gallery} aria-label="Pick one">
          <p className={styles.boardHint}>Tap to look closer</p>
          <div className={gallery.grid}>
            {pictures.items.map((item, index) => (
              <button
                key={item.src}
                type="button"
                className={gallery.animal}
                onClick={() => setSelected(index)}
              >
                {/* Decorative here: the caption below is the accessible name the
                    button already carries, and repeating it doubles the label. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt="" decoding="async" />
                <span>{item.caption ?? item.alt}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {open && (
        <div
          ref={dialogRef}
          className={styles.viewer}
          role="dialog"
          aria-modal="true"
          aria-label={open.caption ?? open.alt}
        >
          <div className={styles.viewerTrack}>
            <figure className={styles.viewerItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.src} alt={open.alt} />
              <figcaption className={styles.viewerCaption}>
                <strong>{open.caption ?? open.alt}</strong>
              </figcaption>
            </figure>
          </div>
          <button
            type="button"
            className={styles.viewerClose}
            aria-label="Put the picture away"
            onClick={() => setSelected(null)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
