/**
 * The merge gate's REST transport (nc#1205).
 *
 * The gate died in a worker container on `spawnSync gh ENOENT` — before a
 * single condition was evaluated — and the merge only completed because the
 * operator wrote a throwaway `gh` shim in a scratchpad. nc#859 had already
 * learned that shape: "eight merges in one night depend[ed] on a throwaway `gh`
 * shim rather than on this script." A shim that is rewritten from memory by
 * whoever hits the wall next, and that sits between a green gate and a real
 * merge, is worth exactly as much as its last author remembered.
 *
 * So the shim is in the repository now, and this is what holds it honest. What
 * is asserted here is the transport's CONTRACT — the argument shapes the gate
 * uses, what comes back, and what a refusal looks like — because
 * `merge-pr.mjs` reads all three and decides the merge on them.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  API_HELPER,
  API_HOST,
  API_ROOT,
  DEFAULT_MAX_BUFFER,
  bypassesProxy,
  callGitHub,
  errorSummary,
  ghApiSync,
  parseGhArgs,
  proxyUsable,
  readToken,
  run,
  selectField,
} from "../../scripts/github-api.mjs";

describe("reading a `gh api` argv (nc#1205)", () => {
  it("reads the plain GET every fact-collection call makes", () => {
    expect(parseGhArgs(["api", "repos/johangace/nature-class/pulls/1204"])).toEqual({
      method: "GET",
      path: "repos/johangace/nature-class/pulls/1204",
      fields: null,
      jq: null,
    });
  });

  it("reads the narrowed compare read that #837 installed", () => {
    expect(
      parseGhArgs(["api", "repos/o/r/compare/main...abc", "--jq", ".behind_by"]),
    ).toMatchObject({ method: "GET", jq: ".behind_by" });
  });

  it("reads the merge call, whose method and fields are the whole point (#859)", () => {
    expect(
      parseGhArgs([
        "api",
        "--method",
        "PUT",
        "repos/o/r/pulls/7/merge",
        "-f",
        "merge_method=squash",
        "-f",
        "sha=deadbeef",
        "-f",
        "commit_title=A title",
        "-f",
        "commit_message=A body\nwith a newline",
      ]),
    ).toEqual({
      method: "PUT",
      path: "repos/o/r/pulls/7/merge",
      fields: {
        merge_method: "squash",
        sha: "deadbeef",
        commit_title: "A title",
        commit_message: "A body\nwith a newline",
      },
      jq: null,
    });
  });

  /**
   * A squash message legitimately contains `=`; splitting on the last one, or
   * on every one, would silently send a truncated commit message. The gate
   * composes that message precisely so GitHub does not compose its own (#995),
   * and a transport that mangles it in transit defeats that at the last step.
   */
  it("keeps everything after the first `=` in a field value", () => {
    const { fields } = parseGhArgs(["api", "-f", "commit_message=a=b=c", "repos/o/r/x"]);
    expect(fields?.commit_message).toBe("a=b=c");
  });

  /**
   * Anything unimplemented throws rather than being approximated. A transport
   * that quietly does something adjacent to what the caller asked is the exact
   * failure mode a hand-written shim has, and the reason this file exists.
   */
  it("refuses what it does not implement instead of guessing", () => {
    expect(() => parseGhArgs(["pr", "merge", "7"])).toThrow(/understands `api` calls only/);
    expect(() => parseGhArgs(["api", "repos/o/r/x", "--paginate"])).toThrow(/does not implement/);
    expect(() => parseGhArgs(["api", "repos/o/r/x", "repos/o/r/y"])).toThrow(/one path/);
    expect(() => parseGhArgs(["api"])).toThrow(/needs a path/);
    expect(() => parseGhArgs(["api", "repos/o/r/x", "-f", "novalue"])).toThrow(/key=value/);
  });
});

/**
 * `gh api -f 'labels[]=track:infra'` (nc#1206).
 *
 * `worktree-patrol.mjs` opens its own issue, and an issue's labels are a JSON
 * array — the one body shape the flat `key=value` map could not express, and
 * the reason the patrol was still shelling out to `gh issue create` after the
 * merge gate had stopped shelling out at all. This is gh's own documented
 * shape rather than a flag invented here, so a caller who knows `gh` needs to
 * learn nothing, and an unlabelled issue would miss the very filter the patrol
 * finds it again by.
 */
