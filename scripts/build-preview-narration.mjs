#!/usr/bin/env node
/**
 * Write the reviewable narration manifest for the lesson preview (nc#515).
 *
 *   npm run preview:narration           # rewrite it
 *   npm run preview:narration -- --check # fail if it is out of date
 *
 * WHY A COMMITTED FILE WHEN THE FUNCTION IS PURE.
 *
 * `lib/lesson/preview.ts` decides every word the preview speaks, and the app
 * calls it directly, so nothing at runtime can drift from the packs. This file
 * exists for the other reader: a person. Sophia's scope asks that a reviewer be
 * able to read what will be spoken for EVERY SESSION IN ONE FILE (fifty-six of
 * them today; the count is `npm run validate:packs`, not this sentence),
 * and a pure function spread across a codebase is not that.
 *
 * It is also what the synthesiser walks, which is why it is worth the second
 * artefact: `scripts/synthesize-lesson-preview.mjs` runs on plain node against
 * this JSON rather than transpiling the app to reach a TypeScript module.
 * `tests/unit/lesson-preview.spec.tsx` fails the build when the two disagree,
 * so the file cannot go stale behind a pack edit.
 *
 * SCOPE: NEITHER HOUSE NOR FOUNDER. It asserts nothing about anyone's prose —
 * it serialises what a pure function returns. Listed here because every script
 * in this repo now says whose writing it governs; see `scripts/authorship.mjs`.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewDeck, narrationText } from "../lib/lesson/preview.ts";
import { syncOutputDependencies } from "./output-dependencies.mjs";
import { previewDependencies } from "../lib/content/preview-dependencies.ts";
import { changedDependencies } from "../lib/content/dependencies.ts";
import { clipKeyOf } from "../lib/lesson/clip-key.mjs";
import { loadAllPacks } from "../lib/pack.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(root, "lib", "lesson", "preview-narration.json");
const CHECK = process.argv.includes("--check");
const DEPENDENCIES = join(root, "lib", "lesson", "preview-dependencies.json");

/** Sidecar metadata only: card and recording keys retain their existing owners. */
export function buildDependencyManifest() {
  const audio = JSON.parse(readFileSync(join(root, "lib", "lesson", "preview-audio.manifest.json"), "utf8"));
  const shared = {settle: JSON.parse(readFileSync(join(process.cwd(), "packs", "settle.json"), "utf8"))};
  const outputs = [];
  for (const {session} of everySession()) {
    const {cards, sources} = previewDependencies(session, shared, session.settle === true);
    for (const [card, dependencies] of sources) {
      const rendered = cards.find(c => c.id === card);
      const key = rendered ? clipKeyOf(rendered.narration, audio) : null;
      outputs.push({sessionId: session.id, card, kind: "overview-narration", key: `${session.id}/${card}`,
        present: Boolean(rendered), expectedClipKey: key,
        recordedClip: key && audio.clips[key] ? audio.clips[key].file : null,
        sources: dependencies});
    }
  }
  return {version: 1, outputs};
}

/** Used by Studio's existing preview:narration --check to name affected cards.
 * A changed dependency can require review while its recording key stays valid. */
export function affectedNarration(previous, current) {
  const before = new Map(previous.outputs.map(output => [output.key, output]));
  const now = new Map(current.outputs.map(output => [output.key, output]));
  return [...new Set([...before.keys(), ...now.keys()])].flatMap(key => {
    const output = before.get(key);
    const updated = now.get(key);
    const changes = changedDependencies(output?.sources ?? [], updated?.sources ?? []);
    const recordingKeyChanged = output?.expectedClipKey !== updated?.expectedClipKey;
    return !output || !updated || changes.length || recordingKeyChanged || output.present !== updated.present
      ? [{key, changes, recordingKeyChanged,
          reason: !output ? "output-added" : !updated ? "output-removed" : recordingKeyChanged ? "recording-changed" : "source-changed"}] : [];
  });
}

/**
 * Every session in the catalogue, including the packs that are off the shelf,
 * THROUGH THE APP'S OWN LOADER.
 *
 * This used to walk `packs/*.json` raw, and that walk shipped a seam bug:
 * `loadPack` composes the shared settling (`packs/settle.json`) in as phase
 * one for every session that opts in, and a raw read misses it. Ten
 * garden/summer sessions therefore had their whole phase narration shifted by
 * one part — every committed key wrong, every runtime lookup a silent miss,
 * and their part cards played as unvoiced while the corpus said otherwise.
 * The loader's own comment promises "no surface has to know the ritual is
 * shared"; this script was the surface that didn't. Reading through
 * `loadAllPacks` means what is voiced is byte-for-byte what the app serves.
 */
function everySession() {
  const sessions = [];
  for (const pack of loadAllPacks()) {
    for (const session of pack.sessions) sessions.push({ pack: pack.id, session });
  }
  return sessions;
}

export function buildManifest() {
  const sessions = {};
  for (const { pack, session } of everySession()) {
    sessions[session.id] = {
      pack,
      title: session.title,
      cards: previewDeck(session)
        .filter((card) => card.narration.length > 0)
        .map((card) => ({
          card: card.id,
          kind: card.kind,
          // The whole card as one readable sentence, first, because that is
          // what a reviewer is here to read.
          says: narrationText(card.narration),
          segments: card.narration,
        })),
    };
  }
  return { sessions };
}

/** The exact bytes the committed file must hold. The spec compares on this. */
export function serialiseManifest() {
  return `${JSON.stringify(buildManifest(), null, 2)}\n`;
}

function main() {
  syncOutputDependencies(CHECK);
  const manifest = buildManifest();
  const serialised = serialiseManifest();
  const dependencies = buildDependencyManifest();
  const dependencyText = `${JSON.stringify(dependencies, null, 2)}\n`;
  const oldDependencies = existsSync(DEPENDENCIES) ? JSON.parse(readFileSync(DEPENDENCIES, "utf8")) : null;
  if (oldDependencies) {
    const affected = affectedNarration(oldDependencies, dependencies);
    if (affected.length) console.log(JSON.stringify({staleNarration: affected}, null, 2));
  }

  if (CHECK) {
    const current = readFileSync(MANIFEST, "utf8");
    if (current !== serialised) {
      console.error(
        "lib/lesson/preview-narration.json is out of date. Run: npm run preview:narration"
      );
      process.exit(1);
    }
    if (!oldDependencies || readFileSync(DEPENDENCIES, "utf8") !== dependencyText) {
      console.error("Preview dependency sidecar is out of date. Run: npm run preview:narration");
      process.exit(1);
    }
    console.log("preview narration manifest and dependency sidecar are current.");
    return;
  }

  writeFileSync(MANIFEST, serialised);
  writeFileSync(DEPENDENCIES, dependencyText);
  const cards = Object.values(manifest.sessions).reduce(
    (total, entry) => total + entry.cards.length,
    0
  );
  const characters = Object.values(manifest.sessions).reduce(
    (total, entry) =>
      total +
      entry.cards.reduce(
        (sum, card) => sum + card.segments.reduce((n, s) => n + s.text.length, 0),
        0
      ),
    0
  );
  console.log(
    `${Object.keys(manifest.sessions).length} sessions, ${cards} narrated cards, ` +
      `${characters} characters.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
