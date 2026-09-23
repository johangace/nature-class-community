import { describe, expect, it } from "vitest";
import {
  reduceLessonConnection,
  type LessonConnectionState,
} from "@/lib/offline/connection-state";

describe("lesson connection state", () => {
  it("keeps the normal online lesson quiet", () => {
    expect(reduceLessonConnection("online", { type: "notice-expired" })).toBe(
      "online",
    );
  });

  it("treats a short signal loss as checking, then restored", () => {
    let state: LessonConnectionState = "online";
    state = reduceLessonConnection(state, { type: "signal-lost" });
    expect(state).toBe("checking");

    state = reduceLessonConnection(state, { type: "signal-restored" });
    expect(state).toBe("restored");
    expect(reduceLessonConnection(state, { type: "grace-elapsed" })).toBe(
      "restored",
    );
    expect(reduceLessonConnection(state, { type: "notice-expired" })).toBe(
      "online",
    );
  });

  it("moves a longer loss into working offline and recovers in place", () => {
    let state: LessonConnectionState = "online";
    state = reduceLessonConnection(state, { type: "signal-lost" });
    state = reduceLessonConnection(state, { type: "grace-elapsed" });
    expect(state).toBe("offline");

    state = reduceLessonConnection(state, { type: "signal-restored" });
    expect(state).toBe("restored");
    expect(reduceLessonConnection(state, { type: "notice-expired" })).toBe(
      "online",
    );
  });
});