describe("array fields, which is how a label reaches a new issue (nc#1206)", () => {
  it("builds an array from the `[]` suffix", () => {
    expect(
      parseGhArgs(["api", "repos/o/r/issues", "-f", "title=T", "-f", "labels[]=track:infra"]),
    ).toMatchObject({
      method: "POST",
      fields: { title: "T", labels: ["track:infra"] },
    });
  });

  it("appends when the key repeats, which is how one writes two labels", () => {
    const { fields } = parseGhArgs([
      "api",
      "repos/o/r/issues",
      "-f",
      "labels[]=track:infra",
      "-f",
      "labels[]=p1",
    ]);
    expect(fields?.labels).toEqual(["track:infra", "p1"]);
  });

  it("refuses a key written both ways rather than picking one", () => {
    expect(() =>
      parseGhArgs(["api", "repos/o/r/issues", "-f", "labels=p1", "-f", "labels[]=p2"]),
    ).toThrow(/both as a value and as an array/);
    expect(() =>
      parseGhArgs(["api", "repos/o/r/issues", "-f", "labels[]=p2", "-f", "labels=p1"]),
    ).toThrow(/both as a value and as an array/);
  });

  it("refuses a nameless array field", () => {
    expect(() => parseGhArgs(["api", "repos/o/r/issues", "-f", "[]=p1"])).toThrow(/before \[\]/);
  });

  it("sends the array as JSON, which is what GitHub reads a label out of", async () => {
    let sent: string | undefined;
    await callGitHub(
      parseGhArgs(["api", "repos/o/r/issues", "-f", "title=T", "-f", "labels[]=track:infra"]),
      {
        env: { GH_TOKEN: "t" },
        fetchImpl: (async (_url: string, init: RequestInit) => {
          sent = init.body as string;
          return new Response('{"number":7}', { status: 201 });
        }) as never,
      },
    );
    expect(JSON.parse(sent as string)).toEqual({ title: "T", labels: ["track:infra"] });
  });
});

/**
 * The parent half of the transport (nc#1206).
 *
 * Three scripts now spawn this file, and each of them needs the two details
 * that were, until this ticket, written down only inside `merge-pr.mjs`: the
 * child must be started with `NODE_USE_ENV_PROXY=1`, or a proxied container
 * sends its placeholder token straight to GitHub and gets a 401 that reads as
 * a permissions problem; and the stdout ceiling must be raised, or Node KILLS
 * the child on a big answer rather than truncating it.
 *
 * Both are asserted against a real child process rather than a mock, because
 * the constant being CORRECT and the constant being USED are different claims
 * — the #1070 lesson, one script over.
 */
