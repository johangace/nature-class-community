import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("offline owner lifecycle contract", () => {
  it("ships the owner synchronizer only behind the private-layer UI gate", () => {
    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain("isPreparedOfflineUiEnabled() && <OfflineOwnerLifecycle />");
  });

  it("refreshes owner proof on mount and when signal returns", () => {
    const source = readFileSync(
      path.join(root, "app/OfflineOwnerLifecycle.tsx"),
      "utf8",
    );
    expect(source).toContain("syncCurrentOfflineOwner()");
    expect(source).toContain('window.addEventListener("online", sync)');
    expect(source).toContain("if (!navigator.onLine) return");
  });
});
