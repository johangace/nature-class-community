/**
 * What Nature Class is allowed to tell an analytics service, and nothing else.
 *
 * WHY THIS IS A CLOSED LIST
 *
 * The old Schools prototype shipped an open `track(event, properties)`: any
 * caller could name any event and hang any object off it. That is fine in a
 * consumer app. It is not fine here. This product is used by a teacher
 * standing in front of children, its lessons carry the teacher's own private
 * reflections, and ADR-001 already wrote down the fields that must never leave
 * the teaching core — teacher reflection or held-question text, teacher or
 * child names, child identifiers, exact coordinates, raw Pointmoon evidence,
 * model prompts or responses.
 *
 * That list was written for our own `/v1/activity-events` protocol. A
 * third-party analytics SDK is a wider hole than that protocol, not a
 * narrower one, so it answers to the same allowlist or a stricter one. The
 * shape is deliberately the same: an enumerated set of events, an enumerated
 * set of properties per event, and `additionalProperties: false` enforced in
 * code rather than promised in a comment.
 *
 * Everything here is pure. No `posthog-js` import, no `window`, no network.
 * The adapter that actually sends (lib/analytics/client.ts) is the only file
 * in the repo permitted to import the SDK, and it sends nothing this module
 * has not first cleared. `scripts/analytics-lint.mjs` holds both halves shut.
 */

/**
 * Every event this product may emit. A call site names one of these
 * constants; a string literal at a call site is a lint failure, because the
 * whole point is that this file is the only place an event can be born.
 */
