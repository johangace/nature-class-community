export type LessonPreparationPath =
  | "/session"
  | "/session/start"
  | "/session/preview"
  | "/session/primer"
  | "/session/safety"
  | "/session/place"
  | "/session/route"
  | "/session/take"
  | "/outside"
  | "/run"
  | "/print";

/** Preserve the selected lesson (and explicit locale) across preparation pages. */
export function lessonHref(
  path: LessonPreparationPath,
  sessionId: string,
  locale?: string
): string {
  const query = new URLSearchParams({ session: sessionId });
  if (locale) query.set("locale", locale);
  return path + "?" + query.toString();
}

/**
 * The same link, staying inside the legacy prototype mode.
 *
 * A mode you can fall out of by tapping anything is not a mode you can judge,
 * so every link the legacy plan draws carries `plan=legacy` forward. The scroll
 * never calls this, which is why it cannot leak into the default.
 */
export function legacyHref(
  path: LessonPreparationPath | "/",
  sessionId: string,
  locale?: string
): string {
  const query = new URLSearchParams({ session: sessionId, plan: "legacy" });
  if (locale) query.set("locale", locale);
  return path + "?" + query.toString();
}
