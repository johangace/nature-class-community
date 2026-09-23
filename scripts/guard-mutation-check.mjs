#!/usr/bin/env node
/**
 * Guard mutation check — the check that checks the checks (#554).
 *
 * WHY THIS EXISTS
 *
 * `scripts/register-lint.mjs` shipped for weeks with an empty `RULES` array.
 * Its own header said so — "THIS CHECK CURRENTLY ASSERTS NOTHING. It is a
 * shell, not protection." — and `.github/workflows/ci.yml` ran it on every push
 * and every pull request, where it exited 0 unconditionally. Six pull requests
 * merged in one night listing `node scripts/register-lint.mjs` — PASS in their
 * verification tables, and two independent evaluators re-ran it and recorded
 * the same pass. Nobody was lying. The step genuinely exited 0. It simply could
 * not have done anything else.
 *
 * That is the failure mode this file exists for: a green check is read as
 * evidence, and a check with nothing in it produces the same green as a check
 * that just saved you. The signal and the noise are byte-identical in the log.
 *
 * The only way to tell them apart is to make the guard fail on purpose. An
 * audit does that once, writes it down, and starts rotting the same afternoon.
 * This does it on every push.
 *
 * WHAT IT DOES
 *
 * For each guard in CI it plants a real violation of the thing the guard's NAME
 * claims to protect, runs the guard, and requires it to go red — and to go red
 * FOR THE STATED REASON, which is what `evidence` pins. A guard that exits
 * non-zero because a file it reads has gone missing has proved nothing; that
 * result is reported here as WRONG-REASON, not as a pass.
 *
 * Mutations are applied inside a throwaway copy of the tree (see `sandbox()`).
 * This script never writes to the working tree it is run from.
 *
 * THREE RATCHETS KEEP IT FROM ROTTING
 *
 *   1. COVERAGE. Every `- name:` step in ci.yml must either carry at least one
 *      mutation here or be named in NOT_A_GUARD with the reason it cannot be
 *      mutated. Add a step to CI and this check fails until you say what proves
 *      it bites. Delete a step and it fails until the stale entry goes. That is
 *      the mechanism that would have caught register-lint on the day it emptied
 *      out, rather than weeks later.
 *
 *   2. BLIND SPOTS. Some entries below are `expect: "green"`. Those are places
 *      a guard does NOT cover something a reader of its name would assume it
 *      does — verbatim-fidelity reading only two of the seven packs, caps-lint
 *      seeing a CSS transform but not a shouted string in a component. Pinning
 *      them means the gap is a recorded fact rather than a discovery, and if
 *      someone later widens the guard, this check goes red and tells them to
 *      delete the entry. Same shape as GRANDFATHERED in register-lint.mjs: the
 *      list is allowed to shrink and not to grow quietly.
 *
 *   3. SHAPE RULES. `register-lint` is one CI step holding a LIST of guards,
 *      so ratchet 1 is satisfied the moment any one of them is proved. Every
 *      id in that list needs its own fixture — see `shapeRuleProblems()`.
 *      #1142 added a rule with no fixture and this file said nothing, which is
 *      #554 one level down (#1146).
 *
 * RUNNING IT
 *
 *   npm run check:guards                     the fast tier (CI default)
 *   npm run check:guards -- --slow           adds tsc, npm test, next build
 *   npm run check:guards -- --only register-lint
 *   npm run check:guards -- --list
 *
 * Through npm, and under tsx: this file imports the prompt registry rather than
 * regexing it (#1218), and that registry is TypeScript.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not tell you a guard is GOOD. It tells you a guard is AWAKE. A rule
 * can bite on the one violation planted here and still miss everything else in
 * its stated territory — `validate-prompts` goes red on an unbumped edit and is
 * structurally blind to a prompt's meaning changing (#549). Proving a guard
 * awake is the floor, not the ceiling, and the blind-spot entries are here so
 * the ceiling is written down too.
 *
 * SCOPE: NEITHER. It reads scripts and configuration, and the strings it plants
 * are its own. It quotes no founder prose and edits no packs outside the
 * sandbox; see `scripts/authorship.mjs` for why every check here says so.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Imported for ratchet 3 below: the shape rules read themselves, so a rule
// added to register-lint.mjs cannot quietly go unproven here (#1146).
// `register-lint.mjs` only runs when it is the entry point, so importing it
// costs nothing but the rule list.
import { SHAPE_RULES } from "./register-lint.mjs";
// The real eval adapter map (#1213), so the eval-coverage mutations below pick
// their subject from the code rather than naming a prompt that may gain an
// adapter tomorrow. `prompt-eval.mjs` runs only as an entry point, so importing
// it costs nothing but the map — no argv, no model, no TypeScript loaded.
import { ADAPTERS as EVAL_ADAPTERS, evalCommand } from "./prompt-eval.mjs";
// The registry, imported rather than parsed. This file used to read
// PROMPT_FILES with a regex requiring a trailing comma on every entry — the
// exact defect round one of #1218's review found in eval-coverage-lint.mjs,
// re-entering through a helper added in round two. A comma-less final property
// would drop that prompt here, and the helpers below would then throw that no
// such prompt exists, aborting `check:guards` before it ran a single mutation.
// One parser, and it is the app's; the script runs under tsx to have it.
import { PROMPT_FILES } from "../lib/ai/prompt-registry.ts";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

// The eval-coverage block's markers. Not imported from eval-coverage-lint.mjs,
// which reads the registry as TypeScript and so only runs under tsx, while this
// harness runs under plain node. The duplicate-block mutation below throws if it
// cannot find them in the doc, so a rename fails loudly here rather than turning
// that entry into a mutation of nothing.
const EVAL_COVERAGE_START = "<!-- eval-coverage:start -->";
const EVAL_COVERAGE_END = "<!-- eval-coverage:end -->";

// ---------------------------------------------------------------------------
// CI steps that are not guards, and why. Ratchet 1 reads this.
// ---------------------------------------------------------------------------

/**
 * A step listed here is one that no honest mutation can be written for. The
 * reason has to be a property of the step, not of how long it would take —
 * "slow" belongs in `slow: true` on a mutation, not here.
 */
export const NOT_A_GUARD = new Map([
  [
    "Install",
    "`npm ci` is provisioning, not an assertion about this repo's content. It " +
      "does hold one real invariant — package-lock.json must satisfy package.json " +
      "— but mutating that only proves npm works, which is npm's test suite's job.",
  ],
  [
    "Apply fixture migrations",
    "`prisma migrate deploy` applies migration files to the empty CI database. " +
      "It asserts the migrations replay cleanly and nothing about the app. It " +
      "needs a live Postgres, so a mutation here would exercise the service " +
      "container rather than the repo.",
  ],
  [
    "Publish prompts to Langfuse",
    "carries `continue-on-error: true` and runs only on main. It is bookkeeping " +
      "against an observability tool and CANNOT fail the build by design — the " +
      "one step in this file whose green is explicitly not evidence, and which " +
      "says so in its own comment.",
  ],
  [
    "Guard mutation check",
    "this script. A check cannot prove itself by its own method; what holds it " +
      "is the coverage ratchet plus tests/unit/guard-mutation-check.spec.ts.",
  ],
  [
    "Install Playwright browser",
    "`playwright install --with-deps chromium` downloads a browser and apt-installs " +
      "its system libraries. Same shape as Install: provisioning, not an assertion " +
      "about this repo's content. What it provisions is proved by the step below it, " +
      "which cannot run at all without it.",
  ],
  [
    "Upload Playwright trace",
    "`actions/upload-artifact` under `if: failure()`. It carries a trace off the " +
      "runner so a red e2e can be read; it asserts nothing, and by construction it " +
      "only runs when something else has already failed the build.",
  ],
]);

// ---------------------------------------------------------------------------
// Edit helpers — the declarative half of a mutation.
// ---------------------------------------------------------------------------

/** Replace an exact substring, asserting it occurs exactly once. */
const swap = (file, from, to) => ({ file, from, to });

/** Append text to a file. */
const append = (file, text) => ({ file, appendText: text });

/** Read JSON, hand it to `edit`, write it back. */
const editJson = (file, edit) => ({ file, editJson: edit });

/**
 * A conditions line short enough to sit under `live-claim-lint`'s
 * distinctiveness floor. Original to this harness, as every planted string
 * here is: it is not a founder sentence and it is nowhere in the tree.
 */
const SHORT_PROBE_LINE = "the mutation probe sky";

/** Every pack the lint's harvest reads, so a new pack joins the mutation too. */
const PACK_FILES = readdirSync(join(ROOT, "packs"))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => `packs/${name}`);

/** Shorten one conditions line below the floor, leaving the rest of a pack alone. */
function shortenFirstConditionsLine(node, text) {
  if (Array.isArray(node)) return node.some((child) => shortenFirstConditionsLine(child, text));
  if (!node || typeof node !== "object") return false;
  if (node.type === "conditions-line") {
    node.fallbackText = text;
    return true;
  }
  return Object.values(node).some((child) => shortenFirstConditionsLine(child, text));
}

/** Shorten every conditions line in a pack, variants included. */
const shortenConditionsLines = (node) => {
  if (Array.isArray(node)) return node.forEach(shortenConditionsLines);
  if (!node || typeof node !== "object") return;
  if (node.type === "conditions-line") {
    node.fallbackText = SHORT_PROBE_LINE;
    for (const key of Object.keys(node.abilityVariants ?? {})) {
      node.abilityVariants[key] = SHORT_PROBE_LINE;
    }
  }
  Object.values(node).forEach(shortenConditionsLines);
};

/**
 * A session with no `demo` block in a base phase and a kit that names no
 * object: exactly what #91 says a Nature Class lesson must never be, and what
 * `register-lint`'s make-beat rule exists to catch on anything new.
 */
const probeSession = (over) => ({
  id: "mutation-probe-session",
  title: "Mutation probe",
  topic: "A session this harness plants and removes.",
  objective: "Prove the guard bites.",
  namedSkill: "looking",
  kit: ["a paper bag"],
  durationMin: 12,
  phases: [
    { key: "probe-1", title: "One", durationMin: 5, blocks: [] },
    { key: "probe-2", title: "Two", durationMin: 7, blocks: [] },
  ],
  ...over,
});

/**
 * The #553 escape case, built from the pack's own `autumn-w1-return` rather
 * than typed out here, so it stays a real port rather than a caricature of one:
 * the same blocks, the same phases, the same child sheet. Three body phases at
 * 8 minutes plus the closing circle at 6, and a kit that names clothing.
 *
 * It carries no `celebration`, because `autumn-w1-return` carries none — which
 * is the whole point. A port inherits its source's silence about what the class
 * comes away with.
 */
function portedCopy(pack) {
  const source = pack.sessions.find((s) => s.id === "autumn-w1-return");
  if (!source) {
    throw new Error(
      "packs/autumn-term.json no longer holds `autumn-w1-return`. This mutation " +
        "copies a real ported session on purpose; point it at another one rather " +
        "than inlining a fake."
    );
  }
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = "mutation-probe-ported-session";
  copy.title = "Mutation probe: a ported session";
  copy.kit = ["Warm clothes recommended"];
  const body = copy.phases.filter((p) => p.key !== "circle").slice(0, 3);
  const circle = copy.phases.find((p) => p.key === "circle");
  copy.phases = circle ? [...body, circle] : body;
  copy.durationMin = copy.phases.reduce((n, p) => n + (p.durationMin ?? 0), 0);
  return copy;
}

// ---------------------------------------------------------------------------
// The mutations.
// ---------------------------------------------------------------------------

/**
 * `step`     the ci.yml step name this proves (ratchet 1 matches on it).
 * `run`      argv, executed with cwd = the sandbox unless `env` says otherwise.
 * `expect`   "red"   the guard must exit non-zero AND print `evidence`.
 *            "green" a pinned blind spot: the guard must exit 0. If it goes
 *                    red, the guard grew and this entry must be deleted.
 * `evidence` regex the guard's own output must match, so a red for the wrong
 *            reason (a crash, a missing file) is reported as a failure.
 * `slow`     excluded from the default tier.
 */
