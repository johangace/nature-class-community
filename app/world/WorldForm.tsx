"use client";

import { localizeText, type Locale } from "@/lib/localization";

import { useState, useTransition } from "react";
import { WorldBuilder } from "@/app/WorldBuilder";
import { setWorld } from "@/app/start/actions";
import styles from "@/app/world.module.css";

/**
 * The permanent Grounds wrapper around WorldBuilder, saving straight to the
 * selected class rather than making this work part of first run.
 *
 * The confirmation is deliberately quiet and deliberately present. She may have
 * changed one word on a page that otherwise looks identical afterwards, and a
 * save that shows nothing reads as a save that did not happen.
 *
 * THERE IS NO `router.refresh()` HERE, AND THAT IS THE POINT (nc#1286).
 * `setWorld` revalidates this path itself, so the answer the action already
 * sends back is the one the page takes. Asking for the tree a second time
 * alongside it is the shape that drops: 11 of 100 hydrated clicks on a probe
 * built to this file's own shape never updated the page, every one of them
 * with the write committed. `scripts/action-refresh-lint.mjs` stops it coming
 * back by hand (nc#1291, split out of this ticket at the review budget).
 */
export function WorldForm(props: {
  classId: string;
  features: string[];
  notes: string[];
  reach: string | null;
  locale?: Locale;
}) {
  const locale = props.locale ?? "uk";
  const t = (text: string) => localizeText(text, locale);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <section className={styles.profile} aria-labelledby="grounds-information-title">
      <header className={styles.profileHead}>
        <h2 id="grounds-information-title" className={styles.head}>
          {t("Add or update place information")}
        </h2>
        <p className={styles.said}>
          Tell Nature Class what a map cannot see so lesson suggestions fit this place.
        </p>
      </header>
      <WorldBuilder
        classId={props.classId}
        features={props.features}
        notes={props.notes}
        reach={props.reach}
        saving={pending}
        locale={locale}
        saveLabel={t("Save place information")}
        onSave={(next) => {
          setSaved(false);
          start(async () => {
            await setWorld({ classId: props.classId, ...next });
            setSaved(true);
          });
        }}
      />
      {saved && !pending && <p className={styles.saved}>Saved.</p>}
    </section>
  );
}
