"use client";

import { z } from "zod";

const FIELD_COMPLETION_PREFIX = "nature-class:field-completion:v1:";

const fieldCompletionSchema = z
  .object({
    version: z.literal(1),
    ownerScope: z.string().regex(/^field_[a-f0-9]{32}$/),
    sessionId: z.string().min(1).max(240),
    completedAt: z.number().int().nonnegative(),
  })
  .strict();

export type FieldCompletion = z.infer<typeof fieldCompletionSchema>;

type FieldStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function hashPart(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A data-free runner has no teacher/class identity to put in local storage.
 * Its public core receipt becomes a deterministic opaque scope instead: no
 * name, school, class, coordinate or free text can leak into the key.
 */
export function fieldRunOwnerScope(coreFingerprint: string): string {
  const value = `nature-class-field\u0000${coreFingerprint}`;
  return `field_${[
    hashPart(value, 0x811c9dc5),
    hashPart(value, 0x9e3779b9),
    hashPart(value, 0x85ebca6b),
    hashPart(value, 0xc2b2ae35),
  ].join("")}`;
}

export function fieldCompletionKey(ownerScope: string, sessionId: string): string {
  return `${FIELD_COMPLETION_PREFIX}${ownerScope}:${encodeURIComponent(sessionId)}`;
}

/** Local storage is untrusted: accept only this exact public scope and lesson. */
export function parseFieldCompletion(
  raw: string | null,
  expected: { ownerScope: string; sessionId: string },
): FieldCompletion | null {
  if (!raw) return null;
  try {
    const parsed = fieldCompletionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (
      parsed.data.ownerScope !== expected.ownerScope ||
      parsed.data.sessionId !== expected.sessionId
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function browserStorage(): FieldStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readFieldCompletion(
  input: { ownerScope: string; sessionId: string },
  storage: FieldStorage | null = browserStorage(),
): FieldCompletion | null {
  if (!storage) return null;
  try {
    return parseFieldCompletion(
      storage.getItem(fieldCompletionKey(input.ownerScope, input.sessionId)),
      input,
    );
  } catch {
    return null;
  }
}

export function recordFieldCompletion(
  input: { ownerScope: string; sessionId: string; completedAt?: number },
  storage: FieldStorage | null = browserStorage(),
): FieldCompletion | null {
  if (!storage) return null;
  const value = fieldCompletionSchema.parse({
    version: 1,
    ownerScope: input.ownerScope,
    sessionId: input.sessionId,
    completedAt: input.completedAt ?? Date.now(),
  });
  try {
    const key = fieldCompletionKey(value.ownerScope, value.sessionId);
    storage.setItem(key, JSON.stringify(value));
    return parseFieldCompletion(storage.getItem(key), value);
  } catch {
    return null;
  }
}

/** Shared-device sign-out clears every minimal field completion receipt. */
export function clearFieldRunState(
  storage: FieldStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(FIELD_COMPLETION_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // A blocked store must never trap sign-out.
  }
}