export const ANALYTICS_EVENTS = {
  /** Route change. Path only, and only a path the app itself routed to. */
  PAGE_VIEWED: "page_viewed",
  /** PostHog Web Analytics requires its standard event; same shaped payload. */
  WEB_PAGE_VIEWED: "$pageview",
  /**
   * DELIBERATELY ABSENT: a sign-in event.
   *
   * Both real doors leave the page the moment they succeed — the email code
   * calls `window.location.assign("/today")` and social sign-in hands the browser
   * to the provider — so a capture fired at either would be racing a hard
   * navigation, and we could not say what fraction arrived. An event whose
   * delivery rate is unknown is worse than no event, because a funnel built on
   * it reads as measurement.
   *
   * Returning teachers are measured instead from identified `page_viewed` on
   * `/today` (the normal sign-in and installed-app destination) and `/` (an
   * explicit visit to the public landing). What that loses is which door they
   * came in by — passkey, code, or school SSO. Getting it back means firing on
   * arrival with a server-set marker, not moving this event to the form.
   */
  /** First-run setup finished: this teacher now has a class and a place. */
  START_FLOW_COMPLETED: "start_flow_completed",
  /** The doorstep's far side — the class is actually doing the lesson. */
  LESSON_RUN_STARTED: "lesson_run_started",
  /**
   * The teacher logged the finished run and the server took it.
   *
   * Sent from the server (lib/analytics/server.ts), not the browser: school
   * networks filter analytics endpoints, and this is the one number that must
   * not read low by an unknown amount.
   */
  LESSON_RUN_COMPLETED: "lesson_run_completed",
  /*
   * DELIBERATELY ABSENT: an offline-queued event.
   *
   * There was one. It fired when the completion POST could not be delivered —
   * which, when a teacher is genuinely out of signal, is exactly when the
   * beacon reporting it could not be delivered either. It was measurement in
   * shape only. `lesson_run_completed` now carries `from_queue`, derived
   * server-side from how late the completion arrived, which says the same
   * thing about the completions we actually received and claims nothing about
   * the ones we did not.
   */
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Stamped on every event and every person, because we do not have a PostHog
 * project of our own.
 *
 * Nature Class reports into the Rewyld project, alongside `rewyld_app`,
 * `rewyld_web` and the backend's `rewyld`. Without this stamp a Nature Class
 * `page_viewed` is indistinguishable from a Rewyld web pageview in the same
 * table, every funnel silently mixes a teacher with a consumer app user, and
 * the mixing is invisible — the numbers look fine and mean nothing.
 *
 * `nature_class`, deliberately NOT the old prototype's `schools`. That value
 * belongs to a different codebase in a different era, and letting the two
 * share a name would merge prototype history into grant-repo history in every
 * chart that groups by product.
 */
export const DEFAULT_PROPERTIES = {
  product: "nature_class",
  platform: "web",
} as const;

/**
 * The teacher's id, namespaced.
 *
 * `distinct_id` is one flat namespace per PostHog project, and we are sharing
 * one. A Nature Class teacher id and a Rewyld user id that happened to collide
 * would not error — they would silently become one person, with one product's
 * behaviour attributed to the other's human. The prefix costs nothing and
 * removes the whole class of it.
 */
export function teacherDistinctId(teacherId: string): string {
  return `nc:${teacherId}`;
}

/**
 * The properties each event may carry.
 *
 * `duration_minutes` and `headcount` are here because ADR-001's own strict
 * protocol schema permits duration, child headcount, and derived child-minutes
 * as aggregate class-level facts. They identify no one, and child-minutes
 * outside is the number the product exists to move, so an analytics layer that
 * could not see it would be decoration.
 *
 * `lesson_id` is a published curriculum id (`w3`), not a teacher's session
 * record. It is the same class of identifier the protocol calls "published
 * lesson and content-release IDs".
 */
export const ALLOWED_PROPERTIES: Record<AnalyticsEvent, readonly string[]> = {
  [ANALYTICS_EVENTS.PAGE_VIEWED]: ["path"],
  [ANALYTICS_EVENTS.WEB_PAGE_VIEWED]: ["path"],
  [ANALYTICS_EVENTS.START_FLOW_COMPLETED]: ["invite_cohort"],
  [ANALYTICS_EVENTS.LESSON_RUN_STARTED]: [
    "lesson_id",
    "pack_id",
    "band",
    "outdoor",
    "resumed",
    "signed_in",
  ],
  [ANALYTICS_EVENTS.LESSON_RUN_COMPLETED]: [
    "lesson_id",
    "duration_minutes",
    "headcount",
    "from_queue",
    "invite_cohort",
  ],
};

/**
 * The invited-cohort code (#821): which invite link a teacher arrived through.
 *
 * A school invite link can carry `cohort=<code>`, so teachers who came in
 * through one can be counted apart from organic sign-ups and from our own
 * accounts without anyone knowing their addresses in advance. The code is
 * chosen by us when we write the link, and it is the only thing about the
 * invitation that reaches analytics: the school's name in the same link never
 * does (`school` is a forbidden key part).
 *
 * The shape is the privacy boundary, so it is enforced on the VALUE, not only
 * on the key: lowercase letters, digits and hyphens, at most 32 characters. No
 * spaces, no capitals, no punctuation, so a school's name typed as written, an
 * email address or a sentence cannot pass it, and `pick` below drops any value
 * that does not match rather than trimming it into shape. What it cannot stop
 * is a person choosing a code that spells a school; codes should be neutral
 * labels such as `autumn-a`.
 */
export const INVITE_COHORT_PATTERN = /^[a-z0-9-]{1,32}$/;

export function isInviteCohort(value: unknown): value is string {
  return typeof value === "string" && INVITE_COHORT_PATTERN.test(value);
}

/** Keys whose values must match a shape, not merely be a short string. */
const VALUE_SHAPES: Record<string, (value: unknown) => boolean> = {
  invite_cohort: isInviteCohort,
};

/**
 * Traits attached to the signed-in teacher. An opaque id and coarse context.
 *
 * The prototype's `identify` carried email, first name, last name, and school
 * name, and its group call carried the school's join code. None of that is
 * here and none of it may come back: a subprocessor holding a roster of named
 * British primary teachers and their schools is a different privacy question
 * from one holding "teacher 4f2a ran two lessons", and only the second is a
 * question this product needs to ask.
 */
export const ALLOWED_TRAITS: readonly string[] = [
  "has_class",
  "locale",
  "band",
  // PostHog's own convention, and the property the Rewyld project's
  // "Internal / Test users" cohort already matches on. It is a flag about an
  // account, not a fact about a person, so it does not cross the line above.
  "$internal_or_test_user",
  // Which invite link she arrived through, as a neutral code. See
  // INVITE_COHORT_PATTERN; absent for an organic sign-up.
  "invite_cohort",
];

/**
 * The identify payload for a signed-in teacher, built in one place so every
 * surface agrees on it.
 *
 * Staff exclusion wins over the cohort. `$internal_or_test_user` is decided
 * from the address alone and is always sent, so one of our own accounts that
 * followed an invite link (to check it works, say) still carries `true` and
 * stays out of every filtered chart. The cohort is sent alongside the flag,
 * never instead of it: a cohort says where someone came from, not whether
 * they are real.
 */
export function teacherTraits({
  hasClass,
  locale,
  internal,
  inviteCohort,
}: {
  hasClass?: boolean;
  locale?: string;
  internal: boolean;
  inviteCohort?: string | null;
}): Record<string, unknown> {
  return {
    ...(hasClass === undefined ? {} : { has_class: hasClass }),
    locale,
    $internal_or_test_user: internal,
    ...(isInviteCohort(inviteCohort) ? { invite_cohort: inviteCohort } : {}),
  };
}

/**
 * Is this an account of ours rather than a teacher's?
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 *
 * The shared Rewyld project has had a "Filter out internal and test users"
 * setting since long before Nature Class arrived, pointed at a cohort that
 * matches `$internal_or_test_user`. Nothing has ever set that property, so the
 * cohort holds nobody and the filter does nothing.
 *
 * At pilot scale that is not a rounding error. A handful of real teachers and
 * one founder testing daily produces a chart that is mostly the founder, and
 * it has already happened once: the consumer app's D7 read 87.7% for identified
 * users, which turned out to be Johan and testers who had logged in, and the
 * natural-user figure was simply never known.
 *
 * The usual escape hatch is closed here on purpose. Filtering internal users by
 * email domain is the normal move, and this product deliberately sends no email
 * anywhere near analytics, so there is nothing for a domain rule to match on
 * downstream. The match therefore happens on the server, where the address is
 * already known, and only the boolean travels.
 *
 * Configured, never committed: `NATURE_CLASS_INTERNAL_EMAILS` holds a
 * comma-separated list of addresses and `@domain` suffixes. Unset — which is
 * how this repository ships, and how a self-hosting school runs — nobody is
 * internal and this returns false for everyone.
 */
export function isInternalTeacher(
  email: string | null | undefined,
  configured: string | undefined = process.env.NATURE_CLASS_INTERNAL_EMAILS
): boolean {
  if (!email || !configured) return false;
  const address = email.trim().toLowerCase();
  if (!address) return false;
  return configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) =>
      entry.startsWith("@") ? address.endsWith(entry) : address === entry
    );
}

