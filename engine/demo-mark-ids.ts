/**
 * The demo mark ids (#252), in one place with no JSX in it.
 *
 * `engine/demo-marks.tsx` types its drawing table as `Record<DemoMarkId, …>`,
 * so adding a drawing without listing it here, or listing an id nobody drew,
 * fails the typecheck rather than shipping a step that silently renders no
 * picture. `scripts/validate-packs.mjs` imports this to reject a pack naming
 * a mark that does not exist — it cannot import the component itself without
 * pulling React into a build script.
 */
export const DEMO_MARK_IDS = [
  "m-dab",
  "m-leafdown",
  "m-press",
  "m-lift",
  "m-turn",
  "m-look",
  "m-high",
  "m-letgo",
  "m-acorn",
  "m-compare",
  "m-pickseed",
  "m-palmrest",
  "m-walk",
  "m-flathand",
  "m-breath",
  "m-stem",
  "m-shake",
  "m-papertrunk",
  "m-crayon",
  "m-stroke",
  "m-canopy",
  "m-open",
  "m-hand",
] as const;

export type DemoMarkId = (typeof DEMO_MARK_IDS)[number];
