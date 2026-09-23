/**
 * `server-only` has no npm package here: Next.js aliases the bare specifier to
 * its own compiled copy at build time, which is why `import "server-only"`
 * works in the app and resolves to nothing under vitest. A module that carries
 * the guard is still worth testing, so the runner gets this empty stand-in.
 *
 * It is deliberately empty. The guard's job is to fail a CLIENT bundle that
 * imports a server module; vitest runs neither bundle, so there is nothing
 * here to assert and nothing to fake.
 */
export {};
