import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const classes = readFileSync(
  new URL("../../app/classes/page.tsx", import.meta.url),
  "utf8",
);
const account = readFileSync(
  new URL("../../app/account/page.tsx", import.meta.url),
  "utf8",
);

describe("account and class management are separate", () => {
  it("keeps account identity and sign-out off My classes", () => {
    expect(classes).not.toContain("Signed in as");
    expect(classes).not.toContain("SignOutButton");
  });

  it("keeps the existing safe sign-out control on Account", () => {
    expect(account).toContain("Signed in as");
    expect(account).toContain("SignOutButton");
  });
});
