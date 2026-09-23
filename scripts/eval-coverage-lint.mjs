#!/usr/bin/env node
/**
 * Eval coverage lint: the bar has an instrument for SOME prompts (#1213).
 *
 * WHY THIS EXISTS
 *
 * `docs/PROMPT_TEMPLATE.md` opens with the bar, in one sentence, as the thing a
 * prompt change clears "and not otherwise":
 *
 *   30 runs per variant, same fixtures, real model, real maxTokens. The new
 *   version ships only if its guard-pass rate is at least the current one's,
 *   and no new refusal category appears.
 *
 * `scripts/prompt-eval.mjs` is that instrument, and it has adapters for two of
 * the thirteen prompts `lib/ai/prompt-registry.ts` names. For the other eleven
 * the bar is not expensive, it is IMPOSSIBLE: there is nothing to run. Those
 * prompts ship on a contract promise, a unit suite and an argument — which is
 * a defensible thing to do and an indefensible thing to leave unsaid, because
 * the doc's own sentence invites the next reader to assume a measurement was
 * made.
 *
 * Two prompt changes have stated the gap in their own pull requests (#756,
 * #791). "Stated openly each time" is a convention, and a convention is what
 * this repo keeps discovering it did not have (#554).
 *
 * WHAT IT CHECKS
 *
 *   1. Every adapter in `ADAPTERS` names a prompt the registry names, and can
 *      be DRIVEN — see `dryRunFault`. A prompt counts as measurable only after
 *      this check has loaded the harness's real chain, taken the real adapter,
 *      built the user half from every committed fixture and called the guard on
 *      each, stopping at the model call. Nothing about runnability is
 *      predicted, because three rounds of review proved that predicting it is a
 *      list of shapes somebody thought of.
 *
 *   1a. The doc advertises the executable that dry run ran under, rendered from
 *      `RUNNER`. It said `node` for the life of the harness, and under node the
 *      command dies in module loading (#1218).
 *
 *   2. `docs/PROMPT_TEMPLATE.md` carries ONE generated block, between the
 *      markers below, saying WHICH prompts have an instrument and which do
 *      not. The block is rendered here from the real `ADAPTERS` map and the
 *      real `PROMPT_FILES` — imported, not regex'd out of the registry's
 *      source, and never a second list somebody maintains. A hand-kept list of
 *      which prompts are measurable would rot exactly the way the doc it
 *      corrects has rotted, and a parser that disagrees with TypeScript about
 *      what an object literal contains is the same failure wearing a regex.
 *
 *   3. The version each prompt was at when that block was last regenerated is
 *      part of the block. So bumping an UNMEASURABLE prompt's version fails
 *      this check, by name, and says what the missing adapter would need. The
 *      only way past is to record — in the doc, in the diff, in front of the
 *      reviewer — that this version shipped without the bar being run:
 *
 *        npm run lint:eval-coverage -- --write
 *
 * WHAT IT CANNOT DO, SAID OUT LOUD
 *
 * It knows whether the bar COULD be run. It has no idea whether it WAS. A
 * measurable prompt can be bumped, re-recorded here and merged with no model
 * ever called, and this check stays green — see the pinned `expect: "green"`
 * entry in `scripts/guard-mutation-check.mjs`. Nothing short of storing run
 * output would close that, and stored output is a number that starts rotting
 * the afternoon it is written. The bar is still a person running the command.
 *
 * And the dry run stops where the money starts. `callModel` is a paid network
 * call, so what a real completion does — the JSON parse, `adapter.field` being
 * present in what came back — is past the line and stays there. An adapter can
 * therefore be driven green here and still fail on its first real draft. That
 * is a smaller residue than "nobody has ever checked", and it is the honest
 * size of it.
 *
 * SCOPE: NEITHER. It reads scripts, a registry, prompt frontmatter and one
 * doc's generated table; it judges no authored sentence and quotes no founder
 * prose. See `scripts/authorship.mjs` for why every check here says so.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ADAPTERS, FIXTURE_DIR, NPM_SCRIPT, RUNNER, evalCommand } from "./prompt-eval.mjs";
// The registry itself, not a regex over its source. The first draft of this
// check read `PROMPT_FILES` with the same pattern `validate-prompts.mjs` uses,
// which requires a trailing comma on every entry — so a thirteenth prompt added
// as the last property without one was silently absent from the table, and
// bypassed this check entirely (#1218 review). That is a parser disagreeing
// with the language, which is the same class of defect as a second list. The
// script therefore runs under tsx, like `validate:packs` does.
import { PROMPT_FILES, loadPrompt } from "../lib/ai/prompt-registry.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DOC = "docs/PROMPT_TEMPLATE.md";
export const REGISTRY = "lib/ai/prompt-registry.ts";
export const HARNESS = "scripts/prompt-eval.mjs";
export const WRITE_COMMAND = "npm run lint:eval-coverage -- --write";

/** Everything between these two lines in the doc is generated by this script. */
export const START = "<!-- eval-coverage:start -->";
export const END = "<!-- eval-coverage:end -->";

