import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  ALLOWED_PROPERTIES,
  ALLOWED_TRAITS,
  ANALYTICS_EVENTS,
  DEFAULT_PROPERTIES,
  isInternalTeacher,
  teacherDistinctId,
  isForbiddenKey,
  isSendableEvent,
  MAX_STRING_LENGTH,
  routePath,
  sanitiseProperties,
  sanitiseTraits,
  scrubAutomaticProperties,
} from "@/lib/analytics/events";

/**
 * Nature Class talks to a third-party analytics service, and the promise made
 * about it is that a teacher's own words, a child, and a school's location
 * cannot reach it. These tests are that promise, executable.
 *
 * The old Schools prototype is the reason the bar is here rather than in a
 * comment. Its `track(event, properties)` took any event and any object; its
 * `identify` sent email, first name, last name and school name; its group call
 * sent the school's join code; and session replay was on. Every one of those
 * was a reasonable line to write in a consumer app. This is not one.
 */
describe("only allowlisted events and properties can be sent", () => {
  it("drops an event nobody declared, however plausible its name", () => {
    expect(sanitiseProperties("teacher_note_saved", { note: "Aisha cried" })).toBeNull();
    expect(isSendableEvent("teacher_note_saved")).toBe(false);
  });

  it("no longer knows the offline event, which was measurement in shape only", () => {
    // It fired when the completion POST could not be delivered — which is
    // exactly when the beacon reporting it could not be delivered either.
    expect(isSendableEvent("lesson_run_queued_offline")).toBe(false);
  });

  it("drops the SDK's own uninvited events", () => {
    // posthog-js makes these for itself. We reviewed none of them.
    for (const event of ["$pageleave", "$web_vitals", "$exception", "$feature_flag_called"]) {
      expect(isSendableEvent(event)).toBe(false);
    }
  });

  it("keeps only the snapshot transport needed for masked session replay", () => {
    expect(isSendableEvent("$snapshot")).toBe(true);
    expect(sanitiseProperties("$snapshot", { text: "a teacher's words" })).toBeNull();
  });

  it("keeps the control events identify() needs to work at all", () => {
    expect(isSendableEvent("$identify")).toBe(true);
    expect(isSendableEvent("$set")).toBe(true);
  });

  it("strips a property the event never declared", () => {
    const clean = sanitiseProperties(ANALYTICS_EVENTS.LESSON_RUN_COMPLETED, {
      lesson_id: "autumn-w3",
      headcount: 24,
      note: "Aisha was upset by the wind and went in early",
      teacher_email: "head@stmarys.sch.uk",
    });
    expect(clean).toEqual({ lesson_id: "autumn-w3", headcount: 24, ...DEFAULT_PROPERTIES });
  });

  it("refuses to send a nested object, which is how a whole draft travels", () => {
    const clean = sanitiseProperties(ANALYTICS_EVENTS.LESSON_RUN_COMPLETED, {
      lesson_id: { id: "autumn-w3", note: "her words" },
      duration_minutes: 35,
    });
    expect(clean).toEqual({ duration_minutes: 35, ...DEFAULT_PROPERTIES });
  });

  it("caps a string, so a field that one day holds prose cannot hold much", () => {
    const clean = sanitiseProperties(ANALYTICS_EVENTS.LESSON_RUN_COMPLETED, {
      lesson_id: "x".repeat(500),
    });
    expect(clean?.lesson_id).toHaveLength(MAX_STRING_LENGTH);
  });
});

describe("the traits attached to a teacher name no one", () => {
  it("drops everything the prototype used to send about a teacher", () => {
    const clean = sanitiseTraits({
      email: "head@stmarys.sch.uk",
      first_name: "Priya",
      last_name: "Shah",
      school_name: "St Mary's CofE Primary",
      join_code: "MEADOW-4417",
      has_class: true,
      locale: "en-GB",
    });
    expect(clean).toEqual({ has_class: true, locale: "en-GB", ...DEFAULT_PROPERTIES });
  });

  it("names no key that ADR-001 forbids from leaving the teaching core", () => {
    const everyKey = [...Object.values(ALLOWED_PROPERTIES).flat(), ...ALLOWED_TRAITS];
    expect(everyKey.length).toBeGreaterThan(0);
    for (const key of everyKey) {
      expect(isForbiddenKey(key), `"${key}" is on an allowlist`).toBe(false);
    }
  });

  it("still recognises the forbidden shapes, so the check above is not vacuous", () => {
    for (const key of ["note", "school_name", "child_id", "teacher_email", "latitude"]) {
      expect(isForbiddenKey(key)).toBe(true);
    }
    // A count of children is not a child. ADR-001's own protocol permits it.
    expect(isForbiddenKey("headcount")).toBe(false);
  });
});

