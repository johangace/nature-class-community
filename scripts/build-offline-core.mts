import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCoreLessonRelease } from "@/lib/offline/core-release";
import { syncOutputDependencies } from "./output-dependencies.mjs";
import { parseCoreLessonReleaseV1 } from "@/lib/offline/contracts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outputFile = fileURLToPath(
  new URL("../public/offline/core-v1.json", import.meta.url)
);

// `lib/pack.ts` intentionally reads the authored pack files from the working
// directory. Make direct script invocation as reliable as `npm run`.
process.chdir(repoRoot);

const fresh = buildCoreLessonRelease();
let release = fresh;

// `generatedAt` records when this CONTENT version was generated, not every
// time a build happened. Keeping it when the fingerprint is unchanged makes
// the checked-in artifact byte-for-byte deterministic across repeat builds.
try {
  const existing = parseCoreLessonReleaseV1(
    JSON.parse(readFileSync(outputFile, "utf8"))
  );
  if (existing.contentFingerprint === fresh.contentFingerprint) {
    release = { ...fresh, generatedAt: existing.generatedAt };
  }
} catch {
  // Missing, malformed, or obsolete output is replaced by the validated
  // release below. The builder is the only source of public artifact data.
}

const json = `${JSON.stringify(release, null, 2)}\n`;
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, json, "utf8");
syncOutputDependencies();

const size = Buffer.byteLength(json);
console.log(
  `offline core: ${Object.keys(release.sessions).length} sessions, ${size} bytes, ${release.contentFingerprint}`
);
