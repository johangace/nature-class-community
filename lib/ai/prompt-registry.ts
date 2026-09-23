import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The prompt registry — prompt text lives in `prompts/*.md`, not in code.
 *
 * This mirrors how this repo already holds authored content: `packs/*.json`
 * read by `lib/pack.ts`, validated by a script in CI. Prompts are authored
 * content too. They were the last body of product words still embedded in
 * TypeScript, where changing a sentence meant reviewing a diff full of escape
 * sequences and `.join("\n")`, and where only a TypeScript author could
 * change what a teacher hears.
 *
 * Markdown rather than JSON, because prose inside a JSON string is not
 * diffable and the whole point is that a prompt change reads as a prompt
 * change. Frontmatter carries the id and the version; the body is the text.
 *
 * The committed file is the source of truth and stays that way: this repo is
 * AGPL and must build and run its features with zero external configuration,
 * so a clone gets the real prompts and not a stub. When a Langfuse project is
 * wired it can override at runtime — the file is the floor, not the ceiling.
 *
 * As in `lib/pack.ts`, a file must be NAMED here to exist. No `readdirSync`:
 * a prompt missing from this map fails a check rather than a teacher's
 * request, and a prompt in the map with no consumer is a finding rather than
 * a file nobody notices (three such prompts rotted for months before the
 * #141 audit).
 */

export const PROMPT_FILES = {
  "door-line": "door-line.md",
  "conditions-line": "conditions-line.md",
  "place-description": "place-description.md",
  "place-instruction": "place-instruction.md",
  "species-note": "species-note.md",
  "species-learning": "species-learning.md",
  "look-for-line": "look-for-line.md",
  "nature-grounding-line": "nature-grounding-line.md",
  "lesson-support": "lesson-support.md",
  "ask-another-way": "ask-another-way.md",
  "world-extract": "world-extract.md",
  "world-photo-extract": "world-photo-extract.md",
  "species-id": "species-id.md",
} as const;

export type PromptId = keyof typeof PROMPT_FILES;

export interface LoadedPrompt {
  id: PromptId;
  version: number;
  system: string;
}

interface ParsedPrompt {
  version: number;
  vars: readonly string[];
  body: string;
}

const cache = new Map<PromptId, ParsedPrompt>();
const sections = new Map<string, Record<string, string>>();

/**
 * `{{name}}` — the same seam Langfuse's own prompt store speaks, so a file and
 * a Langfuse version of the same prompt stay comparable rather than being two
 * unrelated templating schemes.
 */
const VAR = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * `{{> name}}` pulls in `prompts/_shared/name.md` verbatim.
 *
 * Only for text that is genuinely IDENTICAL across prompts. The house voice
 * qualifies: it is one paragraph two prompts share word for word, and before
 * this repo had a shared home for it, seven drafters each carried their own
 * drifted paraphrase of "sentence case, no em dashes, never twee".
 *
 * The temptation once includes exist is to compose the house rules into all
 * twelve. Don't. `place-description` deliberately says "do not sound certain"
 * because the teacher is being invited to disagree, while `door-line` speaks
 * to a class about to walk outside. Those registers differ on purpose, and an
 * include that flattens them is worse than the duplication it removes.
 */
const INCLUDE = /\{\{>\s*([a-z][a-z0-9-]*)\s*\}\}/g;

function expandIncludes(id: PromptId, body: string): string {
  return body.replace(INCLUDE, (_whole, name: string) => {
    const file = path.join(process.cwd(), "prompts", "_shared", `${name}.md`);
    try {
      return readFileSync(file, "utf8").replace(/\n+$/, "");
    } catch {
      throw new Error(`prompt "${id}": no shared fragment "${name}"`);
    }
  });
}

/**
 * A `## key` sectioned file under `prompts/_shared/`, read as a map.
 *
 * Exists for `lesson-support`, whose ten task rules are ten lines of prompt
 * prose that lived in a TypeScript Record. Leaving them there would have kept
 * a second home for prompt text that the "no prompt text in lib/ai" check
 * cannot see, which is how a rule gets quietly reintroduced.
 */
export function loadSections(name: string): Record<string, string> | null {
  const held = sections.get(name);
  if (held) return held;
  try {
    const raw = readFileSync(path.join(process.cwd(), "prompts", "_shared", `${name}.md`), "utf8");
    const out: Record<string, string> = {};
    let key: string | null = null;
    let buf: string[] = [];
    const flush = () => {
      if (key) out[key] = buf.join("\n").trim();
      buf = [];
    };
    for (const line of raw.split("\n")) {
      const heading = /^##\s+(\S+)\s*$/.exec(line);
      if (heading) {
        flush();
        key = heading[1] ?? null;
      } else if (key) {
        buf.push(line);
      }
    }
    flush();
    sections.set(name, out);
    return out;
  } catch (e) {
    console.error(`[prompts] sections "${name}" failed to load:`, (e as Error).message);
    return null;
  }
}

function frontmatter(id: PromptId, raw: string): ParsedPrompt {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`prompt "${id}": no frontmatter`);
  const [, head, body] = match;

  let version: number | null = null;
  let vars: string[] = [];
  for (const line of (head ?? "").split("\n")) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key?.trim() === "version") version = Number(value);
    if (key?.trim() === "vars") {
      vars = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }

  // >= 1 is Langfuse's rule, not ours: a generation carrying promptVersion 0
  // is rejected with a 400 nested inside a 207 response, which is invisible
  // unless something reads the batch's per-event results. Catching it here
  // means a bad frontmatter value fails a check instead of quietly costing
  // every trace that prompt would have produced.
  if (version === null || !Number.isInteger(version) || version < 1) {
    throw new Error(`prompt "${id}": version must be an integer >= 1`);
  }

  // The trailing newline the file ends with is not part of the prompt. Keeping
  // it would put a stray blank line at the end of every system prompt and
  // change the sha the lockfile pins for a change no reader made.
  return { version, vars, body: (body ?? "").replace(/\n+$/, "") };
}

