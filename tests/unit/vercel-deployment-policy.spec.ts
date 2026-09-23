import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel Git deployment policy", () => {
  it("deploys main and skips every preview branch", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")
    );

    expect(config.git?.deploymentEnabled).toEqual({
      "**": false,
      main: true,
    });
  });
});
