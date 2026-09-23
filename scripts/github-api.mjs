#!/usr/bin/env node
/**
 * The merge gate's GitHub transport (nc#1205).
 *
 * `scripts/merge-pr.mjs` used to reach GitHub by spawning `gh`. The containers
 * where this repository's merges are actually performed carry a token and no
 * `gh` on PATH, so the gate died on `spawnSync gh ENOENT` before evaluating a
 * single condition, and the merge went through only because the operator wrote
 * a throwaway `gh` shim in a scratchpad. That shim is the defect: it is
 * unreviewed, it is rewritten from memory by whoever hits the wall next, and it
 * sits on the path between a green gate and a real merge. `Wyld-Way/wyldway-office#634`
 * removed the same dependency from the shared portfolio tool for the same
 * reason; nc#859 had already moved the merge call itself to REST.
 *
 * So this file is the shim, written once, in the repository, with tests.
 *
 * WHY IT IS A SEPARATE PROCESS
 *
 * `merge-pr.mjs` is synchronous end to end — `execFileSync`, `sleepSync`,
 * `JSON.parse(api(...))` — and that is load-bearing rather than incidental: the
 * gate reads a fact and acts on it with nothing interleaved. Node has no
 * synchronous HTTP. Making the gate async to gain one would rewrite every
 * decision path in a 1900-line file whose whole purpose is to be trusted, so
 * the request runs in a child instead and the parent blocks on it exactly as it
 * blocked on `gh`. The child is `node` itself, which is by definition present.
 *
 * WHY IT SPEAKS `gh`'s ARGUMENT SHAPE
 *
 * Every call site passes an argv array and every test injects a fake `api` that
 * receives one. Keeping that shape means this change is a transport swap and
 * not a rewrite of 2000 lines of tests — the decisions stay exactly where they
 * were, which is nc#1205's third done-condition.
 *
 * THE PROXY, WHICH COST THE FIRST ATTEMPT ITS AFTERNOON
 *
 * Outbound HTTPS in these containers goes through an agent proxy that holds the
 * real credentials; `GH_TOKEN` there is the literal string `proxy-injected`.
 * Node's built-in `fetch` reads `HTTPS_PROXY` only when `NODE_USE_ENV_PROXY=1`
 * is set (Node >= 22.21). Without it the request leaves the container directly,
 * carrying the placeholder token, and GitHub answers `401 Bad credentials` —
 * which reads as a permissions problem and is not one. So the child sets that
 * variable for itself rather than depending on an operator's environment, and
 * where no proxy is configured (CI, a laptop) the variable changes nothing.
 */
import { execFileSync } from "node:child_process";
import { readSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** GitHub's REST host. Everything here is one repository's own API surface. */
export const API_ROOT = "https://api.github.com";
export const API_HOST = "api.github.com";

/**
 * Does `NO_PROXY` exempt this host from the configured proxy?
 *
 * The answer has to be the one Node's `fetch` would reach, because where this
 * says "bypassed" and Node would proxy, the version refusal is skipped and an
 * older Node sends the placeholder token straight to GitHub. Node's `fetch` is
 * undici's EnvHttpProxyAgent, so its rules are mirrored here — each one checked
 * against Node 24.20's real `fetch` through a loopback proxy counting CONNECTs
 * (nc#1205 review round 4):
 *
 *   · `no_proxy` is read BEFORE `NO_PROXY`, with `??` — an empty lowercase
 *     value still wins over a populated uppercase one.
 *   · Entries split on commas AND whitespace.
 *   · `*` exempts everything only as the WHOLE value; inside a list it is not
 *     a wildcard and Node proxies.
 *   · `host:port` exempts only that port. This request is HTTPS, so 443.
 *   · A bare name, a `.suffix` and a `*.suffix` match the host or a subdomain.
 *
 * A CIDR block or a bare IP range is NOT interpreted — this is asked about one
 * fixed hostname, and resolving it here would be a guess. An entry this cannot
 * read simply does not match, which leaves the proxy in play: the conservative
 * direction, since the cost is a refusal that names its cause rather than a
 * request sent unauthenticated.
 */
export function bypassesProxy(host, env = process.env, port = 443) {
  // The whole-value test is on the raw value: Node proxies for " * ".
  const list = String(env.no_proxy ?? env.NO_PROXY ?? "");
  if (list === "*") return true;
  const name = String(host).toLowerCase();
  return list
    .split(/[,\s]+/)
    .map((entry) => entry.toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      const qualified = /^(.+):(\d+)$/.exec(entry);
      if (qualified && Number.parseInt(qualified[2], 10) !== Number(port)) return false;
      const bare = (qualified ? qualified[1] : entry).replace(/^\*?\.?/, "");
      if (!bare) return false;
      return name === bare || name.endsWith(`.${bare}`);
    });
}

