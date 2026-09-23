#!/usr/bin/env node
/**
 * Analytics lint: a promise about a child's data is worth what a machine
 * holds shut.
 *
 * WHY THIS EXISTS
 *
 * Nature Class now talks to a third-party analytics service. That service is
 * off unless someone sets two environment variables, and what it may be told
 * is a closed list in `lib/analytics/events.ts`. Both of those facts are one
 * careless commit from being untrue, and neither would look wrong in review:
 * adding `school_name` to a trait list is a one-word diff that reads like
 * useful context, and `import posthog from "posthog-js"` in a component reads
 * like someone wiring up a feature.
 *
 * The repo has already learned this lesson twice. `caps-lint.mjs` holds one
 * rule and it has never broken; every rule written into a comment instead of
 * a check broke — 109 unscaled font sizes, four palettes, the founder's own
 * sentences edited by a style guide written to restrain agents. A privacy
 * boundary in a doc comment is that same rule, with a worse blast radius,
 * because the thing that leaks is a teacher's account of her class.
 *
 * SCOPE: NEITHER. This reads TypeScript under `lib/` and `app/` — no prose,
 * house or founder. It judges no string a person wrote for the product; see
 * `scripts/authorship.mjs` for why every check in this repo says so.
 *
 * WHAT IT IMPORTS AND WHAT IT READS AS SOURCE (#1251)
 *
 * The lists themselves are IMPORTED from `lib/analytics/events.ts`, which is a
 * pure module by its own header and already exports them. They used to be found
 * with regexes over that file's source, and one of those regexes was anchored on
 * a trailing comma: an event added as the file's LAST property — valid
 * TypeScript, and what an editor leaves you — was simply absent from the count,
 * so it could ship with no `ALLOWED_PROPERTIES` entry at all. That is the defect
 * #1218 and #1220 removed from two other scripts; this is its third instance.
 *
 * What stays a source read is every check about how code is WRITTEN at its call
 * sites: which files import an SDK, which call `track()` with a string literal,
 * whether the init options are in the init call rather than in the comment above
 * it, whether `DEFAULT_PROPERTIES` is actually spread. None of that is data a
 * module exports, and a check that imported it would be asking the wrong file.
 *
 * The forbidden-key list below is deliberately NOT imported, although
 * `events.ts` exports `FORBIDDEN_KEY_PARTS`. A guard that took its rule from the
 * file it audits would go green the moment someone shortened the rule.
 *
 * Runs under `tsx` (`npm run lint:analytics`), as `validate:packs`,
 * `validate:prompts` and `lint:eval-coverage` already do.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_PROPERTIES,
  ALLOWED_TRAITS,
  ANALYTICS_EVENTS,
  DEFAULT_PROPERTIES,
} from "../lib/analytics/events.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The only files allowed to touch an SDK, one per surface. */
const ADAPTER = "lib/analytics/client.ts";
const SERVER_ADAPTER = "lib/analytics/server.ts";
const EVENTS = "lib/analytics/events.ts";

/**
 * Events that must never be sent from the browser.
 *
 * `lesson_run_completed` is reported by the server that accepts the write, and
 * the write is idempotent: an offline iPad can replay the same completion for
 * days. A client that also fired it would double-count the one number this
 * product exists to move, and would do it invisibly, because both events are
 * individually correct.
 */
const SERVER_ONLY_EVENTS = ["LESSON_RUN_COMPLETED"];

/**
 * Init options that must be present, verbatim, in the adapter.
 *
 * Autocapture and heatmaps install capture-phase click listeners, and on the
 * old prototype those listeners swallowed every button press on the iPad UI —
 * a broken product, not only a privacy question. Session recording is enabled
 * for the interaction path, so its masking settings are now part of the same
 * boundary: page text and attributes are readable per #1149; typed inputs,
 * console output and request bodies remain excluded.
 * Cookies and localStorage would engage PECR's consent rule and owe a school
 * a banner. None of that is a preference.
 */
