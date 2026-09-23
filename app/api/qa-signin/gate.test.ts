import { test } from "node:test";
import assert from "node:assert/strict";
import { qaSigninGate } from "./gate.ts";

/**
 * Self-contained guard test for the dev/preview-only QA sign-in (#114). No DB,
 * no auth boot, no test-harness dependency (#58 builds that spine separately):
 * run with Node's built-in runner and type-stripping —
 *
 *   node --test --experimental-strip-types app/api/qa-signin/gate.test.ts
 *
 * The load-bearing assertion is the PRODUCTION behaviour: on the production
 * Vercel deployment the route must 404 no matter what secret is configured or
 * presented, because a QA sign-in path that can mint a session in production is
 * the exact hole #114 must never open.
 */

const SECRET = "test-secret";

test("production: 404 even with the secret configured AND presented", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: "production",
      configuredSecret: SECRET,
      presentedSecret: SECRET,
    }),
    404,
    "production must never mint a session, regardless of secret"
  );
});

test("production: 404 with no secret configured", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: "production",
      configuredSecret: undefined,
      presentedSecret: null,
    }),
    404
  );
});

test("preview without secret configured: 404 (door not opened)", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: "preview",
      configuredSecret: undefined,
      presentedSecret: SECRET,
    }),
    404
  );
});

test("development without secret configured: 404 (door not opened)", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: undefined, // local dev: VERCEL_ENV unset
      configuredSecret: undefined,
      presentedSecret: null,
    }),
    404
  );
});

test("preview with secret configured but not presented: 401", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: "preview",
      configuredSecret: SECRET,
      presentedSecret: null,
    }),
    401
  );
});

test("preview with wrong secret presented: 401", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: "preview",
      configuredSecret: SECRET,
      presentedSecret: "wrong",
    }),
    401
  );
});

test("preview with secret configured and correctly presented: 200", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: "preview",
      configuredSecret: SECRET,
      presentedSecret: SECRET,
    }),
    200
  );
});

test("local dev (VERCEL_ENV unset) with secret configured and presented: 200", () => {
  assert.equal(
    qaSigninGate({
      vercelEnv: undefined,
      configuredSecret: SECRET,
      presentedSecret: SECRET,
    }),
    200
  );
});
