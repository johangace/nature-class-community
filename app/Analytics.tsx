"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { identifyTeacher, initAnalytics, trackPageView } from "@/lib/analytics/client";
import { teacherTraits } from "@/lib/analytics/events";

/**
 * Starts analytics and records route changes. Rendered once, from the root
 * layout, and renders nothing.
 *
 * Without `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` every call
 * inside is a no-op, which is the state this repository ships in and the state
 * a self-hoster stays in unless they choose otherwise.
 *
 * It reads `usePathname` and deliberately not `useSearchParams`. Partly
 * because a query string is where an id ends up and we do not want it; partly
 * because reading search params in the root layout would push every route in
 * the app behind a Suspense boundary to keep static rendering, and analytics
 * has not earned that.
 */
export function Analytics() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}

/**
 * Attaches the signed-in teacher's opaque id to this browser's events.
 *
 * Mounted from the session-aware entry pages (`/` and `/today`) rather than
 * from the root layout. The layout does not know who is here, and teaching it
 * to find out would mean a session lookup on every request — including the
 * cold-URL demo — and would opt every route out of static rendering to read a
 * header analytics wanted.
 *
 * The consequence to know when reading a funnel: a teacher who deep-links
 * straight into `/run` and never passes Today is anonymous for that visit.
 */
export function IdentifyTeacher({
  teacherId,
  hasClass,
  locale,
  internal = false,
  inviteCohort = null,
}: {
  teacherId: string;
  hasClass?: boolean;
  locale?: string;
  /**
   * One of ours, not a teacher. Decided on the server from the address, which
   * is why only the boolean reaches this component — the email itself never
   * comes near analytics. See `isInternalTeacher`.
   */
  internal?: boolean;
  /** The invited cohort code on her record (#821), or null. */
  inviteCohort?: string | null;
}) {
  useEffect(() => {
    identifyTeacher(teacherId, teacherTraits({ hasClass, locale, internal, inviteCohort }));
  }, [teacherId, hasClass, locale, internal, inviteCohort]);

  return null;
}