/** Where a prompt's fixture set lives, as the doc and the failures print it. */
export const fixtureFile = (id) => `${FIXTURE_DIR}/${id}.json`;

/* ------------------------------------------------------------------ *
 * Reading the code — the only source of "which prompts exist" and
 * "which of them have an instrument".
 * ------------------------------------------------------------------ */

/**
 * The prompt ids the registry names, in the order it names them — read from the
 * exported object, so a prompt exists here on exactly the terms it exists for
 * the app. No syntax of the file (a trailing comma, a line break, a comment
 * between entries) can hide one from this check.
 *
 * It still refuses to report an empty registry as a readable one: an import
 * that resolved to nothing must fail loudly rather than render a table saying
 * there are no prompts to measure.
 */
export function registryEntries() {
  const entries = Object.entries(PROMPT_FILES).map(([id, file]) => ({ id, file }));
  if (entries.length === 0) {
    throw new Error(
      `${REGISTRY} exports an empty PROMPT_FILES. This check refuses to report green off a ` +
        `registry that names no prompts.`
    );
  }
  return entries;
}

/** A prompt's declared version, from its own frontmatter. */
export function promptVersion(file, root = ROOT) {
  const raw = readFileSync(join(root, "prompts", file), "utf8");
  const match = /^version:\s*(\d+)\s*$/m.exec(raw);
  if (!match) throw new Error(`prompts/${file}: no version in frontmatter`);
  return Number(match[1]);
}

/**
 * One row per prompt: what it is called, what version it is at, and whether the
 * documented bar can be run on it at all.
 *
 * `measured` is the verdict of `dryRunFault` — the real adapter driven over the
 * real fixtures, stopping short of the model. Not a prediction about it.
 */
export async function currentRows(root = ROOT, adapters = ADAPTERS) {
  const rows = [];
  for (const { id, file } of registryEntries()) {
    rows.push({
      id,
      version: promptVersion(file, root),
      measured: (await dryRunFault(id, root, adapters)) === null,
    });
  }
  return rows;
}

/**
 * Why `id`'s fixture set could not be run, or null when it can be.
 *
 * A FILE IS NOT A FIXTURE SET. The first draft asked `existsSync` and called
 * that an instrument (#1218 review): a fixture file holding `{ not json` throws
 * inside the harness's `JSON.parse`, and one holding `[]` gives every run
 * `fixtures[i % 0]` — `undefined` — which dies in the adapter's own builder.
 * Both were reported here as measurable and printed in the doc as a prompt the
 * 30-run bar can be run on, which is precisely the claim this check exists to
 * stop anyone making on trust. So the file is opened and read the way
 * `prompt-eval.mjs` reads it.
 */
