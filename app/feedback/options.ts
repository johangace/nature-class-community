/**
 * The feedback page's two optional context questions (#686). Shared between
 * the form (renders them) and the action (accepts nothing outside them), so
 * the allowlist cannot drift from the options on screen.
 *
 * "During a lesson" rather than "/run": a teacher names the moment, not the
 * route. The lists stay short enough to read in one glance on an iPad.
 */

export const FEEDBACK_SCREENS = [
  "Today",
  "During a lesson",
  "Season",
  "Journal",
  "Classes",
  "Grounds",
  "Signing in",
  "Somewhere else",
] as const;

export const FEEDBACK_DEVICES = [
  "iPad or tablet",
  "Phone",
  "Laptop or desktop",
  "Whiteboard or projector",
] as const;