const REQUIRED_INIT = [
  ['persistence: "memory"', "cookieless, so no consent banner is owed"],
  ["autocapture: false", "its capture-phase listeners blocked the prototype's buttons"],
  ["capture_pageview: false", "routes are recorded through routePath, shaped"],
  ["capture_pageleave: false", "never asked for"],
  ["disable_session_recording: false", "recordings are explicitly enabled for interaction diagnosis"],
  ["sampleRate: 1", "every session is recorded, not a dashboard-dependent sample"],
  ["maskAllInputs: true", "typed teacher content must never be readable"],
  ['maskTextSelector: ".ph-mask"', "page text must stay readable; explicitly marked text stays masked"],
  ["maskAllElementAttributes: false", "blanket attribute masking makes replay unusable"],
  ["recordCrossOriginIframes: false", "an embedded origin is outside this privacy boundary"],
  ["recordHeaders: false", "headers can carry credentials and identifiers"],
  ["recordBody: false", "request bodies can carry teacher content"],
  ["captureJsonLd: false", "structured page content is content too"],
  ["collectFonts: false", "recording fonts adds no interaction evidence"],
  ["captureCanvas: { recordCanvas: false }", "canvas pixels bypass DOM text masking"],
  ["maskCapturedNetworkRequestFn:", "URLs must be reduced to route shape before recording"],
  ["enable_recording_console_log: false", "console output is not reviewed for teacher content"],
  ["capture_performance: false", "remote performance capture must not widen replay data"],
  ["disable_capture_url_hashes: true", "URL fragments may contain identifiers"],
  ["enable_heatmaps: false", "same listeners, same iPad, same bug"],
  ["disable_surveys: true", "never asked for"],
  ["advanced_disable_flags: false", "replay must be able to fetch project configuration"],
  ["advanced_disable_feature_flags: true", "flag evaluation stays disabled without blocking replay"],
  ["disable_external_dependency_loading: true", "no remote scripts fetched into a school's browser"],
  ["before_send:", "the last gate before the wire, answering to the allowlist"],
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    const full = join(root, rel);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      found.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx|mts)$/.test(entry)) {
      found.push(rel);
    }
  }
  return found;
}

const files = [...sourceFiles("lib"), ...sourceFiles("app")];

// ── 1. One seam per surface ──────────────────────────────────────────────────
//
// Both forms are matched: a static `from "posthog-js"` and a dynamic
// `import("posthog-js")`. The browser adapter uses the dynamic one, so a check
// that knew only the static form would have left the wider door open.
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  const normalised = file.split("\\").join("/");
  for (const [pkg, seam] of [
    ["posthog-js", ADAPTER],
    ["posthog-node", SERVER_ADAPTER],
  ]) {
    if (!new RegExp(`["']${pkg}["']`).test(text)) continue;
    if (normalised !== seam) {
      fail(
        `${file} imports ${pkg}. Only ${seam} may. Every guarantee in ` +
          `${EVENTS} is enforced at the seam and nowhere else, so a second ` +
          `import is a second, unreviewed way out of the app.`
      );
    }
  }
}