/**
 * We report into the Rewyld PostHog project rather than one of our own, next
 * to rewyld_app, rewyld_web and the backend's rewyld. Everything below exists
 * because an unstamped event in a shared project does not look broken — it
 * looks like a Rewyld number.
 */
describe("sharing Rewyld's project", () => {
  it("stamps every event with the product that sent it", () => {
    const clean = sanitiseProperties(ANALYTICS_EVENTS.PAGE_VIEWED, { path: "/" });
    expect(clean).toMatchObject({ product: "nature_class", platform: "web" });
  });

  it("stamps the person too, so a teacher profile is identifiable as ours", () => {
    expect(sanitiseTraits({ has_class: true })).toMatchObject({ product: "nature_class" });
  });

  it("is not the old prototype's product name", () => {
    // `schools` belongs to Wyld-Way/nature-class, a different codebase in a
    // different era. Sharing the name would merge prototype history into
    // grant-repo history in every chart that groups by product.
    expect(DEFAULT_PROPERTIES.product).not.toBe("schools");
  });

  it("cannot be overwritten by a caller passing its own product", () => {
    const clean = sanitiseProperties(ANALYTICS_EVENTS.PAGE_VIEWED, {
      path: "/",
      product: "rewyld_web",
    });
    expect(clean?.product).toBe("nature_class");
  });

  it("namespaces the teacher id, because distinct_id is one flat namespace", () => {
    // A Nature Class teacher id colliding with a Rewyld user id would not
    // error. It would merge two people, and nothing would say so.
    expect(teacherDistinctId("clv8x2k4b0001s6a9h3jd7f2q")).toBe(
      "nc:clv8x2k4b0001s6a9h3jd7f2q"
    );
  });
});

/**
 * The shared project's "Internal / Test users" cohort matches
 * `$internal_or_test_user`, and nothing had ever set it — so the filter held
 * nobody and every lesson Johan tested counted as a teacher's. The consumer
 * app has already lost a retention figure to exactly this.
 */
describe("telling our own accounts from a teacher's", () => {
  const LIST = "founder.test@example.com,@rewyld.earth";

  it("matches a named address", () => {
    expect(isInternalTeacher("founder.test@example.com", LIST)).toBe(true);
    expect(isInternalTeacher("Founder.Test@Example.com ", LIST)).toBe(true);
  });

  it("matches a whole domain", () => {
    expect(isInternalTeacher("someone@rewyld.earth", LIST)).toBe(true);
  });

  it("does not match a real teacher", () => {
    expect(isInternalTeacher("head@stmarys.sch.uk", LIST)).toBe(false);
  });

  it("does not match a domain by accident", () => {
    // The suffix rule must not treat a lookalike domain as ours.
    expect(isInternalTeacher("head@notrewyld.earth.sch.uk", LIST)).toBe(false);
  });

  it("makes nobody internal when unconfigured, which is how it ships", () => {
    expect(isInternalTeacher("founder.test@example.com", undefined)).toBe(false);
    expect(isInternalTeacher("founder.test@example.com", "")).toBe(false);
    expect(isInternalTeacher(null, LIST)).toBe(false);
  });

  it("carries the flag as a trait, and never the address it was decided from", () => {
    const clean = sanitiseTraits({
      $internal_or_test_user: true,
      email: "founder.test@example.com",
    });
    expect(clean.$internal_or_test_user).toBe(true);
    expect(clean.email).toBeUndefined();
  });
});

describe("a route can never become an identifier", () => {
  it("keeps the shape of a route the app actually has", () => {
    expect(routePath("/session/autumn-w3")).toBe("/session/autumn-w3");
    expect(routePath("/")).toBe("/");
  });

  it("throws away the query, which is where an id or an address ends up", () => {
    expect(routePath("/journal?entry=cm3x9&email=head@stmarys.sch.uk")).toBe("/journal");
    expect(routePath("/run#phase-2")).toBe("/run");
  });

  it("masks an opaque segment rather than making it a per-class dimension", () => {
    expect(routePath("/classes/clv8x2k4b0001s6a9h3jd7f2q")).toBe("/classes/:id");
    expect(routePath("/print/9f3a2b81c4")).toBe("/print/:id");
  });
});

