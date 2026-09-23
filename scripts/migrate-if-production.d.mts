/**
 * Types for `migrate-if-production.mjs`.
 *
 * The script is `.mjs` like every other tool in `scripts/`: it runs as
 * `node scripts/…` inside the Vercel build, before anything is compiled and
 * with no build step of its own. This declaration is how its spec still gets
 * typechecked — `tsconfig.json` sets `allowJs: false`, so without it the
 * import is an implicit `any` and the test asserts nothing about shape.
 */

/**
 * True only for a production build. Everything else — preview, development, a
 * local run, an unknown future value — must not touch the shared database's
 * schema (#680).
 */
export function shouldMigrate(env: string | undefined): boolean;
