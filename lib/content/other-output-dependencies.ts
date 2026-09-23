import { traceWorksheet } from "./worksheet-dependencies";
import { readFileSync } from "node:fs";
import type { Session } from "@/schema/pack";
import type { SourceFieldRef } from "@/schema/prepared-day";
import { loadAllPacks, loadAuthoredPack, seasonShelf, RETIRED_SESSION_IDS } from "@/lib/pack";
import { collectSpokenLines, spokenAudioForSession } from "@/lib/lesson/spoken-audio";
import { buildCoreLessonRelease, loadOpenCoreShelfSource } from "@/lib/offline/core-release";
import { projectCoreSessionV1 } from "@/lib/offline/core-session";
import { revisionOf } from "@/lib/prepared-day/snapshot";
import { dependencyValue } from "./preview-dependencies";
import { changedDependencies, sourceAddress, type FieldDependency } from "./dependencies";

export type OutputUse = {
  id: string; kind: "audio-clip" | "offline-core" | "worksheet"; key: string;
  /** Existing manifest entry, not a claim that a remote file was checked. */
  recordedArtifact: string | null;
  sources: FieldDependency[];
};
export type OtherOutputManifest = {version: 1; outputs: OutputUse[]};

export function spokenOutputUses(session: Session, shared: Record<string, unknown>, sharedSettleInserted = false): OutputUse[] {
  const uses: OutputUse[] = [];
  const recordings = spokenAudioForSession(session);
  collectSpokenLines(session, {
    sharedSettleInserted,
    lineSource(line, source) {
      // Identity belongs to the use, while the recording's existing string
      // key may legitimately be shared by several nodes or lessons.
      uses.push({id: `${session.id}:spoken:${sourceAddress(source)}`, kind: "audio-clip", key: line,
        recordedArtifact: recordings[line]?.src ?? null,
        sources: [{source, valueRevision: revisionOf(dependencyValue(source, session, shared))}]});
    },
  });
  return uses;
}

/** Map source objects before projection strips authoring identities. */
export function coreSessionDependencies(session: Session, sharedSettleInserted = false): FieldDependency[] {
  const addresses = new WeakMap<object, SourceFieldRef>();
  function walk(value: unknown, address: SourceFieldRef) {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && "nid" in value && typeof value.nid === "string" && address.scope !== "shared") {
      address = {scope: "node", sessionId: session.id, nid: value.nid, field: ""};
    }
    addresses.set(value, address);
    for (const [key, child] of Object.entries(value)) {
      let next = {...address, field: address.field ? `${address.field}.${key}` : key};
      if (sharedSettleInserted && address.scope === "session" && address.field === "phases" && key === "0") next = {scope: "shared", sourceId: "settle", field: "phase"};
      walk(child, next);
    }
  }
  walk(session, {scope: "session", sessionId: session.id, field: ""});
  const sources: FieldDependency[] = [];
  projectCoreSessionV1(session, (object, field, value) => {
    const parent = addresses.get(object);
    if (!parent) throw new Error("Unmapped public core source");
    const source = {...parent, field: parent.field ? `${parent.field}.${field}` : field};
    sources.push({source, valueRevision: revisionOf(value)});
  });
  return sources;
}

export function buildOtherOutputManifest(): OtherOutputManifest {
  const shared = {settle: JSON.parse(readFileSync("packs/settle.json", "utf8"))};
  const outputs = loadAllPacks().flatMap(pack => pack.sessions.flatMap(session => spokenOutputUses(session, shared, session.settle === true)));
  for (const pack of loadAllPacks()) {
    for (const session of pack.sessions) {
      for (const ability of [undefined, "reception", "y1", "y2"] as const) {
        const rendered = traceWorksheet(session, ability, {id:pack.id,title:pack.title,sessionIds:pack.sessions.map(s=>s.id)});
        outputs.push({id:`${session.id}:worksheet:${ability ?? "base"}`,kind:"worksheet",key:revisionOf(rendered.html),recordedArtifact:null,sources:rendered.sources});
      }
    }
  }
  const release = buildCoreLessonRelease();
  const shelf = loadOpenCoreShelfSource();
  const coreSources = shelf.flatMap(entry => entry.pack.sessions.flatMap(session => coreSessionDependencies(session, session.settle === true)));
  for (const {pack} of shelf) {
    coreSources.push({source: {scope: "shared", sourceId: `packs/${pack.id}.json`, field: "sessions.$order"}, valueRevision: revisionOf(loadAuthoredPack(pack.id).sessions.map(session => session.id))});
    for (const field of ["id", "title", "subject", "ageBand"] as const) {
      coreSources.push({source: {scope: "shared", sourceId: `packs/${pack.id}.json`, field}, valueRevision: revisionOf(pack[field])});
    }
  }
  for (const [field, value] of Object.entries({seasonShelf, RETIRED_SESSION_IDS})) {
    coreSources.push({source: {scope: "shared", sourceId: "lib/pack.ts", field}, valueRevision: revisionOf(value)});
  }
  coreSources.push({source: {scope: "shared", sourceId: "lib/lesson/hazards.ts", field: "universalSafetyEntries"}, valueRevision: revisionOf(release.universalSafety)});
  const unique = new Map(coreSources.map(d => [sourceAddress(d.source), d]));
  let recordedCore: string | null = null;
  try {
    if (JSON.parse(readFileSync("public/offline/core-v1.json", "utf8")).contentFingerprint === release.contentFingerprint) recordedCore = "public/offline/core-v1.json";
  } catch { /* An expected build is not a materialized artifact. */ }
  outputs.push({id: "offline-core:core-v1", kind: "offline-core", key: release.contentFingerprint,
    recordedArtifact: recordedCore, sources: [...unique.values()]});
  return {version: 1, outputs};
}

export function affectedOutputUses(previous: OtherOutputManifest, current: OtherOutputManifest) {
  const before = new Map(previous.outputs.map(o => [o.id, o]));
  const after = new Map(current.outputs.map(o => [o.id, o]));
  return [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
    const old = before.get(id), next = after.get(id);
    const changes = changedDependencies(old?.sources ?? [], next?.sources ?? []);
    const keyChanged = old?.key !== next?.key;
    const availabilityChanged = old?.recordedArtifact !== next?.recordedArtifact;
    return !old || !next || changes.length || keyChanged || availabilityChanged ? [{id, keyChanged, availabilityChanged, changes}] : [];
  });
}
