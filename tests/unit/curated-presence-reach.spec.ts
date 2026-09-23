import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("#621 local calendar cannot feed presence consumers", () => {
  for (const file of ["lib/cast/live.ts", "lib/cast/read.ts", "lib/cast/depth.ts", "lib/outside/index.ts", "lib/world.ts", "lib/place-context.ts"]) {
    it(file, () => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/getPhenologyEntries/);
      expect(source).toContain("curatedEntries(");
    });
  }
});