describe("spawning the transport from a synchronous script (nc#1206)", () => {
  const dir = mkdtempSync(join(tmpdir(), "gh-api-spawn-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function fakeHelper(name: string, body: string): string {
    const path = join(dir, name);
    writeFileSync(
      path,
      `import { readFileSync } from "node:fs";\n` +
        `const stdin = readFileSync(0, "utf8");\n` +
        body +
        "\n",
    );
    return path;
  }

  it("hands the argv to the child as JSON on stdin and returns its answer trimmed", () => {
    const helper = fakeHelper("echo.mjs", `process.stdout.write(stdin + "\\n");`);
    expect(ghApiSync(["api", "repos/o/r/issues/1"], { helperPath: helper })).toBe(
      '["api","repos/o/r/issues/1"]',
    );
  });

  it("starts the child with the proxy switch the container needs", () => {
    const helper = fakeHelper(
      "proxy.mjs",
      `process.stdout.write(String(process.env.NODE_USE_ENV_PROXY));`,
    );
    expect(ghApiSync(["api", "x"], { helperPath: helper, env: { PATH: process.env.PATH } })).toBe(
      "1",
    );
  });

  it("carries an answer past the 1 MiB default Node would kill the child over", () => {
    const helper = fakeHelper(
      "big.mjs",
      `process.stdout.write("x".repeat(2 * 1024 * 1024));`,
    );
    expect(DEFAULT_MAX_BUFFER).toBeGreaterThan(2 * 1024 * 1024);
    expect(ghApiSync(["api", "x"], { helperPath: helper })).toHaveLength(2 * 1024 * 1024);
    // And the allowance is what carries it: the same read with Node's default
    // ceiling is an ENOBUFS crash, not a short answer.
    expect(() => ghApiSync(["api", "x"], { helperPath: helper, maxBuffer: 1024 })).toThrow();
  });

  it("throws with the child's own stderr, so a refusal cannot read as an empty answer", () => {
    const helper = fakeHelper(
      "refuse.mjs",
      `process.stderr.write("github-api: HTTP 409 from api.github.com\\n"); process.exit(1);`,
    );
    expect(() => ghApiSync(["api", "x"], { helperPath: helper })).toThrow(/409/);
  });

  /**
   * #571's crash, moved here with the mechanism (nc#1261).
   *
   * `execFileSync` returns NULL rather than a string whenever stdout is not
   * captured, which is what `{ stdio: "inherit" }` asks for. Unguarded that
   * null met `.trim()` and threw AFTER a merge had already succeeded (#571, hit
   * on #569 and again on #572) — and a merge script that exits non-zero reads
   * as "it did not merge", whose natural next move is to merge again.
   *
   * The guard lived in `merge-pr.mjs`'s own copy of this spawn, explained at
   * length in a comment and checked by nothing; the copy is gone and this is
   * the only `?? ""` left. A mutation drill found it survived, which is the
   * exact shape nc#1261 is about: a lesson kept by prose rather than by a test.
   */
  it("answers empty rather than crashing when its caller does not capture stdout", () => {
    const helper = fakeHelper("silent.mjs", `JSON.parse(stdin);`);
    // Only stdout is inherited. A bare `stdio: "inherit"` would take stdin too,
    // and `input` is then never delivered — the child blocks on a read that
    // never arrives and the suite hangs rather than failing. Measured.
    expect(
      ghApiSync(["api", "x"], { helperPath: helper, stdio: ["pipe", "inherit", "pipe"] }),
    ).toBe("");
  });

  it("points at this repository's own transport by default", () => {
    expect(API_HELPER).toMatch(/scripts\/github-api\.mjs$/);
  });
});

describe("the one --jq filter the gate asks for", () => {
  it("hands back a bare number, which is what readBehindBy parses", () => {
    expect(selectField(JSON.stringify({ behind_by: 3, commits: [] }), ".behind_by")).toBe("3");
  });

  it("hands back a string unquoted", () => {
    expect(selectField(JSON.stringify({ title: "a PR" }), ".title")).toBe("a PR");
  });

  it("passes the body through untouched when nothing was asked for", () => {
    expect(selectField('{"a":1}', null)).toBe('{"a":1}');
  });

  it("is empty rather than the literal `undefined` when the field is absent", () => {
    expect(selectField("{}", ".behind_by")).toBe("");
  });

  /**
   * `readBehindBy` treats an unreadable comparison as a refusal, not as zero,
   * because reading a missing `behind_by` as "up to date" is the whole of
   * #535. A filter this transport cannot evaluate must therefore throw rather
   * than return something that parses.
   */
  it("throws on an expression it cannot evaluate", () => {
    expect(() => selectField('{"a":1}', ".a.b")).toThrow(/single top-level field/);
    expect(() => selectField('{"a":1}', "map(.x)")).toThrow(/single top-level field/);
  });
});

describe("performing the request", () => {
  const ok = (body: string) =>
    Object.assign(async () => new Response(body, { status: 200 }), {}) as unknown as typeof fetch;

  it("asks api.github.com for the path it was given, authenticated", async () => {
    let seen: [string, RequestInit] | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = [url, init];
      return new Response('{"number":1}', { status: 200 });
    }) as unknown as typeof fetch;

    const answer = await callGitHub(parseGhArgs(["api", "repos/o/r/pulls/1"]), {
      fetchImpl,
      env: { GH_TOKEN: "t0ken" },
    });

    expect(answer).toEqual({ status: 200, body: '{"number":1}' });
    expect(seen![0]).toBe(`${API_ROOT}/repos/o/r/pulls/1`);
    expect(seen![1].method).toBe("GET");
    expect((seen![1].headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    expect(seen![1].body).toBeUndefined();
  });

  it("sends the merge as a JSON body on the method it was told", async () => {
    let seen: RequestInit | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response('{"merged":true,"sha":"abc"}', { status: 200 });
    }) as unknown as typeof fetch;

    await callGitHub(
      parseGhArgs([
        "api",
        "--method",
        "PUT",
        "repos/o/r/pulls/7/merge",
        "-f",
        "merge_method=squash",
        "-f",
        "sha=deadbeef",
      ]),
      { fetchImpl, env: { GITHUB_TOKEN: "t" } },
    );

    expect(seen!.method).toBe("PUT");
    expect(JSON.parse(String(seen!.body))).toEqual({ merge_method: "squash", sha: "deadbeef" });
  });

  /**
   * A redirect is not an answer about this pull request. Following one would
   * send the token somewhere the caller never named; the gate would rather have
   * no answer than a laundered one.
   */
  it("never follows a redirect", async () => {
    let seen: RequestInit | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await callGitHub(parseGhArgs(["api", "repos/o/r/x"]), { fetchImpl, env: {} });
    expect(seen!.redirect).toBe("error");
  });

  /**
   * Review round 1, P1. `NODE_USE_ENV_PROXY` arrived in Node 22.21 and
   * `.nvmrc` says `22`, so a version manager can hand a contributor 22.9 — on
   * which the switch is ignored, the request leaves directly with the
   * placeholder token a proxied container carries, and GitHub answers
   * `401 Bad credentials`. That is the failure this whole ticket is about
   * (a false answer, not a missing one) reappearing one cause over.
   */
  it("refuses rather than reading the gate's evidence unauthenticated (nc#1205 round 1)", async () => {
    expect(proxyUsable({ version: "22.9.0", env: {} })).toEqual({ proxied: false, usable: true });
    expect(proxyUsable({ version: "22.9.0", env: { HTTPS_PROXY: "http://127.0.0.1:1" } })).toMatchObject({ proxied: true, usable: false });
    expect(proxyUsable({ version: "22.21.0", env: { https_proxy: "http://127.0.0.1:1" } })).toMatchObject({ usable: true });
    expect(proxyUsable({ version: "24.2.0", env: { HTTP_PROXY: "http://127.0.0.1:1" } })).toMatchObject({ usable: true });
    // 23 is end-of-life and is not assumed to carry the backport.
    expect(proxyUsable({ version: "23.5.0", env: { HTTPS_PROXY: "http://127.0.0.1:1" } })).toMatchObject({ usable: false });

    let called = 0;
    await expect(
      callGitHub(parseGhArgs(["api", "repos/o/r/pulls/1"]), {
        env: { HTTPS_PROXY: "http://127.0.0.1:1", GH_TOKEN: "proxy-injected" },
        version: "22.9.0",
        fetchImpl: (async () => {
          called += 1;
          return new Response("{}", { status: 200 });
        }) as never,
      }),
    ).rejects.toThrow(/ignores NODE_USE_ENV_PROXY/);
    expect(called).toBe(0);
  });

  /**
   * Review round 2, P2. Node parses `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`
   * together, so a proxy variable being SET is not the same as this host going
   * through it. Where `NO_PROXY` exempts api.github.com the request connects
   * directly and an older Node needs nothing from the switch — refusing there
   * would refuse a run that works.
   */
  it("does not refuse a host NO_PROXY exempts (nc#1205 round 2)", () => {
    const proxied = { HTTPS_PROXY: "http://127.0.0.1:1" };
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "*" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "api.github.com" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, no_proxy: "localhost,.github.com,10.0.0.0/8" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "*.github.com:443" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "localhost,example.com" })).toBe(false);
    // Not a suffix match on a longer name that merely ends in the same letters.
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "github.co" })).toBe(false);
    // A CIDR block is not interpreted; it leaves the proxy in play, which is
    // the conservative direction — the cost is a refusal naming its cause.
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "10.0.0.0/8" })).toBe(false);
    expect(bypassesProxy(API_HOST, proxied)).toBe(false);

    expect(proxyUsable({ version: "22.9.0", env: { ...proxied, NO_PROXY: "*" } })).toEqual({
      proxied: false,
      usable: true,
    });
    expect(proxyUsable({ version: "22.9.0", env: { ...proxied, NO_PROXY: "api.github.com" } })).toMatchObject({
      usable: true,
    });
  });

  /**
   * Review round 4, P2 (both). The matcher has to agree with the `fetch` that
   * will actually carry the request, because where it wrongly says "bypassed"
   * the version refusal is skipped and an older Node sends the placeholder
   * token straight to GitHub — the 401 this guard exists to prevent. Node's
   * `fetch` is undici's EnvHttpProxyAgent, which reads `no_proxy ?? NO_PROXY`
   * (lowercase first, and an EMPTY lowercase value still wins), splits on
   * commas and whitespace, honours a lone `*` only as the WHOLE value, and
   * matches a port-qualified entry only on that port. Each assertion below was
   * checked against Node 24.20's real `fetch` through a loopback proxy that
   * counted CONNECTs, not read off documentation.
   */
  it("reads no_proxy before NO_PROXY, as Node's fetch does (nc#1205 round 4)", () => {
    const proxied = { HTTPS_PROXY: "http://127.0.0.1:1" };
    expect(bypassesProxy(API_HOST, { ...proxied, no_proxy: "example.com", NO_PROXY: "api.github.com" })).toBe(false);
    expect(bypassesProxy(API_HOST, { ...proxied, no_proxy: "", NO_PROXY: "api.github.com" })).toBe(false);
    expect(bypassesProxy(API_HOST, { ...proxied, no_proxy: "api.github.com", NO_PROXY: "example.com" })).toBe(true);
    // `*` bypasses everything only as the whole value; inside a list Node proxies.
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "localhost,*" })).toBe(false);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: " * " })).toBe(false);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "*" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "github.com" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: ".api.github.com" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "localhost api.github.com" })).toBe(true);

    expect(
      proxyUsable({ version: "22.9.0", env: { ...proxied, no_proxy: "example.com", NO_PROXY: "api.github.com" } }),
    ).toMatchObject({ proxied: true, usable: false });
  });

  it("matches a port-qualified NO_PROXY entry only on the request's port (nc#1205 round 4)", () => {
    const proxied = { HTTPS_PROXY: "http://127.0.0.1:1" };
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "api.github.com:80" })).toBe(false);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: ".github.com:8443" })).toBe(false);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "api.github.com:443" })).toBe(true);
    expect(bypassesProxy(API_HOST, { ...proxied, NO_PROXY: "api.github.com:80" }, 80)).toBe(true);

    expect(proxyUsable({ version: "22.9.0", env: { ...proxied, NO_PROXY: "api.github.com:80" } })).toMatchObject({
      proxied: true,
      usable: false,
    });
  });

  it("reads either token name, because both are in use", () => {
    expect(readToken({ GH_TOKEN: "a", GITHUB_TOKEN: "b" })).toBe("a");
    expect(readToken({ GITHUB_TOKEN: "b" })).toBe("b");
    expect(readToken({})).toBe("");
  });

  it("returns a refusal as an answer rather than throwing", async () => {
    const answer = await callGitHub(parseGhArgs(["api", "repos/o/r/x"]), {
      fetchImpl: ok('{"message":"Bad credentials"}') as unknown as typeof fetch,
      env: {},
    });
    expect(answer.status).toBe(200);
  });
});

