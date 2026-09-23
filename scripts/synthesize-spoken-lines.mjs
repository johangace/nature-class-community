#!/usr/bin/env node
/**
 * Pre-generate the recordings behind the runner's play control (nc#358).
 *
 * Run by a maintainer, by hand, when a pack's spoken lines change:
 *
 *   node scripts/synthesize-spoken-lines.mjs            # voice what is missing
 *   node scripts/synthesize-spoken-lines.mjs --dry-run  # what it would cost
 *   node scripts/synthesize-spoken-lines.mjs --prune    # drop orphaned files
 *
 * WHY PRE-GENERATED, AND NOT AT REQUEST TIME.
 *
 * `recipes/voice-ai-pipeline/SKILL.md` step 4: the fast tier is for the path
 * where somebody is waiting, the high-quality tier is for anything prepared
 * ahead of need. Pack text is static on disk and nothing about a lesson is
 * authored at request time, so there is nothing to wait for. Nobody
 * synthesises while thirty children stand in a field. The recordings are
 * ordinary static files served from the same origin as the page, which is also
 * why the control costs nothing to press and works with no signal.
 *
 * WHY THE CLIENT IS ONLY LOADED HERE.
 *
 * The ElevenLabs client in `scripts/lib/tts-corpus.mjs` needs
 * `ELEVENLABS_API_KEY`, at generation time only. Nothing in the app, the
 * build, or CI can reach it: nature-class builds, tests and deploys with no
 * ElevenLabs key, and simply has fewer recordings until a maintainer runs
 * this.
 *
 * WHY THE FILENAME IS A HASH OF THE LINE.
 *
 * Content-addressed, so a file and the words it speaks can never disagree. If
 * an authored line changes by one character it gets a new name, the manifest
 * key changes with it, and the runner shows no control for that line until it
 * is voiced again. It never speaks the old sentence over the new one. This is
 * also how the verbatim guard is honoured without a second check: the string
 * that is hashed, keyed and sent to the synthesiser is the authored string.
 */

import { createHash } from "node:crypto";
import {
  ensureDir,
  encodeAndMeasure,
  estimateUsd,
  inWaves,
  loadTtsClient,
  pruneOrphans,
  readManifest as readJsonManifest,
  writeManifest as writeJsonManifest,
} from "./lib/tts-corpus.mjs";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PACKS = join(ROOT, "packs");
const AUDIO_DIR = join(ROOT, "public", "lesson-audio");
const MANIFEST = join(ROOT, "lib", "lesson", "spoken-audio.manifest.json");

const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");

/**
 * The tier. `eleven_v3` is the higher-quality model, which is exactly what a
 * pre-generated corpus is allowed to use.
 */
const MODEL_ID = "eleven_v3";

/**
 * THE RUNNER'S VOICE, NAMED HERE AND NOWHERE ELSE.
 *
 * This used to read `process.env.ELEVENLABS_VOICE_ID || tts.DEFAULT_VOICE_ID`,
 * and that is how the corpus ended up in two voices. The first 225 lines
 * (2026-08-27) were voiced with nothing set, so they got the backend's default,
 * Rachel (`21m00Tcm4TlvDq8ikWAM`, an American woman). The 58 lines added on
 * 2026-09-04 were voiced from a shell that had `ELEVENLABS_VOICE_ID` set to the
 * Rewyld app's "moss" voice, Chuck E Peru (`7JxUWWyYwXK8kmqmKEnT`, a British
 * man), and because the filename was salted with the model and the line but not
 * the voice, the old files were kept and the new ones landed beside them. A
 * teacher pressed play on one card and heard a woman, on the next a man.
 *
 * So the voice is a constant, the same way `synthesize-lesson-preview.mjs`
 * names Lily, and the filename is salted with it (see `fileNameFor`). Changing
 * this line renames every file, which is the honest cost of changing a voice.
 *
 * It is Lily, the same voice as the preview. Johan, 2026-09-06: "Lily should be
 * read aloud too, but with emotion." The preview script used to argue for two
 * voices so a teacher could tell narration from her own lines; the spoken line
 * already sits under the big quotation mark on screen, and the two corpora
 * never play in the same moment. One hero voice, British, everywhere; a US
 * voice is a later localization step (nc#676).
 */
export const RUNNER_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";
/**
 * Stability 0.5 is eleven_v3's "natural" setting: the voice is allowed to
 * mean what it says. The corpus used to sit at 0.85 to stop accent wandering
 * between one cold one-line request and the next, and it came out flat; Johan
 * asked for the lines with emotion. The preview runs at 0.6 for whole cards.
 * If a line wanders in accent, raise this toward 0.6 before anything else.
 */
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};


