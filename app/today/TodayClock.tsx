"use client";

import { useEffect, useState } from "react";
import { greetingFor } from "@/lib/greeting";
import { formatLocaleDate, type Locale } from "@/lib/localization";
import styles from "../today.module.css";

/**
 * THE CLOCK ON TODAY — the greeting and the date, kept true by the device.
 *
 * The page is rendered on a server whose clock is UTC, and a teacher's iPad
 * is often left open on Today from the staff room in the morning to the
 * playground door after lunch. So the server's words are only a first paint:
 * this component starts from them (so hydration has nothing to disagree
 * with), reads the device's own clock as soon as it mounts, and reads it again
 * every minute and whenever the page comes back into view. A page opened at
 * eight and looked at again at one says "Good afternoon."
 *
 * Nothing here is composed. The greeting is a three-way lookup on the hour
 * and the date is the same formatter the rest of the app uses.
 */
export function TodayClock({
  locale,
  greeting,
  dateLine,
}: {
  locale: Locale;
  greeting: string;
  dateLine: string;
}) {
  const [clock, setClock] = useState({ greeting, dateLine });

  useEffect(() => {
    const read = () => {
      const now = new Date();
      setClock({ greeting: greetingFor(now.getHours()), dateLine: formatLocaleDate(now, locale) });
    };
    read();
    const interval = window.setInterval(read, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", read);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", read);
    };
  }, [locale]);

  return (
    <header className={styles.todayIntro}>
      <p className={styles.greeting}>{clock.greeting}</p>
      <p className={styles.context}>{clock.dateLine}</p>
    </header>
  );
}
