# Test spine (#58)

The smallest maintainable harness that can reproduce a P0 defect and prove
the invariants #65's Checkpoint A leans on. Three layers, in the order CI
runs them:

## `tests/unit` — Vitest, no database

Pure logic and pack data, run with `npm test`. No setup required; this is
what should stay green with zero external state.

- `pack-validation.spec.ts` — schema-plus-semantic pack invariants (unique
  ids, unique phase keys, ability bands, duration consistency, childSheet
  presence) and shelf semantics (every `seasonShelf` entry resolves, no
  unexpected duplicate titles reach a teacher). Same checks as
  `scripts/validate-packs.mjs` (the standalone CLI command #58 asks for),
  imported against the REAL `lib/pack.ts` shelf definition so the two can't
  silently drift.
- `completion-minutes.spec.ts` — pins the north-star metric's rounding and
  capping rules (`lib/teacher.ts`'s `completionMinutes`) directly against the
  documented behavior, including the exact regression #58's history names
  (a 33-second session crediting ~13 minutes, not the 840 the old uncapped
  math produced).
- `pointmoon-cache-isolation.spec.ts` — a REPRODUCING test for the open P0 at
  `lib/outside/pointmoon.ts`: the Pointmoon field-truth cache is a single
  module-level variable with no location key, so two schools querying inside
  the same 15-minute TTL window silently receive each other's weather and
  sightings. This test passes TODAY (proving the bug exists) and is written
  to start failing the moment #49 lands a location-keyed cache — see its
  file comment for the exact line to change then.
- `commit-identity.spec.ts` — the guard for #834, the failure that PASSES every
  other gate. A Codex branch carrying commits authored
  `johan gace <gace.johan3@gmail.com>` clears the CLA check (the founder's login
  is allowlisted), clears `merge-pr.mjs` (which reads no authorship), and reads
  in `git log` as Johan's own work. Each scenario builds a REAL scratch
  repository with a real borrowed-identity commit and requires
  `scripts/commit-identity-check.mjs` to go red and to NAME the SHA — a check
  nobody has watched fail is not a check. The mirror cases carry the same weight:
  Johan's own `fix/…` branch, a correctly-authored `codex/…` branch and an
  outside contributor all stay green, because a guard that refuses the founder's
  own branches is one that gets switched off within a week. Nothing here writes
  outside `os.tmpdir()`.

## `tests/integration` — Vitest, real Postgres

Ownership and idempotency, run against a real migrated database — no mocked
Prisma client. Self-skips when `DATABASE_URL` is unset (`describe.skipIf`),
so `npm test` never fails for someone without a database, and still runs
the (larger) unit layer. See `tests/integration/README.md` for how to stand
up the fixture database locally; CI provisions it as a service container.

- `completion-ownership-and-idempotency.spec.ts` — the exact `class.findFirst`
  ownership scope `app/api/completions/route.ts` runs (a stranger's
  `teacherId` never resolves someone else's class), the `clientKey` upsert
  that makes an offline retry a no-op rather than a duplicate row, a
  cross-session key collision raising rather than silently merging two
  different sessions' data, and the pre-idempotency-key fallback (many null
  `clientKey`s coexisting) still writing distinct rows.

## `tests/e2e` — Playwright, one golden path

`npm run test:e2e` (needs `next build` run first, and the same fixture
database as the integration layer — `DATABASE_URL` set before Playwright's
`webServer` boots `next start`). The signed-in leg also needs
`BETTER_AUTH_URL=http://localhost:3512` set before that same `next start` —
matching `playwright.config.ts`'s fixed `PORT`, not `.env.example`'s
dev-server default of 3500. Without it, Better Auth logs "Base URL is not
set" and a client-side session check bounces an already-authenticated page
back to `/sign-in`, which looks like the fixture is broken when it isn't.

**The browser (nc#1290).** `@playwright/test` pins a browser *build*, not a
version range, so a container that ships its own browser under
`PLAYWRIGHT_BROWSERS_PATH` usually ships the wrong one and the suite dies
before the first test with `Executable doesn't exist at …`. That error names a
path rather than a mismatch, which reads as a broken image; it cost the worker
on #1286, where the repeat-run was the whole ticket, a second config file and
the time to find out why. `playwright.config.ts` resolves it itself:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` wins when set; otherwise nothing is overridden
where the pinned build is fully installed (CI, and any laptop that has run `npx
playwright install --with-deps chromium`); otherwise the pinned build's own
full browser, where a pruned cache has it but not the headless shell a headless
launch actually runs; otherwise `$PLAYWRIGHT_BROWSERS_PATH/chromium`. The last
two say so on stderr — the last one because it is a different engine and a
timing or rendering measurement should carry that.
`tests/unit/playwright-browser-resolution.spec.ts` holds all four branches,
including the macOS layout no runner here has. Do not write a second
Playwright config beside that one to work around this; there is nothing left
for it to fix, and
a stray `playwright.config.*.ts` is the kind of local file that gets committed
by accident.

- `golden-path.spec.ts` — the arc #58 names: doorstep → steps → finish,
  reproduced signed-out where the ticket says to prefer that ("reproducing
  tests for the open P0 class where feasible signed-out"); an offline-queue
  test that fails the completions POST via network interception, confirms
  the "kept on this iPad" state, then restores connectivity and asserts the
  queued completion is resent EXACTLY once (proves both the "not lost" and
  the "not double-counted" halves of the offline story); and a signed-in
  leg (via `seed.ts`) proving `/journal` and `/season` render for an
  onboarded teacher.
- `seed.ts` — seeds a teacher, a class, and a live Better Auth `Session` row
  directly through Prisma, then sets the resulting `better-auth.session_token`
  cookie on the Playwright browser context. This is not a mock of auth:
  Better Auth's own session lookup reads this exact row the same way it
  would read one created by a real magic-link exchange. Driving the actual
  magic-link email or a WebAuthn passkey ceremony in a headless browser is
  either infeasible (passkey, no virtual authenticator configured here) or
  slow/flaky (scraping a server-logged URL); seeding the row is the standard
  pattern for testing a passwordless app and keeps the golden path fast.

## What this does NOT cover yet (intentionally, per "spine not cathedral")

- The full onboarding wizard (`/start`'s multi-screen flow) end to end —
  the signed-in golden-path leg seeds a class directly rather than walking
  every onboarding screen. `/start` itself has no automated coverage yet.
- HTTP-layer behavior of `/api/completions` (status codes, zod rejection
  messages) — the integration layer proves the Prisma-level invariants the
  route depends on; a `next-test-api-route-handler`-style HTTP test is a
  natural fast-follow, not included here.
## Update (nc#607): the e2e layer now runs in CI

The bullet that used to sit here said the Playwright suite was "not wired
into `.github/workflows/ci.yml` in this PR… wiring it into CI is a
reasonable next step once it has proven stable outside CI first." It stayed
a next step for months, and the cost of that is on the record: four of the
five tests in `golden-path.spec.ts` and `journey-resume.spec.ts` sat red on
`main` for ten days (#583) while every build reported green, because
`playwright` appeared nowhere in any workflow file and `npm test` (vitest)
excludes `tests/e2e` by configuration.

The whole suite now runs in `ci.yml`'s `build` job, on every push and every
pull request, after `Build`:

```yaml
- name: Install Playwright browser
  run: npx playwright install --with-deps chromium
- name: End-to-end tests
  run: npx playwright test
```

It reuses that job's Postgres service, its `prisma migrate deploy` and its
`next build` — `playwright.config.ts`'s `webServer` runs `next start` only
and never builds, so nothing is done twice — and the job's
`BETTER_AUTH_URL: http://localhost:3512` already matches the config's fixed
`PORT`, which is the setting #584 found the signed-in fixture needs.

`retries` is 1 under CI and `workers` is 1, both in `playwright.config.ts`
already. A retry rescues a genuine flake and cannot rescue a regression: the
#583 defect, re-planted to prove this wiring bites, failed identically on
its retry. On failure the traces `trace: "retain-on-failure"` writes are
uploaded as the `playwright-trace` artifact, so a red run can be read rather
than re-run.

`scripts/guard-mutation-check.mjs` holds the step to the same standard as
every other check in that file: `e2e/celebration-regrows-a-claim` (slow
tier) makes the hybrid journey's celebration say "Beautifully done." again —
the claim nc#458 removed — and requires the suite to go red naming the
lesson it should have named instead.

## Update (nc#651): a spec never writes to the working tree

`standards-catalog.spec.ts` and `verbatim-fidelity-guard.spec.ts` are mutation
tests — the only way to show a guard bites is to damage what it guards — and
they used to do that damage to the real files: `writeFileSync` on
`packs/summer.json`, `packs/autumn-garden.json` and
`scripts/lib/standards-catalog.json`, restored in a `finally`.

Restoring is not enough. vitest runs spec files in parallel and `loadPack()`
reads a pack off disk on every call, so any of the other ~150 spec files could
read a pack mid-write: on clean `main`, `season-turns.spec.ts` failed with
`SyntaxError: Unexpected end of JSON input` in a full run and passed 13/13 on
its own. That is the "a different test fails each run" this ticket was filed
for. Worse, a run killed between the write and the restore leaves a truncated
grant pack in the working tree.

So mutation happens somewhere else entirely. `tests/support/guard-sandbox.ts`
copies everything a guard reads (`scripts/`, `packs/`, `fixtures/`) into a temp
directory and runs the guard there — the same discipline
`scripts/guard-mutation-check.mjs` has used since it was written. A guard's
GREEN case still runs against the real repository, read-only, because "passes
on the packs as they ship" has to mean the packs that ship.

`packs-survive-the-suite.spec.ts` holds the rule: it finds every spec that can
write to disk at all, runs exactly those in a child vitest, and compares the
guarded trees byte for byte and mtime for mtime across that run. A spec added
tomorrow that mutates a pack in place is caught without anyone updating a list.

## Update (nc#951): the retry is an independent trial

`playwright.config.ts` retries once under CI, and that retry is the whole
difference between "a flake" and "a regression". It could only tell them apart
by luck: nothing put the database back between the failed attempt and the
retry, so the second attempt began wherever the first one stopped. A pass could
be passing *because* of the leftovers, and a failure was not new information.

The suite nearly got away with it — `seed.ts` gives each test a fresh
random-email teacher and cascades the tree off that `User` row, and every spec
calls `cleanup()` from a `finally`. But a `finally` only runs if control reached
its `try`, and three of the six seed call sites write to the database before
theirs: `location-feedback.spec.ts` nulls the class's coordinates,
`shared-grounds.spec.ts` adds a second class, and `seed.ts` itself creates the
user before the class it might fail on. Anything thrown in those windows leaks a
row no `cleanup()` owns.

So each attempt now guarantees its own starting state rather than inheriting a
promise the previous one may not have kept:

- `tests/e2e/reset.ts` deletes every `pw-e2e-…` teacher (cascading to `Class`,
  `Session`, `Grounds`, `WorldFact`, `PointmoonRead`, `CastMember`,
  `SessionCompletion`, `AiRateLimit`, `Account`, `Passkey`) plus the
  `Verification` rows that name one — then RE-COUNTS and throws on anything that
  survived. A sweep that cannot fail is worth what nc#554's empty lint was
  worth; this one goes red when its predicate stops matching, when a relation
  stops cascading, or when it is pointed at the wrong database.
- `tests/e2e/fixtures.ts` runs it as an `auto: true` fixture, so it happens
  before every attempt whether or not the spec knows it exists. Every spec takes
  its `test` from there rather than from `@playwright/test`.
- `scripts/e2e-reset-lint.mjs` (CI step "E2E reset lint") holds that wiring:
  opting out of the fixture looks exactly like the import line every Playwright
  example opens with, and the fixture can be neutered without a single spec
  changing. Three entries in `scripts/guard-mutation-check.mjs` prove it bites.
- `tests/unit/e2e-reset.spec.ts` is the behavioural half no grep can cover: it
  runs the sweep against a client whose delete does nothing, and requires it to
  throw.

Specs keep their `cleanup()` calls. Leaving a tidy database is still good
manners, and it is what keeps the fixture's `found` counts meaningful — when the
sweep does find something, it says so in the CI log and names the test that was
about to inherit it.