/**
 * The exit codes and the streams, because `merge-pr.mjs` reads BOTH: it parses
 * stdout as the answer, and on a non-zero exit it matches the status out of the
 * text `execFileSync` attaches. `mergePullRequest` turns a 409 into "the head
 * moved, nothing was merged" and a 405 into "GitHub declined" — so the status
 * has to survive as a bare number in the message, or the gate re-runs a merge
 * that may already have landed (#571).
 */
describe("the child's own contract", () => {
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) };
  }

  it("writes the answer and exits 0", async () => {
    const io = capture();
    const code = await run({
      stdin: JSON.stringify(["api", "repos/o/r/pulls/1"]),
      ...io,
      env: {},
      fetchImpl: (async () => new Response('{"number":1}', { status: 200 })) as never,
    });
    expect(code).toBe(0);
    expect(io.out.join("")).toBe('{"number":1}');
    expect(io.err.join("")).toBe("");
  });

  it("puts the status in the stderr text a 409 has to be recognised from", async () => {
    const io = capture();
    const code = await run({
      stdin: JSON.stringify(["api", "--method", "PUT", "repos/o/r/pulls/7/merge", "-f", "a=b"]),
      ...io,
      env: {},
      fetchImpl: (async () =>
        new Response('{"message":"Head branch was modified. Review and try the merge again."}', {
          status: 409,
        })) as never,
    });
    expect(code).toBe(1);
    expect(io.err.join("")).toMatch(/\b409\b/);
    expect(io.err.join("")).toMatch(/Head branch was modified/);
  });

  it("leaves stdout empty when the transport itself failed", async () => {
    const io = capture();
    const code = await run({
      stdin: JSON.stringify(["api", "repos/o/r/pulls/1"]),
      ...io,
      env: {},
      fetchImpl: (async () => {
        throw new Error("getaddrinfo ENOTFOUND api.github.com");
      }) as never,
    });
    expect(code).toBe(3);
    expect(io.out.join("")).toBe("");
    expect(io.err.join("")).toMatch(/ENOTFOUND/);
  });

  it("refuses an argv it cannot honour without calling anything", async () => {
    const io = capture();
    let called = 0;
    const code = await run({
      stdin: JSON.stringify(["pr", "merge", "7"]),
      ...io,
      env: {},
      fetchImpl: (async () => {
        called += 1;
        return new Response("{}", { status: 200 });
      }) as never,
    });
    expect(code).toBe(2);
    expect(called).toBe(0);
  });
});

