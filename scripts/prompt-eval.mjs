/**
 * prompt-eval.mjs -- does a prompt edit actually make the output better?
 *
 *   npm run eval:prompt -- conditions-line --runs 30
 *   npm run eval:prompt -- conditions-line --runs 30 --system variant.md
 *
 * THROUGH NPM, AND NOT `node …`, and neither half is a preference (#1218).
 *
 * Not node: this file loads `lib/ai/*.ts` at run time, and those modules import
 * each other without file extensions while `door-line.ts` reaches for the `@/`
 * path alias — neither of which plain node resolves. Under `node` the command
 * dies inside module loading, before a single draft.
 *
 * Through npm: the loader is `tsx`, which this repo installs as a LOCAL
 * devDependency, so naming it directly in an ordinary shell of a fresh clone is
 * `command not found`; `npm run` is what puts `node_modules/.bin` on PATH.
 *
 * And through npm for a second reason: CREDENTIALS. A developer keeps
 * `ANTHROPIC_API_KEY` or `AI_GATEWAY_API_KEY` in `.env` / `.env.local`, and
 * node 22 reads neither without an explicit `--env-file`. Without them
 * `isModelAvailable()` is false and thirty runs draft nothing at all — the
 * failure this file used to record as thirty `model-unavailable` refusals,
 * which reads in a report exactly like thirty guard refusals. So `RUNNER`
 * carries `--env-file-if-exists` for both files. IF-EXISTS, not the strict
 * `--env-file=` the langfuse smoke script uses: the coverage check RUNS this
 * command as its proof of runnability, and a CI runner has no `.env` — the
 * strict form would fail the build for want of a file the check does not need.
 *
 * Every one of these facts was found by review rather than by anyone running
 * the documented line, which is the whole story of this instrument: it was
 * cited as a bar for a year and could not be started.
 *
 * So the invocation is a package.json script, `evalCommand()` below is the one
 * place it is spelled, and `scripts/eval-coverage-lint.mjs` does not merely
 * print it — it EXECUTES it with `--runs 0` before letting the doc claim a
 * prompt is measurable. A command in that table has been run.
 *
 * Runs N real drafts over committed fixtures and reports the GUARD-VERDICT
 * DISTRIBUTION: what share the guard accepted, and the category of every
 * refusal. Not "is the line nice" — the guards answer "is it true", and
 * whether it is good is a question for a human reading a sampled sheet.
 *
 * This exists because the two best pieces of evidence in this codebase were
 * comments. `nature-grounding-line` v4 records 15/26 drafts naming invented
 * species before a change and 0/10 after; `lesson-support` v2 records 4/30
 * over-length drafts before and 0/30 after. Both were measured by hand, once,
 * and the numbers survive only as prose. A prompt edit should have to clear a
 * bar, and a bar needs an instrument.
 *
 * THE BAR (#141): a variant ships only if its guard-pass rate is at least the
 * current prompt's AND no new refusal category appears. A rewrite that trades
 * one failure for a different one has not improved anything, it has moved the
 * problem somewhere the old measurement could not see.
 *
 * Costs real model calls. Thirty runs of a short prompt on Haiku is pennies;
 * it is still not something to put in CI on every push.
 *
 * WHO ELSE READS THIS FILE (#1213)
 *
 * `ADAPTERS` is exported, and `scripts/eval-coverage-lint.mjs` imports it to
 * answer "which prompts can the bar actually be run on" from the real map
 * rather than from a list somebody keeps in step by hand. That is the only
 * reason the CLI below sits inside `main()` behind an entry-point check: this
 * module must be importable — by that check and by its spec — without reading
 * argv, without loading a TypeScript module and without calling a model.
 * Adapter behaviour is untouched by that move.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Where a prompt's committed fixture set lives, relative to the repo root. */
export const FIXTURE_DIR = "tests/eval/fixtures";

/**
 * EXACTLY how this harness must be started, up to the script path.
 *
 * Not "the executable": every token here is load-bearing and was added because
 * something silently did not work without it (see the header). `--import tsx`
 * resolves the TypeScript chain node cannot; the two `--env-file-if-exists`
 * flags are the credentials, in the order the app resolves them (`.env`, then
 * `.env.local` overriding it).
 *
 * `runnerProblems()` in scripts/eval-coverage-lint.mjs requires package.json's
 * `NPM_SCRIPT` to be exactly `${RUNNER} ${this file}` — a declaration held to
 * the script rather than a guess at its shape — and then EXECUTES it, which is
 * what makes any of this evidence rather than assertion.
 */
export const RUNNER =
  "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx";

/** The package.json script that carries `RUNNER` and starts this file. */
export const NPM_SCRIPT = "eval:prompt";

/** What is missing when no model can be reached, and where it goes. */
const NO_CREDENTIALS =
  "no ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY. Put one in .env.local (or .env), which " +
  `\`npm run ${NPM_SCRIPT}\` loads and a bare shell does not`;

/**
 * The one place the documented invocation is spelled.
 *
 * `scripts/eval-coverage-lint.mjs` renders this into the doc AND runs it (with
 * `runs: 0`, which loads everything and calls no model), so the table cannot
 * print a line nobody has executed. Render and execution differ in the run
 * count and in nothing else, deliberately.
 */
export const evalCommand = (id, runs = 30) => `npm run ${NPM_SCRIPT} -- ${id} --runs ${runs}`;