describe("the properties the SDK attaches on its own", () => {
  it("shapes $current_url, which posthog-js takes straight from the address bar", () => {
    const scrubbed = scrubAutomaticProperties({
      $current_url: "https://natureclass.education/journal?entry=cm3x9",
      $pathname: "/classes/clv8x2k4b0001s6a9h3jd7f2q",
      $browser: "Safari",
      $screen_height: 1024,
    });
    expect(scrubbed.$current_url).toBe("https://natureclass.education/journal");
    expect(scrubbed.$pathname).toBe("/classes/:id");
    // Everything that is not a URL is left exactly alone.
    expect(scrubbed.$browser).toBe("Safari");
    expect(scrubbed.$screen_height).toBe(1024);
  });
});

/**
 * The lint is the half of the promise that survives a refactor, so it gets the
 * same treatment every guard in this repo gets: proof it goes red. A guard
 * nobody has watched fail is a guard nobody knows works.
 */
describe("scripts/analytics-lint.mjs goes red on the mistakes it exists for", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "nc-analytics-lint-"));

  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  /**
   * The lint reads `lib/analytics/events.ts` by importing it (#1251), so it runs
   * under the tsx loader. `--import tsx` resolves against the CHILD's cwd and
   * the sandbox is a temp directory with no `node_modules`, so the loader is
   * resolved here, absolutely, from this tree's own install — the same move
   * `scripts/node-id-invisibility.mjs` makes for the same reason.
   */
  const tsxLoader = import.meta.resolve("tsx");

  function runLintAgainst(mutate: (files: { events: string; client: string }) => void): string {
    const dir = mkdtempSync(join(sandbox, "case-"));
    cpSync(join(process.cwd(), "lib"), join(dir, "lib"), { recursive: true });
    cpSync(join(process.cwd(), "app"), join(dir, "app"), { recursive: true });
    cpSync(
      join(process.cwd(), "scripts/analytics-lint.mjs"),
      join(dir, "scripts/analytics-lint.mjs"),
      { recursive: true }
    );
    mutate({
      events: join(dir, "lib/analytics/events.ts"),
      client: join(dir, "lib/analytics/client.ts"),
    });
    try {
      execFileSync(
        process.execPath,
        ["--import", tsxLoader, join(dir, "scripts/analytics-lint.mjs")],
        { encoding: "utf8" }
      );
      return "";
    } catch (error) {
      const failure = error as { stderr?: string };
      return failure.stderr ?? "";
    }
  }

  it("passes on the tree as it stands", () => {
    expect(runLintAgainst(() => {})).toBe("");
  });

  /**
   * #1251: the declared-event scan used to be a regex anchored on a trailing
   * comma, so an event added as the file's LAST property — valid TypeScript, and
   * what an editor leaves you — was invisible to it. Six events existed, five
   * were counted, and the sixth could ship with no allowlist entry at all.
   */
  it("fails when an event is added as the file's last property, with no trailing comma", () => {
    const stderr = runLintAgainst(({ events }) => {
      const source = readFileSync(events, "utf8");
      writeFileSync(
        events,
        source.replace(
          "} as const;\n\nexport type AnalyticsEvent",
          '  MUTATION_PROBE_EVENT: "mutation_probe_event"\n} as const;\n\nexport type AnalyticsEvent'
        )
      );
    });
    expect(stderr).toContain("ANALYTICS_EVENTS.MUTATION_PROBE_EVENT with no entry");
  });

  it("fails when a forbidden property is added to an allowlist in good faith", () => {
    const stderr = runLintAgainst(({ events }) => {
      const source = readFileSync(events, "utf8");
      writeFileSync(
        events,
        source.replace('[ANALYTICS_EVENTS.PAGE_VIEWED]: ["path"]', '[ANALYTICS_EVENTS.PAGE_VIEWED]: ["path", "school_name"]')
      );
    });
    expect(stderr).toContain("school_name");
  });

  /**
   * Mutate the init call, not the file: `persistence: "memory"` also appears in
   * the doc comment above it, and an early draft of this test edited that
   * instead — which is how the lint's own comment-shaped blind spot was found.
   */
  function mutateInitCall(client: string, from: string, to: string) {
    const source = readFileSync(client, "utf8");
    const start = source.indexOf("posthog.init(");
    const head = source.slice(0, start);
    const call = source.slice(start);
    expect(call).toContain(from);
    writeFileSync(client, head + call.replace(from, to));
  }

  it("fails when session recording is switched off", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, "disable_session_recording: false", "disable_session_recording: true");
    });
    expect(stderr).toContain("disable_session_recording: false");
  });

  it("fails when replay configuration is disabled with the broad flags switch", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, "advanced_disable_flags: false", "advanced_disable_flags: true");
    });
    expect(stderr).toContain("advanced_disable_flags: false");
  });

  it("keeps feature-flag evaluation disabled while replay configuration can load", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, "advanced_disable_feature_flags: true", "advanced_disable_feature_flags: false");
    });
    expect(stderr).toContain("advanced_disable_feature_flags: true");
  });

  it("fails when blanket replay text masking is restored", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, 'maskTextSelector: ".ph-mask"', 'maskTextSelector: "*"');
    });
    expect(stderr).toContain('maskTextSelector: ".ph-mask"');
  });

  it("fails when replay inputs become readable", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, "maskAllInputs: true", "maskAllInputs: false");
    });
    expect(stderr).toContain("maskAllInputs: true");
  });

  it("fails when blanket replay attribute masking is restored", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, "maskAllElementAttributes: false", "maskAllElementAttributes: true");
    });
    expect(stderr).toContain("maskAllElementAttributes: false");
  });

  it("fails when persistence moves off memory and starts owing a consent banner", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, 'persistence: "memory"', 'persistence: "localStorage"');
    });
    expect(stderr).toContain('persistence: "memory"');
  });

  it("fails when the region stops being a stated decision", () => {
    const stderr = runLintAgainst(({ client }) => {
      mutateInitCall(client, "api_host: HOST", 'api_host: "https://us.i.posthog.com"');
    });
    expect(stderr).toContain("hardcodes an api_host");
  });

  it("fails when a second file imports the SDK", () => {
    const stderr = runLintAgainst(({ client }) => {
      writeFileSync(
        join(client, "..", "..", "sneaky.ts"),
        'import posthog from "posthog-js";\nexport const p = posthog;\n'
      );
    });
    expect(stderr).toContain("imports posthog-js");
  });

  it("fails when the product stamp is dropped from a shared project", () => {
    const stderr = runLintAgainst(({ events }) => {
      const source = readFileSync(events, "utf8");
      writeFileSync(events, source.replace(/\.\.\.DEFAULT_PROPERTIES/g, ""));
    });
    expect(stderr).toContain("never merges it");
  });

  it("fails when identify is handed a raw teacher id", () => {
    const stderr = runLintAgainst(({ client }) => {
      const source = readFileSync(client, "utf8");
      writeFileSync(
        client,
        source.replace("posthog.identify(id, clean)", "posthog.identify(teacherId, clean)")
      );
    });
    expect(stderr).toContain("raw teacherId");
  });

  it("fails when the server assembles its own payload instead of the allowlist", () => {
    const stderr = runLintAgainst(({ client }) => {
      const server = join(client, "..", "server.ts");
      const source = readFileSync(server, "utf8");
      writeFileSync(server, source.replace("sanitiseProperties(", "buildPayloadByHand("));
    });
    expect(stderr).toContain("does not call sanitiseProperties");
  });

  it("fails when the server forgets to flush, which silently loses every event", () => {
    const stderr = runLintAgainst(({ client }) => {
      const server = join(client, "..", "server.ts");
      const source = readFileSync(server, "utf8");
      writeFileSync(server, source.replace("await client.shutdown()", "client.shutdown()"));
    });
    expect(stderr).toContain("never awaits shutdown()");
  });

  it("fails when the browser also fires the server-only completion", () => {
    const stderr = runLintAgainst(({ client }) => {
      writeFileSync(
        join(client, "..", "..", "double.ts"),
        'import { ANALYTICS_EVENTS } from "./analytics/events";\n' +
          "export const e = ANALYTICS_EVENTS.LESSON_RUN_COMPLETED;\n"
      );
    });
    expect(stderr).toContain("double-count lessons taught");
  });

  it("fails when a second file imports the server SDK", () => {
    const stderr = runLintAgainst(({ client }) => {
      writeFileSync(
        join(client, "..", "..", "sneaky-server.ts"),
        'import { PostHog } from "posthog-node";\nexport const p = PostHog;\n'
      );
    });
    expect(stderr).toContain("imports posthog-node");
  });

  it("fails when a call site invents an event name", () => {
    const stderr = runLintAgainst(({ client }) => {
      writeFileSync(
        join(client, "..", "..", "caller.ts"),
        'import { track } from "./analytics/client";\nexport const go = () => track("teacher_note_saved" as never);\n'
      );
    });
    expect(stderr).toContain("string literal");
  });
});
