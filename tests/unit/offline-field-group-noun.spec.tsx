import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldRun } from "@/app/field/FieldShell";
import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import { composePreparedFieldOverlay, createOfflineOwnerLease } from "@/lib/offline/prepare";
import {
  classifyPreparedFieldState,
  parsePreparedFieldEnvelope,
} from "@/lib/offline/prepared-store";
import { prepareFieldSession } from "@/lib/offline/prepare-client";
import {
  PREPARED_OVERLAY_FEATURES,
  PREPARED_OVERLAY_FEATURES_HEADER,
  parsePreparedOverlayFeatures,
} from "@/lib/offline/prepared-contracts";
import type { PreparedFieldEnvelopeV1 } from "@/lib/offline/prepared-contracts";
import type { GroupNoun } from "@/lib/group-profile";

/**
 * THE OFFLINE RUNNER CALLED EVERYONE A CLASS (#1266).
 *
 * #1214 wired `groupNoun(groupType)` through `app/run` as context read off the
 * class record on the server. `app/field` renders the same runner with no
 * server read of anything, so a family that prepared a lesson for the field
 * was still told to gather its class.
 *
 * The pin is three-sided:
 *
 *   A PREPARED NON-SCHOOL GROUP IS NOT ADDRESSED AS A CLASS — the noun rides
 *   in the envelope and the words change.
 *
 *   AN ENVELOPE PREPARED BEFORE THE KEY EXISTED STILL RUNS — it is the only
 *   copy of her lesson on a playground, and it reads "class", `groupNoun`'s
 *   own documented default.
 *
 *   THE ENVELOPE STAYS STRICT — the key is additive and optional; anything
 *   else unexpected is still refused.
 */

const core = buildCoreLessonRelease({
  generatedAt: new Date("2026-08-29T08:00:00.000Z"),
});
if (!core.sessions["animal-leaf-masks"]) {
  throw new Error("field group-noun fixture is missing");
}
const coreSession = core.sessions["animal-leaf-masks"];

function preparedEnvelope(noun?: GroupNoun): PreparedFieldEnvelopeV1 {
  const preparedAt = new Date("2026-08-29T08:00:00.000Z");
  const lease = createOfflineOwnerLease({
    teacherId: "teacher-private-id",
    classId: "class-private-id",
    authSessionId: "auth-private-id",
    issuedAt: preparedAt,
    expiresAt: new Date("2026-09-28T08:00:00.000Z"),
  });
  const overlay = composePreparedFieldOverlay({
    lease,
    coreFingerprint: core.contentFingerprint,
    session: coreSession,
    hazards: null,
    spokenAudio: {},
    conditionsMeta: null,
    conditionsSource: "Pointmoon",
    groupNoun: noun,
    preparedAt,
  });
  return { version: 1, lease, overlay };
}

function fieldRunMarkup(envelope: PreparedFieldEnvelopeV1 | null): string {
  return renderToStaticMarkup(
    <FieldRun
      coreSession={coreSession}
      preparedEnvelope={envelope}
      release={core}
      connectionState="offline"
      homeHref="/today"
    />,
  );
}

const FIELD_DIR = new URL("../../app/field/", import.meta.url);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * `DepartureCheck` is read but exempt, for a stated reason rather than for
 * convenience: it is the Wi-Fi boundary list, it renders before and outside any
 * prepared envelope, so no noun exists to render there, and the two uses it
 * carries name the online class journal and class tools rather than addressing
 * the people in front of her.
 */
function fieldRunSources(): Array<{ file: string; code: string }> {
  return readdirSync(FIELD_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !file.endsWith("DepartureCheck.tsx"))
    .map((file) => ({
      file,
      code: stripComments(readFileSync(new URL(file, FIELD_DIR), "utf8")),
    }));
}