/**
 * Per-request ceiling. `gh` had none and neither did the `execFileSync` that
 * spawned it, so a wedged read held a merge session open until someone noticed.
 * A gate that cannot read its evidence must fail loudly (nc#837); it must not
 * hang. Sixty seconds is far past any answer this script waits on — the slowest
 * observed is the check-runs page — and well inside the poll interval's budget.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * `gh api` argv -> what to actually request.
 *
 * Only the forms this gate uses are accepted, and anything else throws rather
 * than being guessed at. A transport that silently does something adjacent to
 * what the caller asked for is the failure mode this file exists to remove.
 */
export function parseGhArgs(args) {
  if (!Array.isArray(args) || args[0] !== "api") {
    throw new Error(
      `github-api understands \`api\` calls only, got ${JSON.stringify(args?.[0] ?? args)}. ` +
        "Every read and the merge itself are REST; if a caller needs something else, it " +
        "belongs here as an explicit case rather than as a second transport.",
    );
  }
  let method = null;
  let path = null;
  let jq = null;
  const fields = {};
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--method" || arg === "-X") {
      method = args[i + 1];
      i += 1;
    } else if (arg === "-f" || arg === "--field" || arg === "--raw-field") {
      const pair = String(args[i + 1] ?? "");
      const eq = pair.indexOf("=");
      if (eq <= 0) throw new Error(`field must be key=value, got ${JSON.stringify(pair)}`);
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      // `gh api -f 'labels[]=track:infra'` builds a JSON array, and a body with
      // an array in it is what `POST /issues` needs to carry a label (nc#1206).
      // Implemented as gh's own documented shape rather than a flag of our own,
      // so a caller who knows `gh` needs to learn nothing here — and repeating
      // the key appends, which is how one writes two labels.
      if (key.endsWith("[]")) {
        const name = key.slice(0, -2);
        if (!name) throw new Error(`array field needs a name before [], got ${JSON.stringify(key)}`);
        const existing = fields[name];
        if (existing !== undefined && !Array.isArray(existing)) {
          throw new Error(`field ${JSON.stringify(name)} is set both as a value and as an array`);
        }
        fields[name] = [...(existing ?? []), value];
      } else {
        if (Array.isArray(fields[key])) {
          throw new Error(`field ${JSON.stringify(key)} is set both as a value and as an array`);
        }
        fields[key] = value;
      }
      i += 1;
    } else if (arg === "--jq" || arg === "-q") {
      jq = args[i + 1];
      i += 1;
    } else if (String(arg).startsWith("-")) {
      throw new Error(`github-api does not implement ${arg}`);
    } else if (path === null) {
      path = String(arg);
    } else {
      throw new Error(`github-api takes one path, got a second: ${JSON.stringify(arg)}`);
    }
  }
  if (!path) throw new Error("github-api needs a path, e.g. repos/owner/name/pulls/1");
  const hasFields = Object.keys(fields).length > 0;
  return {
    method: (method ?? (hasFields ? "POST" : "GET")).toUpperCase(),
    path,
    fields: hasFields ? fields : null,
    jq: jq ?? null,
  };
}