// ── 1b. The server surface answers to the same allowlist ─────────────────────
//
// The server is the surface with the most to leak: at the moment it reports a
// completion it is holding the teacher's note, her reflection taps and her
// class's name. A payload assembled by hand there would bypass every list in
// events.ts while looking entirely reasonable.
if (existsSync(join(root, SERVER_ADAPTER))) {
  const server = readFileSync(join(root, SERVER_ADAPTER), "utf8");
  if (!/sanitiseProperties\(/.test(server)) {
    fail(
      `${SERVER_ADAPTER} does not call sanitiseProperties. It must build its ` +
        `payload through the same allowlist as the browser, not its own.`
    );
  }
  if (!/teacherDistinctId\(/.test(server)) {
    fail(
      `${SERVER_ADAPTER} does not namespace its distinct_id through ` +
        `teacherDistinctId, so its events would land on a different person ` +
        `from the browser's in a project we share with Rewyld.`
    );
  }
  if (!/await\s+\w+\.shutdown\(\)/.test(server)) {
    fail(
      `${SERVER_ADAPTER} never awaits shutdown(). posthog-node batches, and a ` +
        `serverless function is frozen the moment it responds, so an ` +
        `unflushed event is simply lost.`
    );
  }
}

// ── 1c. Server-only events stay off the client ───────────────────────────────
for (const event of SERVER_ONLY_EVENTS) {
  for (const file of files) {
    const normalised = file.split("\\").join("/");
    if (normalised === EVENTS || normalised === SERVER_ADAPTER) continue;
    const text = readFileSync(join(root, file), "utf8");
    if (text.includes(`ANALYTICS_EVENTS.${event}`)) {
      fail(
        `${file} references ANALYTICS_EVENTS.${event}, which is sent from ` +
          `${SERVER_ADAPTER} only. The completion write is idempotent, so an ` +
          `offline device replays it; a client firing this too would ` +
          `double-count lessons taught, invisibly.`
      );
    }
  }
}

// ── 2. The hardening is configuration, not folklore ──────────────────────────
//
// Read the init call itself, not the file. The first draft of this check
// searched the whole source, which meant the doc comment above the call — the
// one explaining why session recording is off — satisfied every requirement on
// its own. A check a comment can pass is a check that would have let the
// config be turned back on in silence.
const adapter = readFileSync(join(root, ADAPTER), "utf8");
const initStart = adapter.indexOf("posthog.init(");
const initEnd = initStart === -1 ? -1 : adapter.indexOf("\n  });", initStart);
if (initStart === -1 || initEnd === -1) {
  fail(`${ADAPTER} has no recognisable posthog.init({ ... }); call to check.`);
}
const initCall = initStart === -1 || initEnd === -1 ? "" : adapter.slice(initStart, initEnd);
for (const [option, why] of REQUIRED_INIT) {
  if (!initCall.includes(option)) {
    fail(`${ADAPTER} is missing \`${option}\` from its posthog.init call — ${why}.`);
  }
}
if (/api_host:\s*["'`]/.test(initCall)) {
  fail(
    `${ADAPTER} hardcodes an api_host. The host comes from ` +
      `NEXT_PUBLIC_POSTHOG_HOST so that a school's region is a stated ` +
      `decision and a self-hoster can point at their own instance.`
  );
}
if (/NEXT_PUBLIC_POSTHOG_KEY\s*(\|\||\?\?)/.test(adapter)) {
  fail(
    `${ADAPTER} gives the key a fallback. This project is AGPL: a default key ` +
      `would make every self-hosted deployment report its teachers to us.`
  );
}

// ── 3. Events are born in one file ───────────────────────────────────────────
//
// The events come from the module rather than from a regex over its source: the
// regex that used to find them required a trailing comma, so the file's last
// property was invisible to it and could carry no allowlist entry at all
// (#1251). The allowlist question is asked of the imported object, and only the
// question about how the entry is WRITTEN is still asked of the source.
const eventsSource = readFileSync(join(root, EVENTS), "utf8");
const declared = Object.values(ANALYTICS_EVENTS);
if (declared.length === 0) {
  fail(`${EVENTS} declares no events — this lint would pass vacuously.`);
}
for (const [constant, event] of Object.entries(ANALYTICS_EVENTS)) {
  if (!Object.hasOwn(ALLOWED_PROPERTIES, event)) {
    fail(
      `${EVENTS} declares ANALYTICS_EVENTS.${constant} with no entry in ` +
        `ALLOWED_PROPERTIES. An event with no property allowlist is an event ` +
        `that can carry anything.`
    );
    continue;
  }
  if (!eventsSource.includes(`[ANALYTICS_EVENTS.${constant}]:`)) {
    fail(
      `${EVENTS} has an ALLOWED_PROPERTIES entry for "${event}" that is not keyed ` +
        `through ANALYTICS_EVENTS.${constant}. Write it as ` +
        `\`[ANALYTICS_EVENTS.${constant}]:\`, so renaming the event's value moves its ` +
        `allowlist with it instead of leaving a stale string behind.`
    );
  }
}

// ── 3b. We share a project, so everything we send says who sent it ───────────
//
// Nature Class reports into the Rewyld PostHog project, next to rewyld_app,
// rewyld_web and the backend's rewyld. An event with no product stamp is not a
// missing label, it is a row that silently joins another product's funnel, and
// nothing about the resulting chart looks wrong.
if (typeof DEFAULT_PROPERTIES.product !== "string" || DEFAULT_PROPERTIES.product === "") {
  fail(
    `${EVENTS} has no DEFAULT_PROPERTIES carrying a \`product\`. We do not have ` +
      `a PostHog project of our own; without the stamp our events are ` +
      `indistinguishable from Rewyld's in the same table.`
  );
}
if (!/\.\.\.DEFAULT_PROPERTIES/.test(eventsSource)) {
  fail(
    `${EVENTS} declares DEFAULT_PROPERTIES but never merges it. Declaring the ` +
      `stamp and not applying it is the same as not having one.`
  );
}
if (!/function teacherDistinctId/.test(eventsSource)) {
  fail(`${EVENTS} has no teacherDistinctId — see the identify check below.`);
}

// A shared project is one flat distinct_id namespace. A raw teacher id handed
// to identify() would not error on a collision with a Rewyld user id; it would
// merge two people.
if (/\.identify\(\s*teacherId\b/.test(adapter)) {
  fail(
    `${ADAPTER} passes a raw teacherId to identify(). Namespace it through ` +
      `teacherDistinctId first: distinct_id is one flat namespace per project ` +
      `and we share ours with Rewyld, so a collision merges two humans.`
  );
}
if (!/teacherDistinctId\(/.test(adapter)) {
  fail(`${ADAPTER} never calls teacherDistinctId, so identify is un-namespaced.`);
}

// ── 4. No call site invents an event name ────────────────────────────────────
for (const file of files) {
  if (file.split("\\").join("/") === EVENTS) continue;
  const text = readFileSync(join(root, file), "utf8");
  for (const match of text.matchAll(/\btrack\(\s*(["'`])/g)) {
    fail(
      `${file} calls track() with a string literal. Name a constant from ` +
        `ANALYTICS_EVENTS instead, so ${EVENTS} stays the only place an ` +
        `event can be born.`
    );
    void match;
  }
}

// ── 5. Nothing on any allowlist is a forbidden key ───────────────────────────
//
// The allowlists are closed, so this is redundant by construction. That is the
// point: it is the check that fires the day someone adds `note` or
// `school_name` in good faith, and it fires before a teacher's browser sees it.
const FORBIDDEN = [
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
const EXCEPTIONS = new Set(["headcount"]);

// The allowlists' CONTENTS, from the module. Each of these is a name we may
// send; the keys beside them are not — `ALLOWED_PROPERTIES` is keyed by event
// name, and `DEFAULT_PROPERTIES` by a key `platform` that contains "lat". The
// source scan this replaced saw only quoted strings, which is the same set for
// the same reason; reading the objects instead adds the trait
// `$internal_or_test_user`, which its `$` had kept out of that regex.
const allowlisted = [
  ...Object.values(ALLOWED_PROPERTIES).flat(),
  ...ALLOWED_TRAITS,
  // Swept too: DEFAULT_PROPERTIES bypasses the allowlist by design, so it is
  // the one place a forbidden key could ride along on every single event.
  ...Object.values(DEFAULT_PROPERTIES),
];
for (const key of allowlisted) {
  if (typeof key !== "string" || EXCEPTIONS.has(key)) continue;
  const hit = FORBIDDEN.find((part) => key.includes(part));
  if (hit) {
    fail(
      `${EVENTS} allows the property "${key}", which contains "${hit}". ` +
        `ADR-001 forbids teacher or child names, child identifiers, ` +
        `reflection or held-question text, exact coordinates, raw Pointmoon ` +
        `evidence, and model prompts or responses from leaving the ` +
        `teaching core. A third-party SDK is a wider hole than that ` +
        `protocol, not a narrower one.`
    );
  }
}

// ── 6. The invited cohort is a shaped code, never free text (#821) ───────────
//
// `invite_cohort` passes the forbidden-part sweep above by name, and a name is
// all that sweep can see. What keeps a school's name out of it is the VALUE
// shape: lowercase letters, digits and hyphens, 32 at most. Widening that
// pattern, or letting the key fall back to ordinary string handling, would
// turn a neutral code into a free-text field that happens to have a safe name.
if (!eventsSource.includes("export const INVITE_COHORT_PATTERN = /^[a-z0-9-]{1,32}$/;")) {
  fail(
    `${EVENTS} no longer declares INVITE_COHORT_PATTERN as /^[a-z0-9-]{1,32}$/. ` +
      `The invited-cohort code reaches analytics as a trait and on events; its ` +
      `shape is what stops a school's name or an address riding along in it.`
  );
}
if (!/invite_cohort:\s*isInviteCohort\b/.test(eventsSource)) {
  fail(
    `${EVENTS} does not hold the invite_cohort value to isInviteCohort in ` +
      `VALUE_SHAPES, so any short string would be sent under that key.`
  );
}

if (failures.length > 0) {
  console.error(`Analytics lint FAILED. ${failures.length} problem(s):`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(
  `Analytics lint passed: ${declared.length} events, one SDK seam ` +
    `(${relative(root, join(root, ADAPTER))}), no forbidden properties.`
);
