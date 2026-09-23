"use client";

import {
  ANALYTICS_EVENTS,
  isSendableEvent,
  routePath,
  sanitiseProperties,
  sanitiseTraits,
  scrubAutomaticProperties,
  teacherDistinctId,
  type AnalyticsEvent,
} from "./events";

/**
 * The only file in this repository allowed to import `posthog-js`.
 * `scripts/analytics-lint.mjs` fails the build if a second one appears.
 *
 * DARK BY DEFAULT, AND THAT IS NOT A CONVENIENCE
 *
 * Nature Class is AGPL, which means anyone may run this code. A hardwired key
 * would make every school, council and hobbyist who self-hosts Community
 * report their teachers' behaviour into Wyld's analytics project without ever
 * agreeing to it. So the key is not in the source, both env vars are required,
 * and with either missing every function here is a no-op that costs nothing
 * and sends nothing.
 *
 * WHY THE HOST HAS NO DEFAULT
 *
 * The prototype defaulted to `us.i.posthog.com` because it shared the consumer
 * app's project. Defaulting a British primary school's telemetry to a US
 * endpoint is exactly the decision a DPIA has to state out loud (#407), so
 * this file refuses to make it silently: name the region, or get nothing.
 * A self-hosted PostHog is the same one line.
 *
 * WHAT IS TURNED OFF, AND WHY
 *
 *   autocapture              Its capture-phase click listeners were what blocked
 *                            every button on the prototype's iPad UI. It also
 *                            hoovers up element text, which on this product is
 *                            lesson copy and a teacher's own words.
 *   session recording        Enabled by Johan for product diagnosis (#966),
 *                            with readable page content and attributes. Typed
 *                            inputs remain masked before leaving the browser.
 *                            Clicks, taps, scrolls, navigation and timing stay.
 *   heatmaps                 Same listeners, same iPad, same bug.
 *   surveys, flags, toolbar  Never asked for; each one is another remote script
 *                            and another request from a school's network.
 *   cookies and localStorage `persistence: "memory"` stores nothing on the
 *                            device, so PECR's consent rule is not engaged and
 *                            no banner is owed. The cost is that a signed-out
 *                            visitor is a new anonymous person on every load;
 *                            the teacher loop is measured from `identify`, on
 *                            an id the server already knows, so the number that
 *                            matters survives.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

type PostHog = (typeof import("posthog-js"))["default"];

let started = false;
let client: PostHog | null = null;

/**
 * Calls made before the SDK finishes loading, replayed when it does.
 *
 * The first event of a visit — the page view — is fired from an effect that
 * runs long before a network import resolves, so without this it would simply
 * be lost and every session would start one page late. Bounded, because an
 * unbounded queue behind a script that never loads is a leak.
 */
let pending: Array<(posthog: PostHog) => void> = [];
const MAX_PENDING = 50;

/**
 * The SDK is imported dynamically, and that is the same promise as the missing
 * key rather than a performance nicety. Unset, a school running this from
 * source ships not one byte of PostHog to a teacher's iPad — nothing to parse
 * on a school's connection, nothing in the service worker's precache, no
 * third-party code present at all. A static import would have put ~250kB of it
 * in the bundle of a product whose demo path is deliberately dependency-free.
 */
export function initAnalytics(): void {
  if (started || typeof window === "undefined") return;
  if (!KEY || !HOST) return;
  started = true;
  void Promise.all([import("posthog-js"), import("posthog-js/dist/lazy-recorder")])
    .then(([{ default: posthog }]) => {
      init(posthog);
      client = posthog;
      const queued = pending;
      pending = [];
      for (const call of queued) {
        try {
          call(posthog);
        } catch {
          // Deliberately silent.
        }
      }
    })
    .catch(() => {
      // A blocked or failed script is not a fault a class should ever see.
      started = false;
      pending = [];
    });
}

function init(posthog: PostHog): void {
  posthog.init(KEY as string, {
    api_host: HOST,
    persistence: "memory",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: false,
    // Johan requested readable replay (#1149). Only explicitly marked text
    // and typed inputs are masked; blanket masking made sessions unusable.
    session_recording: {
      sampleRate: 1,
      maskAllInputs: true,
      maskTextSelector: ".ph-mask",
      maskAllElementAttributes: false,
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
      captureJsonLd: false,
      collectFonts: false,
      captureCanvas: { recordCanvas: false },
      // Keep URL shape for navigation and network timing, but discard queries,
      // fragments, headers and bodies. Replay clicks do not need any of them.
      maskCapturedNetworkRequestFn: (request) => {
        if (!request.name) return null;
        try {
          const url = new URL(request.name, window.location.origin);
          return {
            ...request,
            name: `${url.origin}${routePath(url.pathname)}`,
            requestHeaders: undefined,
            requestBody: undefined,
            responseHeaders: undefined,
            responseBody: undefined,
          };
        } catch {
          return null;
        }
      },
    },
    enable_recording_console_log: false,
    capture_performance: false,
    disable_capture_url_hashes: true,
    enable_heatmaps: false,
    disable_surveys: true,
    // Replay needs project configuration. Disable flag evaluation only; the
    // broader advanced_disable_flags switch also blocks replay configuration.
    advanced_disable_flags: false,
    advanced_disable_feature_flags: true,
    // The recorder above is bundled with the app. Remote config falls back
    // to JSON, so replay works without loading third-party JavaScript.
    disable_external_dependency_loading: true,
    // The last gate before the wire. Everything above is configuration, which
    // a future upgrade could change the defaults of; this runs on every single
    // event, including the ones the SDK makes for itself, and it answers to
    // the allowlist rather than to posthog-js.
    before_send: (event) => {
      if (!event) return null;
      if (!isSendableEvent(event.event)) return null;
      event.properties = scrubAutomaticProperties(event.properties ?? {});
      return event;
    },
  });
}

/** Run something against the SDK, now or as soon as it is here. */
function withClient(action: (posthog: PostHog) => void): void {
  if (!started) return;
  if (client) {
    try {
      action(client);
    } catch {
      // Deliberately silent.
    }
    return;
  }
  if (pending.length >= MAX_PENDING) return;
  pending.push(action);
}

/**
 * Record one allowlisted event.
 *
 * Never throws. A class is outside in the weather with twenty five-year-olds;
 * an analytics failure is not permitted to be their problem.
 */
export function track(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {}
): void {
  // Sanitise at the call, not at the send: what a caller passed is cleared
  // while the caller's own values are still in hand, and the queue then holds
  // an already-clean payload rather than a teacher's raw object.
  const clean = sanitiseProperties(event, properties);
  if (!clean) return;
  withClient((posthog) => posthog.capture(event, clean));
}

/** The signed-in teacher, as an opaque id and coarse context. Never a name. */
export function identifyTeacher(
  teacherId: string,
  traits: Record<string, unknown> = {}
): void {
  if (!teacherId) return;
  const id = teacherDistinctId(teacherId);
  const clean = sanitiseTraits(traits);
  withClient((posthog) => posthog.identify(id, clean));
}

/** Sign-out on a shared staffroom iPad must not leave the last teacher behind. */
export function resetAnalytics(): void {
  withClient((posthog) => posthog.reset());
}

/** A route change, reduced to the route rather than the address. */
export function trackPageView(pathname: string): void {
  const properties = { path: routePath(pathname) };
  // Keep the historical teacher-loop series while feeding standard Web Analytics.
  // Each dashboard must count one of these events, never sum both.
  track(ANALYTICS_EVENTS.PAGE_VIEWED, properties);
  track(ANALYTICS_EVENTS.WEB_PAGE_VIEWED, properties);
}