/**
 * ElevenLabs returns 44.1kHz/128kbps stereo, which for one sentence of speech
 * is about 16kB per spoken second and would put roughly 22MB of near-identical
 * left and right channels into this repository. Every file is therefore
 * re-encoded once, here, before it is written.
 *
 * Mono at 48kbps is transparent for a single voice and lands the whole
 * curriculum around 8MB. The same pass carries the loudness normalisation —
 * recipe step 7, one filter, no extra latency on a path where nobody is
 * waiting anyway. It matters more here than it does for a practice: each line
 * is a SEPARATE cold synthesis, so without this the volume would step up and
 * down between one sentence and the next inside a single lesson, in a
 * playground, over whatever speaker a primary school has.
 *
 * -16 LUFS with a -1.5dBTP ceiling, the same target the rest of Rewyld's
 * spoken audio is mastered to.
 */

/* ── the corpus ─────────────────────────────────────────────────────────── */

/**
 * Unwrap an authored wrapping quote pair. Mirrors `spokenLine` in lib/text.ts
 * exactly, and must keep mirroring it: the runner looks a line up by what it
 * puts on the page, so the two have to agree character for character.
 * Deliberately narrow — a line with quotes inside it is left alone.
 */
function spokenLine(text) {
  if (!text.startsWith('"') || !text.endsWith('"') || text.length < 2) return text;
  if ((text.match(/"/g) ?? []).length !== 2) return text;
  return text.slice(1, -1);
}

/**
 * Every line a pack says out loud. `say-aloud` and nothing else — a
 * teacher-note is direction to the teacher and must never reach a child's
 * ears, a demo's technique is a move she makes with her hands, and a
 * conditions line is about today's sky, which a recording made in August
 * cannot honestly speak. See lib/lesson/spoken-audio.ts for the full reasoning.
 */
function collectFromPhase(phase, out) {
  for (const block of phase.blocks ?? []) {
    if (block.type !== "say-aloud") continue;
    const variants = block.abilityVariants ?? {};
    for (const text of [block.text, variants.reception, variants.y1, variants.y2]) {
      if (typeof text === "string" && text.trim()) out.add(spokenLine(text));
    }
  }
  for (const variant of phase.conditionVariants ?? []) {
    collectFromPhase(variant.phase, out);
  }
}

function packFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...packFiles(path));
    else if (entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

function collectCorpus() {
  const lines = new Set();
  for (const file of packFiles(PACKS)) {
    const pack = JSON.parse(readFileSync(file, "utf8"));
    for (const session of pack.sessions ?? []) {
      for (const phase of session.phases ?? []) collectFromPhase(phase, lines);
    }
  }
  return [...lines];
}

/* ── the manifest ───────────────────────────────────────────────────────── */

/**
 * Salted with the model AND the voice, like the preview corpus. A file's name
 * now says which voice speaks it, so two voices cannot share a corpus by
 * accident, and a browser or service worker that cached the old file cannot
 * keep serving it under the new voice's name. The separator is a NUL byte,
 * as it always was, so no line can be spelled to collide with another.
 */
function fileNameFor(line, voice = RUNNER_VOICE_ID) {
  return `${createHash("sha256")
    .update(`${MODEL_ID} ${voice} ${line}`)
    .digest("hex")
    .slice(0, 16)}.mp3`;
}

/** The pre-salt name, kept only so `adoptExisting` can find the old file. */
function legacyFileNameFor(line) {
  return `${createHash("sha256")
    .update(`${MODEL_ID} ${line}`)
    .digest("hex")
    .slice(0, 16)}.mp3`;
}

/**
 * A recording already made in the current voice is kept, not paid for again:
 * if its file still carries the old unsalted name, it is renamed to the salted
 * one and the manifest entry follows. Deterministic, no network, no spend.
 * Returns the number of files adopted.
 */
function adoptExisting(manifest, corpus) {
  let adopted = 0;
  for (const line of corpus) {
    const entry = manifest.lines[line];
    if (!entry || entry.voice !== RUNNER_VOICE_ID) continue;
    const wanted = fileNameFor(line);
    if (entry.file === wanted) continue;
    const from = join(AUDIO_DIR, entry.file);
    const to = join(AUDIO_DIR, wanted);
    if (entry.file === legacyFileNameFor(line) && existsSync(from) && !existsSync(to)) {
      if (!DRY_RUN) {
        renameSync(from, to);
        entry.file = wanted;
      }
      adopted += 1;
    }
  }
  return adopted;
}




/* ── the run ────────────────────────────────────────────────────────────── */



async function main() {
  const corpus = collectCorpus();
  const manifest = readJsonManifest(MANIFEST, { voice: "", model: MODEL_ID, lines: {} });

  if (manifest.model !== MODEL_ID) {
    // A tier change invalidates every recording, because the filename is
    // salted with the model. Say so rather than silently voicing the corpus
    // twice.
    console.log(`Manifest model ${manifest.model} → ${MODEL_ID}: every line is re-voiced.`);
    manifest.model = MODEL_ID;
    manifest.lines = {};
  }

  const adopted = adoptExisting(manifest, corpus);
  if (adopted > 0) console.log(`${adopted} recordings already in this voice, renamed to the salted name.`);

  /**
   * A line is missing when nothing speaks it, when its file is gone, or when
   * what speaks it is NOT the runner's voice. The third case is the 2026-09-04
   * defect: an entry can look complete and still be the wrong voice.
   */
  const missing = corpus.filter((line) => {
    const entry = manifest.lines[line];
    return (
      !entry ||
      entry.voice !== RUNNER_VOICE_ID ||
      !existsSync(join(AUDIO_DIR, entry.file))
    );
  });
  const wrongVoice = corpus.filter((line) => {
    const entry = manifest.lines[line];
    return entry && entry.voice !== RUNNER_VOICE_ID;
  });

  const characters = missing.reduce((total, line) => total + line.length, 0);
  const corpusCharacters = corpus.reduce((total, line) => total + line.length, 0);
  console.log(
    [
      `${corpus.length} spoken lines in packs/ (${corpusCharacters} characters).`,
      `${missing.length} not yet voiced in the runner's voice (${characters} characters).`,
      `${wrongVoice.length} of those were recorded in another voice and will be replaced.`,
      `Estimated cost of this run: $${estimateUsd(characters).toFixed(2)}`,
      `Whole corpus at this tier: $${estimateUsd(corpusCharacters).toFixed(2)}`,
    ].join("\n")
  );

  if (PRUNE) {
    const kept = new Set(corpus.map((line) => manifest.lines[line]?.file).filter(Boolean));
    for (const line of Object.keys(manifest.lines)) {
      if (!corpus.includes(line)) delete manifest.lines[line];
    }
    for (const name of pruneOrphans(AUDIO_DIR, kept, { dryRun: DRY_RUN })) {
      console.log(`prune ${name}`);
    }
    if (!DRY_RUN) writeJsonManifest(MANIFEST, manifest);
  }

  if (DRY_RUN || missing.length === 0) {
    if (!DRY_RUN && adopted > 0) writeJsonManifest(MANIFEST, manifest);
    return;
  }

  const tts = loadTtsClient(ROOT, "they just show fewer play controls.");
  ensureDir(AUDIO_DIR);

  const voiceId = RUNNER_VOICE_ID;
  manifest.voice = voiceId;

  /**
   * One abort for the whole run, held in a variable so it cannot be collected,
   * and passed into every call. `synthChunkV3` chains it to its own per-request
   * timer, so a hung request frees its concurrency slot instead of stalling the
   * batch — recipe step 5, honoured by using the code that already does it.
   */
  const abort = new AbortController();
  const onSigint = () => abort.abort();
  process.on("SIGINT", onSigint);

  let failed = 0;
  await inWaves(missing, tts.V3_MAX_CONCURRENT ?? 5, async (line) => {
    try {
      // No concatenation anywhere in this pipeline: one spoken line is one
      // request and one file, so the re-encode-never-byte-copy hazard the
      // recipe warns about cannot arise here.
      const { buffer } = await tts.synthChunkV3(line, {
        voiceId,
        voiceSettings: VOICE_SETTINGS,
        modelId: MODEL_ID,
        signal: abort.signal,
      });
      const encoded = encodeAndMeasure(buffer, { tag: "nc-spoken" });
      if (!encoded) throw new Error("ffmpeg re-encode failed");
      const file = fileNameFor(line);
      writeFileSync(join(AUDIO_DIR, file), encoded.buffer);
      manifest.lines[line] = { file, seconds: encoded.seconds, voice: voiceId };
      console.log(
        `voiced ${file}  ${(encoded.buffer.length / 1024).toFixed(0)}kB  ` +
          `${encoded.seconds}s  ${line.slice(0, 52)}`
      );
    } catch (error) {
      failed += 1;
      // A line that fails is left out of the manifest, which is the honest
      // outcome: the runner shows no control for it and everything else ships.
      console.error(`failed  ${line.slice(0, 60)}: ${error.message}`);
    }
  });

  process.off("SIGINT", onSigint);
  writeJsonManifest(MANIFEST, manifest);
  console.log(`\n${missing.length - failed} voiced, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
