/** Pointmoon's UTC ISO week and ISO week-year (Thursday belongs to that year). */
export function producerWeek(date: Date): { week: number; year: number } {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - weekday);
  const year = thursday.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  return { week: Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7), year };
}

/**
 * Do two instants fall in the same producer week?
 *
 * ONE OWNER FOR THE COMPARISON, because a weekly read is only honest under a
 * day inside the week it was read for. `session-day.ts` partitions readings
 * into the-hour and the-season and lets every seasonal read travel to any day
 * it will resolve — true of the look-fors, which are resolved on the chosen
 * day's week, and NOT true of a signal read live out of this week's payload
 * (`readPhenologyCondition` only admits a phenology block whose week is the
 * current one). Those reads need this narrower question, and asking it in one
 * place is what stops a second answer to it growing beside the first.
 *
 * The UTC/local seam is the one `session-day.ts` already records: a day here
 * is a local calendar day and the week is Pointmoon's UTC ISO week, so a
 * server and a school in distant zones can disagree about the week for a few
 * hours either side of a week boundary. Both sides of this comparison go
 * through the same function, so the disagreement cannot be introduced by the
 * comparison itself.
 */
export function sameProducerWeek(a: Date, b: Date): boolean {
  const left = producerWeek(a);
  const right = producerWeek(b);
  return left.week === right.week && left.year === right.year;
}
