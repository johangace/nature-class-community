#!/usr/bin/env node
/**
 * Pre-generate the recordings behind the lesson preview (nc#515).
 *
 * Run by a maintainer, by hand, after `npm run preview:narration`:
 *
 *   node scripts/synthesize-lesson-preview.mjs            # voice what is missing
 *   node scripts/synthesize-lesson-preview.mjs --dry-run  # what it would cost
 *   node scripts/synthesize-lesson-preview.mjs --prune    # drop orphaned files
 *
 * Same shape as `scripts/synthesize-spoken-lines.mjs` (#358), and deliberately
 * so: content-addressed filenames, a manifest a runtime looks a clip up in,
 * `eleven_v3`, mono at 48kbps, mastered to -16 LUFS, cached at runtime rather
 * than precached, and the shipped backend TTS client reached at generation
 * time only. Read that file for the reasoning behind all of it; only what is
 * DIFFERENT is argued here.
 *
 * ── DIFFERENCE ONE: THE SAME VOICE, A DIFFERENT SETTING ────────────────────
 *
 * Lily, the same voice the runner's play control uses since 2026-09-06 (it was
 * a different voice before; Johan asked for one hero voice, read aloud too).
 * A teacher tells narration from her own line by the quotation mark on screen,
 * not by the voice.
 *
 * Stability sits at 0.6 here and 0.5 in `synthesize-spoken-lines.mjs`. A whole
 * card is one recording, so the consistency that matters is within a take, and
 * a little variation is what stops eleven cards in a row sounding like an
 * announcement system. A spoken line is one sentence said to children, and it
 * is allowed to mean it.
 *
 * ── DIFFERENCE TWO: THE PAUSES ARE SPLICED SILENCE, NOT MARKUP ─────────────
 *
 * This is the reason the script is longer than #358's, and it is recipe step 3
 * of `recipes/voice-ai-pipeline/SKILL.md`.
 *
 * `eleven_v3` IGNORES SSML, and its own handling of authored pauses is
 * non-deterministic: the same paragraph synthesised twice comes back with
 * different rests in different places. The first prototype of this deck handed
 * the model a whole card and let it breathe where it liked, and it sounded
 * rushed — sections ran into each other and the last sentence of a card never
 * got to land before the next card started.
 *
 * So a card is not one request. Each SEGMENT is synthesised alone, and then,
 * in ONE ffmpeg pass:
 *
 *   1. every segment's ragged head and tail is trimmed (`silenceremove`
 *      forward, then reversed and again, which is the only way to trim a tail);
 *   2. exactly the authored silence is generated between them (`aevalsrc`);
 *   3. the whole thing is concatenated and mastered in the same graph.
 *
 * ONE PASS IS LOAD-BEARING. The recipe's re-encode-never-byte-copy rule cuts
 * both ways: stitching mp3 frames together would produce gaps and clicks, and
 * decoding and re-encoding each segment on its way to a concat would put every
 * card through the lossy stage twice. Decoding once, splicing in PCM, and
 * encoding once at the end is the only arrangement that is neither.
 *
 * The silences themselves are authored in `lib/lesson/preview.ts`, not here,
 * because a gap is part of what is spoken: change one and the recording is a
 * different recording, and the content hash has to move with it.
 *
 * ── THE CORPUS COMES FROM THE COMMITTED MANIFEST ───────────────────────────
 *
 * This script reads `lib/lesson/preview-narration.json` rather than calling the
 * generator, so it stays plain node with nothing to transpile. That file is
 * written by `npm run preview:narration` and held current against the pure
 * function by `tests/unit/lesson-preview.spec.tsx`, so reading it is reading
 * the function, one build step removed.
 *
 * SCOPE: NEITHER HOUSE NOR FOUNDER. It judges no prose; it turns text that has
 * already been decided into audio. Listed because every script in this repo
 * says whose writing it governs; see `scripts/authorship.mjs`.
 */

import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clipKeyOf } from "../lib/lesson/clip-key.mjs";
import {
  ENCODE_ARGS,
  MASTER_FILTER,
  estimateUsd,
  inWaves,
  loadTtsClient,
  pruneOrphans,
  readManifest,
  writeManifest,
} from "./lib/tts-corpus.mjs";