export function fixtureFault(id, root = ROOT) {
  const file = fixtureFile(id);
  const path = join(root, file);
  if (!existsSync(path)) return `${file} does not exist`;
  let fixtures;
  try {
    fixtures = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return `${file} is not valid JSON (${(e instanceof Error ? e.message : String(e)).split("\n")[0]})`;
  }
  if (!Array.isArray(fixtures)) return `${file} is not a JSON array of fixtures`;
  if (fixtures.length === 0) return `${file} is an empty array, so there is nothing to run over`;
  return null;
}

/**
 * The draft the dry run hands the guard. Original to this check and
 * deliberately dull: what is being exercised is that the guard RUNS against a
 * real fixture, not what it decides. A refusal is a fine answer here; a throw
 * is not.
 */
const PROBE_DRAFT = "Look at the shape of the one on the left.";

/**
 * DRIVE THE INSTRUMENT. Why `id` could not be measured, or null if it can.
 *
 * This is the answer to the question three rounds of review kept circling
 * (#1218): round one checked the fixture path existed, round two that the file
 * parsed into a non-empty array, and round three found three more shapes —
 * a fixture ELEMENT of `[null]`, an adapter missing its `user` or `field`, and
 * a documented command that cannot resolve its own modules. Each fix was a
 * case someone had thought of, and the next round would have found a seventh.
 *
 * A list of predicted failure shapes is not an answer to "is this measurable".
 * So nothing is predicted: the harness's own chain is loaded the way the
 * documented command loads it, the real adapter is taken from the real map, and
 * it is driven over every real fixture — `user` built, `check` called, the
 * prompt loaded — up to but NOT INCLUDING the model call. A prompt is
 * measurable when that completes. `[null]`, a missing `user`, an unresolvable
 * import and a wrong runner all fail here, for their own reasons, in their own
 * words, without this file having to know they exist.
 *
 * WHERE IT STOPS, AND WHY. The model call is the line. `callModel` is a paid
 * network call and CI must never make one, so what happens to a real completion
 * — the JSON parse, `adapter.field` actually being present in what the model
 * returns — is beyond this and stays beyond it. That residue is named in the
 * doc and pinned as a blind spot in `scripts/guard-mutation-check.mjs` rather
 * than implied away.
 */
/**
 * Run the command the table prints, exactly as printed but with `--runs 0`, and
 * say why it failed — or null if it came back clean.
 *
 * #1218 review round 4. Everything above proves the adapter can be driven
 * IN THIS PROCESS, which the check starts through npm with the loader already
 * arranged. That is not the claim the doc makes. The doc tells a reader to type
 * a line into a shell, and the previous rendering — `tsx scripts/prompt-eval.mjs
 * …` — is `tsx: command not found` in a fresh clone, because tsx is a local
 * devDependency and `npm run` is what puts `node_modules/.bin` on PATH. The
 * check stayed green because it never typed its own instruction.
 *
 * So the last prediction goes the way the others went: the rendered string is
 * split into argv and executed. `--runs 0` makes prompt-eval load its whole
 * chain — TypeScript modules, adapter, fixtures, prompt — and return before the
 * loop, so no model is called and none can be.
 */
const commandRuns = new Map();

export function runCommandFault(id, root = ROOT) {
  // Memoised per process. Spawning npm is the expensive part of this check, and
  // within one process the answer cannot change — a mutation that edits
  // package.json or the harness runs the whole check again, in its own process,
  // which is exactly how `scripts/guard-mutation-check.mjs` plants one.
  const key = `${root}\u0000${id}`;
  if (commandRuns.has(key)) return commandRuns.get(key);
  const fault = spawnEval(id, root);
  commandRuns.set(key, fault);
  return fault;
}

