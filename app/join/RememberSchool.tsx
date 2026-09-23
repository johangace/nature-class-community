"use client";

import { useEffect } from "react";
import { rememberJoinCohort, rememberJoinSchool } from "@/lib/join-prefill";

/**
 * The only client-side thing on /join: put the school's name, and the invite
 * link's cohort code (#821), somewhere the onboarding flow can find them after
 * the magic-link round trip. Renders nothing.
 *
 * It is deliberately separate from the page so the landing itself stays an
 * ordinary server-rendered document. A teacher opening an invitation on a
 * school iPad over a slow connection should read the page whether or not this
 * hydrates, and if it never hydrates she loses one prefilled field and nothing
 * else. See lib/join-prefill.ts for why the store is localStorage with an
 * expiry rather than a query parameter.
 */
export function RememberSchool({
  school,
  cohort = null,
}: {
  school: string | null;
  cohort?: string | null;
}) {
  useEffect(() => {
    if (school !== null) rememberJoinSchool(school);
  }, [school]);

  useEffect(() => {
    if (cohort !== null) rememberJoinCohort(cohort);
  }, [cohort]);

  return null;
}
