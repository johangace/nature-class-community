/**
 * Types for `build-preview-narration.mjs`. See `register-lint.d.mts` for why
 * these declaration files exist at all.
 *
 * `serialiseManifest` is what the spec compares against the committed
 * `lib/lesson/preview-narration.json`, which is how that file cannot go stale
 * behind a pack edit.
 */

export interface NarratedCard {
  card: string;
  kind: string;
  says: string;
  segments: Array<{ text: string; gapAfterMs: number; part?: number }>;
}

export interface NarrationManifest {
  sessions: Record<string, { pack: string; title: string; cards: NarratedCard[] }>;
}

export function buildManifest(): NarrationManifest;

/** The exact bytes the committed manifest must hold. */
export function serialiseManifest(): string;

export interface NarrationDependencyManifest {
  version: number;
  outputs: Array<{
    sessionId: string; card: string; kind: string; key: string; present: boolean;
    expectedClipKey: string | null; recordedClip: string | null;
    sources: import("../lib/content/dependencies").FieldDependency[];
  }>;
}
export function buildDependencyManifest(): NarrationDependencyManifest;
export function affectedNarration(previous: NarrationDependencyManifest, current: NarrationDependencyManifest): Array<{
  key: string; changes: import("../lib/content/dependencies").ChangedDependency[]; recordingKeyChanged: boolean;
  reason: "output-added" | "output-removed" | "recording-changed" | "source-changed";
}>;