/**
 * The one `--jq` expression this gate asks for, and nothing more.
 *
 * `readBehindBy` narrows the compare read to `.behind_by` because the whole
 * comparison is megabytes on a branch carrying evidence bundles (nc#837, nc#749).
 * That is a single top-level field, so that is what is implemented. A filter
 * this cannot evaluate throws: `readBehindBy` already accepts a whole
 * comparison object as its fallback, and an answer that silently was not
 * filtered is still an answer it can read — but one that was filtered WRONG is
 * not, and absence of evidence is the whole of nc#535.
 */
export function selectField(body, jq) {
  if (!jq) return body;
  const match = /^\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(String(jq).trim());
  if (!match) {
    throw new Error(
      `github-api implements only a single top-level field filter, not ${JSON.stringify(jq)}`,
    );
  }
  const value = JSON.parse(body)?.[match[1]];
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The token this repository's automation authenticates with. */
export function readToken(env = process.env) {
  return env.GH_TOKEN || env.GITHUB_TOKEN || "";
}

/**
 * Is a proxy configured for this request, and can this `node` actually use it?
 * (nc#1205, review round 1.)
 *
 * `NODE_USE_ENV_PROXY` was introduced in Node 22.21. The repository's `.nvmrc`
 * says `22`, which resolves to the newest 22 in CI but to whatever a
 * contributor's version manager has locally — so on Node 22.0–22.20 the
 * variable is IGNORED, the request leaves the container directly carrying the
 * placeholder token the proxy was supposed to replace, and GitHub answers
 * `401 Bad credentials`. Every gate read fails, and it fails as a permissions
 * problem that is not one.
 *
 * Refusing with the cause named is the whole point. The alternative remedy —
 * pinning the repository's Node — is a change to `.nvmrc`, CI and every
 * contributor's setup, which is a wider decision than this transport gets to
 * make. This refusal costs a `nvm install 22` and says so; the 401 costs an
 * afternoon, as it already did once.
 *
 * Conservative on purpose: 22.21+ and 24+ are the releases known to carry it.
 * Node 23 is end-of-life and is not assumed to. A version this cannot vouch for
 * refuses only when a proxy is actually configured — with none, nothing about
 * the request depends on the switch.
 *
 * ── WHICH VARIABLE, AND WHY IT IS NOT ONE CHAIN (nc#1229) ──────────────────
 *
 * This read used to be `HTTPS_PROXY || https_proxy || HTTP_PROXY ||
 * http_proxy`: uppercase first, and `||` stepping over an empty value. That
 * disagreed with `bypassesProxy` forty lines above, which reads `no_proxy ??
 * NO_PROXY` — lowercase first, empty wins — and the disagreement was not
 * cosmetic, because Node's rule is the second one.
 *
 * Measured on Node v22.22.2 by asking `api.github.com` for its own rate limit:
 * through this container's proxy the answer is credential-injected and reports
 * `limit: 15000`, direct it reports the anonymous `limit: 60`. Nine rows, and
 * every one of them is a case some plausible implementation gets wrong:
 *
 *   | env                                          | observed  |
 *   | -------------------------------------------- | --------- |
 *   | `HTTPS_PROXY` set (control)                  | 15000     |
 *   | `https_proxy=""`, `HTTPS_PROXY` set          | **60**    |
 *   | `HTTPS_PROXY=""`, `https_proxy` set          | 15000     |
 *   | `http_proxy=""`, `HTTP_PROXY` set            | **60**    |
 *   | `http_proxy` set, no https pair              | 15000     |
 *   | `https_proxy=""`, `http_proxy` set           | **15000** |
 *   | `https_proxy=""`, `HTTPS_PROXY` + `http_proxy` set | **15000** |
 *   | `https_proxy` set, `http_proxy=""`           | 15000     |
 *   | nothing set (control)                        | 60        |
 *
 * Two different rules, which is why this is two expressions and not one chain:
 *
 *   · WITHIN a pair, lowercase wins even when it is empty — `??`.
 *   · ACROSS the pairs, an empty https pair falls THROUGH to the http pair —
 *     `||`. An https request really does use `http_proxy`.
 *
 * The single chain `https_proxy ?? HTTPS_PROXY ?? http_proxy ?? HTTP_PROXY`
 * reads like the rule and breaks rows six and seven: an empty `https_proxy`
 * would end the chain, this would report `proxied: false`, and an old Node
 * would sail past the refusal and send the placeholder token straight out —
 * the exact 401 this function exists to prevent, one variable over. Narrowing
 * to the https pair breaks row five the same way.
 */
export function proxyUsable({ version = process.versions.node, env = process.env } = {}) {
  const pair = (lower, upper) => String(env[lower] ?? env[upper] ?? "");
  const proxy = pair("https_proxy", "HTTPS_PROXY") || pair("http_proxy", "HTTP_PROXY");
  if (!proxy) return { proxied: false, usable: true };
  // Node parses HTTP_PROXY/HTTPS_PROXY/NO_PROXY together, so a proxy variable
  // being set is not the same as THIS host going through it (review round 2).
  // With `NO_PROXY=*`, or a list that names api.github.com, the request is
  // supposed to connect directly and an older Node needs nothing from the
  // switch — refusing there would be a refusal on a run that works.
  if (bypassesProxy(API_HOST, env)) return { proxied: false, usable: true };
  const [major, minor] = String(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const usable = major >= 24 || (major === 22 && minor >= 21);
  return { proxied: true, usable, version: String(version) };
}

/**
 * Perform one request. Returns `{ status, body }` for every answer GitHub
 * gives, including the refusals — deciding what a 409 or a 405 MEANS is
 * `merge-pr.mjs`'s job and stays there.
 */
export async function callGitHub(spec, { fetchImpl = fetch, env = process.env, version } = {}) {
  const proxy = proxyUsable(version === undefined ? { env } : { env, version });
  if (proxy.proxied && !proxy.usable) {
    throw new Error(
      `this node (v${proxy.version}) ignores NODE_USE_ENV_PROXY, and a proxy is configured. ` +
        "The request would leave directly with whatever token is in the environment — which " +
        "in a proxied container is a placeholder — and GitHub would answer 401 Bad " +
        "credentials, a false answer rather than a missing one. Node 22.21+ (or 24+) " +
        "carries the switch; `.nvmrc` says 22, so a version manager can hand you an older " +
        "one. Refusing rather than reading the gate's evidence through an unauthenticated " +
        "connection (nc#1205).",
    );
  }
  const token = readToken(env);
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nature-class-merge-gate",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method: spec.method, headers, redirect: "error" };
  if (spec.fields) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(spec.fields);
  }
  if (typeof AbortSignal?.timeout === "function") {
    init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }
  const url = `${API_ROOT}/${String(spec.path).replace(/^\/+/, "")}`;
  const response = await fetchImpl(url, init);
  return { status: response.status, body: await response.text() };
}

/**
 * The first line of a GitHub error body, for the parent's error message.
 * `merge-pr.mjs` matches `409` and `405` out of the text it is handed, so the
 * status has to be in there as a bare number and the reason has to be legible.
 */
export function errorSummary(status, body) {
  let message = "";
  try {
    const parsed = JSON.parse(body);
    message = parsed?.message ?? "";
  } catch {
    message = String(body ?? "").split("\n")[0];
  }
  return `HTTP ${status} from api.github.com${message ? `: ${message}` : ""}`;
}

/** This file, as a path a child `node` can be pointed at. */
export const API_HELPER = fileURLToPath(import.meta.url);

/**
 * Per-call stdout ceiling for the parent (nc#1206).
 *
 * Node caps a child's stdout at 1 MiB and KILLS the child on overrun, so a
 * caller that does not raise this loses a big read as a crash rather than as an
 * answer — nc#837 for the merge gate, and the same shape here: an unfiltered
 * page of a hundred pull requests is comfortably past a megabyte, which is
 * exactly what `branch-salvage-sweep` asks for now that it projects the JSON
 * itself instead of asking `--jq` to shrink it upstream.
 */
export const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * One `gh api` call from a synchronous script, answered by this file in a child
 * process. Returns stdout, trimmed.
 *
 * This is the parent half of the transport, and it lives here so that a script
 * needing GitHub does not have to rediscover the two details that make it work:
 * the child must be spawned with `NODE_USE_ENV_PROXY=1` (see the header — a
 * proxied container's `GH_TOKEN` is a placeholder and Node's `fetch` reads
 * `HTTPS_PROXY` only when asked), and the buffer must be raised. Both were
 * learned expensively on nc#1205 and were, until nc#1206, written down only
 * inside `merge-pr.mjs`, where the three other scripts that spawn GitHub could
 * not reach them.
 *
 * `merge-pr.mjs` CALLS HERE NOW (nc#1261). It kept its own copy of this spawn
 * through nc#1206, because `guard-mutation-check`'s
 * `test/merge-gate-max-buffer-dropped` entry pinned that copy by its exact
 * source text and rewriting the gate's transport was not that ticket's to do.
 * The copies were kept in step by that guard on one side and this file's tests
 * on the other — and they had already drifted where nothing was watching: the
 * gate's buffer was 32 MiB against this file's 64. The guard moved down here
 * with the mechanism, so deleting the allowance below now fails the merge
 * gate's own regression test rather than only a copy of it.
 *
 * Errors are left to throw. `execFileSync` attaches the child's stderr to the
 * error, which is where a caller reads the status and the reason out of — a
 * transport that turned a refusal into an empty answer would be the failure
 * mode this whole file exists to remove.
 */
export function ghApiSync(
  args,
  { helperPath = API_HELPER, maxBuffer = DEFAULT_MAX_BUFFER, env = process.env, ...opts } = {},
) {
  return (
    execFileSync(process.execPath, [helperPath], {
      encoding: "utf8",
      maxBuffer,
      input: JSON.stringify(args),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...env, NODE_USE_ENV_PROXY: "1" },
      ...opts,
    }) ?? ""
  ).trim();
}

/**
 * The child's whole job: read an argv array as JSON on stdin, put the answer on
 * stdout, and exit non-zero with the status in the message when GitHub refuses.
 */
export async function run({ stdin, stdout, stderr, env = process.env, fetchImpl = fetch } = {}) {
  let spec;
  try {
    spec = parseGhArgs(JSON.parse(stdin));
  } catch (error) {
    stderr(`github-api: ${error.message}\n`);
    return 2;
  }
  let answer;
  try {
    answer = await callGitHub(spec, { fetchImpl, env });
  } catch (error) {
    // A transport failure is not an answer about the pull request, and must not
    // read as one. It leaves stdout empty and exits non-zero (nc#571).
    stderr(`github-api: ${String(error?.message ?? error)}\n`);
    return 3;
  }
  if (answer.status < 200 || answer.status >= 300) {
    stdout(answer.body);
    stderr(`github-api: ${errorSummary(answer.status, answer.body)}\n`);
    return 1;
  }
  try {
    stdout(selectField(answer.body, spec.jq));
  } catch (error) {
    stderr(`github-api: ${error.message}\n`);
    return 2;
  }
  return 0;
}

/**
 * The request spec arrives on stdin rather than in argv, so a squash message
 * carrying an arbitrary pull-request body never has to fit an argument list or
 * appear in the process table.
 */
function readStdin() {
  const chunks = [];
  const buffer = Buffer.alloc(65_536);
  for (;;) {
    let read = 0;
    try {
      read = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error.code === "EAGAIN") continue;
      if (error.code === "EOF") break;
      throw error;
    }
    if (read === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, read)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run({
    stdin: readStdin(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
