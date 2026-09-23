import { projectCoreSessionV1 } from "./core-session";
import { createHash } from "node:crypto";
import { universalSafetyEntries } from "@/lib/lesson/hazards";
import {
  RETIRED_SESSION_IDS,
  seasonShelf,
  shelfPackOf,
  type Season,
} from "@/lib/pack";
import {
  parseCoreLessonReleaseV1,
  type CoreLessonReleaseV1,
  type CoreShelfEntry,
} from "@/lib/offline/contracts";
import type { Pack, Session } from "@/schema/pack";

export interface CoreReleaseSourceEntry {
  pack: Pack;
  season: Season;
}

export interface BuildCoreLessonReleaseOptions {
  generatedAt?: Date;
}

/**
 * Read the whole released shelf — every season, open or not, in authored
 * order — then remove collection packs before they reach the public builder.
 * A season that is locked on the shelf today is still released content: the
 * artifact is built once and carried offline through the year, so it holds
 * winter in September. Catalogue-only sessions never enter this source. The
 * builder independently refuses collection input so a caller cannot bypass
 * this filtering by assembling its own source.
 *
 * `shelfPackOf` is the one reading of `only` and `also`, shared with the
 * browse page and the curriculum, so a borrowed session (Minibeast hunting
 * on the autumn shelf) is released under the season it is shown in.
 */
export function loadOpenCoreShelfSource(): CoreReleaseSourceEntry[] {
  const source: CoreReleaseSourceEntry[] = [];

  for (const entry of seasonShelf) {
    const pack = shelfPackOf(entry);
    if (pack.collection) continue;
    // A title-only season (`planned` and no sessions, 2026-09-07) is a drawer
    // on the browse page, not a release: skip it. An entry with neither is a
    // typo, and the empty-pack throw below still catches it.
    if (pack.sessions.length === 0 && (entry.planned?.length ?? 0) > 0) continue;
    source.push({ pack, season: entry.season });
  }

  return source;
}

function assertAuthoredFallbacks(session: Session): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (
      record.type === "conditions-line" &&
      (typeof record.fallbackText !== "string" || record.fallbackText.trim() === "")
    ) {
      throw new Error(
        `Open-core session "${session.id}" has a conditions line without an authored fallback`
      );
    }
    Object.values(record).forEach(visit);
  };

  visit(session.phases);
}

function validateSession(session: Session): void {
  if (!session.primer) {
    throw new Error(`Open-core session "${session.id}" has no authored primer`);
  }
  if (session.childSheet.length === 0) {
    throw new Error(`Open-core session "${session.id}" has no authored child sheet`);
  }
  assertAuthoredFallbacks(session);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function buildCoreLessonReleaseFromSource(
  source: readonly CoreReleaseSourceEntry[],
  options: BuildCoreLessonReleaseOptions = {}
): CoreLessonReleaseV1 {
  if (source.length === 0) throw new Error("Open-core release source is empty");

  const shelf: CoreShelfEntry[] = [];
  const sessions: Record<string, Session> = {};

  for (const { pack, season } of source) {
    if (pack.collection) {
      throw new Error(
        `Collection-marked pack "${pack.id}" cannot enter the public open-core release`
      );
    }
    if (pack.sessions.length === 0) {
      throw new Error(`Open-core shelf pack "${pack.id}" has no released sessions`);
    }

    const sessionIds: string[] = [];
    for (const session of pack.sessions) {
      if (sessions[session.id]) {
        throw new Error(`Duplicate open-core session id "${session.id}"`);
      }
      validateSession(session);
      sessions[session.id] = projectCoreSessionV1(session);
      sessionIds.push(session.id);
    }

    shelf.push({
      packId: pack.id,
      packTitle: pack.title,
      subject: pack.subject,
      ageBand: pack.ageBand,
      season,
      sessionIds,
    });
  }

  const releasedIds = new Set(Object.keys(sessions));
  const retiredSessionIds = Object.fromEntries(
    Object.entries(RETIRED_SESSION_IDS).filter(([, current]) =>
      releasedIds.has(current)
    )
  );
  const universalSafety = universalSafetyEntries();
  const content = {
    version: 1 as const,
    releaseKind: "open-core" as const,
    shelf,
    sessions,
    retiredSessionIds,
    universalSafety,
  };
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();

  return parseCoreLessonReleaseV1({
    ...content,
    contentFingerprint: fingerprint(content),
    generatedAt,
  });
}

export function buildCoreLessonRelease(
  options: BuildCoreLessonReleaseOptions = {}
): CoreLessonReleaseV1 {
  return buildCoreLessonReleaseFromSource(loadOpenCoreShelfSource(), options);
}
