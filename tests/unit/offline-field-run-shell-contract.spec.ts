import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../app/field/FieldShell.tsx", import.meta.url),
  "utf8",
);
const fieldPage = readFileSync(
  new URL("../../app/field/page.tsx", import.meta.url),
  "utf8",
);
const printPage = readFileSync(
  new URL("../../app/field/print/page.tsx", import.meta.url),
  "utf8",
);
const printSource = readFileSync(
  new URL("../../app/field/print/FieldPrint.tsx", import.meta.url),
  "utf8",
);

describe("the offline field run mount boundary", () => {
  it("waits for the private overlay lookup before mounting the journey", () => {
    expect(source).toContain("preparedLookupSettledFor");
    expect(source).toContain("Opening the saved field version");
  });

  it("takes one lazy run snapshot instead of following later preparation state", () => {
    expect(source).toMatch(/useState\(\(\) => \(\{[\s\S]{0,800}session:/);
    expect(source).toContain("preparedLeaseId");
  });

  it("stops a prepared run when its lease is actively removed", () => {
    expect(source).toContain("This field preparation has expired");
    expect(source).toContain("Continue with the basic lesson");
  });

  it("keeps both private UI readers behind the separately approved UI gate", () => {
    expect(fieldPage).toContain(
      "preparedEnabled={isPreparedOfflineUiEnabled()}",
    );
    expect(printPage).toContain(
      "preparedEnabled={isPreparedOfflineUiEnabled()}",
    );
    expect(source).toMatch(/if \(!preparedEnabled \|\| !release/);
    expect(printSource).toMatch(/if \(!preparedEnabled \|\| !release/);
  });
});