/**
 * Per-prompt adapter: how to render the user half from a fixture, and how to
 * judge the result. Deliberately explicit rather than clever — each prompt
 * asks something different of its guard, and a generic harness that pretended
 * otherwise would measure the wrong thing.
 *
 * An entry here is a CLAIM that the documented bar can be run for that prompt,
 * and `scripts/eval-coverage-lint.mjs` holds it to that: an adapter whose
 * fixture file is missing is reported as an instrument that cannot run, and
 * every prompt with no entry at all is printed in `docs/PROMPT_TEMPLATE.md` as
 * unmeasurable, by name.
 */
export const ADAPTERS = {
  "conditions-line": {
    maxTokens: 150,
    user: async (f) => {
      const { buildUser } = await import("../lib/ai/conditions-line.ts");
      return buildUser(f);
    },
    field: "line",
    check: async (draft, f) => {
      const { checkConditionsLine } = await import("../lib/ai/conditions-line.ts");
      return checkConditionsLine(draft, f);
    },
  },

  "door-line": {
    maxTokens: 150,
    user: async (f) => {
      const { buildUser } = await import("../lib/ai/door-line.ts");
      return buildUser(f);
    },
    field: "line",
    check: async (draft, f) => {
      const { checkDoorLine } = await import("../lib/ai/door-line.ts");
      return checkDoorLine(draft, f);
    },
  },
};

async function main() {
  const [id, ...rest] = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = rest.indexOf(`--${name}`);
    return i === -1 ? fallback : rest[i + 1];
  };
  const runs = Number(arg("runs", 30));
  const systemOverride = arg("system", null);

  if (!id) {
    console.error(`Usage: npm run ${NPM_SCRIPT} -- <prompt-id> [--runs N] [--system file.md]`);
    process.exit(1);
  }

  const { loadPrompt } = await import("../lib/ai/prompt-registry.ts");
  const { callModel, isModelAvailable } = await import("../lib/ai/model.ts");
  const { outcomeCode } = await import("../lib/ai/draft.ts");

  const adapter = ADAPTERS[id];
  if (!adapter) {
    console.error(`No eval adapter for "${id}". Adapters: ${Object.keys(ADAPTERS).join(", ")}`);
    process.exit(1);
  }

  const fixtures = JSON.parse(
    readFileSync(path.join(process.cwd(), FIXTURE_DIR, `${id}.json`), "utf8")
  );

  let system;
  if (systemOverride) {
    const raw = readFileSync(path.join(process.cwd(), systemOverride), "utf8");
    const m = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(raw);
    system = (m ? m[1] : raw).replace(/\n+$/, "");
  } else {
    const p = loadPrompt(id);
    if (!p) { console.error(`could not load prompt "${id}"`); process.exit(1); }
    system = p.system;
  }

  // `--runs 0` is the load-and-stop mode the coverage check executes: everything
  // above this line has already resolved — the TypeScript chain, the adapter,
  // the fixtures, the prompt — and returning here is what makes it structurally
  // impossible for that check to reach a paid call, rather than merely unlikely.
  // Whether a real run would draft anything, said before it is asked for. This
  // is the load-and-stop mode's whole job as a diagnostic: a person checking
  // their setup, and the coverage check proving the command starts, both learn
  // the same thing here.
  const modelReady = isModelAvailable();
  if (!(runs > 0)) {
    console.log(
      `${id}: loaded ${fixtures.length} fixtures and the prompt. ` +
        `Model ${modelReady ? "available" : `UNAVAILABLE — ${NO_CREDENTIALS}`}. No runs requested.`
    );
    return;
  }

  // A run with no credentials is not a measurement, it is thirty
  // `model-unavailable` rows that read like thirty refusals in the report this
  // prints. Refuse it instead, and say what is missing.
  if (!modelReady) {
    console.error(`Cannot run the bar for "${id}": ${NO_CREDENTIALS}`);
    process.exit(1);
  }

  console.log(`${id}: ${runs} runs over ${fixtures.length} fixtures${systemOverride ? ` (variant: ${systemOverride})` : ""}\n`);

  let ok = 0;
  const categories = new Map();
  const samples = [];

  for (let i = 0; i < runs; i++) {
    const fixture = fixtures[i % fixtures.length];
    const result = await callModel({ system, user: await adapter.user(fixture), maxTokens: adapter.maxTokens });
    if (!result) { categories.set("model-unavailable", (categories.get("model-unavailable") ?? 0) + 1); continue; }
    const match = result.text.match(/\{[\s\S]*\}/);
    let draft = null;
    try { draft = match ? JSON.parse(match[0])[adapter.field]?.trim() : null; } catch { draft = null; }
    if (!draft) { categories.set("unparseable", (categories.get("unparseable") ?? 0) + 1); continue; }

    const verdict = await adapter.check(draft, fixture);
    if (verdict.ok) { ok++; if (samples.length < 3) samples.push(draft); continue; }
    const code = outcomeCode(verdict.reason);
    categories.set(code, (categories.get(code) ?? 0) + 1);
    if (samples.length < 3) samples.push(`[${code}] ${draft}`);
    process.stdout.write(".");
  }
  process.stdout.write("\n\n");

  const rate = Math.round((100 * ok) / runs);
  console.log(`PASS RATE  ${ok}/${runs}  (${rate}%)`);
  if (categories.size > 0) {
    console.log("\nrefusals by category:");
    for (const [c, n] of [...categories].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`);
  }
  console.log("\nsample drafts:");
  for (const s of samples) console.log(`  ${s.slice(0, 100)}`);
  console.log(`\nMACHINE ${JSON.stringify({ id, runs, ok, rate, categories: Object.fromEntries(categories) })}`);
}

// Only when run as the harness. Imported — by the coverage check that reads
// ADAPTERS, and by its spec — this module must stay side-effect free: it must
// not read argv, load a TypeScript module, or call a model.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
