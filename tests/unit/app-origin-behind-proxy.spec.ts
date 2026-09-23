/**
 * The same-origin guard, held to the deployment it was breaking (nc#955).
 *
 * Both write route handlers used to ask `new URL(request.url).host`, which is
 * the public host on Vercel and the BIND address under `next start`. Measured
 * against the merged build: a POST carrying `Host: teachers.example.com`
 * answered 403 while `Host: localhost:3512` answered 303 — so on a
 * self-hosted install behind nginx every genuine request was refused, and a
 * passing check would have redirected the teacher to the proxy's loopback.
 *
 * The cases below are the shape of that deployment: `request.url` naming
 * 127.0.0.1 while the browser names the real site. They fail against the old
 * comparison and pass against the configured origin.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { passkeyCeremony: { create: vi.fn() } },
}));

import {
  appHosts,
  appOrigin,
  configuredOrigin,
  sameOrigin,
} from "@/lib/app-origin";
import { POST as reportPasskey } from "@/app/api/passkey-report/route";

/** The public site a self-hoster terminates TLS for. */
const PUBLIC = "https://nature.school.example";
/** What `next start` puts in `request.url` behind that proxy. */
const BOUND = "http://127.0.0.1:3000";

const PROXIED = { BETTER_AUTH_URL: PUBLIC };

function post(path: string, origin: string | null, base = BOUND): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request(new URL(path, base), { method: "POST", headers });
}

describe("which origins are ours", () => {
  it("reads the public origin the deployment already had to configure", () => {
    // BETTER_AUTH_URL is not a second notion of our host: sign-in already
    // refuses any Origin that is neither it nor a listed trusted origin, which
    // is why signing in worked behind a proxy while changing a place did not.
    expect(configuredOrigin(PROXIED)).toBe(PUBLIC);
    expect(configuredOrigin({ BETTER_AUTH_URL: "  " })).toBeNull();
    expect(configuredOrigin({ BETTER_AUTH_URL: "not a url" })).toBeNull();
    expect(configuredOrigin({})).toBeNull();
  });

  it("keeps the bind address as well, so nothing configured still works", () => {
    // Local dev, CI, and every preview deployment set no BETTER_AUTH_URL and
    // must go on being answered exactly as before.
    expect(appHosts(post("/world/place", PUBLIC), {})).toEqual(["127.0.0.1:3000"]);
    expect(appHosts(post("/world/place", PUBLIC), PROXIED)).toEqual([
      "nature.school.example",
      "127.0.0.1:3000",
    ]);
  });

  it("takes no notice of the Host header", () => {
    // Next's own server-action check reads it, and next.config.mjs sets no
    // experimental.trustHostHeader. A header the caller writes cannot be the
    // thing that decides whether the caller is us.
    const headers = new Headers({
      origin: "https://evil.example",
      host: "evil.example",
      "x-forwarded-host": "evil.example",
    });
    const request = new Request(`${BOUND}/world/place`, { method: "POST", headers });
    expect(sameOrigin(request, PROXIED)).toBe(false);
  });
});

describe("the same-origin guard behind a reverse proxy", () => {
  it("accepts the real site, though request.url names the loopback", () => {
    expect(sameOrigin(post("/world/place", PUBLIC), PROXIED)).toBe(true);
  });

  it("still refuses a genuinely foreign origin", () => {
    expect(sameOrigin(post("/world/place", "https://evil.example"), PROXIED)).toBe(false);
  });

  it("still refuses a request carrying no origin at all", () => {
    expect(sameOrigin(post("/world/place", null), PROXIED)).toBe(false);
  });

  it("still accepts the bound address itself, for dev and for CI", () => {
    expect(sameOrigin(post("/world/place", BOUND), PROXIED)).toBe(true);
    expect(sameOrigin(post("/world/place", BOUND), {})).toBe(true);
  });
});

describe("the base a redirect is built against", () => {
  it("is the public origin, never the address the server bound to", () => {
    const base = appOrigin(post("/world/place", PUBLIC), PROXIED);
    expect(base).toBe(PUBLIC);
    expect(new URL("/world?classId=hazel", base).toString()).toBe(
      "https://nature.school.example/world?classId=hazel"
    );
  });

  it("falls back to the configured origin when the request is refused", () => {
    // Nothing in the place route redirects before the guard, but a base that
    // could name the loopback is the bug, so it must not be reachable at all.
    expect(appOrigin(post("/world/place", "https://evil.example"), PROXIED)).toBe(PUBLIC);
    expect(appOrigin(post("/world/place", null), PROXIED)).toBe(PUBLIC);
  });

  it("falls back to the request's own origin when nothing is configured", () => {
    expect(appOrigin(post("/world/place", BOUND), {})).toBe(BOUND);
  });
});

describe("the passkey report endpoint behind the same proxy", () => {
  const body = JSON.stringify({
    surface: "sign-in",
    act: "use",
    outcome: "ok",
    platform: "ios",
    browser: "safari",
  });

  function report(origin: string | null): Request {
    const headers = new Headers({ "content-type": "application/json" });
    if (origin) headers.set("origin", origin);
    return new Request(`${BOUND}/api/passkey-report`, {
      method: "POST",
      headers,
      body,
    });
  }

  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", PUBLIC);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("counts a ceremony reported from the real site", async () => {
    // 204, not 403: the instrument goes on recording on a self-hosted install
    // instead of quietly refusing every device it exists to hear from.
    expect((await reportPasskey(report(PUBLIC))).status).toBe(204);
  });

  it("refuses a report from anywhere else", async () => {
    expect((await reportPasskey(report("https://evil.example"))).status).toBe(403);
    expect((await reportPasskey(report(null))).status).toBe(403);
  });
});