const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const NARRATION = join(ROOT, "lib", "lesson", "preview-narration.json");
const AUDIO_DIR = join(ROOT, "public", "lesson-preview");
const MANIFEST = join(ROOT, "lib", "lesson", "preview-audio.manifest.json");

export const MODEL_ID = "eleven_v3";

/**
 * ElevenLabs "Lily": British, confident — Johan's pick by ear on nc#633,
 * against the whole #515 candidate field plus Alice at two stabilities and
 * the runner's own voice, on the listening booth (PR #648): *"I like LILY for
 * UK based / Default"*. Localized voices are a later, deliberate step
 * (nc#676), not an env toggle.
 *
 * Named here rather than left to `ELEVENLABS_VOICE_ID`, because which voice
 * speaks to a teacher is a product decision and not an environment one — the
 * env var would let a maintainer's shell quietly re-record the whole corpus
 * in the runner's voice.
 */
export const VOICE_ID = "pFZP5JQG7iQjIQuC4Bku";
const VOICE_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};


/**
 * The content address of a card's recording.
 *
 * The hash itself lives in `lib/lesson/clip-key.mjs` and the app calls the
 * same function (#570). This used to carry its own copy of the sha256, held
 * in agreement with the app's by a spec — which caught a real drift on its
 * first run, where this file passed raw control characters as separators and
 * the app did not. Every card disagreed, and nothing looked wrong in a diff.
 *
 * Kept as a named export so the spec can still assert that the two sides
 * reach the same address over the whole shipped corpus.
 */
export function clipKeyFor(narration) {
  return clipKeyOf(narration, { model: MODEL_ID, voice: VOICE_ID });
}

/* ── the splice ─────────────────────────────────────────────────────────── */

/**
 * Trim a segment's ragged edges without eating its own breath.
 *
 * -45dB rather than a lower floor because this is a mastered studio voice over
 * a near-silent bed; 30ms of the original silence is kept at each end so a
 * consonant is never clipped off the front of a word. Both directions, because
 * `silenceremove` only ever works on the head — `areverse` is how a tail gets
 * trimmed at all.
 *
 * MEASURED, ON A SHIPPED CARD: an authored 500ms rest lands at about 870ms of
 * audible silence, and a 450ms one at about 1.0s. The difference is the 60ms
 * kept at the join plus the model's own low-level breath sitting under the
 * threshold. It is left alone on purpose. The floor is deliberately safe
 * rather than tight — a trim that clips a consonant is a defect a teacher
 * hears, where a rest that runs slightly long is the direction Johan asked for
 * after the first cut felt too fast. What the splice actually buys is that the
 * rest is the SAME every time, which is the thing `eleven_v3` cannot give.
 */
const TRIM =
  "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB" +
  ":start_silence=0.03:detection=peak";
const TRIM_BOTH_ENDS = `${TRIM},areverse,${TRIM},areverse`;

/** Everything joins at one rate and one channel count, or `concat` refuses. */
const BED = "aresample=44100,aformat=sample_fmts=s16p:channel_layouts=mono";

/**
 * -16 LUFS with a -1.5dBTP ceiling, the target the rest of Rewyld's spoken
 * audio is mastered to. Applied ACROSS the spliced card rather than per
 * segment: normalising each segment separately would level the quiet end of
 * one sentence up against the loud start of the next, which is exactly the
 * step-up-and-down artefact the loudness pass exists to remove.
 */
const MASTER = MASTER_FILTER;

/**
 * One segment's length after trimming, measured the same way the splice will
 * trim it (nc#625). A separate small pass per segment rather than a probe
 * inside the big graph, because ffmpeg's filter graph has no way to report a
 * per-stream duration out of a single run — and this is what makes `marks`
 * MEASURED rather than estimated: the drawer opens on where a segment actually
 * starts, not on where arithmetic over the raw files guesses it might.
 */
function trimmedSeconds(input, stem, index) {
  const out = `${stem}.${index}.trim.wav`;
  try {
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-i", input,
      "-af", `${TRIM_BOTH_ENDS},aresample=44100`,
      out,
    ]);
    const seconds = Number(
      execFileSync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        out,
      ]).toString().trim()
    );
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  } finally {
    if (existsSync(out)) rmSync(out, { force: true });
  }
}

