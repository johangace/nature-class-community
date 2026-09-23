/**
 * Types for the pure guards exported by validate-prompts.mjs, so
 * tests/unit/prompt-contracts.spec.ts can watch the real check bite instead of
 * reimplementing it under `any`. The script stays .mjs, but since #1220 it runs
 * under tsx rather than bare `node`, so it can import the prompt registry
 * instead of parsing its source.
 */

/** The shared context keys a prompt's text may be permitted to point at. */
export const CONTEXT_KEYS: readonly string[];

/** One prompt as the registry names it. */
export interface RegistryEntry {
  id: string;
  file: string;
}

/**
 * The prompts `lib/ai/prompt-registry.ts` names, read from the exported object
 * rather than from a regex over its source.
 */
export function registryEntries(): RegistryEntry[];

export interface DeixisHit {
  /** The context key the phrase points at. */
  key: string;
  /** The matched phrase, whitespace collapsed. */
  phrase: string;
}

/** Every place `text` points at a shared context field. */
export function contextDeixis(text: string): DeixisHit[];

/** The keys `text` points at that `declared` does not guarantee. */
export function unsupportedDeixis(text: string, declared: readonly string[]): DeixisHit[];

export interface PromptContract {
  name: string;
  why?: string;
  shape?: string;
  /** Alternative regex sources; the contract is kept when any one matches. */
  anyOf: string[];
}

/** The contracts in `requirements` that `text` does not keep. */
export function missingContracts<T extends PromptContract>(
  text: string,
  requirements: readonly T[]
): T[];
