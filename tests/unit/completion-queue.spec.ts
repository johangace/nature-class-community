import { describe, expect, it } from "vitest";
import {
  completionClientKey,
  completionQueueKey,
  enqueueCompletion,
  isTerminalCompletionStatus,
  parseCompletionQueue,
  removeCompletionKeys,
  type CompletionDraft,
} from "@/lib/run/completion-queue";

/**
 * A completion can wait on a shared classroom iPad, but it must never leak
 * into another class's queue or be counted twice after a retry. The storage
 * boundary is deliberately smaller than the API body: the version and class
 * identity are validated here, then the network layer strips the version.
 */

const classId = "oak-room/year-2";

const valid: CompletionDraft = {
  version: 1,
  sessionId: "autumn-w2-leaf-collage",
  classId,
  startedAt: 1_723_456_789_000,
  endedAt: 1_723_459_189_000,
  headcount: 24,
  clientKey: "completion-oak-001",
};

describe("completionQueueKey", () => {
  it("gives each class a collision-safe queue", () => {
    expect(completionQueueKey(classId)).toBe(
      "nature-class:completion-queue:v1:oak-room%2Fyear-2"
    );
    expect(completionQueueKey("ash-room/year-2")).not.toBe(
      completionQueueKey(classId)
    );
  });
});

describe("completionClientKey", () => {
  it("is stable across a finish reload and distinct across classes", () => {
    const first = completionClientKey(classId, valid.sessionId, valid.startedAt);
    expect(completionClientKey(classId, valid.sessionId, valid.startedAt)).toBe(first);
    expect(completionClientKey("ash-room/year-2", valid.sessionId, valid.startedAt)).not.toBe(
      first
    );
    expect(first.length).toBeLessThanOrEqual(64);
  });
});

describe("parseCompletionQueue", () => {
  it("accepts only the strict current-version draft for the expected class", () => {
    expect(parseCompletionQueue(JSON.stringify([valid]), { classId })).toEqual([
      valid,
    ]);
  });

  it("keeps a completion when the optional headcount was left blank", () => {
    const { headcount: _headcount, ...withoutHeadcount } = valid;
    expect(
      parseCompletionQueue(JSON.stringify([withoutHeadcount]), { classId })
    ).toEqual([withoutHeadcount]);
  });

  it("drops cross-class, malformed, legacy, and unknown-field entries", () => {
    const invalidEntries = [
      { ...valid, classId: "ash-room/year-2", clientKey: "completion-ash-001" },
      { ...valid, version: 2, clientKey: "completion-oak-002" },
      { ...valid, headcount: 0, clientKey: "completion-oak-003" },
      { ...valid, clientKey: "completion-oak-004", childName: "do not store this" },
      { sessionId: valid.sessionId, classId, headcount: 24 },
      null,
    ];

    expect(
      parseCompletionQueue(JSON.stringify([valid, ...invalidEntries]), { classId })
    ).toEqual([valid]);
  });

  it("fails closed for absent, malformed, and non-array storage", () => {
    expect(parseCompletionQueue(null, { classId })).toEqual([]);
    expect(parseCompletionQueue("not json", { classId })).toEqual([]);
    expect(parseCompletionQueue(JSON.stringify(valid), { classId })).toEqual([]);
  });
});

describe("enqueueCompletion", () => {
  it("is idempotent by clientKey", () => {
    const once = enqueueCompletion([], valid);
    const twice = enqueueCompletion(once, { ...valid });

    expect(once).toEqual([valid]);
    expect(twice).toEqual(once);
  });

  it("keeps distinct completions in arrival order", () => {
    const next = { ...valid, clientKey: "completion-oak-002" };

    expect(enqueueCompletion([valid], next)).toEqual([valid, next]);
  });
});

describe("removeCompletionKeys", () => {
  it("removes only settled snapshot keys and preserves a later enqueue", () => {
    const later = { ...valid, clientKey: "completion-oak-later" };
    expect(removeCompletionKeys([valid, later], new Set([valid.clientKey]))).toEqual([
      later,
    ]);
  });
});

describe("isTerminalCompletionStatus", () => {
  it("drops only this endpoint's permanent client errors", () => {
    expect([400, 403].filter(isTerminalCompletionStatus)).toEqual([400, 403]);
  });

  it("keeps authentication, timeout, throttle, and server responses retryable", () => {
    for (const status of [401, 408, 425, 429, 500, 503]) {
      expect(isTerminalCompletionStatus(status), String(status)).toBe(false);
    }
  });
});