describe("the word the offline field runner uses", () => {
  it("calls a prepared family a family", () => {
    const markup = fieldRunMarkup(preparedEnvelope("family"));
    expect(markup).toContain("family");
    expect(markup).not.toMatch(/(?:the|your) class\b/);
  });

  it("calls a prepared nature club a group", () => {
    const markup = fieldRunMarkup(preparedEnvelope("group"));
    expect(markup).not.toMatch(/(?:the|your) class\b/);
  });

  it("still calls a school a class", () => {
    expect(fieldRunMarkup(preparedEnvelope("class"))).toMatch(/(?:the|your) class\b/);
  });

  it("runs an envelope prepared before the noun existed, and reads it as a class", () => {
    const legacy = preparedEnvelope();
    expect("groupNoun" in legacy.overlay).toBe(false);
    expect(fieldRunMarkup(legacy)).toMatch(/(?:the|your) class\b/);
  });

  it("reads the basic lesson with no envelope at all as a class", () => {
    expect(fieldRunMarkup(null)).toMatch(/(?:the|your) class\b/);
  });

  it("leaves no written-in class noun anywhere in the field surface", () => {
    // Wider than #1214's `(the|your) class`, and deliberately: the string this
    // ticket actually found said "prepared for the active class", which that
    // pattern reads straight past. An article, an optional adjective, then the
    // word — `className` is safe, because the boundary needs a non-word after
    // "class".
    const offenders = fieldRunSources().flatMap(({ file, code }) =>
      [...code.matchAll(/\b(?:the|your|a|this)\b(?:\s+\w+)?\s+class\b/g)].map(
        (match) =>
          `${file}: ${code.slice(Math.max(0, match.index - 40), match.index + 40).trim()}`,
      ),
    );
    expect(offenders, "every rendered use goes through the prepared noun").toEqual([]);
  });

  it("carries the noun through the envelope, because the field has no server read", () => {
    const shell = stripComments(readFileSync(new URL("FieldShell.tsx", FIELD_DIR), "utf8"));
    expect(shell).toContain("<GroupNounProvider ");
    // A lazy run snapshot, like the lesson text and safety beside it: the word
    // cannot change under a teacher mid-run.
    expect(shell).toMatch(/useState\(\(\) => \(\{[\s\S]{0,400}groupNoun:/);

    const server = stripComments(
      readFileSync(new URL("../../lib/offline/prepare-server.ts", import.meta.url), "utf8"),
    );
    expect(server).toMatch(/groupNoun: groupNoun\(active\.groupType\)/);
  });
});

describe("the prepared envelope contract around the added noun", () => {
  it("omits the key entirely when no audience was resolved", () => {
    expect(JSON.stringify(preparedEnvelope().overlay)).not.toContain("groupNoun");
  });

  it("round-trips each of the three words the product already uses", () => {
    for (const noun of ["class", "family", "group"] as const) {
      const parsed = parsePreparedFieldEnvelope(preparedEnvelope(noun));
      expect(parsed.overlay.groupNoun).toBe(noun);
    }
  });

  it("accepts an envelope stored before the key existed", () => {
    const legacy = preparedEnvelope();
    expect(parsePreparedFieldEnvelope(legacy).overlay.groupNoun).toBeUndefined();
  });

  it("still refuses a word the product does not use, and any other new key", () => {
    const wrongWord = preparedEnvelope();
    expect(() =>
      parsePreparedFieldEnvelope({
        ...wrongWord,
        overlay: { ...wrongWord.overlay, groupNoun: "cohort" },
      }),
    ).toThrow();
    expect(() =>
      parsePreparedFieldEnvelope({
        ...wrongWord,
        overlay: { ...wrongWord.overlay, className: "Year 4" },
      }),
    ).toThrow();
  });

  it("keeps naming nobody: the noun is a word, not a record", () => {
    const serialised = JSON.stringify(preparedEnvelope("family"));
    expect(serialised).not.toContain("class-private-id");
    expect(serialised).not.toContain("teacher-private-id");
  });
});

describe("the deployment skew this key opens, and what closes it", () => {
  it("declares this build's own schema in a header the old endpoint can ignore", async () => {
    const envelope = preparedEnvelope("family");
    let sentBody: unknown = null;
    let sentHeader: string | null = null;
    await prepareFieldSession({
      sessionId: coreSession.id,
      coreFingerprint: core.contentFingerprint,
      fetcher: async (_input, init) => {
        sentBody = JSON.parse(String(init?.body));
        sentHeader = new Headers(init?.headers).get(PREPARED_OVERLAY_FEATURES_HEADER);
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      cacheMatch: async () => undefined,
      save: async () => undefined,
    });
    expect(sentHeader).toBe([...PREPARED_OVERLAY_FEATURES].join(","));
    // Rolled back, the previous deployment validates this body with a
    // `.strict()` schema over exactly two fields. It must still pass.
    expect(Object.keys(sentBody as object).sort()).toEqual([
      "coreFingerprint",
      "sessionId",
    ]);
  });

  it("reads absent, empty, malformed and unknown declarations as no declaration", () => {
    expect(parsePreparedOverlayFeatures(null)).toEqual([]);
    expect(parsePreparedOverlayFeatures("")).toEqual([]);
    expect(parsePreparedOverlayFeatures(",,  ,")).toEqual([]);
    expect(parsePreparedOverlayFeatures("group-class")).toEqual([]);
    // A client NEWER than this server names a field it has never heard of; the
    // preparation still happens, carrying only what this build can name.
    expect(parsePreparedOverlayFeatures("group-noun,something-later")).toEqual([
      "group-noun",
    ]);
    expect(parsePreparedOverlayFeatures("  GROUP-NOUN , group-noun ")).toEqual([
      "group-noun",
    ]);
    expect(parsePreparedOverlayFeatures("x".repeat(5000))).toEqual([]);
  });

  it("reads an envelope with a key it does not know as unavailable, not as a throw", () => {
    // This is the old tab's side of the same skew: one shared IndexedDB key, so
    // a new tab's envelope can be read by a build that predates the key. The
    // store answers unavailable/"invalid" and the shell falls back to the basic
    // public lesson, which is what an unknown key must not turn into a crash.
    const stored = preparedEnvelope("family");
    const withAKeyFromTheFuture = {
      ...stored,
      overlay: { ...stored.overlay, somethingAddedLater: "x" },
    };
    expect(
      classifyPreparedFieldState(withAKeyFromTheFuture, {
        sessionId: coreSession.id,
        coreFingerprint: core.contentFingerprint,
        expectedOwner: stored.lease,
      }),
    ).toEqual({ status: "unavailable", reason: "invalid" });
  });

  it("passes the declaration through the endpoint rather than assuming it", () => {
    const route = stripComments(
      readFileSync(new URL("../../app/api/offline/prepare/route.ts", import.meta.url), "utf8"),
    );
    expect(route).toContain("parsePreparedOverlayFeatures(");
    expect(route).toContain("request.headers.get(PREPARED_OVERLAY_FEATURES_HEADER)");
    // The body schema must stay exactly what a rolled-back deployment accepts:
    // two fields and `.strict()`, with the declaration nowhere in it.
    expect(route).not.toMatch(/overlayFeatures: z\./);
  });
});
