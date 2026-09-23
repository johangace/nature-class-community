/**
 * Carrying the school's name from the join link into onboarding (#529).
 *
 * WHY IT IS NOT A QUERY PARAMETER
 *
 * The path between /join and /start runs through the magic-link email. She
 * asks for the link on one screen, opens it out of her inbox some minutes
 * later, and the browser that opens it was handed a URL we wrote before she
 * ever typed her address. Nothing in a query string survives that round trip,
 * and the auth flow is explicitly out of scope to change.
 *
 * WHY IT IS NOT sessionStorage
 *
 * For the same reason. sessionStorage is scoped to the tab, and the tab that
 * opens an email link is usually not the tab that asked for it. A prefill that
 * only worked when she happened to stay in one tab would look like a flaky
 * feature rather than an absent one.
 *
 * WHAT IT IS INSTEAD
 *
 * One localStorage entry with a timestamp, read once and deleted on read. The
 * expiry is what makes that safe on the shared staffroom iPad this product
 * runs on: a name left behind by whoever set up a class before lunch must not
 * be waiting in the field for the next teacher that afternoon. Two hours is
 * long enough to walk to your inbox and back, short enough that the stale case
 * is a rounding error rather than a habit.
 *
 * It is a convenience, never a fact. Everything it does is put characters in a
 * field the teacher can see and overwrite, and if it fails, misses, or expires,
 * she types her school's name exactly as she did before this existed.
 */

import { readInviteCohort, readSchoolName } from "./join";

const KEY = "nature-class.join.school";

/**
 * The invite link's cohort code (#821) travels the same way and for the same
 * reasons as the school's name, in its own entry, because a link may carry
 * either without the other. Unlike the name it is not a convenience: it ends
 * up on the teacher's record. It is still taken once and expires, so a code
 * left on a shared iPad cannot attach itself to the next teacher's sign-up.
 */
const COHORT_KEY = "nature-class.join.cohort";

/** Two hours, in milliseconds. */
export const JOIN_PREFILL_TTL_MS = 2 * 60 * 60 * 1000;

/** The slice of the Storage interface this uses, so a test can pass a fake. */
export interface PrefillStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage throws rather than returning null in two ordinary situations:
 * private browsing on older Safari, and a browser configured to block site
 * data. Neither is an error a teacher should ever hear about, because the
 * feature that fails is "we saved you some typing".
 */
function browserStore(): PrefillStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Remember the school from a join link. Called on /join, once, on arrival. */
export function rememberJoinSchool(
  school: string,
  now: number = Date.now(),
  store: PrefillStore | null = browserStore()
): void {
  if (!store) return;
  const name = readSchoolName(school);
  if (!name) return;
  try {
    store.setItem(KEY, JSON.stringify({ school: name, at: now }));
  } catch {
    // Quota, or site data blocked. She types it. Nothing else changes.
  }
}

/**
 * Take the remembered school, if there is a fresh one, and forget it.
 *
 * Taking rather than reading is the point. The name is for the one class she
 * is setting up now; leaving it behind would put it in front of the next
 * person to open the flow on this device.
 */
export function takeJoinSchool(
  now: number = Date.now(),
  store: PrefillStore | null = browserStore()
): string | null {
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    store.removeItem(KEY);
  } catch {
    // Best effort. A name we cannot delete is still a name we only use once,
    // because the expiry below runs on every read.
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { school, at } = parsed as { school?: unknown; at?: unknown };
  if (typeof at !== "number" || !Number.isFinite(at)) return null;

  // A timestamp in the future means a clock that moved, not a fresh entry.
  const age = now - at;
  if (age < 0 || age > JOIN_PREFILL_TTL_MS) return null;

  // Sanitise on the way out as well as in. What is in storage is whatever the
  // last page on this origin wrote there, and the field it lands in is one a
  // server action reads.
  return readSchoolName(school);
}

/** Remember the cohort code from a join link (#821). Called on /join. */
export function rememberJoinCohort(
  cohort: string,
  now: number = Date.now(),
  store: PrefillStore | null = browserStore()
): void {
  if (!store) return;
  const code = readInviteCohort(cohort);
  if (!code) return;
  try {
    store.setItem(COHORT_KEY, JSON.stringify({ cohort: code, at: now }));
  } catch {
    // Quota, or site data blocked. She is counted as organic. Nothing else changes.
  }
}

/**
 * Take the remembered cohort code, if there is a fresh one, and forget it.
 * Same once-and-expire rule as the school's name, and it is re-validated on
 * the way out because storage holds whatever this origin last wrote there.
 */
export function takeJoinCohort(
  now: number = Date.now(),
  store: PrefillStore | null = browserStore()
): string | null {
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(COHORT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    store.removeItem(COHORT_KEY);
  } catch {
    // Best effort; the expiry below still bounds it.
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { cohort, at } = parsed as { cohort?: unknown; at?: unknown };
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  const age = now - at;
  if (age < 0 || age > JOIN_PREFILL_TTL_MS) return null;
  return readInviteCohort(cohort);
}
