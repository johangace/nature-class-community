import { PrismaClient } from "@prisma/client";

/**
 * A single Prisma client for the whole app. Next.js dev hot-reloads modules,
 * which would otherwise spawn a new client (and a new connection pool) on every
 * reload and exhaust the database. Stashing it on globalThis in development
 * keeps exactly one. Standard Prisma-on-Next pattern.
 *
 * This is the account layer's data access; the cold-URL demo path never
 * touches it — packs still load from disk (lib/pack.ts), no DB required.
 *
 * A PREVIEW MAY NOT TOUCH THE DATABASE PRODUCTION IS SITTING ON
 *
 * nc#680, second half. `DATABASE_URL` is scoped Production AND Preview on this
 * project, so every preview deployment — every branch, from the night loop,
 * from Codex, from anyone — connects to the live database with the live
 * credentials. `scripts/migrate-if-production.mjs` closed the sharper half of
 * this: a branch can no longer reshape the schema. It did nothing about reads
 * and writes against real rows, and as of 2026-09-01 those rows are real
 * teachers' classes.
 *
 * The obvious fix is to unscope the variable in Vercel, and it is not
 * available: the entry carries both targets at once, and removing the preview
 * target through the CLI deletes the entry outright — production loses its
 * database. Verified on a disposable variable rather than guessed.
 *
 * So the refusal lives here, which is better than a dashboard checkbox anyway:
 * it is version-controlled, it is tested, and it survives the Neon integration
 * re-provisioning those variables and quietly restoring both targets.
 *
 * WHEN A PREVIEW DATABASE EXISTS, THIS STOPS REFUSING
 *
 * Set `PREVIEW_DATABASE_IS_SEPARATE=true` on the Preview environment once a
 * Neon branch database is wired to previews. The escape hatch is deliberately
 * a statement about the world ("this is not production") rather than a mute
 * switch, so that turning it on while the variable still points at production
 * is a lie somebody has to type out.
 */
export function mayUseSharedDatabase(
  vercelEnv: string | undefined,
  previewDatabaseIsSeparate: string | undefined
): boolean {
  if (vercelEnv !== "preview") return true;
  return previewDatabaseIsSeparate === "true";
}

const REFUSAL =
  "[nature-class] This is a preview deployment, and DATABASE_URL points at the " +
  "production database (#680). Refusing to read or write real teachers' data " +
  "from an unreviewed branch. If a separate preview database is now wired, set " +
  "PREVIEW_DATABASE_IS_SEPARATE=true on the Preview environment.";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Refuse lazily, on first use, rather than at import.
 *
 * Throwing while this module is being imported would fail the preview build
 * itself, including for the many routes that import the client and never query
 * on the path being rendered. A page that does not touch the database should
 * still render on a preview — that is most of what a preview is for. So the
 * cost falls exactly where the risk is: the query.
 */
function refusingClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get() {
      throw new Error(REFUSAL);
    },
    apply() {
      throw new Error(REFUSAL);
    },
  });
}

export const prisma =
  globalForPrisma.prisma ??
  (mayUseSharedDatabase(
    process.env.VERCEL_ENV,
    process.env.PREVIEW_DATABASE_IS_SEPARATE
  )
    ? new PrismaClient()
    : refusingClient());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