describe("summarising a refusal", () => {
  it("leads with the status so a bare number is always in the text", () => {
    expect(errorSummary(405, '{"message":"Pull Request is not mergeable"}')).toBe(
      "HTTP 405 from api.github.com: Pull Request is not mergeable",
    );
  });

  it("survives a body that is not JSON at all", () => {
    expect(errorSummary(502, "<html>Bad gateway</html>")).toMatch(/HTTP 502/);
  });
});

/**
 * WHICH PROXY VARIABLE, MEASURED RATHER THAN ASSUMED (nc#1229).
 *
 * `proxyUsable` used to read `HTTPS_PROXY || https_proxy || HTTP_PROXY ||
 * http_proxy` — uppercase first, `||` stepping over an empty value — while
 * `bypassesProxy` forty lines above read `no_proxy ?? NO_PROXY`. One file, two
 * rules for one question, and Node's is the second.
 *
 * Every row below was OBSERVED on Node v22.22.2, by asking api.github.com for
 * its own rate limit from a proxied container: a credential-injected answer
 * reports `limit: 15000`, a direct one the anonymous `limit: 60`. The comment
 * on `proxyUsable` carries the table; these are the same rows as assertions,
 * so the rule cannot be narrowed later without one of them going red.
 *
 * The two that matter most are the two that no single `??` chain can satisfy
 * at once: an empty `https_proxy` beats a populated `HTTPS_PROXY` (Node goes
 * direct), and yet an empty `https_proxy` still falls THROUGH to a populated
 * `http_proxy` (Node proxies). Within a pair, `??`; across the pairs, `||`.
 */
