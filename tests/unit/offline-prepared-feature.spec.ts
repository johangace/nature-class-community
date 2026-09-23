import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPreparedOfflineApiEnabled,
  isPreparedOfflineUiEnabled,
} from "@/lib/offline/prepared-feature";

describe("private offline feature gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults both private surfaces to dark", () => {
    vi.stubEnv("NATURE_CLASS_PREPARED_OFFLINE", "");
    vi.stubEnv("NEXT_PUBLIC_NATURE_CLASS_PREPARED_OFFLINE", "");
    expect(isPreparedOfflineApiEnabled()).toBe(false);
    expect(isPreparedOfflineUiEnabled()).toBe(false);
  });

  it("requires the API and UI gates to be deliberately enabled separately", () => {
    vi.stubEnv("NATURE_CLASS_PREPARED_OFFLINE", "1");
    expect(isPreparedOfflineApiEnabled()).toBe(true);
    expect(isPreparedOfflineUiEnabled()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_NATURE_CLASS_PREPARED_OFFLINE", "1");
    expect(isPreparedOfflineUiEnabled()).toBe(true);
  });
});
