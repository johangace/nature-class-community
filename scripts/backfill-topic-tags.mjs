// Authoring tool (#161): tag every session with its closed topic vocabulary,
// derived deterministically from the words the session already carries
// (title + topic + objective). Additive metadata only: no authored text is
// touched, and re-running is idempotent. Review the printed table before
// committing — the keywords propose, the diff review disposes.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  ["minibeasts", /minibeast|bug\b|insect|creature|butterfl|bee\b|bees\b|worm|spider|snail|pollinat|ladybird|woodlouse|beetle/],
  ["birds", /\bbird|feather|nest\b|feeder/],
  ["trees", /\btree|leaf|leaves|bark\b|branch|conker|acorn|blossom|twig/],
  ["plants", /flower|plant|seed|petal|grass\b|moss\b|bulb|fruit|berry|green\b/],
  ["seasons", /season|autumn|winter|spring|summer|turn(ing|s)?\b|hibernat|migrat|promise/],
  ["soil", /\bsoil|mud\b|underground|decompos|mould|compost/],
  ["water", /\brain|water|puddle|\bice\b|frost/],
  ["weather", /weather|wind\b|sky\b|cloud|warmth|sun\b|shade|shadow|light\b|dark\b/],
  ["art", /\bart\b|paint|collage|rubbing|make\b|craft/],
  ["senses", /listen|sound|smell|quiet|sense|breath|touch\b|feel\b/],
];

const packsDir = join(process.cwd(), "packs");
for (const file of readdirSync(packsDir).filter((f) => f.endsWith(".json"))) {
  const path = join(packsDir, file);
  const pack = JSON.parse(readFileSync(path, "utf8"));
  for (const session of pack.sessions) {
    const hay = `${session.title} ${session.topic} ${session.objective}`.toLowerCase();
    const tags = RULES.filter(([, re]) => re.test(hay)).map(([tag]) => tag);
    if (tags.length > 0) {
      // Insert topicTags right after topic, preserving key order elsewhere.
      const rebuilt = {};
      for (const [k, v] of Object.entries(session)) {
        rebuilt[k] = v;
        if (k === "topic") rebuilt.topicTags = tags.slice(0, 3);
      }
      // eslint-disable-next-line no-unused-vars
      for (const k of Object.keys(session)) delete session[k];
      Object.assign(session, rebuilt);
    }
    console.log(`${file} :: ${session.title} -> ${tags.slice(0, 3).join(", ") || "(none)"}`);
  }
  writeFileSync(path, JSON.stringify(pack, null, 2) + "\n");
}
