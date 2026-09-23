import { describe, expect, it } from "vitest";

import { contributorsFromLog, nextVersion, releaseMessage } from "../../scripts/publish-community.mjs";

describe("publishing a Community release", () => {
  it("tags the next patch version, in numeric order", () => {
    expect(nextVersion([])).toBe("v1.0.0");
    expect(nextVersion(["v1.0.0"])).toBe("v1.0.1");
    expect(nextVersion(["v1.0.9", "v1.0.10", "v1.0.2", "not-a-version"])).toBe("v1.0.11");
    expect(nextVersion(["v1.0.4", "v1.1.0"])).toBe("v1.1.1");
  });

  it("credits outside contributors once, and not maintainers or machines", () => {
    const log = [
      "Johan <45638957+johangace@users.noreply.github.com>",
      "Ada Teacher <ada@example.org>",
      "rewyld-claude[bot] <299630839+rewyld-claude[bot]@users.noreply.github.com>",
      "Claude Opus 5.5 <noreply@anthropic.com>",
      "Ada Teacher <ADA@example.org>",
      "",
      "Sam Coder <sam@example.net>",
    ].join("\n");
    expect(contributorsFromLog(log)).toEqual(["Ada Teacher <ada@example.org>", "Sam Coder <sam@example.net>"]);
  });

  it("names the source commit and carries the credits as trailers", () => {
    const message = releaseMessage({
      version: "v1.0.1",
      sourceSha: "a".repeat(40),
      contributors: ["Ada Teacher <ada@example.org>"],
    });
    expect(message.split("\n")[0]).toBe("Nature Class Community 1.0.1");
    expect(message).toContain(`Source: ${"a".repeat(40)}`);
    expect(message.trim().endsWith("Co-authored-by: Ada Teacher <ada@example.org>")).toBe(true);
    expect(releaseMessage({ version: "v1.0.2", sourceSha: "b".repeat(40), contributors: [] })).not.toContain("Co-authored-by");
  });
});
