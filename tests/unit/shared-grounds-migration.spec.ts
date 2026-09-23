import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared Grounds migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/z_shared_grounds/migration.sql"),
    "utf8",
  );

  it("copies every existing class into its own Grounds row before assigning it", () => {
    expect(sql).toContain('CREATE TABLE "grounds"');
    expect(sql).toMatch(/INSERT INTO "grounds"[\s\S]+SELECT[\s\S]+FROM "class"/);
    expect(sql).toMatch(/UPDATE "class"[\s\S]+SET "groundsId"/);
    expect(sql).not.toMatch(/GROUP BY|DISTINCT ON/i);
  });

  it("retains legacy source columns for an additive deploy and copies all place data", () => {
    for (const column of [
      '"lat"',
      '"lng"',
      '"climate"',
      '"grounds"',
      '"siteFeatures"',
      '"siteNotes"',
      '"reach"',
      '"placeRead"',
      '"placeReadAt"',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE/i);
  });
});
