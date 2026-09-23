import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSignInCodeEmail } from "@/lib/email";

/**
 * The code is a live sign-in credential, and the two ways to leak one are to
 * write it into a production log or to let a misconfigured deployment look
 * like it worked. Both are asserted here, because both were the reasoning
 * behind the link path's fail-closed rule and a second sender is exactly how
 * that rule quietly stops applying.
 */
describe("the sign-in code email", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses to send in production with no email provider, rather than logging the code", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      sendSignInCodeEmail({ email: "teacher@school.org", code: "123456" })
    ).rejects.toThrow(/RESEND_API_KEY/);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the code locally so a developer can sign in with no email service", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendSignInCodeEmail({ email: "teacher@school.org", code: "123456" });
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).toContain("123456");
  });

  it("sends the code and nothing to click", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("{}", { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendSignInCodeEmail({ email: "teacher@school.org", code: "123456" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    const body = JSON.parse(String(init?.body));
    expect(body.to).toBe("teacher@school.org");
    expect(body.subject).toContain("123456");
    expect(body.text).toContain("123456");
    // The whole point of the code: a mail scanner has nothing to spend. A URL
    // in this message would hand the scanner back its one-time token.
    expect(body.text).not.toMatch(/https?:\/\//);
  });

  it("says so when the provider refuses, instead of reporting a send that did not happen", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 422 })
    ) as unknown as typeof fetch;
    await expect(
      sendSignInCodeEmail({ email: "teacher@school.org", code: "123456" })
    ).rejects.toThrow(/422/);
  });
});