describe("the proxy variables, in Node's own precedence (nc#1229)", () => {
  const P = "http://127.0.0.1:1";
  const old = "22.9.0";

  it("lets an empty lowercase value win over a populated uppercase one", () => {
    // Observed 60 — direct — so an old Node needs nothing from the switch and
    // refusing here would be a refusal on a run that works.
    expect(proxyUsable({ version: old, env: { https_proxy: "", HTTPS_PROXY: P } }))
      .toEqual({ proxied: false, usable: true });
    expect(proxyUsable({ version: old, env: { http_proxy: "", HTTP_PROXY: P } }))
      .toEqual({ proxied: false, usable: true });
    // And the other way round: an empty UPPERCASE value does not win.
    expect(proxyUsable({ version: old, env: { HTTPS_PROXY: "", https_proxy: P } }))
      .toMatchObject({ proxied: true, usable: false });
  });

  it("falls through an empty https pair to the http pair", () => {
    // Observed 15000 — proxied — in both rows. A `??` chain across all four
    // variables would stop at the empty `https_proxy`, report `proxied: false`,
    // and let an old Node send the placeholder token out directly.
    expect(proxyUsable({ version: old, env: { https_proxy: "", http_proxy: P } }))
      .toMatchObject({ proxied: true, usable: false });
    expect(proxyUsable({ version: old, env: { https_proxy: "", HTTPS_PROXY: P, http_proxy: P } }))
      .toMatchObject({ proxied: true, usable: false });
  });

  it("keeps the http fallback for an https request", () => {
    // Observed 15000. Narrowing this read to the https pair would be wrong.
    expect(proxyUsable({ version: old, env: { http_proxy: P } }))
      .toMatchObject({ proxied: true, usable: false });
    expect(proxyUsable({ version: old, env: { https_proxy: P, http_proxy: "" } }))
      .toMatchObject({ proxied: true, usable: false });
  });

  it("reads the exemption list with that same precedence", () => {
    // Observed 15000: an empty `no_proxy` wins, so the populated `NO_PROXY`
    // never exempts the host and Node proxies. `bypassesProxy` already had
    // this right; the row is here so both reads are pinned by one table.
    expect(bypassesProxy(API_HOST, { no_proxy: "", NO_PROXY: API_HOST })).toBe(false);
    expect(bypassesProxy(API_HOST, { no_proxy: API_HOST })).toBe(true);
    expect(bypassesProxy(API_HOST, { NO_PROXY: API_HOST })).toBe(true);
  });

  it("still says nothing is proxied when nothing is set", () => {
    expect(proxyUsable({ version: old, env: {} })).toEqual({ proxied: false, usable: true });
  });
});