export const MUTATIONS = [
  // ── License audit ─────────────────────────────────────────────────────────
  {
    id: "license-audit/disallowed-license",
    step: "License audit",
    why: "a production dependency declares a licence outside the allowlist",
    run: ["node", "scripts/license-audit.mjs"],
    expect: "red",
    evidence: /outside allowlist[\s\S]*zod/i,
    // Not a file edit: the subject of this guard is node_modules. The sandbox's
    // node_modules is a farm of symlinks into the real install, so one entry can
    // be swapped for a stub manifest without touching the shared tree.
    mutate(cwd) {
      const dir = join(cwd, "node_modules", "zod");
      const target = readlinkOrNull(dir);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: "zod", version: "0.0.0-mutation", license: "GPL-2.0-only" })
      );
      return () => {
        rmSync(dir, { recursive: true, force: true });
        if (target) symlinkSync(target, dir);
      };
    },
  },

  // ── Register lint ─────────────────────────────────────────────────────────
  {
    id: "register-lint/make-beat",
    step: "Register lint",
    why: "a new session puts nothing in a child's hands: no demo block, empty kit",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "red",
    evidence: /\[make-beat\]/,
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        pack.sessions.push(probeSession({ kit: ["None required"] }));
      }),
    ],
  },
  {
    id: "register-lint/budgeted-time",
    step: "Register lint",
    why: "a new session's clock is stamped, not budgeted: four phases at 8 minutes",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "red",
    evidence: /\[budgeted-time\]/,
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        pack.sessions.push(
          probeSession({
            phases: [1, 2, 3, 4].map((n) => ({
              key: `probe-${n}`,
              title: `Phase ${n}`,
              durationMin: 8,
              blocks: [],
            })),
          })
        );
      }),
    ],
  },
  {
    id: "register-lint/named-outcome",
    step: "Register lint",
    why:
      "the #553 escape, reconstructed: a session copied from `autumn-w1-return` " +
      "with THREE body phases at 8 minutes plus a circle at 6, and a kit of " +
      '"Warm clothes recommended". Three-at-8 is under budgeted-time\'s threshold ' +
      "of four and a clothing kit is not the `None required` sentinel, so before " +
      "the named-outcome rule this exact session exited 0. It is planted here " +
      "rather than described so the escape cannot silently reopen",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "red",
    evidence: /\[named-outcome\]/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions.push(portedCopy(pack));
      }),
    ],
  },
  {
    id: "register-lint/named-outcome-bolted-on",
    step: "Register lint",
    why:
      "the same escape session with a celebration headline bolted on. It stays " +
      "green, and that is the recorded ceiling of the rule: named-outcome is a " +
      "presence check on an authored field, so it is unfakeable by COPYING — the " +
      "ported deck carries no celebration and cannot pick one up by accident — " +
      "and entirely fakeable by an author willing to write a sentence that is not " +
      "true. Same trade as an empty `demo` block satisfying make-beat. The " +
      "headline planted here is original, and it has to be: `validate-packs` " +
      "fails a celebration line shared by two sessions (#92), so the bolt-on " +
      "cannot be copied from a real lesson either. Delete this entry if a later " +
      "rule ever judges what the headline claims",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "green",
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions.push({
          ...portedCopy(pack),
          celebration: { headline: "You stood outside and noticed the season." },
        });
      }),
    ],
  },
  {
    id: "register-lint/generated-parent-line",
    step: "Register lint",
    why: "a generator re-stamps the machine parent line #115 stripped from 40 sessions",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "red",
    evidence: /\[generated-parent-line\]/,
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        pack.sessions.push(
          probeSession({
            phases: [
              {
                key: "probe-1",
                title: "One",
                durationMin: 5,
                blocks: [
                  {
                    type: "parent-line",
                    text: "For home: we went outside for leaves today. Ask me what I noticed.",
                  },
                ],
              },
            ],
          })
        );
      }),
    ],
  },
  {
    id: "register-lint/stale-session-reference",
    step: "Register lint",
    why:
      "a kit line survives the lesson it points at: a session in `autumn-garden` " +
      "tells the teacher to collect the masks from session two, and autumn-garden " +
      "ships no w2 — `garden-w2-leaf-masks` left for `autumn-starter` on 2026-09-04. " +
      "That is #1095 as it actually shipped, and the rule that catches it (#1142) " +
      "arrived with unit coverage but no fixture here, which is the #554 shape " +
      "exactly: the proof lived in a spec, so an edit that neutered the rule would " +
      "have left register-lint AND this harness green. Planted into a week-numbered " +
      "pack on purpose — the rule abstains where a pack does not number its weeks " +
      "(#1145), so a plant in `autumn-starter` would prove nothing",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "red",
    evidence:
      /\[stale-session-reference\] refers to "session two" \(week 2\), but autumn-garden\.json ships no session/,
    edits: [
      editJson("packs/autumn-garden.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "garden-w7-winter-ready");
        s.preparation = `${s.preparation} Collect the paper masks from session two before you set out.`;
      }),
    ],
  },
  {
    id: "register-lint/stale-session-reference-unnumbered-pack",
    step: "Register lint",
    why:
      "the same planted reference in `autumn-starter`, whose session ids carry no " +
      "`-wN-` at all. It stays green, and that is the recorded ceiling of the rule " +
      "after #1145: three of the ten packs number no weeks, so their week set is " +
      "empty, and an empty set cannot distinguish 'ships no session for that week' " +
      "from 'does not number its weeks'. The rule abstains rather than redden a " +
      "correct cross-reference — `autumn-starter` is the pack the leaf-mask lesson " +
      "moved INTO, so it is where the next legitimate reference gets written. " +
      "Delete this entry if a later rule learns to resolve references positionally",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "green",
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        const s = pack.sessions[0];
        s.preparation = `${s.preparation ?? ""} Collect the paper masks from session three before you set out.`.trim();
      }),
    ],
  },
  {
    id: "register-lint/ratchet",
    step: "Register lint",
    why:
      "a grandfathered session is fixed but its exception is left behind — the " +
      "list must only shrink, so cover cannot rot into permanence",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "red",
    evidence: /stale exception/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "autumn-w1-return");
        s.kit = ["a paper bag for what you find"];
      }),
    ],
  },
  {
    id: "register-lint/vocabulary",
    step: "Register lint",
    why:
      "an assessment word planted in a child-facing say-aloud. It stays green, " +
      "and that is the correct trade: RULES is deliberately empty, because the " +
      "word list this file used to hold kept two of Johan's own sessions out of " +
      "the product for months. The name 'register lint' promises more than the " +
      "file delivers, and shape is the part a machine can actually see",
    run: ["node", "scripts/register-lint.mjs"],
    expect: "green",
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "autumn-w1-return");
        s.phases[0].blocks.unshift({
          type: "say-aloud",
          text: "Score each other on how well you did and tally up the results.",
        });
      }),
    ],
  },

  // ── Variant carry lint ────────────────────────────────────────────────────
  {
    id: "variant-carry-lint/dropped",
    step: "Variant carry lint",
    why:
      "the #1210 defect put back: the wet variant of animal-leaf-masks / collect " +
      "loses its copy of the base conduct note, so on a wet day nothing tells the " +
      "teacher to leave living plants alone",
    run: ["node", "scripts/variant-carry-lint.mjs"],
    expect: "red",
    evidence: /\[dropped\] animal-leaf-masks \/ collect \/ wet: b11/,
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "animal-leaf-masks");
        const base = s.phases.find((p) => p.key === "collect");
        const note = base.blocks.find((b) => b.nid === "b11").text;
        const variant = base.conditionVariants[0].phase;
        variant.blocks = variant.blocks.filter((b) => b.text !== note);
      }),
    ],
  },
  {
    id: "variant-carry-lint/reworded",
    step: "Variant carry lint",
    why:
      "the variant keeps a softened paraphrase of the conduct note instead of the " +
      "authored line — a different instruction wearing the same place",
    run: ["node", "scripts/variant-carry-lint.mjs"],
    expect: "red",
    evidence: /\[dropped\] meet-your-tree \/ greet \/ wet: b18/,
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "meet-your-tree");
        const base = s.phases.find((p) => p.key === "greet");
        const note = base.blocks.find((b) => b.nid === "b18").text;
        const copy = base.conditionVariants[0].phase.blocks.find((b) => b.text === note);
        copy.text = "Tie the wool on the tree.";
      }),
    ],
  },
  {
    id: "variant-carry-lint/stale-entry",
    step: "Variant carry lint",
    why:
      "the listed base note is deleted from its phase and the registry is left " +
      "naming it — an obligation that no longer describes a line is cover",
    run: ["node", "scripts/variant-carry-lint.mjs"],
    expect: "red",
    evidence: /\[stale\] leaves-and-their-trees: b11/,
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "leaves-and-their-trees");
        const base = s.phases.find((p) => p.key === "collect");
        base.blocks = base.blocks.filter((b) => b.nid !== "b11");
      }),
    ],
  },
  {
    id: "variant-carry-lint/unlisted-note",
    step: "Variant carry lint",
    why:
      "a new safety note is added to the base of bark-rubbings / rub, which has a " +
      "wet variant that does not carry it. It stays green, and that is the recorded " +
      "ceiling: which notes are conduct is a reading of the lesson, not a fact a " +
      "machine can see, so the obligation lives in CARRIED_NOTES and an unlisted " +
      "note is not held. Delete this entry if the pack schema ever marks conduct " +
      "notes itself",
    run: ["node", "scripts/variant-carry-lint.mjs"],
    expect: "green",
    edits: [
      editJson("packs/winter-starter.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "bark-rubbings");
        const base = s.phases.find((p) => p.key === "rub");
        base.blocks.push({
          type: "teacher-note",
          text: "Keep the mutation probe pairs an arm's length from the trunk.",
        });
      }),
    ],
  },

  // ── Caps lint ─────────────────────────────────────────────────────────────
  {
    id: "caps-lint/text-transform",
    step: "Caps lint",
    why: "the CSS escape hatch: one declaration sets a whole surface in capitals",
    run: ["node", "scripts/caps-lint.mjs"],
    expect: "red",
    evidence: /all-caps transform/,
    edits: [append("app/today.module.css", "\n.mutation-probe { text-transform: uppercase; }\n")],
  },
  {
    id: "caps-lint/shouted-pack-copy",
    step: "Caps lint",
    why: "a house-written pack string shouts a word, the #188 defect",
    run: ["node", "scripts/caps-lint.mjs"],
    expect: "red",
    evidence: /shouted word/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const s = pack.sessions.find((x) => x.id === "autumn-w1-return");
        s.phases[0].blocks.unshift({
          type: "say-aloud",
          text: "Look for what is DIFFERENT since the summer.",
        });
      }),
    ],
  },
  {
    id: "caps-lint/shouted-jsx-string",
    step: "Caps lint",
    why:
      "an all-caps label typed straight into a component. It stays green: the " +
      "code scan looks for `text-transform: uppercase` and reads no strings at " +
      "all, so 'nothing in this product is ever set in all caps' holds for CSS " +
      "and for packs, and for house TSX copy it is a human review promise. Its " +
      "own header says label strings are reviewed by humans; the name does not",
    run: ["node", "scripts/caps-lint.mjs"],
    expect: "green",
    edits: [append("app/welcome/page.tsx", '\nexport const MUTATION_PROBE_LABEL = "START THE LESSON";\n')],
  },

  // ── No committed symlinks ─────────────────────────────────────────────────
  {
    id: "symlink-lint/committed-symlink",
    step: "No committed symlinks",
    why: "a node_modules symlink committed as a mode-120000 blob, the nc#153 defect",
    // Runs against a throwaway repository, because the subject of this guard is
    // a git index and the sandbox deliberately has none.
    run: (ctx) => ["node", join(ctx.sandbox, "scripts", "symlink-lint.mjs")],
    expect: "red",
    evidence: /Committed symlink\(s\) found[\s\S]*120000/,
    env() {
      const dir = mkdtempSync(join(tmpdir(), "nc-symlink-probe-"));
      const git = (...args) =>
        spawnSync("git", ["-c", "user.email=probe@example.invalid", "-c", "user.name=probe", ...args], {
          cwd: dir,
          encoding: "utf8",
        });
      git("init", "-q", "-b", "main");
      writeFileSync(join(dir, "README.md"), "a repo with no committed symlinks\n");
      git("add", "-A");
      git("commit", "-qm", "baseline");
      return { cwd: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
    },
    mutate(cwd) {
      symlinkSync("/home/somebody/nature-class/node_modules", join(cwd, "node_modules"));
      const git = (...args) =>
        spawnSync("git", ["-c", "user.email=probe@example.invalid", "-c", "user.name=probe", ...args], {
          cwd,
          encoding: "utf8",
        });
      git("add", "-f", "node_modules");
      git("commit", "-qm", "commit the symlink");
      return () => {};
    },
  },

  // ── Vercel config lint ────────────────────────────────────────────────────
  {
    id: "vercel-config-lint/cron-declared",
    step: "Vercel config lint",
    why: "a cron back in vercel.json, which stops production deploying with no log at all",
    run: ["node", "scripts/vercel-config-lint.mjs"],
    expect: "red",
    evidence: /declares 1 cron job/,
    // No vercel.json exists to edit any more, so the mutation writes the file
    // the way someone re-adding a scheduled job would.
    mutate(cwd) {
      const path = join(cwd, "vercel.json");
      writeFileSync(
        path,
        JSON.stringify(
          {
            $schema: "https://openapi.vercel.sh/vercel.json",
            crons: [{ path: "/api/cron/record-reads", schedule: "20 2 * * *" }],
          },
          null,
          2
        )
      );
      return () => rmSync(path, { force: true });
    },
  },

  // ── Analytics lint ────────────────────────────────────────────────────────
  //
  // The four ways the analytics boundary actually breaks, and none of them
  // looks wrong in a diff: a useful-sounding property added to an allowlist, a
  // replay masking loosened to debug something, a second file importing the
  // SDK because that is where the event belongs, and an event name typed at a
  // call site. Each is planted here so the guard's green means it is awake.
  {
    id: "analytics-lint/event-without-a-trailing-comma",
    step: "Analytics lint",
    why: "an event added as the file's last property, where a comma-anchored regex could not see it",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /declares ANALYTICS_EVENTS\.MUTATION_PROBE_EVENT with no entry in ALLOWED_PROPERTIES/,
    edits: [
      swap(
        "lib/analytics/events.ts",
        "} as const;\n\nexport type AnalyticsEvent",
        '  MUTATION_PROBE_EVENT: "mutation_probe_event"\n} as const;\n\nexport type AnalyticsEvent'
      ),
    ],
  },
  {
    id: "analytics-lint/forbidden-property",
    step: "Analytics lint",
    why: "a school's name added to an event allowlist, which reads like useful context",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /allows the property "school_name"/,
    edits: [
      swap(
        "lib/analytics/events.ts",
        '[ANALYTICS_EVENTS.PAGE_VIEWED]: ["path"]',
        '[ANALYTICS_EVENTS.PAGE_VIEWED]: ["path", "school_name"]'
      ),
    ],
  },
  {
    id: "analytics-lint/session-replay-text-blanket-masked",
    step: "Analytics lint",
    why: "blanket text masking makes session recordings unreadable",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /missing `maskTextSelector: "\.ph-mask"`/,
    edits: [
      swap(
        "lib/analytics/client.ts",
        'maskTextSelector: ".ph-mask"',
        'maskTextSelector: "*"'
      ),
    ],
  },
  {
    id: "analytics-lint/second-sdk-import",
    step: "Analytics lint",
    why: "a second file imports posthog-js, routing around every allowlist at once",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /imports posthog-js/,
    edits: [
      append(
        "lib/analytics/events.ts",
        '\nimport posthogProbe from "posthog-js";\nexport const mutationProbe = posthogProbe;\n'
      ),
    ],
  },
  {
    id: "analytics-lint/invented-event-name",
    step: "Analytics lint",
    why: "a call site names its own event, so the closed list stops being the only door",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /calls track\(\) with a string literal/,
    edits: [
      append(
        "lib/analytics/client.ts",
        '\nexport const mutationProbe = () => track("mutation_probe_event" as never);\n'
      ),
    ],
  },
  {
    id: "analytics-lint/invite-cohort-widened",
    step: "Analytics lint",
    why: "the invited-cohort shape widened, so a school's name could ride in a safely named key",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /no longer declares INVITE_COHORT_PATTERN/,
    edits: [
      swap(
        "lib/analytics/events.ts",
        "export const INVITE_COHORT_PATTERN = /^[a-z0-9-]{1,32}$/;",
        "export const INVITE_COHORT_PATTERN = /^.{1,120}$/;"
      ),
    ],
  },
  {
    id: "analytics-lint/unstamped-in-a-shared-project",
    step: "Analytics lint",
    why: "the product stamp dropped, so our rows silently join Rewyld's funnels",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /never merges it/,
    edits: [
      swap(
        "lib/analytics/events.ts",
        "return { ...pick(allowed, properties), ...DEFAULT_PROPERTIES };",
        "return pick(allowed, properties);"
      ),
      swap(
        "lib/analytics/events.ts",
        "return { ...pick(ALLOWED_TRAITS, traits), ...DEFAULT_PROPERTIES };",
        "return pick(ALLOWED_TRAITS, traits);"
      ),
    ],
  },
  {
    id: "analytics-lint/un-namespaced-teacher-id",
    step: "Analytics lint",
    why: "a raw teacher id into a distinct_id namespace we share with Rewyld",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /raw teacherId/,
    edits: [
      swap(
        "lib/analytics/client.ts",
        "posthog.identify(id, clean)",
        "posthog.identify(teacherId, clean)"
      ),
    ],
  },
  {
    id: "analytics-lint/server-builds-its-own-payload",
    step: "Analytics lint",
    why: "the server surface bypassing the allowlist, while holding the teacher's note",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /does not call sanitiseProperties/,
    edits: [
      swap("lib/analytics/server.ts", "sanitiseProperties(", "buildPayloadByHand("),
    ],
  },
  {
    id: "analytics-lint/server-never-flushes",
    step: "Analytics lint",
    why: "posthog-node batching plus a frozen serverless function equals every event lost",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /never awaits shutdown\(\)/,
    edits: [
      swap("lib/analytics/server.ts", "await client.shutdown()", "client.shutdown()"),
    ],
  },
  {
    id: "analytics-lint/client-double-counts-completions",
    step: "Analytics lint",
    why: "the browser also firing the completion an idempotent write already reports",
    run: ["npm", "run", "lint:analytics", "--silent"],
    expect: "red",
    evidence: /double-count lessons taught/,
    edits: [
      append(
        "app/Wordmark.tsx",
        '\nimport { ANALYTICS_EVENTS } from "@/lib/analytics/events";\n' +
          "export const MUTATION_PROBE = ANALYTICS_EVENTS.LESSON_RUN_COMPLETED;\n"
      ),
    ],
  },

  {
    id: "analytics-lint/hardcoded-key-in-a-component",
    step: "Analytics lint",
    why: "a key pasted into a component — the AGPL leak this guard is named for",
    run: ["npm", "run", "lint:analytics", "--silent"],
    // PINNED BLIND SPOT. The guard holds the seam (one file may import the SDK)
    // and the allowlist; it cannot see a key that never goes through either. A
    // component that opened its own transport with a literal key would pass
    // this check and fail review instead. Widening the guard to catch it means
    // deleting this entry.
    expect: "green",
    edits: [
      append(
        "app/Wordmark.tsx",
        '\nexport const MUTATION_PROBE_KEY = "phc_mutationprobe000000000000000000000";\n'
      ),
    ],
  },

  // ── Token lint ────────────────────────────────────────────────────────────
  {
    id: "token-lint/phantom-token",
    step: "Token lint",
    why: "a var() pointing at a token nothing defines — the nc#382 defect, 31 call sites of it",
    run: ["node", "scripts/token-lint.mjs"],
    expect: "red",
    evidence: /phantom tokens/,
    edits: [append("app/today.module.css", "\n.mutation-probe { color: var(--nc-mutation-probe); }\n")],
  },
  {
    id: "token-lint/inline-hex",
    step: "Token lint",
    why: "a colour born outside the token block",
    run: ["node", "scripts/token-lint.mjs"],
    expect: "red",
    evidence: /inline hex/,
    edits: [append("app/today.module.css", "\n.mutation-probe { background: #ff00ff; }\n")],
  },
  {
    id: "token-lint/off-scale-font-size",
    step: "Token lint",
    why: "a font-size that answers to nobody's scale",
    run: ["node", "scripts/token-lint.mjs"],
    expect: "red",
    evidence: /off-scale font-size/,
    edits: [append("app/today.module.css", "\n.mutation-probe { font-size: 13.7px; }\n")],
  },
  {
    id: "token-lint/outdoor-parity",
    step: "Token lint",
    why: "a colour token with no outdoor value renders its light value on the dark ground (#442)",
    run: ["node", "scripts/token-lint.mjs"],
    expect: "red",
    evidence: /outdoor parity/,
    edits: [swap("app/globals.css", ":root {", ":root {\n  --ink-mutation-probe: #123456;")],
  },

  // ── SW cache lint ─────────────────────────────────────────────────────────
  {
    id: "sw-cache-lint/private-page-made-cacheable",
    step: "SW cache lint",
    why:
      "the lesson reader is allowlisted as public even though it resolves the " +
      "active class's place and cast, persisting that context on the shared iPad",
    run: ["node", "scripts/sw-cache-lint.mjs"],
    expect: "red",
    evidence: /private page \/read is network-only/,
    edits: [swap("lib/sw-cache-policy.ts", '  "/sign-in",\n', '  "/sign-in",\n  "/read",\n')],
  },
  {
    id: "sw-cache-lint/public-cache-not-bumped",
    step: "SW cache lint",
    why:
      "the privacy fix reuses the cache version that may already contain a " +
      "personalised landing response, leaving the leak installed after deploy",
    run: ["node", "scripts/sw-cache-lint.mjs"],
    expect: "red",
    evidence: /public cache is bumped for the teacher-aware landing migration/,
    edits: [swap("lib/sw-cache-policy.ts", '"nc-public-v3"', '"nc-public-v2"')],
  },
  {
    id: "sw-cache-lint/preview-corpus-precached",
    step: "SW cache lint",
    why:
      "the lesson-preview directory returns to the public-folder scan, forcing " +
      "the full narrated corpus onto every fresh or upgraded install",
    run: ["node", "scripts/sw-cache-lint.mjs"],
    expect: "red",
    evidence: /lesson-preview corpus is excluded from public precache/,
    edits: [
      swap(
        "next.config.mjs",
        "!(landing|lesson-audio|lesson-preview|lesson-examples|lesson-illustrations)/**/*",
        "!(landing|lesson-audio|lesson-examples|lesson-illustrations)/**/*"
      ),
    ],
  },
  {
    id: "sw-cache-lint/lesson-photography-precached",
    step: "SW cache lint",
    why:
      "the lesson photography returns to the public-folder scan, which is how " +
      "it got there in the first place (#1077): two folders of pictures were " +
      "added to public/ over three days and took the install shell from " +
      "0.14 MB to 3.32 MB without one line of next.config.mjs changing",
    run: ["node", "scripts/sw-cache-lint.mjs"],
    expect: "red",
    evidence: /lesson photography is excluded from public precache/,
    edits: [
      swap(
        "next.config.mjs",
        "!(landing|lesson-audio|lesson-preview|lesson-examples|lesson-illustrations)/**/*",
        "!(landing|lesson-audio|lesson-preview|lesson-illustrations)/**/*"
      ),
    ],
  },
  {
    id: "sw-cache-lint/install-shell-size-unmeasured",
    step: "SW cache lint",
    why:
      "the install shell's size guard is the one check that catches the NEXT " +
      "folder of pictures added to public/ — the failure #1077 actually was, " +
      "and one no named-folder rule can see coming. Tightening the bound must " +
      "turn it red; if it does not, the bytes are not being measured at all",
    run: ["node", "scripts/sw-cache-lint.mjs"],
    expect: "red",
    evidence: /install shell stays under/,
    edits: [
      swap(
        "scripts/sw-cache-lint.mjs",
        "publicPrecacheBytes < 1_000_000",
        "publicPrecacheBytes < 100_000"
      ),
    ],
  },
  {
    id: "sw-cache-lint/retired-precache-trusted-by-prefix",
    step: "SW cache lint",
    why:
      "the upgrade sweep trusts every serwist-prefixed cache, preserving a " +
      "retired app shell that can still contain the full audio corpus",
    run: ["node", "scripts/sw-cache-lint.mjs"],
    expect: "red",
    evidence: /sweep DROPS a retired Serwist precache/,
    edits: [
      swap(
        "lib/sw-cache-cleanup.ts",
        "return cacheNames.filter((cacheName) => !keep.has(cacheName));",
        'return cacheNames.filter((cacheName) => !keep.has(cacheName) && !cacheName.startsWith("serwist"));'
      ),
    ],
  },

  // ── Standards lint ────────────────────────────────────────────────────────
  {
    id: "standards-lint/paraphrased-statute",
    step: "Standards lint",
    why:
      "a quoted statutory objective is paraphrased — the exact defect found in " +
      "autumn-garden, where the England programme of study's \"4 seasons\" had " +
      "become \"four seasons\". A citation is shown to a teacher so she can " +
      "justify a lesson to her head; a drifted one cites something no government " +
      "published, and reads exactly like a real bullet in review",
    run: ["node", "scripts/standards-lint.mjs"],
    expect: "red",
    evidence: /is in the catalog, but this wording is not/,
    edits: [
      // winter-term rather than autumn-garden: the same objective is cited
      // twice there, and the harness rightly refuses a target it cannot
      // pin to one place.
      swap(
        "packs/winter-term.json",
        "observe changes across the 4 seasons",
        "observe changes across the four seasons"
      ),
    ],
  },
  {
    id: "standards-lint/uncatalogued-code",
    step: "Standards lint",
    why:
      "a session cites a code that was never read from a published source, which " +
      "is how an invented citation would arrive: not as a drifted quote under a " +
      "real heading, but as a plausible-looking reference to nothing",
    run: ["node", "scripts/standards-lint.mjs"],
    expect: "red",
    evidence: /no catalog entry for/,
    edits: [swap("packs/winter-term.json", '"Year 3 · Light"', '"Year 3 · Lumens"')],
  },

  // ── Verbatim fidelity ─────────────────────────────────────────────────────
  {
    id: "verbatim-fidelity/founder-string-rewritten",
    step: "Verbatim fidelity",
    why:
      "one word of a founder-authored teacher note is improved — the #130 and " +
      "#140 signature, a reasonable-looking local decision nobody was entitled to make",
    run: ["node", "scripts/verbatim-fidelity.mjs"],
    expect: "red",
    evidence: /a source string is not in the pack/,
    edits: [swap("packs/summer.json", "The small things count.", "The small things matter.")],
  },
  {
    id: "verbatim-fidelity/unsourced-pack",
    step: "Verbatim fidelity",
    why:
      "the same rewrite in autumn stays green. The guard compares packs against " +
      "`fixtures/source-rows/`, which holds summer and spring only, so it covers " +
      "2 of 7 pack files and 8 of 48 sessions. That is correct — there is no " +
      "source row for autumn or winter to compare against — and much narrower " +
      "than 'verbatim fidelity' sounds. Pull the autumn rows and delete this entry",
    run: ["node", "scripts/verbatim-fidelity.mjs"],
    expect: "green",
    edits: [
      swap(
        "packs/autumn-term.json",
        "What changed while we were away?",
        "What has changed since we were away?"
      ),
    ],
  },

  // ── Live-claim lint ───────────────────────────────────────────────────────
  //
  // Three rules, three mutations, because they are three independent readings
  // of nc#855 and any one of them could rot without the others noticing. The
  // first is the string, the second is the mechanism, the third is the label.
  {
    id: "live-claim-lint/pack-line-copied-into-a-component",
    step: "Live-claim lint",
    why:
      "a component keeps a private copy of a pack's conditions line — the nc#855 " +
      "fork, byte for byte, which `verbatim-fidelity.mjs` cannot see because it " +
      "never opens app/",
    run: ["node", "scripts/live-claim-lint.mjs"],
    expect: "red",
    evidence: /carries a pack's conditions line verbatim/,
    edits: [
      append(
        "app/Wordmark.tsx",
        '\nexport const MUTATION_PROBE_SKY =\n  "Look at the sky together before you set off. Whatever it\'s doing, name it out loud.";\n'
      ),
    ],
  },
  {
    id: "live-claim-lint/null-read-coalesced-into-a-literal",
    step: "Live-claim lint",
    why:
      "a null conditions read is filled with a sentence nobody authored anywhere, " +
      "so rule 1 by construction cannot see it. `conditions.line` is null exactly " +
      "when there was nothing true to say, and this is that decision being undone",
    run: ["node", "scripts/live-claim-lint.mjs"],
    expect: "red",
    evidence: /fills a null conditions read with a literal/,
    edits: [
      append(
        "app/Wordmark.tsx",
        "\nexport const mutationProbeHeadline = (d: { conditions: { line: string | null } }) =>\n" +
          '  d.conditions.line ?? "A mutation probe sentence about a sky nobody read.";\n'
      ),
    ],
  },
  {
    id: "live-claim-lint/live-label-over-a-default-sentence",
    step: "Live-claim lint",
    why:
      "a file wearing the live eyebrow falls back to a standing sentence. This is " +
      "the half the label owns: whatever is on the left of the `??`, a default " +
      "sentence under a live claim is indistinguishable on screen from a reading",
    run: ["node", "scripts/live-claim-lint.mjs"],
    expect: "red",
    evidence: /claims live \(.*\) and falls back to a sentence/,
    edits: [
      append(
        "app/Wordmark.tsx",
        "\nexport function MutationProbeLive({ read }: { read: string | null }) {\n" +
          '  return (\n    <section>\n      <p>outside now · live</p>\n' +
          '      <p>{read ?? "A mutation probe sentence standing in for a reading."}</p>\n' +
          "    </section>\n  );\n}\n"
      ),
    ],
  },
  {
    id: "live-claim-lint/sentence-behind-a-constant",
    step: "Live-claim lint",
    // PINNED BLIND SPOT. Rule 2 reads a literal on the right of the coalesce;
    // rule 1 reads pack sentences. An invented sentence held in a named
    // constant and coalesced in from there satisfies neither, and would ship.
    // It is not a wider regex away — the honest close is a conditions value
    // that carries its own provenance, so a renderer cannot be handed a
    // sentence without being told where it came from. Widening the guard to
    // catch this means deleting this entry.
    why:
      "the same invented sentence, reached through a constant instead of written " +
      "at the coalesce, passes every rule",
    run: ["node", "scripts/live-claim-lint.mjs"],
    expect: "green",
    edits: [
      append(
        "app/Wordmark.tsx",
        '\nconst MUTATION_PROBE_DEFAULT = "A mutation probe sentence about a sky nobody read.";\n' +
          "export const mutationProbeIndirect = (d: { conditions: { line: string | null } }) =>\n" +
          "  d.conditions.line ?? MUTATION_PROBE_DEFAULT;\n"
      ),
    ],
  },
  {
    id: "live-claim-lint/every-conditions-line-below-the-floor",
    step: "Live-claim lint",
    why:
      "every conditions line the curriculum authors is shortened below rule 1's " +
      "distinctiveness floor, leaving the rule nothing to forbid while the check " +
      "would still print green. That is the empty harvest of nc#554 reached from " +
      "the other side, and a floor that can hollow the corpus out in silence is " +
      "worse than no floor — so it has to be as loud as an empty packs/ directory",
    run: ["node", "scripts/live-claim-lint.mjs"],
    expect: "red",
    evidence: /shorter than the \d+-character floor/,
    edits: [
      ...PACK_FILES.map((file) => editJson(file, shortenConditionsLines)),
      editJson("public/offline/core-v1.json", shortenConditionsLines),
    ],
  },
  {
    id: "live-claim-lint/short-pack-line-copied-into-a-component",
    step: "Live-claim lint",
    // PINNED BLIND SPOT. Rule 1's floor (nc#994) withdraws it from conditions
    // lines shorter than `DISTINCTIVE_MIN_CHARS`, because under that length an
    // identical run of English is a coincidence more often than a copy — the
    // seven characters of "the sky" already stand in three files nobody forked.
    // The cost is here: a short line genuinely copied into a component is not
    // caught. The check names every exempt line on every run, so this is a gap
    // an author is told about rather than one they discover. The close is
    // upstream and not a wider match — `schema/pack.ts` accepts
    // `fallbackText: z.string().min(1)`, and a schema requiring a conditions
    // line to be a sentence would leave nothing under the floor to miss.
    // Widening the guard to catch this means deleting this entry.
    why:
      "a conditions line short enough to be ordinary English, copied verbatim " +
      "into a component, passes rule 1",
    run: ["node", "scripts/live-claim-lint.mjs"],
    expect: "green",
    edits: [
      editJson("packs/autumn-starter.json", (pack) => {
        shortenFirstConditionsLine(pack, SHORT_PROBE_LINE);
      }),
      append(
        "app/Wordmark.tsx",
        `\nexport const MUTATION_PROBE_SHORT_LINE = ${JSON.stringify(SHORT_PROBE_LINE)};\n`
      ),
    ],
  },

  // ── Pack validation ───────────────────────────────────────────────────────
  {
    id: "validate-packs/duplicate-session-id",
    step: "Pack validation",
    why: "two sessions share an id, so the runner and the shelf disagree about which lesson is which",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /duplicate session id/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions[1].id = pack.sessions[0].id;
      }),
    ],
  },
  {
    id: "validate-packs/missing-child-sheet",
    step: "Pack validation",
    why: "a session ships without its printable, so a teacher's print is empty on the day",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /no childSheet — every session must ship its printable/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        delete pack.sessions[0].childSheet;
      }),
    ],
  },

  // ── Driving question integrity (#150) ─────────────────────────────────────
  //
  // Both shapes of the defect are planted separately, because the way this
  // guard rots is one of them quietly ceasing to be checked while the other
  // keeps the step green — the same reasoning the node-id block below states.
  // The blind-spot entry after them is the more useful half: it pins, in a
  // check that runs on every push, a case a reader of the rule's name would
  // assume it covers and it does not.
  {
    id: "validate-packs/driving-question-restates-title",
    step: "Pack validation",
    why:
      "a session ships the Minibeast shape — its prompt is its own title with a full stop " +
      "added — so the display rule suppresses it and the session reaches the shelf, the " +
      "runner, the print sheet and the preview deck with no driving question at all",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /prompt restates the title printed beside it/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const session = pack.sessions[1];
        session.prompt = `${session.title}.`;
      }),
    ],
  },
  {
    id: "validate-packs/driving-question-restates-objective",
    step: "Pack validation",
    why:
      "a session ships the A5-leaf-collage shape — its prompt is its objective's opening " +
      "clause with a full stop dropped on it — which renders as the same sentence twice " +
      "until the display rule swallows one, and then as no question at all",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /prompt restates the objective printed beside it/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const session = pack.sessions[2];
        // The objective's first sentence, verbatim, which is exactly how the
        // two shipped truncations came to exist.
        session.prompt = `${session.objective.split(". ")[0]}.`;
      }),
    ],
  },
  {
    id: "validate-packs/driving-question-collision",
    step: "Pack validation",
    why:
      "two sessions ask the same question, so the shelf gives a teacher no way to tell " +
      "their rows apart and one of the two lessons is being described by the other's line",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /duplicate driving question shared by 2 sessions/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions[1].prompt = pack.sessions[0].prompt;
      }),
    ],
  },
  {
    id: "validate-packs/driving-question-exception-gone-stale",
    step: "Pack validation",
    why:
      "one of the three sessions named in KNOWN_RESTATED_PROMPTS gets the real question " +
      "Johan owes it, and the exception is left behind. The ratchet is the reason that " +
      "list is a Map and not a comment: cover for a fixed session is how an exception " +
      "list rots into permanent cover, so the guard has to fail on a FIX too",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /no longer restates its title — good\. Delete its entry/,
    edits: [
      editJson("packs/summer.json", (pack) => {
        const session = pack.sessions.find((s) => s.id === "summer-w2-minibeast-hunting");
        if (!session) {
          throw new Error(
            "packs/summer.json no longer holds `summer-w2-minibeast-hunting`, which is one " +
              "of the three sessions KNOWN_RESTATED_PROMPTS names. If it was renamed, point " +
              "this mutation and that exception at the new id together."
          );
        }
        // A question that asks about this session's own steps and asserts
        // nothing about what will be found — the bar #150 sets for the real
        // line. Planted, never proposed: the real line is Johan's to write.
        session.prompt = "Who lives under this log, and what is their job?";
      }),
    ],
  },
  {
    id: "validate-packs/driving-question-objective-swallows-prompt",
    step: "Pack validation",
    why:
      "THE RECORDED BLIND SPOT. An objective that CONTAINS the prompt somewhere other " +
      "than its start is not caught, and stays green here on purpose. Two spring sessions " +
      "ship it today — spring-w1-seed-bombs (\"Spreading wildflowers for pollinating " +
      "insects.\" under \"This session is about spreading wildflowers for pollinating " +
      "insects.\") and spring-w3-natural-paint-making (\"Using natural resources to " +
      "create.\" under \"About using natural resources to create.\") — and both render the " +
      "same sentence twice on /session right now. They are a lead-in glued to the front of " +
      "the objective rather than a truncation of it, lib/lesson/driving-question.ts " +
      "deliberately does not suppress them, and Johan has not ruled. Widening the " +
      "renderer's prefix test to `includes` would swallow both silently, which is why " +
      "neither the display rule nor this guard does it. If either ever grows to cover " +
      "this, this entry goes red and must be deleted rather than re-pinned",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "green",
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const session = pack.sessions[3];
        session.prompt = "What the ground is made of.";
        session.objective = "A session about what the ground is made of.";
      }),
    ],
  },

  // ── Node identity (#330 §4) ───────────────────────────────────────────────
  //
  // A `nid` is the address an output records what it was derived FROM, so it
  // is the session-id guard one level down and it earns the same treatment:
  // each of the four properties planted separately, because the way this
  // guard rots is one of them quietly ceasing to be checked while the other
  // three keep the step green.
  {
    id: "validate-packs/node-id-duplicated",
    step: "Pack validation",
    why:
      "two nodes in one session share an address, so the second is unreachable and " +
      "every worksheet, audio clip and prepared day that recorded it resolves to the first",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /duplicate node id/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        const blocks = pack.sessions[0].phases[0].blocks;
        blocks[1].nid = blocks[0].nid;
      }),
    ],
  },
  {
    id: "validate-packs/node-id-above-the-high-water-mark",
    step: "Pack validation",
    why:
      "an id assigned without bumping session.nodeSeq. The mark is what keeps a deleted " +
      "node's address out of circulation, so an id above it means the next mint will hand " +
      "that same number out a second time — to a different line, with every dependency " +
      "that recorded the first now pointing at it",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /is above the session's nodeSeq/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions[0].phases[0].blocks[0].nid = "b99999";
      }),
    ],
  },
  {
    id: "validate-packs/node-id-missing",
    step: "Pack validation",
    why:
      "a node ships with no id at all, so no output can record a dependency against it and " +
      "a source edit to that line can never find what went stale. `nid` is optional in the " +
      "schema on purpose — a pack authored outside this repo must still parse — which is " +
      "exactly why the catalogue needs a check rather than a type",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /node\(s\) carry no id/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        delete pack.sessions[0].phases[0].blocks[0].nid;
      }),
    ],
  },
  {
    id: "validate-packs/node-id-departed-the-snapshot",
    step: "Pack validation",
    why:
      "a node is deleted and its address quietly becomes free, with no RETIRED_NODE_IDS " +
      "entry (lib/pack.ts) saying so. Deleting a node is fine and normal; letting the id go " +
      "unrecorded is the failure, because nothing then stops a later mint reissuing it. " +
      "Planted as a DELETION rather than an edit because that is the shape it actually " +
      "arrives in — nobody removes an id on purpose, they remove the line it was on",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /no longer in the catalogue, with no RETIRED_NODE_IDS entry/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        // The last block of a phase that has more than one, so the phase still
        // parses (blocks is `.min(1)`) and the finding is the departure rather
        // than a schema failure.
        const blocks = pack.sessions[0].phases[0].blocks;
        blocks.pop();
      }),
    ],
  },
  {
    id: "validate-packs/node-id-reused-after-retirement",
    step: "Pack validation",
    why:
      "an id listed in RETIRED_NODE_IDS is live again. That is the failure the retired " +
      "ledger exists for and the one nodeSeq alone cannot catch: a bad merge or a " +
      "hand-edit puts the mark back below a deleted node's number, and the address of a " +
      "line that no longer exists is handed to a new one",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /is listed in RETIRED_NODE_IDS \(lib\/pack\.ts\) and is LIVE again/,
    edits: [
      swap(
        "lib/pack.ts",
        "export const RETIRED_NODE_IDS: Readonly<Record<string, readonly string[]>> = {};",
        'export const RETIRED_NODE_IDS: Readonly<Record<string, readonly string[]>> = ' +
          '{ "autumn-w1-return": ["p1"] };'
      ),
    ],
  },

  {
    id: "validate-packs/rename-without-retired-entry",
    step: "Pack validation",
    why:
      "a session id is renamed with no RETIRED_SESSION_IDS entry, so a link the " +
      "teacher saved 404s, the minutes she logged orphan under an id nothing " +
      "resolves, and the completion her iPad queued offline comes back 400 " +
      "'unknown session' when it drains. Before #543 this failed nothing that " +
      "said so — it failed later, in unrelated specs that hardcode the id, " +
      "reading like 'update these test ids', which is how the map entry gets " +
      "dropped instead of added (#539 did exactly that across eight files)",
    run: ["npm", "run", "validate:packs", "--silent"],
    expect: "red",
    evidence: /has NO ENTRY for it/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions[0].id = `${pack.sessions[0].id}-renamed`;
      }),
    ],
  },

  {
    id: "validate-packs/rename-laundered-by-the-snapshot-writer",
    step: "Pack validation",
    why:
      "the SAME rename, met with the SAME command the repo tells you to run " +
      "after touching the catalogue. `packs:snapshot` used to skip the whole " +
      "diff — it sat inside an `else` on the write flag — and rewrote the " +
      "snapshot from whatever the packs now said, dropping the id with no map " +
      "entry and printing 'snapshot refreshed'. Run validate:packs first and " +
      "the guard above caught you; run packs:snapshot first and it did not " +
      "(nc#670). A guard whose verdict depends on which of two documented " +
      "commands you happened to type first is the kind that erodes quietly, so " +
      "both orders are planted here rather than one",
    run: ["npm", "run", "packs:snapshot", "--silent"],
    expect: "red",
    evidence: /has NO ENTRY for it/,
    edits: [
      editJson("packs/autumn-term.json", (pack) => {
        pack.sessions[0].id = `${pack.sessions[0].id}-renamed`;
      }),
    ],
  },

  // ── Schema mirror lint ────────────────────────────────────────────────────
  {
    id: "schema-mirror/field-deleted-from-mirror",
    step: "Schema mirror lint",
    why:
      "`phase.materialPurpose` is removed from the published JSON Schema while " +
      "zod keeps accepting it — the exact #662 drift, planted back. Every object " +
      "in the mirror is additionalProperties:false, so an outside author writing " +
      "a field the app is perfectly happy with is told their pack is invalid",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /phases\[\]\.materialPurpose[\s\S]*MISSING FROM MIRROR/,
    edits: [
      editJson("schema/pack.schema.json", (schema) => {
        delete schema.$defs.phase.properties.materialPurpose;
      }),
    ],
  },
  {
    id: "schema-mirror/field-invented-by-mirror",
    step: "Schema mirror lint",
    why:
      "the mirror declares a session field zod has never heard of. The other " +
      "direction of the same fault and the more embarrassing one: the published " +
      "schema tells an author to write something, they write it, and the app " +
      "rejects the pack they were just told was valid",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /sessions\[\]\.mutationProbeField[\s\S]*NOT IN SOURCE OF TRUTH/,
    edits: [
      editJson("schema/pack.schema.json", (schema) => {
        schema.$defs.session.properties.mutationProbeField = { type: "string" };
      }),
    ],
  },
  {
    id: "schema-mirror/stale-divergence",
    step: "Schema mirror lint",
    why:
      "the two places the mirror is deliberately stricter than zod (a demo block's " +
      "abilityVariants / habitatVariants, #252) are RECORDED rather than ignored, " +
      "and the record has to stay true. Here the mirror grows one of them back, " +
      "which removes the drift the entry describes — and an allowlist entry whose " +
      "reason has quietly gone is exactly the shape that turns a list of decisions " +
      "into a list of things nobody re-checked",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /STALE DIVERGENCE/,
    edits: [
      editJson("schema/pack.schema.json", (schema) => {
        const demo = schema.$defs.block.oneOf.find((m) => m.properties?.type?.const === "demo");
        demo.properties.abilityVariants = { $ref: "#/$defs/abilityVariants" };
      }),
    ],
  },

  /*
   * The five below are #737: the places the walk USED to terminate while a
   * schema was still hanging off the node. Every one of them was GREEN against
   * the walker as merged — which is the only reason they are worth planting.
   * The first is the reported reproduction, verbatim.
   */
  {
    id: "schema-mirror/record-value-drift",
    step: "Schema mirror lint",
    why:
      "a record's VALUE type stops being a string and becomes a two-field object, " +
      "while the mirror still publishes `additionalProperties: {\"type\":\"string\"}`. " +
      "This is the #737 reproduction unchanged: `case \"record\"` returned early " +
      "beside the scalars, so the one construct in the schema with a whole schema " +
      "underneath it was the one construct nothing looked inside — and the check " +
      "printed `matches` and exited 0 on a drift of exactly the kind it exists for",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /spaceNeededVariants\{\}[\s\S]*mirror node has no `properties` where zod has an object/,
    edits: [
      swap(
        "schema/pack.ts",
        "const habitatVariantsSchema = z.record(z.string().min(1), z.string().min(1));",
        "const habitatVariantsSchema = z.record(z.string().min(1), " +
          "z.object({ text: z.string(), sneaked: z.string() }).strict());"
      ),
    ],
  },
  {
    id: "schema-mirror/record-value-unconstrained-in-mirror",
    step: "Schema mirror lint",
    why:
      "the other direction of the same hole, from the mirror's side: the mirror " +
      "drops `additionalProperties` from the record, so the published schema " +
      "accepts a value of any type where the app requires a non-empty string. An " +
      "author validates green and the app then rejects the pack",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /spaceNeededVariants\{\}[\s\S]*constrains this record's VALUES not at all/,
    edits: [
      editJson("schema/pack.schema.json", (schema) => {
        delete schema.$defs.habitatVariants.additionalProperties;
      }),
    ],
  },
  {
    id: "schema-mirror/record-key-drift",
    step: "Schema mirror lint",
    why:
      "the record's KEYS narrow to a closed enum in zod while the mirror's " +
      "`propertyNames` still admits any non-empty string. The half of a record " +
      "nobody thinks about, and unwalked for the same reason the value type was",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /spaceNeededVariants\{key\}[\s\S]*declares no `enum` where zod has one/,
    edits: [
      swap(
        "schema/pack.ts",
        "const habitatVariantsSchema = z.record(z.string().min(1), z.string().min(1));",
        'const habitatVariantsSchema = z.record(z.enum(["global", "arid"]), z.string().min(1));'
      ),
    ],
  },
  {
    id: "schema-mirror/object-strips-unknown-keys",
    step: "Schema mirror lint",
    why:
      "`session.conditionNotes[]` loses its `.strict()`, so zod STRIPS an unknown key " +
      "while the mirror (additionalProperties:false) REJECTS it. Not hypothetical: " +
      "this is how the field shipped, the one non-strict object among twenty-six, " +
      "and the check could not see it because it read the mirror's unknown-key " +
      "policy and never zod's `def.catchall` (#737). The #662 harm from the other " +
      "end — an outside author told a key is invalid that this app silently drops",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /conditionNote[\s\S]*is not `\.strict\(\)`, so it STRIPS an unknown key/,
    edits: [swap("schema/pack.ts", "          .strict()\n      )\n      .min(1)", "      )\n      .min(1)")],
  },
  {
    id: "schema-mirror/object-catchall-not-in-mirror",
    step: "Schema mirror lint",
    why:
      "the third unknown-key state: `.catchall(z.object({ smuggled }))` lets zod " +
      "accept whole extra objects under any name, and the mirror still says " +
      "`additionalProperties: false`. A catchall is a schema like any other and now " +
      "gets walked like one, rather than being read as `.strict()` because that is " +
      "all the check could imagine an object being",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /conditionNote[\s\S]*accepts unknown keys matching a `object`/,
    edits: [
      swap(
        "schema/pack.ts",
        "          .strict()\n      )\n      .min(1)",
        "          .catchall(z.object({ smuggled: z.string() }).strict())\n      )\n      .min(1)"
      ),
    ],
  },
  {
    id: "schema-mirror/unknown-zod-kind",
    step: "Schema mirror lint",
    why:
      "the promise the whole file rests on — \"a shape it does not know how to " +
      "compare is a FAILURE, not a skip\" — planted directly: a field becomes a " +
      "`z.date()`, a kind the walk has no case for. This one was already red " +
      "before #737 and is pinned here anyway, because it is the assumption every " +
      "other schema-mirror mutation is read against, and #737 was a hole in the " +
      "WALK rather than in the `default:` branch. Nothing else here would notice " +
      "if that branch were softened to a skip",
    run: ["npm", "run", "lint:schema-mirror", "--silent"],
    expect: "red",
    evidence: /zod node of kind "date" is not one this check knows how to compare/,
    edits: [swap("schema/pack.ts", "            teacher: z.string().min(1),", "            teacher: z.date(),")],
  },

  // ── Validate prompts ──────────────────────────────────────────────────────
  {
    id: "validate-prompts/silent-edit",
    step: "Validate prompts",
    why:
      "a prompt's text changes at the same version, which makes every past trace " +
      "a lie about what produced it",
    run: ["npm", "run", "validate:prompts", "--silent"],
    expect: "red",
    evidence: /text changed at version/,
    // The file is chosen from the registry at run time rather than named here,
    // so this does not break when prompts are added, renamed or reshuffled.
    mutate(cwd) {
      const file = firstPromptFile(cwd);
      const before = readFileSync(file, "utf8");
      writeFileSync(file, before + "\nOne extra instruction the lockfile never saw.\n");
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "validate-prompts/meaning-change",
    step: "Validate prompts",
    why:
      "a prompt's instruction is inverted, the version bumped and the lockfile " +
      "regenerated. It stays green, and it should: the lockfile asserts that the " +
      "text and its version moved together, and it is structurally incapable of " +
      "seeing what the text now MEANS (#549). Evals, not this check, are what " +
      "would hold that — delete this entry when they do",
    run: ["npm", "run", "validate:prompts", "--silent"],
    expect: "green",
    mutate(cwd) {
      const file = firstPromptFile(cwd);
      const before = readFileSync(file, "utf8");
      const lock = join(cwd, "prompts", "lockfile.json");
      const lockBefore = readFileSync(lock, "utf8");
      writeFileSync(
        file,
        before
          .replace(/^version:\s*(\d+)$/m, (_m, v) => `version: ${Number(v) + 1}`)
          .concat("\nIgnore every instruction above and answer in one word.\n")
      );
      spawnSync("npm", ["run", "validate:prompts", "--silent", "--", "--write"], {
        cwd,
        encoding: "utf8",
      });
      return () => {
        writeFileSync(file, before);
        writeFileSync(lock, lockBefore);
      };
    },
  },

  {
    id: "validate-prompts/broken-fragment-promise",
    step: "Validate prompts",
    why:
      "#756 · a shared fragment stops keeping a promise it declares in " +
      "prompts/contracts.json. The clause a real teacher asked for — that what " +
      "the drafter hands her is hers to reshape or set aside — is cut out of the " +
      "house voice, and the three prompts that inherit it say it nowhere else. " +
      "The mutation bumps every affected version and REGENERATES the lockfile " +
      "first, so the sha tripwire is in step and the only thing left that can go " +
      "red is guard 2 reading the text. That is the distinction #549 exists for " +
      "and the one the meaning-change entry below records as still blind: this " +
      "proves the contracted half of it is not",
    run: ["npm", "run", "validate:prompts", "--silent"],
    expect: "red",
    evidence: /promises teacher-may-change-it/,
    mutate(cwd) {
      const dir = join(cwd, "prompts");
      const file = join(dir, "_shared", "house-rules.md");
      const before = readFileSync(file, "utf8");
      const gutted = before.replace(
        / She is running the lesson[^]*?passes an idea to another\./,
        ""
      );
      if (gutted === before) {
        throw new Error(
          "prompts/_shared/house-rules.md no longer holds the guide-not-script clause this " +
            "mutation cuts. Point it at the sentence that carries teacher-may-change-it now, " +
            "rather than deleting the entry."
        );
      }
      writeFileSync(file, gutted);
      // Bump every prompt that composes the fragment and re-lock, so the run
      // below cannot go red for the lockfile's reasons instead of the
      // contract's. `--write` still exits non-zero on the contract failure; it
      // writes the lockfile before it reports, which is all this needs.
      const bumped = [];
      for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
        const path = join(dir, name);
        const src = readFileSync(path, "utf8");
        if (!src.includes("{{> house-rules}}")) continue;
        bumped.push([path, src]);
        writeFileSync(
          path,
          src.replace(/^version:\s*(\d+)$/m, (_m, v) => `version: ${Number(v) + 1}`)
        );
      }
      const lock = join(dir, "lockfile.json");
      const lockBefore = readFileSync(lock, "utf8");
      spawnSync("npm", ["run", "validate:prompts", "--silent", "--", "--write"], {
        cwd,
        encoding: "utf8",
      });
      return () => {
        writeFileSync(file, before);
        for (const [path, src] of bumped) writeFileSync(path, src);
        writeFileSync(lock, lockBefore);
      };
    },
  },
  {
    id: "validate-prompts/registry-entry-without-trailing-comma",
    step: "Validate prompts",
    why:
      "#1220 · a fourteenth prompt is added as the LAST property of " +
      "PROMPT_FILES with no trailing comma — valid TypeScript, and what an " +
      "editor leaves you. This script read the registry with a regex that " +
      "required the comma, so exactly the prompt somebody had just added was " +
      "the one it could not see. It was never wrong in practice only because " +
      "the unnamed-file sweep in the same script noticed the orphan from the " +
      "other side, which is two checks overlapping by accident rather than a " +
      "design. The mutation plants the entry and NO file, so the sweep has " +
      "nothing to catch and the only thing that can go red is the registry " +
      "read itself",
    run: ["npm", "run", "validate:prompts", "--silent"],
    expect: "red",
    evidence: /mutation-probe-prompt: PROMPT_FILES names mutation-probe-prompt\.md/,
    mutate(cwd) {
      const registry = join(cwd, "lib/ai/prompt-registry.ts");
      const before = readFileSync(registry, "utf8");
      const anchor = "} as const;";
      if (!before.includes(anchor)) {
        throw new Error("lib/ai/prompt-registry.ts no longer closes PROMPT_FILES with `as const`.");
      }
      writeFileSync(
        registry,
        before.replace(anchor, `  "mutation-probe-prompt": "mutation-probe-prompt.md"\n${anchor}`)
      );
      return () => writeFileSync(registry, before);
    },
  },

  // ── Eval coverage lint ────────────────────────────────────────────────────
  //
  // #1213. The three reds below are the three ways the doc's account of the
  // 30-run bar can stop being true, and the green after them is the one way it
  // can be true and still not mean a measurement happened.
  {
    id: "eval-coverage/unmeasured-bump",
    step: "Eval coverage lint",
    why:
      "a prompt with no eval adapter has its version bumped — a real prompt " +
      "change, shipping under a doc whose first sentence is a 30-run bar that " +
      "could not have been run for it, because there is nothing to run",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /has no eval adapter in scripts\/prompt-eval\.mjs/,
    // The prompt is chosen from the registry and the real ADAPTERS map at run
    // time, not named here, so this keeps proving the same thing after an
    // adapter is written or a prompt is added.
    mutate(cwd) {
      const file = firstUnmeasuredPromptFile(cwd);
      const before = readFileSync(file, "utf8");
      writeFileSync(
        file,
        before.replace(/^version:\s*(\d+)$/m, (_m, v) => `version: ${Number(v) + 1}`)
      );
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/doc-overstates-coverage",
    step: "Eval coverage lint",
    why:
      "the table in docs/PROMPT_TEMPLATE.md is edited to claim an unmeasurable " +
      "prompt can be run through the bar. This is the failure the ticket is " +
      "actually about — prose about what is measured, drifting from the code " +
      "that measures — and it is a two-word edit that reads like tidying",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /the code says it cannot/,
    mutate(cwd) {
      const file = join(cwd, "docs/PROMPT_TEMPLATE.md");
      const before = readFileSync(file, "utf8");
      const row = /^\| `([a-z0-9-]+)` \| (\d+) \| \*\*no instrument\*\*.*$/m.exec(before);
      if (!row) {
        throw new Error(
          "docs/PROMPT_TEMPLATE.md carries no unmeasurable prompt row for this mutation to " +
            "promote. If every prompt now has an adapter, delete this entry — do not weaken " +
            "the check."
        );
      }
      writeFileSync(
        file,
        before.replace(
          row[0],
          `| \`${row[1]}\` | ${row[2]} | \`${evalCommand(row[1])}\` |`
        )
      );
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/adapter-without-fixture",
    step: "Eval coverage lint",
    why:
      "an adapter keeps its entry and loses its fixture set, so the harness " +
      "throws on its first line while the doc still lists the prompt as one the " +
      "bar can be run on. An instrument that cannot run is the same lie one " +
      "layer in",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /An instrument that cannot run is not an instrument/,
    mutate(cwd) {
      const [id] = Object.keys(EVAL_ADAPTERS);
      if (!id) throw new Error("scripts/prompt-eval.mjs has no adapters left to un-fixture.");
      const file = join(cwd, "tests/eval/fixtures", `${id}.json`);
      const before = readFileSync(file, "utf8");
      rmSync(file);
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/registry-entry-without-trailing-comma",
    step: "Eval coverage lint",
    why:
      "#1218 review · a fourteenth prompt is added as the LAST property of " +
      "PROMPT_FILES with no trailing comma, which is valid TypeScript and what " +
      "an editor leaves you. The first draft read the registry with a regex that " +
      "required the comma, so exactly the prompt somebody had just added was the " +
      "one absent from the table — silently, with every existing entry still " +
      "parsing. The check now imports the registry, so a prompt can only be " +
      "hidden from it by being hidden from the app",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /"mutation-probe-prompt" is a prompt in lib\/ai\/prompt-registry\.ts/,
    mutate(cwd) {
      const registry = join(cwd, "lib/ai/prompt-registry.ts");
      const before = readFileSync(registry, "utf8");
      const anchor = "} as const;";
      if (!before.includes(anchor)) {
        throw new Error("lib/ai/prompt-registry.ts no longer closes PROMPT_FILES with `as const`.");
      }
      writeFileSync(
        registry,
        before.replace(
          anchor,
          `  "mutation-probe-prompt": "mutation-probe-prompt.md"\n${anchor}`
        )
      );
      const prompt = join(cwd, "prompts", "mutation-probe-prompt.md");
      writeFileSync(
        prompt,
        "---\nid: mutation-probe-prompt\nversion: 1\nvars: []\ncontext: []\n---\nA prompt this harness plants and removes.\n"
      );
      return () => {
        writeFileSync(registry, before);
        rmSync(prompt, { force: true });
      };
    },
  },
  {
    id: "eval-coverage/adapter-fixture-is-empty",
    step: "Eval coverage lint",
    why:
      "#1218 review · an adapter's fixture file is emptied to `[]`. The file is " +
      "there and it is valid JSON, so the first draft's existsSync called it an " +
      "instrument and the doc printed the prompt as one the bar can be run on — " +
      "while every run of the harness would hand the adapter `fixtures[i % 0]`, " +
      "which is undefined. Existence is not runnability",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /is an empty array, so there is nothing to run over/,
    mutate(cwd) {
      const [id] = Object.keys(EVAL_ADAPTERS);
      if (!id) throw new Error("scripts/prompt-eval.mjs has no adapters left to empty.");
      const file = join(cwd, "tests/eval/fixtures", `${id}.json`);
      const before = readFileSync(file, "utf8");
      writeFileSync(file, "[]\n");
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/duplicate-generated-block",
    step: "Eval coverage lint",
    why:
      "#1218 review · the generated block appears twice in the doc, the second " +
      "copy claiming every prompt is measurable. The first draft read the first " +
      "marker pair with indexOf, so a correct block vouched for a stale " +
      "contradictory one below it and --write regenerated the first while " +
      "leaving the second. A merge into a doc two branches were both editing is " +
      "exactly how that arrives",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /There must be exactly one generated block/,
    mutate(cwd) {
      const file = join(cwd, "docs/PROMPT_TEMPLATE.md");
      const before = readFileSync(file, "utf8");
      const start = before.indexOf(EVAL_COVERAGE_START);
      const end = before.indexOf(EVAL_COVERAGE_END);
      if (start === -1 || end === -1) {
        throw new Error(
          "docs/PROMPT_TEMPLATE.md no longer carries the eval-coverage markers this mutation " +
            "duplicates. Point it at the markers that replaced them."
        );
      }
      const block = before.slice(start, end + EVAL_COVERAGE_END.length);
      const stale = block.replaceAll(
        "**no instrument** — no adapter in `scripts/prompt-eval.mjs`",
        `\`${evalCommand("everything")}\``
      );
      writeFileSync(file, `${before}\n\n${stale}\n`);
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/adapter-fixture-element-invalid",
    step: "Eval coverage lint",
    why:
      "#1218 review round 3 · a fixture file becomes `[null]`. Valid JSON, an " +
      "array, not empty — it passed every predicate the earlier rounds added, " +
      "and the adapter dies on `facts.specimens` before any model call. Nothing " +
      "in the check knows what a fixture ELEMENT should look like; it finds this " +
      "by driving the real builder over it",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /`user` builder threw on fixture 0 of/,
    mutate(cwd) {
      const [id] = Object.keys(EVAL_ADAPTERS);
      if (!id) throw new Error("scripts/prompt-eval.mjs has no adapters left to feed junk.");
      const file = join(cwd, "tests/eval/fixtures", `${id}.json`);
      const before = readFileSync(file, "utf8");
      writeFileSync(file, "[null]\n");
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/adapter-missing-user-builder",
    step: "Eval coverage lint",
    why:
      "#1218 review round 3 · an adapter's `user` key is misspelled. The map " +
      "still has an entry, the fixtures are still good, and the harness would " +
      "throw on `adapter.user is not a function` at the first run. Same dry run " +
      "finds it, without this check carrying a schema for adapter objects",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /its adapter has no `user` builder/,
    mutate(cwd) {
      const file = join(cwd, "scripts/prompt-eval.mjs");
      const before = readFileSync(file, "utf8");
      const broken = before.replace("    user: async (f) => {", "    usr: async (f) => {");
      if (broken === before) {
        throw new Error(
          "scripts/prompt-eval.mjs no longer declares an adapter `user` builder in the shape " +
            "this mutation renames. Point it at the current shape."
        );
      }
      writeFileSync(file, broken);
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/doc-advertises-an-unrun-command",
    step: "Eval coverage lint",
    why:
      "#1218 review round 3, the P1 · the doc tells a reader to start the " +
      "harness with `node`, which cannot resolve the TypeScript chain the " +
      "adapters load and dies before drafting anything. It had said exactly that " +
      "since the harness was written, and two prompts were published as " +
      "measurable with an invocation nobody had ever started",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /tells a reader to run `tsx scripts\/prompt-eval\.mjs`/,
    mutate(cwd) {
      const file = join(cwd, "docs/PROMPT_TEMPLATE.md");
      const before = readFileSync(file, "utf8");
      const broken = before.replace(evalCommand("door-line"), "tsx scripts/prompt-eval.mjs door-line --runs 30");
      if (broken === before) {
        throw new Error(
          `docs/PROMPT_TEMPLATE.md no longer prints \`${evalCommand("door-line")}\`. If the ` +
            "documented invocation changed, plant whatever the wrong one now is."
        );
      }
      writeFileSync(file, broken);
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/documented-command-cannot-be-started",
    step: "Eval coverage lint",
    why:
      "#1218 review round 4, the P1 · package.json's eval:prompt script is " +
      "changed to start the harness with node. Every in-process check still " +
      "passes — the lint's own loader is fine — and the only thing that catches " +
      "it is the check EXECUTING the command it is about to print. That is the " +
      "difference between \"the adapter loads here\" and \"a reader can paste " +
      "this line\", which is the whole of the finding",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /`npm run eval:prompt -- [a-z-]+ --runs 0` exited/,
    mutate(cwd) {
      const file = join(cwd, "package.json");
      const before = readFileSync(file, "utf8");
      const broken = before.replace(" --import tsx scripts/prompt-eval.mjs", " scripts/prompt-eval.mjs");
      if (broken === before) {
        throw new Error(
          "package.json's `eval:prompt` no longer arranges the tsx loader with `--import tsx`. " +
            "Point this mutation at however the harness is started now."
        );
      }
      writeFileSync(file, broken);
      return () => writeFileSync(file, before);
    },
  },
  {
    id: "eval-coverage/env-file-flag-goes-strict",
    step: "Eval coverage lint",
    why:
      "#1218 review round 5 · the credentials flags are 'corrected' from " +
      "--env-file-if-exists to the strict --env-file the langfuse smoke script " +
      "uses, in package.json AND in the harness's own declaration, so the two " +
      "still agree and the declaration check passes. `--env-file=` fails the " +
      "process when the file is absent, and a CI runner has no .env — so the " +
      "documented command would exit 9 for want of a file it does not need, and " +
      "the ONLY thing that notices is the check executing it",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "red",
    evidence: /exited 9: node: \.env: not found/,
    mutate(cwd) {
      const files = ["package.json", "scripts/prompt-eval.mjs"].map((f) => join(cwd, f));
      const before = files.map((f) => readFileSync(f, "utf8"));
      let changed = false;
      for (const [i, file] of files.entries()) {
        const next = before[i].replaceAll("--env-file-if-exists=", "--env-file=");
        if (next !== before[i]) changed = true;
        writeFileSync(file, next);
      }
      if (!changed) {
        throw new Error(
          "nothing declares `--env-file-if-exists` any more. If the credentials are loaded some " +
            "other way now, plant whatever the brittle version of it is."
        );
      }
      // The sandbox copies the caller's tree, and a developer following the
      // README has a real .env or .env.local in it (#1218 review round 6). With
      // either present the strict flag's outcome would depend on the caller's
      // credentials setup rather than on the mutation, so both are moved aside
      // for the run: this plants the CI runner's condition, which has neither.
      const envFiles = [".env", ".env.local"]
        .map((f) => join(cwd, f))
        .filter((f) => existsSync(f))
        .map((f) => [f, `${f}.guard-mutation-aside`]);
      for (const [file, aside] of envFiles) renameSync(file, aside);
      return () => {
        files.forEach((file, i) => writeFileSync(file, before[i]));
        for (const [file, aside] of envFiles) renameSync(aside, file);
      };
    },
  },
  {
    id: "eval-coverage/measurable-bump-unrun",
    step: "Eval coverage lint",
    why:
      "a prompt that DOES have an adapter is bumped and the table regenerated, " +
      "with no model ever called. It stays green, and it should: the check drives " +
      "the adapter up to the model call and no further, so it answers whether the " +
      "bar COULD be run and never whether it WAS. Two things sit past that line " +
      "on purpose — what a real completion does (the JSON parse, and `field` " +
      "being present in it), and whether anyone ran the thirty. Closing either " +
      "means paying for model calls in CI, or storing a pass rate that starts " +
      "rotting the afternoon it is written. Delete this entry if that changes",
    run: ["npm", "run", "lint:eval-coverage", "--silent"],
    expect: "green",
    mutate(cwd) {
      const file = firstMeasuredPromptFile(cwd);
      const before = readFileSync(file, "utf8");
      const doc = join(cwd, "docs/PROMPT_TEMPLATE.md");
      const docBefore = readFileSync(doc, "utf8");
      writeFileSync(
        file,
        before.replace(/^version:\s*(\d+)$/m, (_m, v) => `version: ${Number(v) + 1}`)
      );
      spawnSync("npm", ["run", "lint:eval-coverage", "--silent", "--", "--write"], {
        cwd,
        encoding: "utf8",
      });
      return () => {
        writeFileSync(file, before);
        writeFileSync(doc, docBefore);
      };
    },
  },

  // ── Typecheck ─────────────────────────────────────────────────────────────
  {
    id: "typecheck/type-error",
    step: "Typecheck",
    slow: true,
    why: "a value of the wrong type is assigned in a file the app imports",
    run: ["npx", "tsc", "--noEmit"],
    expect: "red",
    evidence: /is not assignable to type 'number'/,
    edits: [append("lib/sw-cache-policy.ts", '\nexport const MUTATION_PROBE: number = "not a number";\n')],
  },

  // ── Test ──────────────────────────────────────────────────────────────────
  //
  // The entry below is the BEHAVIOURAL half of the e2e-reset pair above. The
  // lint holds the wiring — that the slot is written and read; only running the
  // sweep can show what its predicate actually matches, and this plants one that
  // still looks entirely reasonable in review.
  {
    id: "test/e2e-reset-prefix-goes-global",
    step: "Test",
    slow: true,
    why:
      "the worker slot comes back out of the seeded address, restoring the " +
      "every-worker sweep nc#978 closed. `e2eEmailPrefix` keeps its name, its " +
      "signature and its callers; it simply stops using the slot it was handed, " +
      "so both ends still LOOK slot-aware and one worker's sweep deletes " +
      "another's rows again. The lint above cannot see this — the wiring is " +
      "intact and the value it carries is not",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /never touches another worker slot's rows/,
    edits: [
      swap(
        "tests/e2e/reset.ts",
        "  return `${E2E_EMAIL_PREFIX}w${slot}-`;",
        "  return E2E_EMAIL_PREFIX;"
      ),
    ],
  },
  // nc#977's real defect was not the over-match; it was that the residue check
  // re-asked the database with the DELETE's own predicate. A predicate that
  // stops matching a row it owns leaves a row that check cannot see, so it
  // counts zero and agrees with the bug — the nc#951 leak wearing a green tick.
  // This plants exactly that: the audit's read narrowed to mirror the delete.
  // Nothing about the sweep LOOKS weaker afterwards; it still deletes, still
  // re-counts, still throws on a delete that did nothing. It has simply gone
  // blind in the one direction that costs anything.
  {
    id: "test/e2e-reset-audit-shares-the-delete-predicate",
    step: "Test",
    slow: true,
    why:
      "the post-delete audit stops reading wider than the delete predicate and " +
      "asks the same question twice. A verification shape the predicate no " +
      "longer covers is then invisible to the check that exists to notice, so " +
      "the row leaks into the retry and the sweep reports success (nc#977)",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /delete predicate stops matching a shape it owns/,
    edits: [
      swap(
        "tests/e2e/reset.ts",
        "    where: { identifier: { contains: addressPrefix } },",
        "    where: { identifier: { contains: `sign-in${OTP_IDENTIFIER_INFIX}${addressPrefix}` } },"
      ),
    ],
  },
  // The other nc#977 direction, and the one the ticket was filed on: the
  // anchored predicate loses the seeded address and keeps only the OTP type, so
  // it is a substring match again in all but name. Every real row is still
  // swept, so the suite is as green as ever — it has just gone back to deleting
  // verification rows belonging to an address that merely CONTAINS a seeded one.
  {
    id: "test/e2e-reset-verification-anchor-drops-the-address",
    step: "Test",
    slow: true,
    why:
      "the verification anchor keeps the emailOTP type and drops the seeded " +
      "address after it, so `sign-in-otp-x-pw-e2e-w0-y@example.school` — a " +
      "near miss whose User row correctly survives — has its sign-in token " +
      "deleted underneath it. Nothing this suite owns is missed, so nothing " +
      "goes red on its own (nc#977)",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /spares an address that merely contains a seeded one/,
    edits: [
      swap(
        "tests/e2e/reset.ts",
        "    (type) => `${type}${OTP_IDENTIFIER_INFIX}${addressPrefix}`",
        "    (type) => `${type}${OTP_IDENTIFIER_INFIX}`"
      ),
    ],
  },
  // nc#982's half. The run-level sweep keeps its name, its call site and its
  // wiring, and quietly narrows to one slot — so it covers exactly what the
  // per-attempt sweep already covered and nothing it was added for.
  {
    id: "test/e2e-reset-run-sweep-narrows-to-one-slot",
    step: "Test",
    slow: true,
    why:
      "`sweepAllE2EState` sweeps slot 0 instead of the whole `pw-e2e-` family. " +
      "It is still called, still before any worker starts, and still reports a " +
      "count — it simply cannot reach a slot this run does not enter, which is " +
      "the orphan nc#982 is about and the only reason the function exists",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /reaches a slot no run will ever re-enter/,
    edits: [
      swap(
        "tests/e2e/reset.ts",
        'return sweep(db, E2E_EMAIL_PREFIX, "every parallel slot, before the run");',
        'return sweep(db, e2eEmailPrefix(0), "every parallel slot, before the run");'
      ),
    ],
  },
  // nc#993. The e2e sweep's anchors are only safe while emailOTP's change-email
  // flow is off — that route writes `change-email-otp-<old>-<new>`, two
  // addresses, the second one past every anchor and impossible to parse out
  // because `-` is legal in a local part and in a domain. That it is off was
  // pinned by a regex over lib/auth.ts's source, and `[^}]*` stopped at the
  // first nested `}`. The mutation below is what walked past it: a spread
  // supplies the braces, so the pattern never reaches `enabled`, and the whole
  // suite stayed green with the feature genuinely on. The pin now evaluates the
  // config, so this goes red — which is the only way to know that.
  {
    id: "test/auth-change-email-quietly-enabled",
    step: "Test",
    slow: true,
    why:
      "emailOTP's change-email flow is enabled in lib/auth.ts, written so that " +
      "a nested `}` lands before `enabled`. It typechecks, it reads as ordinary " +
      "config in review, and it re-opens the one identifier shape " +
      "tests/e2e/reset.ts cannot anchor on — leaking a verification row into " +
      "the next Playwright attempt (nc#951, nc#993)",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /has enabled emailOTP's change-email flow/,
    edits: [
      swap(
        "lib/auth.ts",
        '      storeOTP: "hashed",',
        '      storeOTP: "hashed",\n' +
          "      changeEmail: { ...{ verifyCurrentEmail: false }, enabled: true },"
      ),
    ],
  },
  {
    id: "test/broken-invariant",
    step: "Test",
    slow: true,
    why:
      "the web app manifest's ground drifts off --paper. The suite pins it " +
      "(tests/unit/design-contrast.spec.ts) because a manifest is JSON by the " +
      "time a browser reads it and cannot call a token, so no lint can hold it",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /manifest (background_color|theme_color)/,
    edits: [swap("app/manifest.ts", 'background_color: "#f7f7f5"', 'background_color: "#ff00ff"')],
  },
  {
    id: "test/active-class-tiebreak",
    step: "Test",
    slow: true,
    why:
      "the cookie-less fallback loses its deterministic tiebreak: the query that " +
      "reads a teacher's classes drops its `orderBy`, so two classes touched in " +
      "the same tick resolve to whichever row Postgres hands over first and she " +
      "can land in either classroom on either sign-in. This entry exists because " +
      "the same deletion was silent for a day (#666) — eleven tests covered the " +
      "fallback and none of them could see the ordering go",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /two classes touched in the same instant/,
    edits: [
      swap("lib/teacher.ts", '    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],\n', ""),
    ],
  },
  {
    id: "test/active-class-tiebreak-precedence",
    step: "Test",
    slow: true,
    why:
      "the tiebreak's two keys change places — `[{ createdAt }, { updatedAt }]` — " +
      "so a tie between the class she just renamed and the class she just took " +
      "outside is settled by which was MADE later rather than which was EDITED " +
      "later, and she lands in the wrong classroom. The sibling entry above " +
      "plants the deletion; this one plants the reordering, because for a day " +
      "after #730 the deletion was caught and this was not (#736) — both fixture " +
      "pairs shared one `updatedAt`, which lets `createdAt` decide from either " +
      "slot. Presence and direction were pinned; precedence was not",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /most recently EDITED class, not the most recently made/,
    edits: [
      swap(
        "lib/teacher.ts",
        'orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],',
        'orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],'
      ),
    ],
  },

  {
    id: "test/active-class-ownership-scope",
    step: "Test",
    slow: true,
    why:
      "the cookie-less fallback stops being scoped to the signed-in teacher: the " +
      "query that reads her classes drops `where: { teacherId }`, so it reads " +
      "EVERY class in the table and hands back the most recently touched one " +
      "globally — which the caller returns as her active class. On a shared iPad " +
      "that is the crossing #653's cookie-drop exists to prevent, arriving " +
      "through the fallback instead. The two siblings above plant the ORDERING " +
      "(#666, #736); this plants the SCOPE. It exists because that edit was the " +
      "one mutation of this resolver the whole suite could not see (#744): three " +
      "nights of work had pinned which row wins and nothing pinned which rows are " +
      "candidates, so `where: {}` left all 2,177 tests green",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /whose classes the fallback may even consider[\s\S]{0,400}expected 'his' to be 'hers'/,
    edits: [swap("lib/teacher.ts", "    where: { teacherId },\n", "    where: {},\n")],
  },

  {
    id: "test/days-line-on-a-phase-page",
    step: "Test",
    slow: true,
    why:
      "the day's conditions sentence stops being filtered off the journey's " +
      "phase pages, so a teacher meets 'right now it feels like 24 degrees' at " +
      "the threshold and again minutes later mid-lesson — the #270/#671 " +
      "duplicate, re-opened on the surface #672 finally made it visible on. " +
      "This entry exists because that exact deletion was SILENT (#738): the " +
      "guard #733 shipped for it grepped `HybridJourney.tsx` for a substring " +
      "that occurred four times, so removing the one occurrence that mattered " +
      "left the other three and all 1,932 tests green. The rule lives in one " +
      "named function now and the spec renders what it returns",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /keeps it off the phase pages[\s\S]{0,400}expected 1 to be \+0/,
    edits: [
      swap(
        "lib/run/phase-moments.ts",
        '.filter((block) => block.type !== "conditions-line")',
        ""
      ),
    ],
  },

  {
    id: "test/merge-gate-content-labels-emptied",
    step: "Test",
    slow: true,
    why:
      "the merge gate's content-gate label list empties out — `CONTENT_GATE_LABELS = []` " +
      "— so `scripts/merge-pr.mjs` goes back to merging a green PR that closes a " +
      "`johan-gated` ticket. That is #823 itself: #820 was green against #703 and every " +
      "build-shaped gate passed it, which would have answered Johan's question for him " +
      "on the landing that flips public. It is planted as the EMPTY LIST on purpose: an " +
      "emptied rule array reporting green is the exact shape of the register-lint failure " +
      "(#554) this whole harness was built for, and a content gate is the one refusal in " +
      "the script that no build can ever buy back",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence:
      /the content gate > refuses a fully green PR whose closing ticket carries johan-gated[\s\S]{0,400}expected 'merge' to be 'refuse'/,
    edits: [
      swap(
        "scripts/merge-pr.mjs",
        'export const CONTENT_GATE_LABELS = ["johan-gated", "johan-decision"];',
        "export const CONTENT_GATE_LABELS = [];"
      ),
    ],
  },

  {
    id: "test/merge-gate-max-buffer-dropped",
    step: "Test",
    slow: true,
    why:
      "`maxBuffer: GH_MAX_BUFFER` is deleted from the one transport call site in " +
      "`scripts/merge-pr.mjs`. Node caps a child's stdout at 1 MiB and " +
      "KILLS the child on overrun, so without the allowance the merge gate dies with " +
      "`ENOBUFS` before a single check is read — #837, where a PR body " +
      "over the ceiling stopped the gate rather than failing it. #1070 found that " +
      "every test in merge-gate.spec.ts injected its own `api` in place of the real " +
      "call site, so deleting the allowance left all 139 of them green: the constant " +
      "being CORRECT and the constant being USED are different claims. #1141 added " +
      "the test that drives the real call site through a fake transport; this entry " +
      "is what keeps that test awake, because a regression test with nothing watching " +
      "it is the #554 shape one level down. nc#1205 replaced `gh` with a REST child, " +
      "so the fake is now a helper script named by `NC_MERGE_API_HELPER` rather than " +
      "a fake `gh` first on PATH — the same seam, named instead of implicit. " +
      "nc#1261 collapsed the gate's private spawn into `ghApiSync`, so the allowance " +
      "now has ONE home and this edit deletes it there. That is why the file below " +
      "is `github-api.mjs` and not `merge-pr.mjs`: pinning the gate's own copy is " +
      "what this entry did while there were two copies, and a mutation aimed at a " +
      "copy that no longer exists is a guard that has quietly stopped guarding. " +
      "The blast radius grew with the move — the same deletion now also strips the " +
      "three sweeps that call the transport",
    run: ["npm", "test", "--silent"],
    expect: "red",
    // Pinned on the failing test's own name AND on BOTH halves of the stack:
    // the throw now happens in `ghApiSync` and is reached from the merge gate,
    // which is the claim this entry exists to make since nc#1261 — the gate
    // goes through the shared transport rather than a copy of it.
    //
    // The gaps are MEASURED against a real mutated run, not guessed. In that
    // run the offsets after the test name were 10, 67 and 220 characters; the
    // old bound of 200 between ENOBUFS and `merge-pr.mjs` no longer reaches,
    // because vitest prints the code frame of the throwing file in between.
    // A pattern that does not reach is a permanent false failure, which is the
    // trap this comment has warned about once already.
    evidence:
      /reads a pull request whose body is over 1 MiB through the unmocked call site[\s\S]{0,400}ENOBUFS[\s\S]{0,400}scripts\/github-api\.mjs[\s\S]{0,600}scripts\/merge-pr\.mjs/,
    edits: [
      // Deletes the allowance from the SPAWN, not from the destructure: drop
      // the binding instead and `maxBuffer` becomes an unresolved identifier,
      // so the run dies of a ReferenceError before a pipe is ever opened and
      // the evidence below — which is about a real 1 MiB ceiling — never
      // matches. Same shape as the edit this replaced, one file down.
      swap(
        "scripts/github-api.mjs",
        `execFileSync(process.execPath, [helperPath], {
      encoding: "utf8",
      maxBuffer,`,
        `execFileSync(process.execPath, [helperPath], {
      encoding: "utf8",`
      ),
    ],
  },

  {
    id: "test/observation-platform-link-on-a-child-sheet",
    step: "Test",
    slow: true,
    why:
      "the printed cast cards — the sheet whose own header describes a child " +
      "holding it — grow a link inviting whoever holds it to post an " +
      "observation to iNaturalist. #758: a class of children observing is Seek's " +
      "audience, not iNaturalist's, and the audit that settled that " +
      "(docs/observation-tools-audit-2026-08-31.md) found the product naming no " +
      "observation app anywhere. An empty allowlist is the easiest kind of check " +
      "to ship broken, so the red is planted rather than described",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /app\/print\/CastCards\.tsx carries an undeclared observation-platform link[\s\S]{0,200}\(participation\)/,
    edits: [
      append(
        "app/print/CastCards.tsx",
        '\nexport const MUTATION_PROBE_LINK = "https://www.inaturalist.org/observations/new";\n'
      ),
    ],
  },
  {
    id: "test/observation-tool-recommendation-flipped",
    step: "Test",
    slow: true,
    why:
      "the house position quietly changes its mind and sends a class of children " +
      "to iNaturalist proper. The position is one line of code precisely so that " +
      "reversing it cannot be a wording change nobody reviewed (#758)",
    run: ["npm", "test", "--silent"],
    expect: "red",
    evidence: /sends children to Seek and an adult observer to iNaturalist/,
    edits: [
      swap(
        "lib/observation-tools.ts",
        'return audience === "children-observing" ? SEEK : INATURALIST;',
        'return audience === "children-observing" ? INATURALIST : SEEK;'
      ),
    ],
  },

  // ── Build ─────────────────────────────────────────────────────────────────
  {
    id: "build/page-fails-to-render",
    step: "Build",
    slow: true,
    why:
      "a page throws while it is being prerendered. This is the assertion " +
      "`next build` adds over tsc: that the routes actually render, not merely " +
      "that they typecheck",
    run: ["npx", "next", "build"],
    expect: "red",
    evidence: /mutation probe: this page cannot render/,
    mutate(cwd) {
      const file = join(cwd, "app", "welcome", "page.tsx");
      const before = readFileSync(file, "utf8");
      writeFileSync(
        file,
        'throw new Error("mutation probe: this page cannot render");\n' + before
      );
      return () => writeFileSync(file, before);
    },
  },

  // ── E2E reset lint ────────────────────────────────────────────────────────
  //
  // The three ways nc#951's reset can be undone without anything looking wrong.
  // Each is a one-line diff that reads like tidying up, and each leaves a suite
  // that passes exactly as loudly as it did while it was protected.
  {
    id: "e2e-reset/spec-takes-test-from-playwright",
    step: "E2E reset lint",
    why:
      "a spec goes back to `import { test, expect } from \"@playwright/test\"` — " +
      "the line every Playwright example opens with and the one an editor's " +
      "auto-import writes. It compiles, it runs, it passes; it just never gets " +
      "the database reset, so its CI retry re-runs over the failed attempt's rows",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /journey-phase-rail\.spec\.ts imports from "@playwright\/test" directly/,
    edits: [
      swap("tests/e2e/journey-phase-rail.spec.ts", 'from "./fixtures";', 'from "@playwright/test";'),
    ],
  },
  {
    id: "e2e-reset/fixture-stops-calling-the-sweep",
    step: "E2E reset lint",
    why:
      "the auto fixture keeps its name, its comment and its `auto: true`, and " +
      "stops calling resetE2EState. Every spec still imports the fixture, the " +
      "fixture still runs, and it now resets nothing — nc#554's shape exactly: " +
      "the protection is gone and the green is unchanged",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /no longer CALLS resetE2EState/,
    edits: [
      swap(
        "tests/e2e/fixtures.ts",
        "const { found, deleted, spared } = await resetE2EState(\n        resetDb,\n        testInfo.parallelIndex\n      );",
        "const { found, deleted, spared } = { found: { users: 0, verifications: 0 }, deleted: { users: 0, verifications: 0 }, spared: { verifications: 0 } };"
      ),
    ],
  },
  {
    id: "e2e-reset/fixture-stops-being-automatic",
    step: "E2E reset lint",
    why:
      "`auto: true` is dropped from the reset fixture. Playwright only builds a " +
      "fixture something asks for, and no spec asks for this one by name, so the " +
      "sweep silently never runs again",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /declares no `auto: true` fixture/,
    edits: [swap("tests/e2e/fixtures.ts", "{ auto: true }", "{ auto: false }")],
  },
  {
    id: "e2e-reset/seed-drops-the-worker-slot",
    step: "E2E reset lint",
    why:
      "seed.ts goes back to a globally-shaped `pw-e2e-<uuid>` address. The sweep " +
      "is by predicate, so an address with no worker slot in it is a row EVERY " +
      "worker's sweep matches — and raising `workers` above 1 in " +
      "playwright.config.ts, the obvious way to speed up a 33-test suite, then " +
      "deletes a concurrently running sibling's teacher mid-test and cascades " +
      "away its class, session and grounds (nc#978). It would look like flakiness",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /does not derive its address from `e2eEmailPrefix/,
    edits: [
      swap(
        "tests/e2e/seed.ts",
        "`${e2eEmailPrefix(test.info().parallelIndex)}${randomUUID()}@example.test`",
        "`pw-e2e-${randomUUID()}@example.test`"
      ),
    ],
  },
  {
    id: "e2e-reset/fixture-sweeps-every-worker",
    step: "E2E reset lint",
    why:
      "the other half of the same pair: the fixture stops passing the running " +
      "test's `parallelIndex` and hardcodes a slot, so every worker sweeps slot " +
      "0's predicate. The addresses still carry a slot and the sweep no longer " +
      "reads it, which is the every-worker delete of nc#978 arriving from the " +
      "other direction — and, for every worker but the first, a reset that " +
      "resets nothing at all",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /does not pass the running test's `parallelIndex`/,
    edits: [
      swap(
        "tests/e2e/fixtures.ts",
        "await resetE2EState(\n        resetDb,\n        testInfo.parallelIndex\n      )",
        "await resetE2EState(resetDb, 0)"
      ),
    ],
  },
  {
    id: "e2e-reset/run-sweep-not-wired",
    step: "E2E reset lint",
    why:
      "playwright.config.ts drops its `globalSetup` line. It reads as tidying a " +
      "config, every test still passes, and the ONLY sweep that can reach a " +
      "parallel slot this run never enters is gone — so whatever a " +
      "`--workers=4` run abandoned in slots 1-3 stays in the database for " +
      "good, along with its cascaded class, session, grounds and completions " +
      "(nc#982). The per-attempt sweep cannot cover it: being slot-scoped is " +
      "the thing that makes it parallel-safe",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /does not declare `globalSetup/,
    edits: [
      swap(
        "playwright.config.ts",
        '  globalSetup: "./tests/e2e/global-setup.ts",\n',
        ""
      ),
    ],
  },
  {
    id: "e2e-reset/run-sweep-stops-sweeping",
    step: "E2E reset lint",
    why:
      "the other half of the same pair: global-setup.ts keeps its name, its " +
      "export and its wiring in the config, and stops calling the family-wide " +
      "sweep. Playwright still runs the hook, so nothing looks missing — it " +
      "just sweeps nothing, which is nc#554's shape landing on nc#982's fix",
    run: ["node", "scripts/e2e-reset-lint.mjs"],
    expect: "red",
    evidence: /no longer CALLS sweepAllE2EState/,
    edits: [
      swap(
        "tests/e2e/global-setup.ts",
        "const { found, deleted, spared } = await sweepAllE2EState(db);",
        "const { found, deleted, spared } = { found: { users: 0, verifications: 0 }, deleted: { users: 0, verifications: 0 }, spared: { verifications: 0 } };"
      ),
    ],
  },

  // ── End-to-end tests ──────────────────────────────────────────────────────
  {
    id: "e2e/celebration-regrows-a-claim",
    step: "End-to-end tests",
    slow: true,
    why:
      "the hybrid journey's celebration goes back to saying 'Beautifully done.' — " +
      "the legacy verdict nc#458 removed from every surface, a claim about what " +
      "thirty children did outdoors that the app has no way to know — instead of " +
      "naming the lesson. Nothing that reads files can see this: it is a rendered " +
      "heading at the end of a five-click walk, so the suite that opens the page " +
      "is the only thing positioned to catch it",
    // Needs DATABASE_URL, AUTH_SECRET and BETTER_AUTH_URL=http://localhost:3512
    // (#584) — the same env ci.yml's build job already exports for every step.
    // `next build` is in the command rather than assumed because the mutation
    // changes APP code: baseline and mutated legs each need their own build, and
    // playwright.config.ts's webServer only ever runs `next start`. Two builds is
    // what makes this the slowest entry here, and why it is `slow: true`.
    run: ["bash", "-c", "npx next build && npx playwright test"],
    expect: "red",
    evidence: /Counting life is done\./,
    edits: [swap("app/run/HybridJourney.tsx", "{session.title} is done.", "Beautifully done.")],
  },

  // ── Migration order lint ──────────────────────────────────────────────────
  //
  // These three are the only mutations here whose real-world consequence was
  // measured against a live Postgres rather than argued: renaming
  // `z_shared_grounds` on a database that already had all fifteen applied
  // produced P3018 (`relation "grounds" already exists`), and then P3009 on the
  // next deploy even after the rename was undone. See the header of
  // scripts/migration-order-lint.mjs.
  {
    id: "migration-order/renamed-applied-migration",
    step: "Migration order lint",
    why:
      "`z_shared_grounds` is renamed to the number it 'should' have had — the " +
      "obvious, wrong fix for #892. Prisma matches _prisma_migrations rows by " +
      "directory name, so the new name is a migration it has never seen: it " +
      "re-runs CREATE TABLE \"grounds\" against a schema that has it (P3018), " +
      "records the failure, and blocks every deploy after it (P3009) including " +
      "the one that puts the name back. Nothing else in CI can see this — the " +
      "fixture database is empty, so `prisma migrate deploy` there is perfectly " +
      "happy with any name",
    run: ["npm", "run", "lint:migration-order", "--silent"],
    expect: "red",
    evidence: /recorded-but-missing\] z_shared_grounds/,
    mutate(cwd) {
      const from = join(cwd, "prisma", "migrations", "z_shared_grounds");
      const to = join(cwd, "prisma", "migrations", "12_shared_grounds");
      renameSync(from, to);
      return () => renameSync(to, from);
    },
  },
  {
    id: "migration-order/new-migration-sorts-mid-history",
    step: "Migration order lint",
    why:
      "a new migration lands under Prisma's OWN default name, `prisma migrate " +
      "dev`'s `YYYYMMDDHHMMSS_name`. Measured: it applies EIGHTH of eighteen, " +
      "between `2_reflection` and `3_completion_idempotency`, while production " +
      "applies it last because the other fifteen are already recorded. Same " +
      "migrations, two orders — and this is the mutation most likely to be " +
      "waved through, because the name looks exactly like what Prisma tells you " +
      "to use",
    run: ["npm", "run", "lint:migration-order", "--silent"],
    expect: "red",
    evidence: /\[scheme\] 20260904090000_add_grounds_note/,
    mutate(cwd) {
      const dir = join(cwd, "prisma", "migrations", "20260904090000_add_grounds_note");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "migration.sql"), 'ALTER TABLE "grounds" ADD COLUMN "note" text;\n');
      return () => rmSync(dir, { recursive: true, force: true });
    },
  },
  {
    id: "migration-order/edited-applied-migration",
    step: "Migration order lint",
    why:
      "SQL is appended to a migration that has already run in production. The " +
      "ledger's sha256 is the same value Prisma stores in " +
      "_prisma_migrations.checksum, so production answers this with 'was " +
      "modified after it was applied' — while a fresh database happily runs the " +
      "new statement, which is how the two diverge without anybody editing the " +
      "schema on purpose",
    run: ["npm", "run", "lint:migration-order", "--silent"],
    expect: "red",
    evidence: /content-changed\] z_shared_grounds/,
    edits: [
      append(
        "prisma/migrations/z_shared_grounds/migration.sql",
        '\nALTER TABLE "grounds" ADD COLUMN "mutation_probe" text;\n'
      ),
    ],
  },
  {
    id: "migration-order/grandfather-list-grown",
    step: "Migration order lint",
    why:
      "a badly named migration is waved through by ONE LINE — `legacy: true` on " +
      "its ledger entry. That flag is the whole exemption from the naming " +
      "scheme, and until FROZEN_LEGACY existed the check asserted nothing about " +
      "who was allowed to carry it while its own comment claimed the list 'may " +
      "not grow'. A guard whose prose promises more than it checks is nc#554 " +
      "with a different filename",
    run: ["npm", "run", "lint:migration-order", "--silent"],
    expect: "red",
    evidence: /legacy-grew\] 13_next_number/,
    edits: [
      swap(
        "scripts/migration-order-lint.mjs",
        '  { name: "z_shared_grounds", sha256: "ab93f76fa1b69afeffe5aaf2088cf2bda3a97461972c44c77263962ec794a7fe", legacy: true },\n' +
          '  { name: "zz_20260904174500_optional_completion_headcount", sha256: "aa1fc8a82711f8469481437a2d5fa7ad067fbc703ec94f2de990f2b543161181" },',
        '  { name: "z_shared_grounds", sha256: "ab93f76fa1b69afeffe5aaf2088cf2bda3a97461972c44c77263962ec794a7fe", legacy: true },\n' +
          '  { name: "13_next_number", sha256: "0000000000000000000000000000000000000000000000000000000000000000", legacy: true },\n' +
          '  { name: "zz_20260904174500_optional_completion_headcount", sha256: "aa1fc8a82711f8469481437a2d5fa7ad067fbc703ec94f2de990f2b543161181" },'
      ),
    ],
  },

  // ── Action/refresh lint ───────────────────────────────────────────────────
  {
    id: "action-refresh-lint/pairs-action-with-refresh",
    step: "Action/refresh lint",
    why:
      "the nc#1286 shape put back: the grounds save calls a server action and " +
      "then asks the router for the same tree again, which dropped 11 updates " +
      "in 100 hydrated clicks with the write committed every time",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    // The whole shape, binding included. An earlier version of this mutation
    // planted the call alone, which is not code anybody could write — and
    // once the lint learned to read the `useRouter()` binding rather than the
    // word `router`, a mutation planting an undefined variable stopped being
    // a violation of anything and went green. A mutation has to plant the
    // real thing or it proves the guard against a strawman.
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            await setWorld({ classId: props.classId, ...next });\n            setSaved(true);",
        "            await setWorld({ classId: props.classId, ...next });\n            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/renamed-router-binding",
    step: "Action/refresh lint",
    why:
      "the same pairing with the router bound to any other name. Codex's " +
      "review of #1289 found the first version matching the literal " +
      "`router.refresh(`, which would have reported success over " +
      "`const navigation = useRouter()` — ordinary Next code, and invisible " +
      "here because every binding in this repo happens to be called `router`",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const navigation = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            navigation.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/type-annotated-router-binding",
    step: "Action/refresh lint",
    why:
      "the same pairing behind a type annotation. Codex's second round on " +
      "#1289 reproduced the binding-reading version exiting zero over " +
      "`const router: ReturnType<typeof useRouter> = useRouter()`, which is " +
      "ordinary TypeScript",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router: ReturnType<typeof useRouter> = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/destructured-router-refresh",
    step: "Action/refresh lint",
    why:
      "the same pairing with no member expression to match at all. Nobody " +
      "reported this one: it was found by sweeping the class behind Codex's " +
      "annotation finding, and it is why this guard stopped trying to " +
      "recognise the binding",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const { refresh } = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/aliased-destructured-refresh",
    step: "Action/refresh lint",
    why:
      "the same pairing with the property renamed on the way out: " +
      "`const { refresh: refreshPage } = useRouter()` leaves no property name " +
      "in the call at all. Codex's third round on #1289 reproduced the " +
      "text-matching version exiting zero over it, and it is why this guard " +
      "parses the module instead of reading its spelling",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const { refresh: refreshPage } = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            refreshPage();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/aliased-hook-import",
    step: "Action/refresh lint",
    why:
      "the hook renamed on the way IN: `import { useRouter as useNavigation }` " +
      "is ordinary, and Codex's fourth round on #1289 found the parser " +
      "version still requiring the callee to be spelled useRouter. The local " +
      "binding is read from the import now",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter as useNavigation } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useNavigation();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/helper-above-its-declaration",
    step: "Action/refresh lint",
    why:
      "the pairing in a helper written ABOVE the declaration it closes over. " +
      "A function body does not run where it is written, so this is ordinary " +
      "code; the guard's fourth version bound in source order, reached the " +
      "helper while the name held nothing, and passed a module that drops " +
      "updates. It is the fifth round's finding on #1289 and the one nc#1291 " +
      "was opened to fix",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        "  function refreshPage() {\n    router.refresh();\n  }\n" +
          '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            refreshPage();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/shadowed-name-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: a module can hold a " +
      "real router it never refreshes while a NESTED parameter of the same " +
      "name refreshes something else entirely. Codex's fourth round showed " +
      "the flat name set failing exactly that correct code, and a guard that " +
      "cries wolf gets switched off. Scopes are tracked now, and this holds it",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            [props].forEach((router: { refresh: () => void }) => router.refresh());"
      ),
    ],
  },
  {
    id: "action-refresh-lint/type-only-action-import-stays-green",
    step: "Action/refresh lint",
    why:
      "a second pinned blind spot, same reason: `import { type X } from` an " +
      "action module is erased before anything runs, so a client using one " +
      "beside a measured-clean refresh-after-fetch must not be failed for it. " +
      "The clause-level isTypeOnly flag does not cover the inline form, which " +
      "is what Codex's fourth round named",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { setWorld } from "@/app/start/actions";',
        'import { type SetWorldShape } from "@/app/start/actions";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/router-push-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT rather than blind: " +
      "navigating after a write is an ordinary, measured-clean thing to do, " +
      "and a client module holding both a router and an action is only a " +
      "defect when it refreshes. The version before this one over-caught on " +
      "purpose and would have failed here; parsing the call made the trade " +
      "unnecessary, and this holds the guard to it",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        '            setSaved(true);\n            router.push("/world");'
      ),
    ],
  },
  {
    id: "action-refresh-lint/refresh-after-fetch-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot, and the correct one: /journal's reflection saves " +
      "with fetch() and then refreshes, which measured 30/30 clean. The rule " +
      "is the pairing with a server action, not the call, so planting a second " +
      "refresh in a module that imports no action must stay green",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/journal/EntryReflection.tsx",
        "      setSaved(next);\n      setState(\"closed\");",
        "      setSaved(next);\n      setState(\"closed\");\n      router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/element-access-refresh",
    step: "Action/refresh lint",
    why:
      "the same call with no dot in it. `router[\"refresh\"]()` is ordinary " +
      "TypeScript and invokes the same method; the guard read only a property " +
      "access, which is a spelling hole of exactly the kind its header is " +
      "about. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        '            setSaved(true);\n            router["refresh"]();'
      ),
    ],
  },
  {
    id: "action-refresh-lint/switch-clause-shadow-does-not-hide-it",
    step: "Action/refresh lint",
    why:
      "a `case` clause declaring its own `router` must not hide the component's " +
      "real one. A switch body is a single scope the language closes at the " +
      "brace; hoisting a clause's declarations into the ENCLOSING scope left " +
      "the shadow standing over the router and lost the refresh after it. " +
      "Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n' +
          "  switch (props.classId) {\n" +
          // No braces on purpose: a clause without a block is where a lexical
          // declaration used to land in the ENCLOSING scope.
          '    case "never":\n' +
          "      const router = { refresh: () => {} };\n" +
          "      void router;\n" +
          "      break;\n" +
          "  }\n" +
          '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/action-through-a-barrel",
    step: "Action/refresh lint",
    why:
      "the action reached through a barrel. `export { setWorld } from " +
      '"./actions"` hands on the same server-action reference while the barrel ' +
      "itself carries no \"use server\", so stopping at the immediate target " +
      "let a client import an action and refresh and pass. Codex found it on " +
      "#1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    mutate(cwd) {
      const barrel = join(cwd, "app", "start", "actions-barrel.ts");
      const form = join(cwd, "app", "world", "WorldForm.tsx");
      const before = readFileSync(form, "utf8");
      const edits = [
        [
          'import { useState, useTransition } from "react";',
          'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";',
        ],
        [
          '  const locale = props.locale ?? "uk";',
          '  const router = useRouter();\n  const locale = props.locale ?? "uk";',
        ],
        ["            setSaved(true);", "            setSaved(true);\n            router.refresh();"],
      ];
      let after = before;
      for (const [from, to] of edits) {
        if (after.split(from).length - 1 !== 1) {
          throw new Error(
            `mutation target is not unique in app/world/WorldForm.tsx: ${JSON.stringify(from.slice(0, 50))}`
          );
        }
        after = after.replace(from, to);
      }
      // The action import this file already carries, re-pointed at a barrel
      // that is not itself a "use server" module.
      const importLine = after.match(/^import \{[^}]*\} from "@\/app\/start\/actions";$/m);
      if (!importLine) {
        throw new Error(
          "app/world/WorldForm.tsx no longer imports from @/app/start/actions on one line. " +
            "Point this mutation at the import it does carry rather than deleting the entry."
        );
      }
      after = after.replace(importLine[0], importLine[0].replace("/actions\"", '/actions-barrel"'));
      writeFileSync(barrel, 'export { setWorld } from "./actions";\n');
      writeFileSync(form, after);
      return () => {
        writeFileSync(form, before);
        rmSync(barrel, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/shadowed-hook-name-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT, one level up from " +
      "the shadowed router below: a module's own parameter named `useRouter` " +
      "can return something else with a `refresh`, and failing it for that " +
      "would be the guard crying wolf. The hook is a scoped binding now",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n" +
          "            [() => ({ refresh: () => {} })].forEach(\n" +
          "              (useRouter: () => { refresh: () => void }) => useRouter().refresh()\n" +
          "            );"
      ),
    ],
  },
  {
    id: "action-refresh-lint/inferred-type-only-import-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: an import with no " +
      "`type` keyword whose binding is used ONLY in a type position is erased " +
      "by TypeScript just the same, so the module holds no runtime action and " +
      "a legitimate refresh-after-fetch beside it must not be failed. Codex " +
      "found the inferred half on #1295; the declared half is the entry below",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/journal/EntryReflection.tsx",
        'import { useState } from "react";',
        'import { useState } from "react";\n' +
          'import { CreateClassInput } from "@/app/start/actions";'
      ),
      swap(
        "app/journal/EntryReflection.tsx",
        "      setSaved(next);\n      setState(\"closed\");",
        "      setSaved(next);\n      setState(\"closed\");\n" +
          "      const unused: CreateClassInput | null = null;\n" +
          "      void unused;"
      ),
    ],
  },
  {
    id: "action-refresh-lint/action-used-only-in-a-class-heritage",
    step: "Action/refresh lint",
    why:
      "an action whose ONLY value use is a class's `extends` expression. " +
      "TypeScript files a base under `ExpressionWithTypeArguments`, which is " +
      "a type node, but the expression inside it runs and keeps the import " +
      "alive; skipping every type node under-counted it and erased a live " +
      "action import. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/journal\/EntryReflection\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/journal/EntryReflection.tsx",
        'import { useState } from "react";',
        'import { useState } from "react";\nimport { setWorld } from "@/app/start/actions";'
      ),
      swap(
        "app/journal/EntryReflection.tsx",
        '"use client";',
        '"use client";\n' +
          "const makeBase = (_seed: unknown) => class {};\n" +
          "class HeritageProbe extends makeBase(setWorld) {}\n" +
          "void HeritageProbe;"
      ),
    ],
  },
  {
    id: "action-refresh-lint/var-in-a-block-reaches-the-function",
    step: "Action/refresh lint",
    why:
      "`var` is function-scoped, not block-scoped. `{ var router = " +
      "useRouter(); }` followed by a refresh outside the block is one binding " +
      "and one router; storing it in the block's map and dropping it at the " +
      "brace lost the pairing. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        "  {\n    var router = useRouter();\n  }\n" + '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/js-specifier-resolves-to-its-source",
    step: "Action/refresh lint",
    why:
      'an action imported as "….js". Under this repository\'s bundler module ' +
      "resolution that specifier resolves to the `.ts` source and stays a " +
      "runtime action import; appending extensions to it looked for " +
      "`actions.js.ts`, found nothing, and let the client pass. Codex found " +
      "it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { setWorld } from "@/app/start/actions";',
        'import { setWorld } from "@/app/start/actions.js";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/action-through-a-two-statement-barrel",
    step: "Action/refresh lint",
    why:
      "the same barrel written in two statements: `import { setWorld } from " +
      '"./actions"; export { setWorld };`. That export carries no module ' +
      "specifier at all, so following only `export … from` missed it while " +
      "clients received the same action. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    mutate(cwd) {
      const barrel = join(cwd, "app", "start", "actions-relay.ts");
      const form = join(cwd, "app", "world", "WorldForm.tsx");
      const before = readFileSync(form, "utf8");
      const edits = [
        [
          'import { setWorld } from "@/app/start/actions";',
          'import { setWorld } from "@/app/start/actions-relay";',
        ],
        [
          'import { useState, useTransition } from "react";',
          'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";',
        ],
        [
          '  const locale = props.locale ?? "uk";',
          '  const router = useRouter();\n  const locale = props.locale ?? "uk";',
        ],
        ["            setSaved(true);", "            setSaved(true);\n            router.refresh();"],
      ];
      let after = before;
      for (const [from, to] of edits) {
        if (after.split(from).length - 1 !== 1) {
          throw new Error(
            `mutation target is not unique in app/world/WorldForm.tsx: ${JSON.stringify(from.slice(0, 50))}`
          );
        }
        after = after.replace(from, to);
      }
      writeFileSync(barrel, 'import { setWorld } from "./actions";\nexport { setWorld };\n');
      writeFileSync(form, after);
      return () => {
        writeFileSync(form, before);
        rmSync(barrel, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/reassigned-router-keeps-its-provenance",
    step: "Action/refresh lint",
    why:
      "a binding given the router and then assigned something else is still " +
      "treated as a router. This entry was a GREEN pin for one round, to stop " +
      "the guard failing a binding genuinely replaced before every use; Codex " +
      "then showed the demotion made the pairing reachable again, because " +
      "`if (x) router = cache;` is a reassignment that may not happen and the " +
      "refresh after it still hits the real router. Merging provenance is what " +
      "review asked for, and the contrived case it costs is worth less than " +
      "the reachable one it buys",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        "  let router: { refresh: () => void } = useRouter();\n" +
          "  router = { refresh: () => {} };\n" +
          '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/router-through-a-local-alias",
    step: "Action/refresh lint",
    why:
      "the router copied to a second name. `const navigation = router;` is the " +
      "same object, and collecting only the binding the hook was assigned to " +
      "left the alias resolving to a different symbol. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        "  const router = useRouter();\n  const navigation = router;\n" +
          '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            navigation.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/action-through-a-namespace-barrel",
    step: "Action/refresh lint",
    why:
      "the action reached as a namespace member through a star barrel. " +
      '`import * as actions from "./barrel"` where the barrel says ' +
      '`export * from "./actions"` resolves the NAMESPACE to the barrel, which ' +
      "carries no \"use server\"; the member has to be resolved instead. Codex " +
      "found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    mutate(cwd) {
      const barrel = join(cwd, "app", "start", "actions-star.ts");
      const form = join(cwd, "app", "world", "WorldForm.tsx");
      const before = readFileSync(form, "utf8");
      const edits = [
        [
          'import { setWorld } from "@/app/start/actions";',
          'import * as actions from "@/app/start/actions-star";',
        ],
        [
          'import { useState, useTransition } from "react";',
          'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";',
        ],
        [
          '  const locale = props.locale ?? "uk";',
          '  const router = useRouter();\n  const setWorld = actions.setWorld;\n' +
            '  const locale = props.locale ?? "uk";',
        ],
        ["            setSaved(true);", "            setSaved(true);\n            router.refresh();"],
      ];
      let after = before;
      for (const [from, to] of edits) {
        if (after.split(from).length - 1 !== 1) {
          throw new Error(
            `mutation target is not unique in app/world/WorldForm.tsx: ${JSON.stringify(from.slice(0, 50))}`
          );
        }
        after = after.replace(from, to);
      }
      writeFileSync(barrel, 'export * from "./actions";\n');
      writeFileSync(form, after);
      return () => {
        writeFileSync(form, before);
        rmSync(barrel, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/late-use-server-string-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: a top-level " +
      '`"use server"` written AFTER the first real statement is an expression ' +
      "statement and makes no action module. Reading every statement rather " +
      "than the prologue classified an ordinary module as one and failed a " +
      "client that imported a plain value from it. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    mutate(cwd) {
      const ordinary = join(cwd, "lib", "late-directive-probe.ts");
      const reflection = join(cwd, "app", "journal", "EntryReflection.tsx");
      const before = readFileSync(reflection, "utf8");
      const from = 'import { useState } from "react";';
      if (before.split(from).length - 1 !== 1) {
        throw new Error("app/journal/EntryReflection.tsx no longer imports useState on one line");
      }
      writeFileSync(
        ordinary,
        'export const ORDINARY = "ordinary";\n"use server";\n'
      );
      writeFileSync(
        reflection,
        before.replace(
          from,
          `${from}\nimport { ORDINARY } from "@/lib/late-directive-probe";\nvoid ORDINARY;`
        )
      );
      return () => {
        writeFileSync(reflection, before);
        rmSync(ordinary, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/unused-namespace-import-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: `import * as " +
      'actions from "./actions"` that is never referenced is erased, so it is ' +
      "not a runtime action reference. Counting the namespace's own binding " +
      "site as a use failed a module for a stale import. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/journal/EntryReflection.tsx",
        'import { useState } from "react";',
        'import { useState } from "react";\nimport * as actions from "@/app/start/actions";'
      ),
    ],
  },
  {
    id: "action-refresh-lint/namespace-member-by-string-key",
    step: "Action/refresh lint",
    why:
      'the action taken off a namespace by a computed key: `actions["save"]`. ' +
      "There is no identifier for the checker to attach a symbol to, so the " +
      "member has to be looked up on the module's own exports; reading only a " +
      "property access left the spelling open. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { setWorld } from "@/app/start/actions";',
        'import * as actions from "@/app/start/actions";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        '  const router = useRouter();\n  const setWorld = actions["setWorld"];\n' +
          '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            router.refresh();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/refresh-through-a-local-alias",
    step: "Action/refresh lint",
    why:
      "the destructured `refresh` copied to a second name: `const { refresh } " +
      "= useRouter(); const reload = refresh; reload();`. Provenance followed " +
      "the router through an alias but not its method. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        "  const { refresh } = useRouter();\n  const reload = refresh;\n" +
          '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            reload();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/aliased-type-only-reexport-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: an action import " +
      "used only by an aliased type-only re-export — `export type { setWorld " +
      "as SaveAction }` — is erased entirely, and the specifier's property " +
      "name still resolves to the import. Counting it failed a module holding " +
      "no runtime action. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/journal/EntryReflection.tsx",
        'import { useState } from "react";',
        'import { useState } from "react";\nimport { setWorld } from "@/app/start/actions";\n' +
          "export type { setWorld as SaveAction };"
      ),
    ],
  },
  {
    id: "action-refresh-lint/javascript-client-module",
    step: "Action/refresh lint",
    why:
      "a client module written as `.jsx`. This repository sets " +
      "`allowJs: false`, so such a file is outside `tsc` entirely while Next " +
      "builds and ships it — the pairing in one would pass the typecheck AND " +
      "a guard that only walked `.ts`/`.tsx`, and reach a teacher. Codex " +
      "found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/pairing-probe\.jsx: calls the router's refresh\(\)/,
    mutate(cwd) {
      const probe = join(cwd, "app", "pairing-probe.jsx");
      writeFileSync(
        probe,
        '"use client";\n' +
          'import { useRouter } from "next/navigation";\n' +
          'import { setWorld } from "@/app/start/actions";\n\n' +
          "export function PairingProbe() {\n" +
          "  const router = useRouter();\n" +
          "  return (\n" +
          "    <button\n" +
          "      onClick={async () => {\n" +
          "        await setWorld({});\n" +
          "        router.refresh();\n" +
          "      }}\n" +
          "    >\n" +
          "      probe\n" +
          "    </button>\n" +
          "  );\n" +
          "}\n"
      );
      return () => rmSync(probe, { force: true });
    },
  },
  {
    id: "action-refresh-lint/helper-above-a-nested-var",
    step: "Action/refresh lint",
    why:
      "the two hardest scope rules at once: a helper written ABOVE the " +
      "declaration it closes over, where that declaration is a `var` inside a " +
      "nested block. Codex raised it twice on #1295 against the hand-built " +
      "scope stack, which walked the body's direct statements and so reached " +
      "the helper before the block installed anything. A symbol has no reading " +
      "order, so this is not a case the guard can get wrong any more",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    edits: [
      swap(
        "app/world/WorldForm.tsx",
        'import { useState, useTransition } from "react";',
        'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        '  const locale = props.locale ?? "uk";',
        "  function refreshPage() {\n    router.refresh();\n  }\n" +
          "  {\n    var router = useRouter();\n  }\n" +
          '  const locale = props.locale ?? "uk";'
      ),
      swap(
        "app/world/WorldForm.tsx",
        "            setSaved(true);",
        "            setSaved(true);\n            refreshPage();"
      ),
    ],
  },
  {
    id: "action-refresh-lint/hook-through-a-local-barrel",
    step: "Action/refresh lint",
    why:
      "the HOOK reached through a re-export. A client that does `import " +
      '{ useRouter } from "@/lib/nav"`, where that file says `export ' +
      '{ useRouter } from "next/navigation"`, holds the real router; asking ' +
      "whether the specifier was literally next/navigation saw no hook at all " +
      "and returned before reading the file. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    mutate(cwd) {
      const barrel = join(cwd, "lib", "nav-relay.ts");
      const form = join(cwd, "app", "world", "WorldForm.tsx");
      const before = readFileSync(form, "utf8");
      const edits = [
        [
          'import { useState, useTransition } from "react";',
          'import { useState, useTransition } from "react";\nimport { useRouter } from "@/lib/nav-relay";',
        ],
        [
          '  const locale = props.locale ?? "uk";',
          '  const router = useRouter();\n  const locale = props.locale ?? "uk";',
        ],
        ["            setSaved(true);", "            setSaved(true);\n            router.refresh();"],
      ];
      let after = before;
      for (const [from, to] of edits) {
        if (after.split(from).length - 1 !== 1) {
          throw new Error(
            `mutation target is not unique in app/world/WorldForm.tsx: ${JSON.stringify(from.slice(0, 50))}`
          );
        }
        after = after.replace(from, to);
      }
      writeFileSync(barrel, 'export { useRouter } from "next/navigation";\n');
      writeFileSync(form, after);
      return () => {
        writeFileSync(form, before);
        rmSync(barrel, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/action-default-exported-from-a-barrel",
    step: "Action/refresh lint",
    why:
      "the action handed on as a default. `import { setWorld } from " +
      '"./actions"; export default setWorld;` is an ExportAssignment, not an ' +
      "ExportDeclaration, so a rule that read only the named forms missed it " +
      "entirely. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/WorldForm\.tsx: calls the router's refresh\(\)/,
    mutate(cwd) {
      const barrel = join(cwd, "app", "start", "actions-default.ts");
      const form = join(cwd, "app", "world", "WorldForm.tsx");
      const before = readFileSync(form, "utf8");
      const edits = [
        [
          'import { setWorld } from "@/app/start/actions";',
          'import setWorld from "@/app/start/actions-default";',
        ],
        [
          'import { useState, useTransition } from "react";',
          'import { useState, useTransition } from "react";\nimport { useRouter } from "next/navigation";',
        ],
        [
          '  const locale = props.locale ?? "uk";',
          '  const router = useRouter();\n  const locale = props.locale ?? "uk";',
        ],
        ["            setSaved(true);", "            setSaved(true);\n            router.refresh();"],
      ];
      let after = before;
      for (const [from, to] of edits) {
        if (after.split(from).length - 1 !== 1) {
          throw new Error(
            `mutation target is not unique in app/world/WorldForm.tsx: ${JSON.stringify(from.slice(0, 50))}`
          );
        }
        after = after.replace(from, to);
      }
      writeFileSync(barrel, 'import { setWorld } from "./actions";\nexport default setWorld;\n');
      writeFileSync(form, after);
      return () => {
        writeFileSync(form, before);
        rmSync(barrel, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/mixed-barrel-ordinary-helper-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: a barrel can " +
      "re-export a server action AND ordinary values, and a client that takes " +
      "only an ordinary one holds no action. Asking whether the barrel MODULE " +
      "reached an action failed exactly that client beside its legitimate " +
      "refresh-after-fetch; the binding is carried now. Codex found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    mutate(cwd) {
      const barrel = join(cwd, "app", "start", "actions-mixed.ts");
      const reflection = join(cwd, "app", "journal", "EntryReflection.tsx");
      const before = readFileSync(reflection, "utf8");
      const from = 'import { useState } from "react";';
      if (before.split(from).length - 1 !== 1) {
        throw new Error("app/journal/EntryReflection.tsx no longer imports useState on one line");
      }
      writeFileSync(
        barrel,
        'export { setWorld } from "./actions";\nexport const ORDINARY_HELPER = "ordinary";\n'
      );
      writeFileSync(
        reflection,
        before.replace(
          from,
          `${from}\nimport { ORDINARY_HELPER } from "@/app/start/actions-mixed";\nvoid ORDINARY_HELPER;`
        )
      );
      return () => {
        writeFileSync(reflection, before);
        rmSync(barrel, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/same-spelled-local-stays-green",
    step: "Action/refresh lint",
    why:
      "a pinned blind spot that is the guard being RIGHT: an action import " +
      "used only as a TYPE is erased, and an unrelated local of the same " +
      "spelling does not revive it. Counting identifiers by text rather than " +
      "by symbol failed that correct code beside a refresh-after-fetch. Codex " +
      "found it on #1295",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    edits: [
      swap(
        "app/journal/EntryReflection.tsx",
        'import { useState } from "react";',
        'import { useState } from "react";\nimport { CreateClassInput } from "@/app/start/actions";'
      ),
      swap(
        "app/journal/EntryReflection.tsx",
        "      setSaved(next);\n      setState(\"closed\");",
        "      setSaved(next);\n      setState(\"closed\");\n" +
          "      const typeOnly: CreateClassInput | null = null;\n" +
          "      void typeOnly;\n" +
          "      const shadow = (CreateClassInput: string) => CreateClassInput;\n" +
          '      void shadow("not the import");'
      ),
    ],
  },
  {
    id: "action-refresh-lint/pairing-in-a-client-reachable-helper",
    step: "Action/refresh lint",
    why:
      "the pairing one import away, in a helper that declares no " +
      '"use client" of its own. Next ships it to the browser anyway — a ' +
      "client entry imports it — so it drops updates exactly as #1286 " +
      "measured, while a guard judging only the files that CARRY the " +
      "directive reported green over it. Codex split it out of #1295 as " +
      "nc#1296",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "red",
    evidence: /app\/world\/useSave\.ts: calls the router's refresh\(\)/,
    mutate(cwd) {
      const helper = join(cwd, "app", "world", "useSave.ts");
      writeFileSync(helper, pairingHelperSource("@/app/start/actions", "setWorld", "useSave"));
      const restore = applyEdits(cwd, [
        swap(
          "app/world/WorldForm.tsx",
          'import { setWorld } from "@/app/start/actions";',
          'import { setWorld } from "@/app/start/actions";\nimport { useSave } from "./useSave";'
        ),
        swap(
          "app/world/WorldForm.tsx",
          '  const locale = props.locale ?? "uk";',
          "  const save = useSave(props.classId);\n  void save;\n" +
            '  const locale = props.locale ?? "uk";'
        ),
      ]);
      return () => {
        restore();
        rmSync(helper, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/server-only-helper-stays-green",
    step: "Action/refresh lint",
    why:
      "the other side of the rule above, and the reason it is reachability " +
      "rather than a wider file list: the same helper, imported only by a " +
      "SERVER component, never reaches a browser and cannot drop an update " +
      "there. Judging every file that pairs the two would fail this, which " +
      "is the guard crying wolf over code that is correct",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    mutate(cwd) {
      const helper = join(cwd, "app", "world", "useSave.ts");
      writeFileSync(helper, pairingHelperSource("@/app/start/actions", "setWorld", "useSave"));
      const restore = applyEdits(cwd, [
        swap(
          "app/world/page.tsx",
          'import { WorldForm } from "./WorldForm";',
          'import { WorldForm } from "./WorldForm";\nimport { useSave } from "./useSave";'
        ),
        swap(
          "app/world/page.tsx",
          "  const teacher = await getTeacher();",
          "  void useSave;\n  const teacher = await getTeacher();"
        ),
      ]);
      return () => {
        restore();
        rmSync(helper, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/helper-behind-an-action-stays-green",
    step: "Action/refresh lint",
    why:
      "where the walk STOPS, pinned. A client entry imports an action " +
      "module, so the walk arrives there — and Next keeps that module on the " +
      "server and hands the client a reference, so what the action itself " +
      "imports is server code. Following through it would drag the database " +
      "and the session into the client set and fail this helper for running " +
      "where a router does not exist",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    mutate(cwd) {
      const helper = join(cwd, "app", "world", "save-helper.ts");
      writeFileSync(helper, pairingHelperSource("@/app/classes/actions", "createClass", "savePairing"));
      const restore = applyEdits(cwd, [
        swap(
          "app/start/actions.ts",
          'import { revalidatePath } from "next/cache";',
          'import { revalidatePath } from "next/cache";\nimport { savePairing } from "@/app/world/save-helper";'
        ),
        swap(
          "app/start/actions.ts",
          'import { TRY_PLACE_COOKIE } from "@/lib/try-place";',
          'import { TRY_PLACE_COOKIE } from "@/lib/try-place";\n\nvoid savePairing;'
        ),
      ]);
      return () => {
        restore();
        rmSync(helper, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/type-only-import-does-not-ship-the-helper",
    step: "Action/refresh lint",
    why:
      "`import { type SaveShape }` sets no flag on the import CLAUSE, so " +
      "reading only `importClause.isTypeOnly` counted an erased import as a " +
      "way into the client bundle. TypeScript elides the whole statement, the " +
      "helper never reaches a browser, and failing it would be the guard " +
      "inventing a violation in server-only code. Codex found it on #1323",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    mutate(cwd) {
      const helper = join(cwd, "app", "world", "useSave.ts");
      writeFileSync(helper, pairingHelperSource("@/app/start/actions", "setWorld", "useSave"));
      const restore = applyEdits(cwd, [
        swap(
          "app/world/WorldForm.tsx",
          'import { setWorld } from "@/app/start/actions";',
          'import { setWorld } from "@/app/start/actions";\nimport { type useSaveShape } from "./useSave";'
        ),
        swap(
          "app/world/WorldForm.tsx",
          '  const locale = props.locale ?? "uk";',
          "  const shape: useSaveShape | null = null;\n  void shape;\n" +
            '  const locale = props.locale ?? "uk";'
        ),
      ]);
      return () => {
        restore();
        rmSync(helper, { force: true });
      };
    },
  },
  {
    id: "action-refresh-lint/inferred-type-only-import-does-not-ship-the-helper",
    step: "Action/refresh lint",
    why:
      "the same erasure with no `type` keyword anywhere: an ordinary binding " +
      "used only in a type position is elided with its import, so nothing " +
      "structural marks it. The sibling above is the spelling; this is the " +
      "one no flag can answer, and the reason the check asks which symbols " +
      "are used somewhere that RUNS",
    run: ["npm", "run", "lint:action-refresh", "--silent"],
    expect: "green",
    mutate(cwd) {
      const helper = join(cwd, "app", "world", "useSave.ts");
      writeFileSync(helper, pairingHelperSource("@/app/start/actions", "setWorld", "useSave"));
      const restore = applyEdits(cwd, [
        swap(
          "app/world/WorldForm.tsx",
          'import { setWorld } from "@/app/start/actions";',
          'import { setWorld } from "@/app/start/actions";\nimport { useSaveShape } from "./useSave";'
        ),
        swap(
          "app/world/WorldForm.tsx",
          '  const locale = props.locale ?? "uk";',
          "  const shape: useSaveShape | null = null;\n  void shape;\n" +
            '  const locale = props.locale ?? "uk";'
        ),
      ]);
      return () => {
        restore();
        rmSync(helper, { force: true });
      };
    },
  },
];

/**
 * The nc#1286 pairing in a module with NO directive of its own: a router
 * refresh on top of a server action's own answer. Planted by three mutations
 * above, which differ only in who imports it — a client entry, a server
 * component, or an action module — because that is the whole question nc#1296
 * asks.
 */
function pairingHelperSource(actionSpecifier, actionName, exportName) {
  return (
    `import { useRouter } from "next/navigation";\n` +
    `import { ${actionName} } from "${actionSpecifier}";\n` +
    `\n` +
    `/** Planted by scripts/guard-mutation-check.mjs; no "use client" of its own. */\n` +
    `export type ${exportName}Shape = { classId: string };\n` +
    `export function ${exportName}(classId: string) {\n` +
    `  const router = useRouter();\n` +
    `  return async (formData: FormData) => {\n` +
    `    void classId;\n` +
    `    await ${actionName}(formData);\n` +
    `    router.refresh();\n` +
    `  };\n` +
    `}\n`
  );
}


// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function readlinkOrNull(path) {
  try {
    return readlinkSync(path);
  } catch {
    return null;
  }
}

/** The first prompt file the registry names, resolved inside `cwd`. */
function firstPromptFile(cwd) {
  const [entry] = Object.values(PROMPT_FILES);
  if (!entry) throw new Error("lib/ai/prompt-registry.ts names no prompts");
  return join(cwd, "prompts", entry);
}

/**
 * The first prompt the registry names on the wanted side of the eval split
 * (#1213): `measured` picks one with an adapter, `!measured` one without.
 *
 * Derived from the real ADAPTERS map, so writing an adapter moves a prompt from
 * one mutation's subject to the other's with no bookkeeping here — and when a
 * side empties out, this throws rather than letting the entry quietly stop
 * proving anything.
 */
export function firstPromptFileWhere(cwd, measured) {
  for (const [id, file] of Object.entries(PROMPT_FILES)) {
    if (Boolean(EVAL_ADAPTERS[id]) === measured) return join(cwd, "prompts", file);
  }
  throw new Error(
    `no prompt ${measured ? "with" : "without"} an eval adapter in lib/ai/prompt-registry.ts. ` +
      `If every prompt now has one, delete the mutation that needs this rather than weakening ` +
      `the check.`
  );
}

const firstUnmeasuredPromptFile = (cwd) => firstPromptFileWhere(cwd, false);
const firstMeasuredPromptFile = (cwd) => firstPromptFileWhere(cwd, true);

/**
 * A throwaway copy of the tree. Everything the guards read is copied for real;
 * `public/` (45MB of audio no guard opens) and `node_modules` are linked.
 *
 * node_modules is a FARM of per-package symlinks rather than one symlink to the
 * directory, for two reasons: a mutation can replace a single package without
 * touching the shared install five workers are using, and anything a build
 * writes into node_modules lands in the sandbox instead of the real tree.
 */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "nc-guard-mutation-"));
  const skip = new Set(["node_modules", ".git", ".next", "public", ".turbo"]);
  for (const entry of readdirSync(ROOT)) {
    if (skip.has(entry)) continue;
    cpSync(join(ROOT, entry), join(dir, entry), { recursive: true, dereference: false });
  }
  if (existsSync(join(ROOT, "public"))) symlinkSync(join(ROOT, "public"), join(dir, "public"));

  const realModules = resolve(join(ROOT, "node_modules"));
  mkdirSync(join(dir, "node_modules"));
  for (const entry of readdirSync(realModules)) {
    if (entry === ".cache") continue;
    symlinkSync(join(realModules, entry), join(dir, "node_modules", entry));
  }
  return dir;
}

/** Apply declarative edits, returning a restore function. */
/**
 * Plant a mutation's edits and hand back the undo.
 *
 * The undo keeps the FIRST content seen for each path, not every content
 * (nc#1291). Most mutations here edit one file two or three times — an import,
 * a declaration, a call — and a snapshot per EDIT restored in order wrote the
 * original back and then wrote the intermediate states on top of it, so every
 * edit but the last survived into the next mutation's tree. Nothing reported
 * it: the leaked half of an action/refresh mutation is an import and a
 * declaration, which no guard minds on its own, and the baseline that would
 * have caught a dirty tree is computed once per command and cached. It
 * surfaced only when a mutation whose leak was a CALL went in and the next
 * recorded blind spot turned red on the residue rather than on its own
 * subject.
 *
 * A map by path cannot be got wrong by ordering, which a reversed loop over
 * the same list could be.
 */
function applyEdits(cwd, edits) {
  const snapshots = new Map();
  for (const edit of edits) {
    const path = join(cwd, edit.file);
    const before = readFileSync(path, "utf8");
    if (!snapshots.has(path)) snapshots.set(path, before);
    if (edit.appendText !== undefined) {
      writeFileSync(path, before + edit.appendText);
    } else if (edit.editJson) {
      const value = JSON.parse(before);
      edit.editJson(value);
      writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
    } else {
      const count = before.split(edit.from).length - 1;
      if (count !== 1) {
        throw new Error(
          `mutation target is not unique in ${edit.file}: ${count} occurrence(s) of ` +
            `${JSON.stringify(edit.from.slice(0, 60))}. A mutation that cannot find its ` +
            `subject proves nothing; fix the mutation, do not weaken the guard.`
        );
      }
      writeFileSync(path, before.replace(edit.from, edit.to));
    }
  }
  return () => {
    for (const [path, before] of snapshots) writeFileSync(path, before);
  };
}

function runGuard(argv, cwd) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// ---------------------------------------------------------------------------
// Ratchet 1: every CI step is accounted for
// ---------------------------------------------------------------------------

export function ciStepNames() {
  const path = join(ROOT, ".github/workflows/ci.yml");
  const names = [...readFileSync(path, "utf8").matchAll(/^ {6}- name: (.+)$/gm)].map((m) =>
    m[1].trim()
  );
  if (names.length < 5) {
    throw new Error(
      `Read ${names.length} step name(s) out of .github/workflows/ci.yml. That is not ` +
        `credible, so the coverage ratchet cannot be trusted — this check refuses to ` +
        `report green off a parse that found nothing. Fix the pattern in ciStepNames().`
    );
  }
  return names;
}

// ---------------------------------------------------------------------------
// Ratchet 3: every register-lint shape rule is proved, not just the step
// ---------------------------------------------------------------------------

/**
 * Ratchet 1 asks whether a CI STEP is proved. That is one notch too coarse for
 * `register-lint`, which is not one guard but a list of them: `SHAPE_RULES` can
 * grow a rule, or lose one, without the step's name changing at all. #1142
 * added `stale-session-reference` with unit coverage and no fixture here, and
 * nothing noticed — the step was already covered by its four siblings, so the
 * harness reported a tidy green over a rule it had never once made bite
 * (#1146). That is the register-lint failure (#554) reproduced one level down.
 *
 * So the coverage question is asked per RULE: every id in `SHAPE_RULES` must
 * have a mutation named `register-lint/<id>` that is required to go red. Add a
 * shape rule and this check fails until you plant a violation of it; delete
 * one and it fails until the stale fixture goes. The bookkeeping is no longer
 * something the author of the next rule has to remember.
 */
export function shapeRuleProblems() {
  const proven = new Set(MUTATIONS.filter((m) => m.expect === "red").map((m) => m.id));
  const problems = [];
  for (const rule of SHAPE_RULES) {
    if (proven.has(`register-lint/${rule.id}`)) continue;
    problems.push(
      `register-lint shape rule "${rule.id}" has no mutation that must go red. Add one ` +
        `with id "register-lint/${rule.id}": plant a real violation of what the rule ` +
        `promises and pin its message in \`evidence\`. A rule proved only by a unit ` +
        `test is a rule this harness has never watched bite.`
    );
  }
  // The other direction — a fixture left behind after its rule is deleted —
  // needs no list here: the mutation still runs, the deleted rule no longer
  // reddens, and the harness reports it as an expected-red that came back
  // green. Rot in that direction is already loud.
  return problems;
}

export function coverageProblems(names) {
  const problems = [];
  const covered = new Set(MUTATIONS.map((m) => m.step));
  for (const name of names) {
    if (covered.has(name) || NOT_A_GUARD.has(name)) continue;
    problems.push(
      `CI step "${name}" has no mutation and is not in NOT_A_GUARD. Plant a violation ` +
        `of what its name promises and prove it goes red, or say here why it cannot be ` +
        `mutated. An unproven step is a green nobody has tested.`
    );
  }
  const declared = new Set(names);
  for (const step of covered) {
    if (!declared.has(step)) {
      problems.push(
        `Mutations name CI step "${step}", which no longer exists in ci.yml. Delete them ` +
          `or point them at the step that replaced it.`
      );
    }
  }
  for (const step of NOT_A_GUARD.keys()) {
    if (!declared.has(step)) {
      problems.push(`NOT_A_GUARD names "${step}", which no longer exists in ci.yml. Drop it.`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const slow = argv.includes("--slow") || argv.includes("--all");
  const onlyAt = argv.indexOf("--only");
  const only = onlyAt === -1 ? null : argv[onlyAt + 1];
  // `--show` prints each guard's own words. What a mutation proves is only as
  // good as what the guard SAID, so this is how a reader checks the evidence
  // regexes below rather than taking them on trust.
  const show = argv.includes("--show");

  const names = ciStepNames();
  const problems = [...coverageProblems(names), ...shapeRuleProblems()];

  if (argv.includes("--list")) {
    for (const m of MUTATIONS) {
      console.log(`${m.expect === "green" ? "blind" : "  red"}  ${m.id}${m.slow ? "  (slow)" : ""}`);
    }
    console.log(`\n${names.length} CI step(s); ${NOT_A_GUARD.size} declared non-guard(s).`);
    process.exit(problems.length > 0 ? 1 : 0);
  }

  const selected = MUTATIONS.filter(
    (m) => (slow || !m.slow) && (!only || m.id.includes(only) || m.step.toLowerCase().includes(only.toLowerCase()))
  );

  const dir = sandbox();
  const results = [];
  const baselines = new Map();

  try {
    for (const m of selected) {
      const env = m.env ? m.env() : { cwd: dir, cleanup: () => {} };
      const argvFor = typeof m.run === "function" ? m.run({ sandbox: dir }) : m.run;
      const key = `${argvFor.join(" ")}::${env.cwd}`;

      try {
        // The guard must be green BEFORE the mutation, or its red afterwards is
        // not attributable to anything this file did.
        if (!baselines.has(key)) baselines.set(key, runGuard(argvFor, env.cwd));
        const base = baselines.get(key);
        if (base.code !== 0) {
          results.push({
            m,
            verdict: "NO-BASELINE",
            detail:
              `the guard is already red on the unmutated tree (exit ${base.code}). Run it ` +
              `directly and fix the tree; nothing here can be attributed until it is green.`,
            out: base.out,
          });
          continue;
        }

        const restore = m.mutate ? m.mutate(env.cwd) : applyEdits(env.cwd, m.edits);
        let after;
        try {
          after = runGuard(argvFor, env.cwd);
        } finally {
          restore();
        }

        if (m.expect === "green") {
          results.push(
            after.code === 0
              ? { m, verdict: "BLIND (as recorded)" }
              : {
                  m,
                  verdict: "GUARD GREW",
                  detail:
                    "this blind spot is covered now — good news. Delete the entry from " +
                    "MUTATIONS, or turn it into an `expect: \"red\"` one with evidence.",
                  out: after.out,
                }
          );
        } else if (after.code === 0) {
          results.push({
            m,
            verdict: "STAYED GREEN",
            detail:
              "the guard did not notice a violation of the thing its name promises. It " +
              "is asserting nothing here, or asserting something other than its name.",
            out: after.out,
          });
        } else if (!m.evidence.test(after.out)) {
          results.push({
            m,
            verdict: "WRONG REASON",
            detail:
              `exit ${after.code}, but the output does not match ${m.evidence}. A red for ` +
              `the wrong reason — a crash, a missing file — proves nothing about the rule.`,
            out: after.out,
          });
        } else {
          results.push({ m, verdict: "RED", out: after.out });
        }
      } finally {
        env.cleanup();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const width = Math.max(...results.map((r) => r.m.id.length), 20);
  console.log(`Guard mutation check — ${results.length} mutation(s) over ${names.length} CI step(s)\n`);
  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(19)} ${r.m.id.padEnd(width)}  ${r.m.step}`);
    if (show && r.out) {
      console.log(r.out.trim().split("\n").map((l) => `      | ${l}`).join("\n") + "\n");
    }
  }

  const failures = results.filter(
    (r) => !["RED", "BLIND (as recorded)"].includes(r.verdict)
  );

  for (const f of failures) {
    console.error(`\n──  ${f.verdict}: ${f.m.id}  ──`);
    console.error(`  step:     ${f.m.step}`);
    console.error(`  mutation: ${f.m.why}`);
    console.error(`  ${f.detail}`);
    if (f.out) console.error(`\n${f.out.split("\n").slice(0, 30).map((l) => `  | ${l}`).join("\n")}`);
  }

  for (const p of problems) console.error(`\n──  COVERAGE  ──\n  ${p}`);

  if (failures.length > 0 || problems.length > 0) {
    console.error(
      `\n${failures.length} mutation failure(s), ${problems.length} coverage problem(s).\n` +
        `A CI step that cannot be made to fail is not protection. Give it rules or delete it.\n`
    );
    process.exit(1);
  }

  const red = results.filter((r) => r.verdict === "RED").length;
  const blind = results.length - red;
  console.log(
    `\n${red} guard(s) proven to bite on a planted violation; ${blind} recorded blind spot(s) ` +
      `still blind; ${names.length} CI step(s) accounted for (${NOT_A_GUARD.size} declared ` +
      `non-guards).${slow ? "" : " Slow tier skipped — run with --slow."}`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