function read(id: PromptId): ParsedPrompt {
  const held = cache.get(id);
  if (held) return held;
  const file = path.join(process.cwd(), "prompts", PROMPT_FILES[id]);
  const parsed = frontmatter(id, readFileSync(file, "utf8"));
  const expanded = { ...parsed, body: expandIncludes(id, parsed.body) };
  cache.set(id, expanded);
  return expanded;
}

/**
 * Load a prompt, substituting its declared variables.
 *
 * Returns null rather than throwing. Every caller is a drafter that already
 * returns null on any problem and lets the authored content render, so a
 * broken prompt costs a draft and never a teacher's request. And a
 * half-substituted prompt reaching the model would be worse than no draft at
 * all: `{{speciesList}}` sitting in a system prompt is an instruction the
 * model will try to make sense of.
 */
export function loadPrompt(
  id: PromptId,
  vars: Record<string, string> = {}
): LoadedPrompt | null {
  let parsed: ParsedPrompt;
  try {
    parsed = read(id);
  } catch (e) {
    console.error(`[prompts] ${id} failed to load:`, (e as Error).message);
    return null;
  }

  for (const name of parsed.vars) {
    if (typeof vars[name] !== "string") {
      console.error(`[prompts] ${id}: missing variable "${name}"`);
      return null;
    }
  }

  const system = parsed.body.replace(VAR, (whole, name: string) =>
    typeof vars[name] === "string" ? vars[name] : whole
  );

  if (system.includes("{{")) {
    console.error(`[prompts] ${id}: a variable was left unsubstituted`);
    return null;
  }


  return { id, version: parsed.version, system };
}

/** Test seam: forget what has been read, so a fixture can be swapped. */
export function clearPromptCache(): void {
  cache.clear();
  sections.clear();
}