/**
 * Keys that may never appear anywhere, whatever an allowlist says.
 *
 * The allowlists above are already closed, so this is redundant by
 * construction — which is the point. It is the check that fails when someone
 * later adds `note` or `school_name` to an allowlist in good faith, and it
 * fails in the lint, in the tests, and at runtime, so the good-faith addition
 * cannot reach a teacher's browser.
 */
export const FORBIDDEN_KEY_PARTS: readonly string[] = [
  "note",
  "reflection",
  "question",
  "answer",
  "text",
  "prompt",
  "response",
  "child",
  "pupil",
  "student",
  "name",
  "email",
  "school",
  "lat",
  "lon",
  "coord",
  "postcode",
  "address",
];

/** The one exception, and it is a count rather than a person. */
const FORBIDDEN_EXCEPTIONS = new Set(["headcount"]);

export function isForbiddenKey(key: string): boolean {
  if (FORBIDDEN_EXCEPTIONS.has(key)) return false;
  const lowered = key.toLowerCase();
  return FORBIDDEN_KEY_PARTS.some((part) => lowered.includes(part));
}

/**
 * The longest a string property may be. Free text is impossible here anyway —
 * no allowlisted key holds any — but a cap means that if one day one does, it
 * cannot carry a teacher's paragraph about a child.
 */
export const MAX_STRING_LENGTH = 120;

export type AnalyticsValue = string | number | boolean;

/**
 * Reduce a caller's properties to what the event is allowed to send.
 *
 * Drops rather than throws: analytics must never be able to break a lesson
 * that a class is standing outside in the rain for. What it drops it drops
 * silently in production, and the tests and the lint are where a mistake is
 * meant to be discovered instead.
 */
export function sanitiseProperties(
  event: string,
  properties: Record<string, unknown> = {}
): Record<string, AnalyticsValue> | null {
  const allowed = ALLOWED_PROPERTIES[event as AnalyticsEvent];
  if (!allowed) return null;
  // Defaults last: a caller cannot overwrite the product stamp by passing a
  // `product` of its own, and `pick` would have dropped it anyway.
  return { ...pick(allowed, properties), ...DEFAULT_PROPERTIES };
}

