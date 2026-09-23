/**
 * Types for `acronyms.mjs`.
 *
 * The module is `.mjs` because `scripts/caps-lint.mjs` imports it and CI runs
 * that with `node`, no build step. This file is how the register spec still
 * gets typechecked: `tsconfig.json` sets `allowJs: false`, so without a
 * declaration the import is an implicit `any` and the assertion asserts
 * nothing about shape. Same pattern as `register-lint.d.mts`.
 */

/** The two readers this repo writes for. */
export type Audience = "child" | "teacher";

export const CHILD: "child";
export const TEACHER: "teacher";

/** Phenology field -> the reader it is written for. */
export const FIELD_AUDIENCE: Record<string, Audience>;

/** Acronym -> the readers it may be spelled in front of. */
export const ACRONYMS: Record<string, readonly Audience[]>;

export function allowedFor(term: string, audience: Audience): boolean;

export function allowedInField(term: string, field: string): boolean;

export function termsFor(audience: Audience): Set<string>;
