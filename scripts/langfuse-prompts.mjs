/**
 * langfuse-prompts.mjs -- publish prompts/*.md to Langfuse.
 *
 *   npm run prompts:push
 *
 * One direction only, because there is only one source of truth. The
 * committed file is what production runs; this copies it up so the prompt is
 * versioned and visible in Langfuse and a generation's link to its prompt
 * resolves in the dashboard. Langfuse observes; the repo owns.
 *
 * `pull` and `diff` used to live here, for when a promoted Langfuse version
 * could win at runtime. Nothing reads the `production` label any more, so
 * there is no second copy to drift from and nothing to reconcile. The push is
 * idempotent, so running it IS the check: it prints "=" for every prompt
 * already in step and "+" for one it had to publish.
 *
 * WHY PUSH NEVER LABELS `production`. On 2026-06-30 a seed script re-run from
 * a stale worktree republished an old voice.md and moved the `production`
 * label off the good version of the sibling product's meditation prompt. It
 * was reverted by hand. Re-runs from ANY checkout are the hazard, so push is
 * inert by design: it creates a version labelled `file` and nothing else. A
 * human promotes in the Langfuse UI, deliberately, once.
 *
 * That is also what keeps the AGPL promise intact. The committed file is the
 * source of truth; Langfuse is an override a human opts into per prompt. With
 * nothing labelled `production`, the runtime always uses the file, which is
 * exactly what a fresh clone gets.
 *
 * PULL is the other direction and it is what makes the open repo honest: it
 * brings whatever Langfuse actually serves back down into prompts/*.md so the
 * committed files are a snapshot of production rather than a stale stub.
 * Review the diff and commit it like any other change.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

// The registry itself, not a regex over its source. This script carried the
// same trailing-comma pattern `validate-prompts.mjs` did, and here it had no
// second check covering the blind spot: a prompt added as the LAST entry
// without a comma would simply never be published, silently, on every push
// from main (#1220). Read the exported object instead, so a prompt can only
// hide from the push by hiding from the app. Runs under tsx for this import.
import { PROMPT_FILES } from "../lib/ai/prompt-registry.ts";

const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;
const host = (process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST ?? "https://us.cloud.langfuse.com").replace(/\/$/, "");
if (!publicKey || !secretKey) {
  console.error("No Langfuse keys. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

const root = process.cwd();
const dir = path.join(root, "prompts");
const entries = Object.entries(PROMPT_FILES).map(([id, file]) => ({ id, file }));

/** The composed body: frontmatter stripped, shared fragments expanded. */
function body(file) {
  const raw = readFileSync(path.join(dir, file), "utf8");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`${file}: no frontmatter`);
  const version = Number(/^version:\s*(\d+)$/m.exec(m[1])?.[1]);
  const text = m[2].replace(/\n+$/, "").replace(/\{\{>\s*([a-z][a-z0-9-]*)\s*\}\}/g, (_w, name) => {
    const f = path.join(dir, "_shared", `${name}.md`);
    if (!existsSync(f)) throw new Error(`${file}: no shared fragment "${name}"`);
    return readFileSync(f, "utf8").replace(/\n+$/, "");
  });
  return { version, text };
}

async function api(pathname, init) {
  const res = await fetch(`${host}/api/public${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: auth, ...(init?.headers ?? {}) },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(payload)?.slice(0, 200)}`);
  return payload;
}

async function remote(id, label) {
  try {
    const q = label ? `?label=${encodeURIComponent(label)}` : "";
    return await api(`/v2/prompts/${encodeURIComponent(id)}${q}`);
  } catch {
    return null;
  }
}

let changed = 0;
for (const { id, file } of entries) {
  const local = body(file);

  // Explicitly "latest", not the default. A bare fetch resolves the
  // `production` label, which nothing here sets — so the comparison always
  // missed and every run published an identical new version. A push that is
  // not idempotent is a push nobody dares re-run.
  const latest = await remote(id, "latest");
  if (latest && latest.prompt === local.text) {
    console.log(`  = ${id} (already there, v${latest.version})`);
    continue;
  }
  const created = await api("/v2/prompts", {
    method: "POST",
    body: JSON.stringify({ name: id, type: "text", prompt: local.text, labels: ["file"] }),
  });
  console.log(`  + ${id} -> Langfuse v${created.version}`);
  changed++;

}

console.log(`\npush: ${entries.length} prompts, ${changed} published.`);