/** The same reduction for `identify` traits. */
export function sanitiseTraits(
  traits: Record<string, unknown> = {}
): Record<string, AnalyticsValue> {
  return { ...pick(ALLOWED_TRAITS, traits), ...DEFAULT_PROPERTIES };
}

function pick(
  allowed: readonly string[],
  source: Record<string, unknown>
): Record<string, AnalyticsValue> {
  const clean: Record<string, AnalyticsValue> = {};
  for (const key of allowed) {
    if (isForbiddenKey(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    const shape = VALUE_SHAPES[key];
    if (shape) {
      // A shaped key is all or nothing: never trimmed or cut into shape.
      if (shape(value)) clean[key] = value as AnalyticsValue;
      continue;
    }
    if (typeof value === "boolean") {
      clean[key] = value;
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) clean[key] = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) clean[key] = trimmed.slice(0, MAX_STRING_LENGTH);
    }
    // Objects, arrays, functions, null and undefined are never sent: a nested
    // object is exactly how an unreviewed field travels.
  }
  return clean;
}

/**
 * A route reduced to the shape the app routes on, so a path can never become
 * an identifier.
 *
 * `/session/autumn-w3` stays. `/journal?entry=…` loses its query, because a
 * query string is where an id or an email ends up. A path segment that looks
 * like an opaque id — long, or mixed hex — is replaced with `:id`, so a URL
 * carrying a class id does not quietly become a per-class dimension in a
 * third-party product.
 */
export function routePath(pathname: string, maxSegments = 4): string {
  const path = (pathname.split("?")[0] ?? "").split("#")[0] ?? "";
  const segments = path.split("/").filter(Boolean).slice(0, maxSegments);
  const shaped = segments.map((segment) => (looksLikeId(segment) ? ":id" : segment));
  return `/${shaped.join("/")}`;
}

function looksLikeId(segment: string): boolean {
  if (segment.length >= 16) return true;
  if (/^[0-9a-f]{8,}$/i.test(segment)) return true;
  if (/^\d+$/.test(segment) && segment.length >= 4) return true;
  return false;
}

/**
 * The control events the SDK needs in order to work at all, plus the one
 * transport event used by privacy-masked session recording. `$snapshot` is
 * not a product event and never goes through `sanitiseProperties`: its DOM
 * payload is made safe at source by the mandatory recorder configuration in
 * client.ts. The analytics lint holds that masking configuration shut.
 *
 * Everything else PostHog generates for itself — `$pageleave`, `$web_vitals`,
 * `$exception`, `$feature_flag_called` — is dropped, because we did not ask
 * for it and it was never reviewed against the list above.
 */
export const SDK_CONTROL_EVENTS: readonly string[] = ["$identify", "$set", "$create_alias"];
export const SDK_RECORDING_EVENTS: readonly string[] = ["$snapshot"];

export function isSendableEvent(event: string): boolean {
  if (SDK_CONTROL_EVENTS.includes(event)) return true;
  if (SDK_RECORDING_EVENTS.includes(event)) return true;
  return Object.values(ANALYTICS_EVENTS).includes(event as AnalyticsEvent);
}

/**
 * Scrub the properties the SDK attaches on its own.
 *
 * This is the leak the allowlist above does not cover. `posthog-js` decorates
 * every event with `$current_url`, `$pathname`, `$referrer` and friends, taken
 * straight from the address bar — so a route that carries a class id or a
 * `?entry=` query would arrive at a third party as a per-teacher dimension
 * even though no call site ever passed it. Every URL-shaped value is reduced
 * to origin plus the same route shape `routePath` produces, and the query and
 * fragment are dropped.
 */
export function scrubAutomaticProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") {
      scrubbed[key] = value;
      continue;
    }
    scrubbed[key] = looksLikeUrl(value) ? shapeUrl(value) : value;
  }
  return scrubbed;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function shapeUrl(value: string): string {
  if (value.startsWith("/")) return routePath(value);
  try {
    const url = new URL(value);
    return `${url.origin}${routePath(url.pathname)}`;
  } catch {
    return "";
  }
}
