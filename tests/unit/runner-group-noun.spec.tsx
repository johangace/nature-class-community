import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CircleTime } from "@/app/run/CircleTime";
import { AskAtTheDoor } from "@/app/run/HybridJourney";
import { GroupNounProvider } from "@/app/run/GroupNoun";
import { doorQuestions } from "@/lib/lesson/door";
import { loadAllPacks } from "@/lib/pack";
import { groupNoun } from "@/lib/group-profile";
import type { Session } from "@/schema/pack";

/**
 * THE RUNNER CALLED EVERYONE A CLASS (#1214).
 *
 * `groupType` is stored on the class record and has varied the copy on
 * `/world`, `/account` and `/classes` since #1156 — but `app/run` could not
 * reach it, so fourteen rendered strings told a family in a garden and a
 * Saturday nature club to gather their class. #467 fixed exactly one of them,
 * and fixed it by neutralising the word ("Settle everyone"), which is the
 * trade this repository declined to make for the rest: the school is the
 * majority audience and "class" is the word it uses.
 *
 * So the pin here is two-sided, and both sides matter:
 *
 *   A NON-SCHOOL GROUP IS NOT ADDRESSED AS A CLASS — the provider carries
 *   "family" or "group" and the words change.
 *
 *   A SCHOOL, AND A SIGNED-OUT VISITOR, STILL IS — the context default is
 *   "class", which is `groupNoun`'s own documented default: missing audience
 *   means an existing school record, not an inferred family.
 *
 * The two render tests below cover the two components a spec can mount
 * directly. The rest of the runner's interior is behind taps and this suite
 * has no DOM, so — in the idiom `circle-time-density.spec.tsx` established for
 * this component — the source is read instead, with comments stripped first:
 * prose that MENTIONS the word is not the word on screen. That source guard is
 * the part that holds over time. A future edit that types "Ask the class" back
 * into a render branch reddens here rather than shipping.
 */

const RUN_DIR = new URL("../../app/run/", import.meta.url);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function runSources(): Array<{ file: string; code: string }> {
  return readdirSync(RUN_DIR)
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
    .map((file) => ({
      file,
      code: stripComments(readFileSync(new URL(file, RUN_DIR), "utf8")),
    }));
}

/** A shipped session that actually asks a question at the door. */
function sessionWithADoorQuestion(): Session {
  const session = loadAllPacks()
    .flatMap((pack) => pack.sessions)
    .find((candidate) => doorQuestions(candidate).length > 0);
  expect(session, "no shipped session asks a question at the door").toBeDefined();
  return session as Session;
}

describe("the word the runner uses for the people in front of her", () => {
  it("calls a family a family on the circle screen", () => {
    const markup = renderToStaticMarkup(
      <GroupNounProvider noun="family">
        <CircleTime blocks={[]} ability={undefined} />
      </GroupNounProvider>
    );
    expect(markup).toContain("Gather your family in a circle");
    expect(markup).not.toContain("your class");
  });

  it("still calls a school a class, with no provider at all", () => {
    const markup = renderToStaticMarkup(<CircleTime blocks={[]} ability={undefined} />);
    expect(markup).toContain("Gather your class in a circle");
  });

  it("asks a nature club, not a class, at the door", () => {
    const session = sessionWithADoorQuestion();
    const club = renderToStaticMarkup(
      <GroupNounProvider noun="group">
        <AskAtTheDoor session={session} />
      </GroupNounProvider>
    );
    const school = renderToStaticMarkup(<AskAtTheDoor session={session} />);
    expect(club).toContain("Ask the group");
    expect(club).not.toContain("Ask the class");
    expect(school).toContain("Ask the class");
  });

  it("leaves no rendered 'the class' or 'your class' anywhere in the runner", () => {
    const offenders = runSources().flatMap(({ file, code }) =>
      [...code.matchAll(/(?:the|your) class\b/g)].map(
        (match) => `${file}: ${code.slice(Math.max(0, match.index - 40), match.index + 40).trim()}`
      )
    );
    expect(offenders, "every rendered use goes through useGroupNoun()").toEqual([]);
  });

  it("wires the noun into all three runners from the class record", () => {
    const page = stripComments(readFileSync(new URL("page.tsx", RUN_DIR), "utf8"));
    // The record already carried it; the page simply never read it.
    expect(page).toMatch(/groupType = active\.groupType/);
    expect(page).toMatch(/groupNoun\(groupType\)/);
    // Scroll, hybrid and legacy: a runner outside the provider silently keeps
    // the school word for everyone, which is the bug rather than a fallback.
    expect(page.match(/<GroupNounProvider /g) ?? []).toHaveLength(3);
  });

  it("keeps the school default that groupNoun documents", () => {
    expect(groupNoun(null)).toBe("class");
    expect(groupNoun("school")).toBe("class");
    expect(groupNoun("family")).toBe("family");
    expect(groupNoun("other")).toBe("group");
  });
});