/**
 * Trim, splice and master a card's segments into one mp3, in one pass.
 *
 * Returns the encoded buffer, its MEASURED length, and where each segment
 * starts inside it (`marks`, in seconds). The length comes from ffprobe rather
 * than arithmetic over the segments, because the progress bar sizes each
 * card's stripe from it and a bar that promises a length the deck does not
 * keep is worse than no bar. The marks come from measuring each trimmed
 * segment and summing with the authored gaps — the same numbers the concat
 * assembles, so a mark is where the splice actually put the segment. Returns
 * null when ffmpeg is missing or the audio will not encode; the caller treats
 * that as a failed card, and a card that cannot be measured is not shipped.
 */
export function spliceCard(buffers, gapsMs) {
  const stem = join(tmpdir(), `nc-preview-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const inputs = buffers.map((_, index) => `${stem}.${index}.mp3`);
  const out = `${stem}.out.mp3`;
  try {
    buffers.forEach((buffer, index) => writeFileSync(inputs[index], buffer));

    const marks = [];
    let cursor = 0;
    for (const [index, input] of inputs.entries()) {
      marks.push(Math.round(cursor * 100) / 100);
      const trimmed = trimmedSeconds(input, stem, index);
      if (trimmed === null) return null;
      cursor += trimmed + (gapsMs[index] ?? 0) / 1000;
    }

    const filters = [];
    const chain = [];
    buffers.forEach((_, index) => {
      filters.push(`[${index}:a]${TRIM_BOTH_ENDS},${BED}[a${index}]`);
      chain.push(`[a${index}]`);
      const gap = gapsMs[index] ?? 0;
      if (gap > 0 && index < buffers.length - 1) {
        // Exact, generated silence — not the model's idea of a pause.
        filters.push(`aevalsrc=0:d=${(gap / 1000).toFixed(3)}:s=44100:c=mono,${BED}[g${index}]`);
        chain.push(`[g${index}]`);
      }
    });
    filters.push(`${chain.join("")}concat=n=${chain.length}:v=0:a=1,${MASTER}[out]`);

    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      ...inputs.flatMap((path) => ["-i", path]),
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      ...ENCODE_ARGS,
      out,
    ]);

    const seconds = Number(
      execFileSync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        out,
      ]).toString().trim()
    );
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    // The marks' own total against the mastered file: they were assembled from
    // the same trims and gaps the concat used, so more than a third of a
    // second of drift means the splice did not do what the arithmetic says.
    const assembled = cursor;
    if (Math.abs(assembled - seconds) > 0.35) {
      console.warn(
        `marks drift ${(seconds - assembled).toFixed(2)}s on a ${seconds}s card`
      );
    }
    return { buffer: readFileSync(out), seconds: Math.round(seconds * 10) / 10, marks };
  } catch {
    return null;
  } finally {
    for (const path of [...inputs, out]) if (existsSync(path)) rmSync(path, { force: true });
  }
}

/**
 * Every card that needs a recording, deduplicated by content address.
 *
 * `--session <id>` narrows it to one lesson, which is how a maintainer hears a
 * change before spending the whole corpus on it.
 */
export function collectCorpus(onlySession = null) {
  const narration = JSON.parse(readFileSync(NARRATION, "utf8"));
  const cards = new Map();
  for (const [id, entry] of Object.entries(narration.sessions)) {
    if (onlySession && id !== onlySession) continue;
    for (const card of entry.cards) {
      const key = clipKeyFor(card.segments);
      if (!cards.has(key)) cards.set(key, { key, segments: card.segments, says: card.says });
    }
  }
  return [...cards.values()];
}

/**
 * Write the manifest with its clips in key order.
 *
 * The order is not cosmetic: without it a run that voices three new cards
 * appends them wherever the object happened to grow, and the diff of a
 * 2,600-line manifest becomes unreadable at exactly the moment somebody wants
 * to see what a regeneration actually changed. Sorting stays here rather than
 * in the shared writer because the runner's manifest (#358) is keyed on
 * authored lines and re-ordering it would rewrite a file that has not changed.
 */
function writePreviewManifest(manifest) {
  const clips = {};
  for (const key of Object.keys(manifest.clips).sort()) clips[key] = manifest.clips[key];
  writeManifest(MANIFEST, { ...manifest, clips });
}

/* ── the run ────────────────────────────────────────────────────────────── */





async function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  const PRUNE = process.argv.includes("--prune");
  const onlyFlag = process.argv.indexOf("--session");
  const only = onlyFlag === -1 ? null : (process.argv[onlyFlag + 1] ?? null);

  // Pruning is over the WHOLE corpus even when voicing one session, or a
  // narrowed run would delete every other lesson's recordings.
  const corpus = collectCorpus(only);
  const manifest = readManifest(MANIFEST, { voice: VOICE_ID, model: MODEL_ID, clips: {} });

  if (manifest.model !== MODEL_ID || manifest.voice !== VOICE_ID) {
    console.log(
      `Manifest ${manifest.voice}/${manifest.model} → ${VOICE_ID}/${MODEL_ID}: ` +
        "every card is re-voiced."
    );
    manifest.model = MODEL_ID;
    manifest.voice = VOICE_ID;
    manifest.clips = {};
  }

  const missing = corpus.filter((card) => {
    const entry = manifest.clips[card.key];
    return !entry || !existsSync(join(AUDIO_DIR, entry.file));
  });

  const chars = (cards) =>
    cards.reduce(
      (total, card) => total + card.segments.reduce((n, s) => n + s.text.length, 0),
      0
    );
  const runCharacters = chars(missing);
  const corpusCharacters = chars(corpus);
  console.log(
    [
      `${corpus.length} preview cards to voice (${corpusCharacters} characters).`,
      `${missing.length} not yet voiced (${runCharacters} characters).`,
      `Estimated cost of this run: $${estimateUsd(runCharacters).toFixed(2)}`,
      `Whole corpus at this tier: $${estimateUsd(corpusCharacters).toFixed(2)}`,
    ].join("\n")
  );

  if (PRUNE) {
    const whole = collectCorpus();
    const kept = new Set(whole.map((card) => manifest.clips[card.key]?.file).filter(Boolean));
    const live = new Set(whole.map((card) => card.key));
    for (const key of Object.keys(manifest.clips)) {
      if (!live.has(key)) delete manifest.clips[key];
    }
    for (const name of pruneOrphans(AUDIO_DIR, kept, { dryRun: DRY_RUN })) {
      console.log(`prune ${name}`);
    }
    if (!DRY_RUN) writePreviewManifest(manifest);
  }

  if (DRY_RUN || missing.length === 0) return;

  const tts = loadTtsClient(ROOT, "a session with no recording simply shows no Preview row.");
  mkdirSync(AUDIO_DIR, { recursive: true });

  const abort = new AbortController();
  const onSigint = () => abort.abort();
  process.on("SIGINT", onSigint);

  let failed = 0;
  let done = 0;
  /**
   * A card is several requests, so the wave limit is over CARDS rather than
   * requests and sits below the client's own ceiling. Its segments go out
   * together: they are one recording and a card half-voiced is no recording.
   */
  await inWaves(missing, 3, async (card) => {
    try {
      const buffers = await Promise.all(
        card.segments.map((segment) =>
          tts
            .synthChunkV3(segment.text, {
              voiceId: VOICE_ID,
              voiceSettings: VOICE_SETTINGS,
              modelId: MODEL_ID,
              signal: abort.signal,
            })
            .then((result) => result.buffer)
        )
      );
      const spliced = spliceCard(
        buffers,
        card.segments.map((segment) => segment.gapAfterMs)
      );
      if (!spliced) throw new Error("ffmpeg splice failed");
      const file = `${card.key}.mp3`;
      writeFileSync(join(AUDIO_DIR, file), spliced.buffer);
      manifest.clips[card.key] = {
        file,
        seconds: spliced.seconds,
        // The words, in the manifest, so a diff on this file says what changed
        // in a language a reviewer reads rather than in sixteen hex digits.
        text: card.says,
        // Where each segment starts, in seconds — the drawer on the shape
        // card opens sections on these (nc#625).
        marks: spliced.marks,
      };
      done += 1;
      console.log(
        `voiced ${file}  ${(spliced.buffer.length / 1024).toFixed(0)}kB  ` +
          `${spliced.seconds}s  ${card.says.slice(0, 48)}`
      );
    } catch (error) {
      failed += 1;
      // A card that fails is left out of the manifest. The deck falls to
      // tap-to-advance on it, which is a mode rather than an error screen.
      console.error(`failed  ${card.says.slice(0, 56)}: ${error.message}`);
    }
  });

  process.off("SIGINT", onSigint);
  writePreviewManifest(manifest);
  console.log(`\n${done} voiced, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
