// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

// Use the real SDK and bundled recorder: a config-only test missed the missing
// recorder in #966. Mock init/capture only to keep this test off the network.
it("loads the real recorder before init and sends sanitized views to both analytics surfaces", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://example.invalid");
  const { default: posthog } = await import("posthog-js");
  const init = vi.spyOn(posthog, "init").mockImplementation((_key, config) => {
    const extensions = (window as unknown as {
      __PosthogExtensions__?: { initSessionRecording?: unknown; rrweb?: { record?: unknown } };
    }).__PosthogExtensions__;
    expect(extensions?.initSessionRecording).toBeTypeOf("function");
    expect(extensions?.rrweb?.record).toBeTypeOf("function");
    expect(config).toMatchObject({
      advanced_disable_flags: false,
      advanced_disable_feature_flags: true,
      disable_external_dependency_loading: true,
      disable_session_recording: false,
      persistence: "memory",
      autocapture: false,
      capture_pageview: false,
      session_recording: { maskAllInputs: true, maskTextSelector: ".ph-mask", maskAllElementAttributes: false },
    });
    return posthog;
  });
  const capture = vi.spyOn(posthog, "capture").mockReturnValue(undefined);
  const { initAnalytics, trackPageView } = await import("@/lib/analytics/client");
  initAnalytics();
  trackPageView("/today?school=private#reflection");
  await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
  expect(init).toHaveBeenCalledOnce();
  expect(capture.mock.calls.map(([event, properties]) => [event, properties])).toEqual([
    ["page_viewed", { path: "/today", product: "nature_class", platform: "web" }],
    ["$pageview", { path: "/today", product: "nature_class", platform: "web" }],
  ]);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
