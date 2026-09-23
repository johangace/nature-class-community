/**
 * THE GREETING, READ OFF A CLOCK RATHER THAN TYPED IN (2026-09-07).
 *
 * Today opened with the words "Good morning." for as long as the page has
 * existed, and Johan opened it at midday: *"good morning is stale now is
 * midday"*. The line is the first thing on the screen and it was the one
 * thing on it that never read anything.
 *
 * Two clocks matter and neither is the server's. The server runs in UTC, so
 * a Massachusetts teacher at two in the afternoon would be greeted for the
 * evening; the school's own longitude puts the server's first guess within an
 * hour of her wall clock, and the device in her hand then says the rest
 * (`app/today/TodayClock.tsx`). The boundaries are the ordinary ones: the
 * morning ends at noon, the afternoon at six.
 */

export type Greeting = "Good morning." | "Good afternoon." | "Good evening.";

/** The greeting for an hour on a 24-hour clock. Anything outside 0-23 is treated as unknown and reads as morning, the one word that was never wrong before noon. */
export function greetingFor(hour: number): Greeting {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "Good morning.";
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

/**
 * The server's best guess at the school's wall clock, as a Date whose UTC
 * fields read as local time there.
 *
 * Fifteen degrees of longitude is an hour. That ignores daylight saving and
 * the way zone borders wander, so it can be an hour out at the edges, and it
 * is only ever the first paint: the device corrects it on mount. Without a
 * longitude the guess is the server's own clock, exactly as before.
 */
export function approximateLocalTime(now: Date, lng?: number | null): Date {
  if (typeof lng !== "number" || !Number.isFinite(lng)) return now;
  const offsetHours = Math.round(lng / 15);
  return new Date(now.getTime() + offsetHours * 3_600_000);
}