function spawnEval(id, root) {
  const printed = evalCommand(id, 0);
  const [bin, ...argv] = printed.split(" ");
  const r = spawnSync(bin, argv, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return `\`${printed}\` could not be started: ${oneLine(r.error)}`;
  if (r.status !== 0) {
    const lines = `${r.stdout ?? ""}${r.stderr ?? ""}`
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith(">") && !line.startsWith("npm "));
    // The line that says what went wrong, not the last line printed — a stack
    // trace ends on the node version, which tells a reader nothing.
    const said = lines.find((line) => /error|Error|cannot|Cannot|not found/.test(line)) ?? lines.at(-1);
    return `\`${printed}\` exited ${r.status}: ${said ?? "no output"}`;
  }
  return null;
}

export async function dryRunFault(id, root = ROOT, adapters = ADAPTERS) {
  const adapter = adapters[id];
  if (!adapter) return `${HARNESS} has no adapter for it`;

  // The shape the harness will actually use, in the harness's own terms:
  // `callModel({ user, maxTokens })`, then `JSON.parse(...)[field]`, then
  // `check(draft, fixture)`.
  if (typeof adapter.user !== "function") return `its adapter has no \`user\` builder`;
  if (typeof adapter.check !== "function") return `its adapter has no \`check\` function`;
  if (typeof adapter.field !== "string" || adapter.field.trim() === "") {
    return `its adapter's \`field\` is ${JSON.stringify(adapter.field)}, not the name of a field`;
  }
  if (!Number.isInteger(adapter.maxTokens) || adapter.maxTokens <= 0) {
    return `its adapter's \`maxTokens\` is ${JSON.stringify(adapter.maxTokens)}, and the bar is ` +
      `"real maxTokens"`;
  }

  const fault = fixtureFault(id, root);
  if (fault) return fault;
  const fixtures = JSON.parse(readFileSync(join(root, fixtureFile(id)), "utf8"));

  // The harness composes the system half through loadPrompt(id) with no
  // variables. A prompt that cannot be loaded that way cannot be run either.
  const prompt = loadPrompt(id);
  if (!prompt) return `${REGISTRY} could not load the prompt (see the [prompts] line above)`;

  for (const [i, fixture] of fixtures.entries()) {
    const where = `fixture ${i} of ${fixtureFile(id)}`;
    let user;
    try {
      user = await adapter.user(fixture);
    } catch (e) {
      return `its adapter's \`user\` builder threw on ${where}: ${oneLine(e)}`;
    }
    if (typeof user !== "string" || user.trim() === "") {
      return `its adapter's \`user\` builder returned ${JSON.stringify(user)} for ${where}`;
    }
    let verdict;
    try {
      verdict = await adapter.check(PROBE_DRAFT, fixture);
    } catch (e) {
      return `its adapter's \`check\` threw on ${where}: ${oneLine(e)}`;
    }
    if (!verdict || typeof verdict.ok !== "boolean") {
      return `its adapter's \`check\` returned ${JSON.stringify(verdict)} for ${where}, and the ` +
        `harness reads \`.ok\``;
    }
  }

  // Last, because it is the slowest and the least specific: the command the
  // table is about to print, actually run.
  return runCommandFault(id, root);
}

const oneLine = (e) => String(e instanceof Error ? e.message : e).split("\n")[0];

/**
 * Problems with the instrument itself, before any question about the doc: an
 * adapter for a prompt the registry does not name, or one the dry run above
 * could not drive.
 */
