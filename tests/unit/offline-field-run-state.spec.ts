import { describe, expect, it } from "vitest";
import {
  clearFieldRunState,
  fieldCompletionKey,
  fieldRunOwnerScope,
  parseFieldCompletion,
  readFieldCompletion,
  recordFieldCompletion,
} from "@/lib/offline/field-run-state";

const sessionId = "summer-w1-counting-life";
const fingerprint = "a".repeat(64);

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("the data-free field run state", () => {
  it("derives an opaque resume scope from the public core receipt", () => {
    const scope = fieldRunOwnerScope(fingerprint);

    expect(scope).toMatch(/^field_[a-f0-9]{32}$/);
    expect(scope).not.toContain(fingerprint);
    expect(fieldRunOwnerScope(fingerprint)).toBe(scope);
    expect(fieldRunOwnerScope("b".repeat(64))).not.toBe(scope);
  });

  it("keeps a completion under one encoded scope and lesson key", () => {
    const scope = fieldRunOwnerScope(fingerprint);

    expect(fieldCompletionKey(scope, "counting/life")).toBe(
      `nature-class:field-completion:v1:${scope}:counting%2Flife`,
    );
  });

  it("accepts only the minimal local receipt for this scope and lesson", () => {
    const ownerScope = fieldRunOwnerScope(fingerprint);
    const safe = {
      version: 1 as const,
      ownerScope,
      sessionId,
      completedAt: 1_778_000_000_000,
    };

    expect(parseFieldCompletion(JSON.stringify(safe), { ownerScope, sessionId })).toEqual(safe);
    expect(
      parseFieldCompletion(JSON.stringify({ ...safe, childName: "Never store me" }), {
        ownerScope,
        sessionId,
      }),
    ).toBeNull();
    expect(
      parseFieldCompletion(JSON.stringify({ ...safe, ownerScope: fieldRunOwnerScope("b") }), {
        ownerScope,
        sessionId,
      }),
    ).toBeNull();
  });

  it("writes one device-only completion, reads it after reload, and purges it on sign-out", () => {
    const storage = memoryStorage();
    const ownerScope = fieldRunOwnerScope(fingerprint);
    const receipt = recordFieldCompletion(
      { ownerScope, sessionId, completedAt: 1_778_000_000_000 },
      storage,
    );

    expect(receipt).not.toBeNull();
    expect(readFieldCompletion({ ownerScope, sessionId }, storage)).toEqual(receipt);
    expect(JSON.stringify(receipt)).not.toMatch(/class|teacher|school|child|note|headcount/i);

    clearFieldRunState(storage);
    expect(readFieldCompletion({ ownerScope, sessionId }, storage)).toBeNull();
  });
});
