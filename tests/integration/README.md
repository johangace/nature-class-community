# Integration tests: fixture database

These tests hit a real Postgres, migrated with the repo's own Prisma
migrations — no mocked Prisma client. They self-skip (`describe.skipIf`) when
`DATABASE_URL` is unset, so `npm test` never fails for someone who hasn't set
up a database; the pure-logic majority of the suite (`tests/unit`) still runs
and still enforces the invariants that matter most day to day.

## Running them locally

Any local Postgres 14+ works. The convention this repo's other docs already
use is port 5544 (see `wyldway-office` context notes), reachable over TCP for
Prisma (a plain `pg_ctl -D <dir> -o "-p 5544 -h 127.0.0.1" start` cluster —
the Unix-socket form Postgres defaults to does not work with Prisma's
connection-string parser).

```bash
# one-time: create a scratch cluster
initdb -D /tmp/nc-test-pg -U postgres --auth=trust
pg_ctl -D /tmp/nc-test-pg -l /tmp/nc-test-pg/log -o "-p 5544 -h 127.0.0.1" start
psql "postgresql://postgres@127.0.0.1:5544/postgres" -c "CREATE DATABASE nature_class_test;"

# each run: migrate + test
export DATABASE_URL="postgresql://postgres@127.0.0.1:5544/nature_class_test"
export DATABASE_URL_UNPOOLED="$DATABASE_URL"
npx prisma migrate deploy
npx vitest run tests/integration
```

## What's covered here vs. what isn't

Covered: the two invariants #58 names explicitly — ownership (a completion
can only be written against a class the signed-in teacher actually owns) and
idempotency (a `clientKey` retry upserts onto the same row rather than
double-writing) — proven directly against Prisma and the migrated schema,
the same query shapes `app/api/completions/route.ts` uses.

Not covered here: the HTTP layer itself (auth cookie parsing, zod body
validation, the 401/403/400 status codes). Those need a running Next server
and are better exercised by the Playwright golden path
(`tests/e2e/golden-path.spec.ts`) or a future `next-test-api-route-handler`
addition — deliberately left out to keep this PR's harness the spine, not
the cathedral.
