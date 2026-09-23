import { describe, expect, it } from "vitest";
import {
  fieldHref,
  fieldPrintHref,
} from "@/lib/offline/field-location";

describe("offline field addresses", () => {
  it("keeps selected lesson and view in the client-only hash", () => {
    expect(fieldHref("counting/life", "run")).toBe(
      "/field#session=counting%2Flife&view=run",
    );
    expect(fieldPrintHref("counting/life")).toBe(
      "/field/print#session=counting%2Flife",
    );
  });

  it("carries an allowlisted teacher return without exposing a redirect URL", () => {
    expect(fieldHref("counting/life", "run", "/today")).toBe(
      "/field#session=counting%2Flife&view=run&home=today",
    );
    expect(fieldPrintHref("counting/life", "/today")).toBe(
      "/field/print#session=counting%2Flife&home=today",
    );
  });
});
