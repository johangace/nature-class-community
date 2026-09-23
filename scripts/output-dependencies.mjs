import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildOtherOutputManifest, affectedOutputUses } from "../lib/content/other-output-dependencies.ts";
const file = fileURLToPath(new URL("../lib/lesson/output-dependencies.json", import.meta.url));
export function syncOutputDependencies(check = false) {
  const current = buildOtherOutputManifest();
  // One use per line keeps large generated metadata diffs local to a source use.
  const text = `{\n  "version": 1,\n  "outputs": [\n${current.outputs.map(row => `    ${JSON.stringify(row)}`).join(",\n")}\n  ]\n}\n`;
  const oldText = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (oldText) {
    const affected = affectedOutputUses(JSON.parse(oldText), current);
    if (affected.length) console.log(JSON.stringify({affectedOutputs: affected}, null, 2));
  }
  if (check && oldText !== text) throw new Error("Output dependency sidecar is out of date. Run npm run preview:narration.");
  if (!check) writeFileSync(file, text);
  return current;
}