export async function instrumentProblems(root = ROOT, adapters = ADAPTERS) {
  const known = new Set(registryEntries().map((e) => e.id));
  const problems = [];
  for (const id of Object.keys(adapters)) {
    if (!known.has(id)) {
      problems.push(
        `${HARNESS} has an adapter for "${id}", which ${REGISTRY} does not name. Either the ` +
          `prompt was renamed and the adapter was left behind, or the adapter is for a prompt ` +
          `nothing can load — both mean the bar cannot be run for it.`
      );
      continue;
    }
    const fault = await dryRunFault(id, root, adapters);
    if (fault) {
      problems.push(
        `${HARNESS} has an adapter for "${id}", but ${fault}. ` +
          `${command(id)} cannot complete a single run. An instrument ` +
          `that cannot run is not an instrument; fix it or remove the adapter, and ` +
          `do not leave the doc claiming this prompt is measurable.`
      );
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * The generated block.
 * ------------------------------------------------------------------ */

/**
 * The command the doc prints — the harness's own `evalCommand`, which
 * `runCommandFault` below EXECUTES (at `--runs 0`) before any prompt is allowed
 * into the measurable half of the table. Print and execution come from one
 * producer and differ only in the run count.
 */
const command = (id) => `\`${evalCommand(id)}\``;

/**
 * The order the table prints rows in: everything with an instrument first, each
 * group keeping registry order. Exported because a reader of the doc and a
 * reader of the code must be able to agree on it — the spec compares the doc's
 * parsed rows against `tableRows(currentRows())` rather than re-deriving the
 * ordering, which is what made the first draft's assertion fail the moment a
 * third prompt gained an adapter (#1218 review). That is the option-1 follow-up
 * this whole ticket sets up, so the check must not be the thing that blocks it.
 */
export function tableRows(rows) {
  return [...rows.filter((r) => r.measured), ...rows.filter((r) => !r.measured)];
}

/** The doc's table, rendered from rows. The doc holds no other copy of this. */
export function renderBlock(rows) {
  const measured = rows.filter((r) => r.measured);
  const unmeasured = rows.filter((r) => !r.measured);
  const lines = [
    START,
    "",
    `<!-- Generated by \`${WRITE_COMMAND}\` from the \`ADAPTERS\` map in \`${HARNESS}\` and`,
    `     \`PROMPT_FILES\` in \`${REGISTRY}\`. Do not hand-edit: \`npm run lint:eval-coverage\``,
    `     runs in CI and compares every cell of it to the code. -->`,
    "",
    `**${measured.length} of ${rows.length} prompts have an instrument.** For the other ` +
      `${unmeasured.length} the bar above is not expensive, it is impossible: there is nothing ` +
      `to run. A change to one of those ships on its contract, its unit suite and an argument. ` +
      `That is allowed. Saying so in the pull request is not optional.`,
    "",
    `"Has an instrument" is not a judgement about these prompts — every row in the first group ` +
      `was **driven** to get here. \`npm run lint:eval-coverage\` loads the harness's real ` +
      `adapter, builds the user half from every committed fixture and calls the guard on each, ` +
      `stopping at the model call. What it cannot reach is what a real completion does: the ` +
      `JSON parse and the field the model was asked for. That, and whether anyone actually ran ` +
      `the thirty, stay with the person typing the command.`,
    "",
    "| prompt | version | the bar |",
    "| --- | --- | --- |",
  ];
  for (const row of tableRows(rows)) {
    lines.push(
      `| \`${row.id}\` | ${row.version} | ` +
        (row.measured
          ? `${command(row.id)} |`
          : `**no instrument** — no adapter in \`${HARNESS}\` |`)
    );
  }
  lines.push(
    "",
    "The version column is the version each prompt stood at when this table was last " +
      "regenerated, which is how a bump on an unmeasurable prompt becomes a red build instead " +
      `of a silent assumption. Bump one and the check names it; run \`${WRITE_COMMAND}\` to ` +
      "record that this version shipped unmeasured.",
    "",
    END
  );
  return lines.join("\n");
}

/**
 * What is wrong with the doc's markers, before anything is read between them.
 *
 * EXACTLY ONE PAIR, and that is not pedantry. The first draft took the first
 * `indexOf` of each marker (#1218 review), so a merge or a copy-paste that left
 * two blocks in the file had a correct first table vouching for a second,
 * contradictory one below it — and `--write` regenerated the first and left the
 * stale copy in place. Two tables in one doc is two answers to "which prompts
 * can the bar be run on", which is the question this file exists to have one
 * answer to. It is also the likeliest accident here: a doc section edited on two
 * branches at once.
 */
export function markerProblems(doc) {
  const starts = doc.split(START).length - 1;
  const ends = doc.split(END).length - 1;
  if (starts === 0 || ends === 0) {
    return [
      `${DOC} has no generated coverage block. Put the markers ${START} and ${END} under ` +
        `"The bar" and run: ${WRITE_COMMAND}`,
    ];
  }
  if (starts > 1 || ends > 1) {
    return [
      `${DOC} carries ${starts} ${START} marker(s) and ${ends} ${END} marker(s). There must be ` +
        `exactly one generated block: a second one is a second answer to which prompts the bar ` +
        `can be run on, and whichever copy is stale will be read as current by somebody. This ` +
        `usually arrives in a merge — delete the block you do not want and run: ${WRITE_COMMAND}`,
    ];
  }
  if (doc.indexOf(END) < doc.indexOf(START)) {
    return [`${DOC} has its ${END} marker before its ${START} marker. Put them back in order.`];
  }
  return [];
}

/**
 * The rows the doc currently records, or null when the markers are missing,
 * duplicated or inverted — `markerProblems` says which, and this refuses to
 * guess at a block rather than silently picking one of two.
 */
export function parseBlock(doc) {
  if (markerProblems(doc).length > 0) return null;
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  const block = doc.slice(start, end + END.length);
  const rows = [];
  for (const line of block.split("\n")) {
    const cells = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (!cells) continue;
    rows.push({
      id: cells[1],
      version: Number(cells[2]),
      measured: !cells[3].includes("no instrument"),
    });
  }
  return { block, rows };
}

/* ------------------------------------------------------------------ *
 * What moved since the table was written.
 * ------------------------------------------------------------------ */

const adapterRecipe = (id, adapters) =>
  `Writing one means a \`user\` builder that renders the prompt's user half from a committed ` +
  `fixture set at ${fixtureFile(id)}, and the \`field\` and guard call that judge the draft — ` +
  `see the ${Object.keys(adapters).join(" and ")} entries for the shape.`;

/**
 * The drift between what the doc records and what the code says, in the doc's
 * own terms. Pure, exported, and the thing the spec watches bite.
 */
export function driftProblems(recorded, current, adapters = ADAPTERS) {
  const problems = [];
  const was = new Map(recorded.map((row) => [row.id, row]));
  const now = new Map(current.map((row) => [row.id, row]));

  for (const row of current) {
    const before = was.get(row.id);
    if (!before) {
      problems.push(
        `"${row.id}" is a prompt in ${REGISTRY} and is not in the table in ${DOC}. A prompt ` +
          `that reaches a teacher without appearing there is one the doc silently implies the ` +
          `bar was run on. Run: ${WRITE_COMMAND}`
      );
      continue;
    }
    if (before.measured !== row.measured) {
      problems.push(
        row.measured
          ? `"${row.id}": the table says it has no instrument, and ${HARNESS} now has an ` +
            `adapter for it. Good — record it: ${WRITE_COMMAND}`
          : `"${row.id}": the table says the 30-run bar can be run for it, and the code says ` +
            `it cannot — ${HARNESS} has no adapter for it, or its fixture set cannot be run. ` +
            `A doc that overstates what is measurable is worse than one that says nothing. ` +
            `Run: ${WRITE_COMMAND}`
      );
      continue;
    }
    if (before.version === row.version) continue;
    problems.push(
      row.measured
        ? `"${row.id}" went version ${before.version} -> ${row.version}. It has an instrument, ` +
          `so the bar applies as written: ${command(row.id)} for the current prompt and for ` +
          `the variant, then record the new version with ${WRITE_COMMAND}`
        : `"${row.id}" went version ${before.version} -> ${row.version}, and it has no eval ` +
          `adapter in ${HARNESS}. The bar at the top of ${DOC} — 30 runs per variant, same ` +
          `fixtures, real model — CANNOT have been run for this change, because there is ` +
          `nothing to run. ${adapterRecipe(row.id, adapters)} Or ship it unmeasured, which is ` +
          `allowed: record that with \`${WRITE_COMMAND}\` so the table carries version ` +
          `${row.version} as unmeasured, and say in the pull request what you leaned on ` +
          `instead. What is not allowed is leaving the doc's bar to imply a measurement ` +
          `nobody made.`
    );
  }

  for (const row of recorded) {
    if (now.has(row.id)) continue;
    problems.push(
      `The table in ${DOC} lists "${row.id}", which ${REGISTRY} no longer names. Run: ` +
        `${WRITE_COMMAND}`
    );
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * The check itself.
 * ------------------------------------------------------------------ */

/**
 * The doc must advertise the executable the dry run actually used.
 *
 * #1218 review, P1: the table said `node scripts/prompt-eval.mjs …`, and on this
 * repo's node that command dies inside module loading — the adapters reach
 * `lib/ai/*.ts` through extensionless imports and the `@/` alias, neither of
 * which node resolves. Two prompts were published as measurable with an
 * invocation nobody had ever started.
 *
 * The rendered command is built from `RUNNER`, which `prompt-eval.mjs` declares.
 * This holds that declaration to the loader the dry run ran under: the npm
 * script that starts THIS file. They agree, or the doc is telling a reader to
 * type something this check has not itself proved loads.
 */
export function runnerProblems(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const script = pkg.scripts?.[NPM_SCRIPT];
  if (typeof script !== "string" || script.trim() === "") {
    return [
      `package.json has no "${NPM_SCRIPT}" script, and that script IS the documented way to ` +
        `run the harness — \`${evalCommand("<prompt-id>")}\`. Without it the doc's command is ` +
        `an instruction to nothing.`,
    ];
  }
  // Exact, not a shape test. Every token of RUNNER is load-bearing and each was
  // added because something failed silently without it: `--import tsx` for the
  // TypeScript chain, and two `--env-file-if-exists` for the credentials a
  // developer keeps in .env.local — without which thirty runs draft nothing and
  // report it as thirty refusals (#1218 review round 4). A "starts with tsx"
  // test would have gone on passing through that, which is the difference
  // between an assertion that is true and one that merely still passes.
  const expected = `${RUNNER} ${HARNESS}`;
  if (script.trim() !== expected) {
    return [
      `package.json's "${NPM_SCRIPT}" is:\n      ${script.trim()}\n    and ${HARNESS} declares ` +
        `it must be:\n      ${expected}\n    Every flag there is load-bearing — see that ` +
        `file's header. Change the declaration and the script together; this check then runs ` +
        `the result before the doc may print it.`,
    ];
  }
  return [];
}

/**
 * Nowhere in the doc may the harness be invoked with anything but `RUNNER`.
 * The generated table is built from it, but the prose around the table is not,
 * and the prose is where the broken `node …` invocation actually lived.
 */
export function docCommandProblems(doc) {
  const problems = [];
  const seen = new Set();
  // The path may be spelled relatively — `./scripts/…`, `../nature-class/scripts/…`
  // — and is the same invocation of the same unconfigured loader (#1218 review
  // round 6), so any run of `./`, `../` or directory segments before `scripts/`
  // counts. It is anchored to whitespace, so it still cannot start inside a
  // backticked bare mention.
  for (const m of doc.matchAll(
    /(\S+)[^\S\n]+(?:\.{1,2}\/|[\w.-]+\/)*scripts\/prompt-eval\.mjs/g
  )) {
    // The word before the path, with any markdown fence or backtick stripped.
    // A bare mention of the file — "no adapter in `scripts/prompt-eval.mjs`" —
    // has no space before the path and does not match at all.
    const runner = m[1].replace(/^[`*_(]+/, "");
    if (seen.has(runner)) continue;
    seen.add(runner);
    problems.push(
      `${DOC} tells a reader to run \`${runner} scripts/prompt-eval.mjs\`. Nothing here has ` +
        `executed that. The harness is started as \`${evalCommand("<prompt-id>")}\` — through ` +
        `npm, because its runner \`${RUNNER}\` is a local devDependency that is only on PATH ` +
        `inside an npm script, and that is the one form this check runs before printing it.`
    );
  }
  return problems;
}

/** Every problem with the tree at `root`. Empty means the doc tells the truth. */
export async function checkProblems(root = ROOT, adapters = ADAPTERS) {
  const problems = [...runnerProblems(root), ...(await instrumentProblems(root, adapters))];
  const rows = await currentRows(root, adapters);
  const doc = readFileSync(join(root, DOC), "utf8");
  problems.push(...docCommandProblems(doc));

  const markers = markerProblems(doc);
  if (markers.length > 0) return [...problems, ...markers];
  const parsed = parseBlock(doc);
  if (!parsed) throw new Error("parseBlock returned nothing for a doc with sound markers");

  problems.push(...driftProblems(parsed.rows, rows, adapters));

  // Rows agreeing is not the block agreeing: the prose around the table is
  // generated too, and it states the count. Hand-editing "2 of 13" is exactly
  // the drift this whole check exists to refuse.
  const expected = renderBlock(rows);
  if (problems.length === 0 && parsed.block !== expected) {
    problems.push(
      `The generated block in ${DOC} has been hand-edited: every prompt and version in it is ` +
        `right, and the surrounding text is not what this check renders. That text states how ` +
        `many prompts are measurable, which is the sentence the whole ticket is about. Run: ` +
        `${WRITE_COMMAND}`
    );
  }
  return problems;
}

/**
 * Regenerate the block in place. Refuses to guess where it belongs, and refuses
 * to pick one of two — `--write` over a duplicated block would rewrite the
 * first copy and leave the stale one behind it looking freshly generated.
 */
async function writeBlock(root = ROOT) {
  const path = join(root, DOC);
  const doc = readFileSync(path, "utf8");
  const markers = markerProblems(doc);
  if (markers.length > 0) {
    console.error("Eval coverage lint FAILED:");
    for (const problem of markers) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const parsed = parseBlock(doc);
  if (!parsed) throw new Error("parseBlock returned nothing for a doc with sound markers");
  const next = doc.replace(parsed.block, renderBlock(await currentRows(root)));
  if (next !== doc) writeFileSync(path, next);
  console.log(next === doc ? `${DOC} already in step.` : `Wrote the coverage table into ${DOC}.`);
}

async function main() {
  if (process.argv.includes("--write")) {
    // A failed dry run is not fixable by writing the doc, and writing over it
    // would publish a table claiming an adapter that cannot run.
    const blocking = [...runnerProblems(), ...(await instrumentProblems())];
    if (blocking.length > 0) {
      console.error("Eval coverage lint FAILED:");
      for (const problem of blocking) console.error(`  - ${problem}`);
      process.exit(1);
    }
    await writeBlock();
    return;
  }

  const problems = await checkProblems();
  if (problems.length > 0) {
    console.error("Eval coverage lint FAILED:");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("");
    console.error(`The bar in ${DOC} is the first thing a prompt change reads, and it does not`);
    console.error("say which prompts it can be run on. This check is what makes that table say");
    console.error("it, and what stops an unmeasurable prompt changing under a bar that reads as");
    console.error("if it were met. Shipping unmeasured is allowed; shipping unmeasured in");
    console.error("silence is what this refuses.");
    process.exit(1);
  }

  const rows = await currentRows();
  const measured = rows.filter((r) => r.measured).length;
  console.log(
    `Eval coverage lint passed: ${measured} of ${rows.length} prompt(s) were driven through ` +
      `their real adapter over their real fixtures, up to the model call, and ${DOC} says which ` +
      `— with the version each unmeasurable prompt last shipped at.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
