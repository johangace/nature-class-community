/**
 * langfuse-smoke.mjs -- Prove one trace lands, end to end.
 *
 * Imports the REAL `lib/ai/langfuse.ts#trace` (not a reimplementation of it),
 * sends one synthetic trace, then reads it back through the public API. The
 * hand-rolled ingestion payload in that module has never executed against a
 * live project, so "the code compiles" and "a trace appears in the dashboard"
 * are still two different claims. This closes the gap.
 *
 * Carries no lesson content, no teacher text, no child text -- the same
 * no-input/no-output posture the module enforces in production (nc#50, nc#66).
 *
 *   node --env-file=.env.local scripts/langfuse-smoke.mjs
 *
 * Exit 0 = the trace was written AND read back. Exit 1 = it was not.
 * Ingestion is asynchronous, so the read-back polls for up to forty seconds.
 */

import { trace } from "../lib/ai/langfuse.ts";

const host = (process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com").replace(/\/$/, "");
const pk = process.env.LANGFUSE_PUBLIC_KEY;
const sk = process.env.LANGFUSE_SECRET_KEY;

if (!pk || !sk) {
  console.error("No Langfuse keys. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.");
  process.exit(1);
}

// The stamp is the current hour, not the current millisecond: a re-run inside
// the same hour reuses the id and overwrites its own trace rather than
// littering the project, and the trace still lands dated today. A fixed
// constant would be idempotent forever but would file every smoke run in
// whatever year the constant was written, which is how the first version of
// this script filed its proof in 2025 and then could not find it.
const HOUR = 60 * 60 * 1000;
const startedAt = Number(process.env.SMOKE_STAMP ?? Math.floor(Date.now() / HOUR) * HOUR);
const input = {
  promptId: "smoke-test",
  promptName: "smoke-test",
  // 1, not 0: Langfuse rejects promptVersion 0 outright, and the rejection
  // arrives as a 400 nested inside a 207, which is invisible unless something
  // reads the batch's per-event results. That is how this line was found.
  promptVersion: 1,
  model: "smoke",
  startedAt,
  endedAt: startedAt + 1234,
  usage: { inputTokens: 11, outputTokens: 22 },
  outcome: "ok",
};

console.log(`looking for helper:${input.promptId} at ${new Date(startedAt).toISOString()}`);

await trace(input);
console.log("sent      ok (module swallows errors by design, so this proves nothing yet)");

const auth = Buffer.from(`${pk}:${sk}`).toString("base64");
for (let attempt = 1; attempt <= 20; attempt++) {
  await new Promise((r) => setTimeout(r, 2000));
  // By name, not by id: event ids are random now, because a deterministic hash
  // let two drafts of the same prompt in the same millisecond collide and one
  // be dropped without a word.
  const res = await fetch(
    `${host}/api/public/traces?name=${encodeURIComponent(`helper:${input.promptId}`)}&limit=1`,
    { headers: { authorization: `Basic ${auth}` } }
  );
  const found = res.ok ? (await res.json()).data?.[0] : null;
  if (found) {
    const gen = (found.observations ?? [])[0];
    console.log(`READ BACK ok after ${attempt * 2}s`);
    console.log(`  id            ${found.id}`);
    console.log(`  name          ${found.name}`);
    console.log(`  tags          ${JSON.stringify(found.tags)}`);
    console.log(`  observations  ${(found.observations ?? []).length}`);
    if (gen) console.log(`  generation    ${gen.name} model=${gen.model} promptName=${gen.promptName}`);
    console.log(`  input/output  ${found.input == null && found.output == null ? "null (PII boundary holds)" : "PRESENT -- PII BOUNDARY BROKEN"}`);
    process.exit(found.input == null && found.output == null ? 0 : 1);
  }
  console.log(`  poll ${attempt}/20 -> not yet`);
}
console.error("NOT READ BACK. The payload was rejected or ingestion is not reaching this project.");
process.exit(1);
