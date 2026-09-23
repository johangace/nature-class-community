import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * THE MACHINERY UNDER BOTH SPOKEN CORPORA (nc#570).
 *
 * Two scripts generate audio from authored pack text: the runner's spoken
 * lines (#358) and the lesson preview's narration (#515). The second was
 * written to the shape of the first, deliberately and correctly — copying one
 * example is cheaper than guessing an abstraction from it. There are two now,
 * which is the moment the guess stops being a guess.
 *
 * What is genuinely different between them stays in the scripts: what text is
 * collected, which voice says it, and whether silence is spliced between
 * segments. What was the same in both — resolving the client, costing a run,
 * bounded concurrency, re-encoding, measuring, sweeping orphans — is here, so
 * a 429 handler or a loudness target has one place to be fixed rather than two
 * places to be fixed and one to be forgotten.
 *
 * NOTHING HERE MAY REACH THE APP. This module is for scripts a maintainer runs
 * by hand. The app, the build and CI all run with no ElevenLabs key; they
 * simply ship whatever recordings exist.
 */

/** ElevenLabs Pro: $99 / 500,000 credits, one credit per character. */
export const USD_PER_CHARACTER = 99 / 500_000;

/**
 * −16 LUFS with a −1.5 dBTP ceiling, the target the rest of Rewyld's spoken
 * audio is mastered to, and mono at 48kbps.
 *
 * The loudness pass matters more here than for a single long practice: every
 * line is a SEPARATE cold synthesis, so without it the volume steps up and
 * down between one sentence and the next inside one lesson, in a playground,
 * over whatever speaker a primary school has.
 */
export const MASTER_FILTER = "loudnorm=I=-16:TP=-1.5:LRA=11";
export const ENCODE_ARGS = ["-ac", "1", "-b:a", "48k", "-codec:a", "libmp3lame"];

/** Requests in flight at once, below the provider's per-account ceiling. */
export const V3_MAX_CONCURRENT = 5;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_429_RETRIES = 3;

/**
 * The ElevenLabs client: one text-to-speech request, in this repository.
 *
 * It used to be required from a sibling checkout of another, private
 * repository, which meant the published source could not regenerate its own
 * recordings. It is one POST, a timeout and a bounded retry on 429, so it
 * lives here, and the only thing a maintainer needs is their own key.
 *
 * Required at generation time only.
 *
 * @param {string} _root Unused; kept so both scripts' call sites stay as they are.
 * @param {string} note One line about what this particular script loses
 *   without it, so the error tells a maintainer what actually broke.
 */
export function loadTtsClient(_root, note) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error(
      [
        "ELEVENLABS_API_KEY is not set.",
        "",
        "Only the synthesis scripts need it. The app, the build and the tests",
        `all run without it; ${note}`,
      ].join("\n")
    );
    process.exit(1);
  }
  return { V3_MAX_CONCURRENT, synthChunkV3: (text, options) => synthChunkV3(apiKey, text, options) };
}

/**
 * @param {string} apiKey
 * @param {string} text
 * @param {{ voiceId: string, modelId: string, voiceSettings?: object, signal?: AbortSignal }} options
 * @returns {Promise<{ buffer: Buffer }>}
 */
async function synthChunkV3(apiKey, text, { voiceId, modelId, voiceSettings, signal }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  for (let attempt = 0; ; attempt += 1) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    // A 429 is the account's concurrency ceiling, and it clears as other
    // requests finish, so it is waited out a few times rather than thrown.
    if (res.status === 429 && attempt < MAX_429_RETRIES && !signal?.aborted) {
      await res.text().catch(() => {});
      const retryAfter = Number.parseFloat(res.headers.get("retry-after") ?? "");
      const waitMs = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 3000) : 1000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 200)}`);
    }
    return { buffer: Buffer.from(await res.arrayBuffer()) };
  }
}

/**
 * Run `fn` over `items`, at most `limit` in flight, results in input order.
 *
 * A wave rather than `Promise.all` over the whole corpus: the provider has a
 * concurrency ceiling, and five hundred simultaneous requests earn a 429 for
 * every one of them rather than a queue.
 */
export async function inWaves(items, limit, fn) {
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await fn(items[index], index);
      }
    })
  );
  return results;
}

/**
 * Re-encode one synthesised buffer and measure what came out.
 *
 * RE-ENCODED, NEVER BYTE-COPIED. The provider returns 44.1kHz stereo, which
 * for one sentence is about 16kB per spoken second and would put megabytes of
 * near-identical left and right channels into this repository.
 *
 * MEASURED WITH ffprobe RATHER THAN ARITHMETIC over the input, because the
 * duration is what a progress bar and a countdown are drawn from, and an
 * estimate that is two seconds out is visible to a teacher.
 *
 * Returns null when ffmpeg is missing or the audio will not encode. A
 * recording that cannot be measured is not shipped.
 *
 * @param {Buffer} buffer
 * @param {{ tag?: string, filters?: string[], inputArgs?: string[] }} [options]
 *   `filters` are audio filters applied before the master pass — the preview's
 *   silence splice arrives already concatenated and needs none, while a caller
 *   trimming a segment's ragged edges passes its own.
 */
export function encodeAndMeasure(buffer, options = {}) {
  const { tag = "nc-tts", filters = [], inputArgs = [] } = options;
  const stem = join(tmpdir(), `${tag}-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const raw = `${stem}.in.mp3`;
  const out = `${stem}.out.mp3`;
  try {
    writeFileSync(raw, buffer);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      ...inputArgs,
      "-i",
      raw,
      "-af",
      [...filters, MASTER_FILTER].join(","),
      ...ENCODE_ARGS,
      out,
    ]);
    const seconds = measureSeconds(out);
    if (seconds === null) return null;
    return { buffer: readFileSync(out), seconds };
  } catch {
    return null;
  } finally {
    for (const path of [raw, out]) if (existsSync(path)) rmSync(path);
  }
}

/** Length of an encoded file, to a tenth, or null when it cannot be read. */
export function measureSeconds(path) {
  try {
    const seconds = Number(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
      ])
        .toString()
        .trim()
    );
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.round(seconds * 10) / 10;
  } catch {
    return null;
  }
}

/** Read a manifest, or the empty shape a first run starts from. */
export function readManifest(path, empty) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : structuredClone(empty);
}

/** Write a manifest with a trailing newline, the way the repo stores JSON. */
export function writeManifest(path, manifest) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Make sure the audio directory exists before the first file lands in it. */
export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

/**
 * Delete recordings nothing points at any more.
 *
 * Only ever run behind `--prune`. An orphan is cheap to keep and expensive to
 * delete by mistake, so a maintainer asks for this rather than a script
 * deciding on its behalf that a file is unwanted.
 *
 * @param {Set<string>} kept Filenames the manifest still refers to.
 * @param {{ dryRun?: boolean }} [options] `--dry-run` reports without deleting.
 * @returns {string[]} what was removed, or would have been
 */
export function pruneOrphans(dir, kept, options = {}) {
  if (!existsSync(dir)) return [];
  const orphans = readdirSync(dir).filter((name) => name.endsWith(".mp3") && !kept.has(name));
  if (!options.dryRun) for (const name of orphans) rmSync(join(dir, name));
  return orphans;
}

/** What a run of this many characters costs, to the cent. */
export function estimateUsd(characters) {
  return characters * USD_PER_CHARACTER;
}
