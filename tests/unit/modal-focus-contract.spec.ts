import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync(
  new URL("../../app/run/Runner.tsx", import.meta.url),
  "utf8"
);
const folio = readFileSync(
  new URL("../../app/run/Folio.tsx", import.meta.url),
  "utf8"
);

describe("runner modal focus contract", () => {
  it("uses one focus trap with Escape and focus return for live overlays", () => {
    expect(runner).toContain('from "./useModalFocus"');
    expect(runner.match(/useModalFocus\(/g)).toHaveLength(3);
    expect(runner).toMatch(/className="whisper-card"[\s\S]*?aria-modal="true"/);
  });

  it("gives the session index the same modal behavior", () => {
    expect(folio).toContain('from "./useModalFocus"');
    expect(folio).toContain("useModalFocus(open");
    expect(folio).toContain('aria-modal="true"');
  });
});
