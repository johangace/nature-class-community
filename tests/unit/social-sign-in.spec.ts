import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredSocialProviders,
  socialProviderConfig,
} from "@/lib/social-sign-in";

/**
 * The school doors light up from the environment, so the environment is what
 * the test moves. The case that matters is the half-set credential: an id
 * pasted in without its secret is the ordinary way a wiring session gets
 * interrupted, and the wrong answer there is a button that opens onto an
 * OAuth error page the teacher cannot read.
 */
describe("school sign-in providers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers nothing when no credential is set", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    expect(configuredSocialProviders()).toEqual([]);
    expect(socialProviderConfig()).toEqual({});
  });

  it("offers a provider only when both halves of its credential are present", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    expect(configuredSocialProviders()).toEqual([]);
    expect(socialProviderConfig()).toEqual({});
  });

  it("passes each configured credential through to Better Auth", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "ms-id");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "ms-secret");
    expect(configuredSocialProviders()).toEqual(["google", "microsoft"]);
    expect(socialProviderConfig()).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      microsoft: { clientId: "ms-id", clientSecret: "ms-secret" },
    });
  });

  it("keeps one school configurable without the other", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "ms-id");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "ms-secret");
    expect(configuredSocialProviders()).toEqual(["microsoft"]);
  });
});
