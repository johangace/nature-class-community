import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localizeDeep } from "@/lib/localization";
import { primaryTopicOf } from "@/lib/lesson/door";
import { hasTaxa } from "@/lib/outside/observations";
import type { Session } from "@/schema/pack";

/**
 * A TOPIC TAG IS A KEY, NOT A WORD (#1076).
 *
 * `primaryTopic` was reaching `localizeDeep` unheld, so a US class read the
 * tag `minibeasts` as `bugs` — the right word for the child, and not a
 * `TopicTag`. `hasTaxa` then answered false, which every consumer reads as
 * "taxonomy cannot express this topic", and the species filter turned itself
 * off: a minibeast hunt opened on a horse chestnut and an oak.
 *
 * The regression is silent by construction — no throw, no empty row, just a
 * broader one — so it is pinned against the shipped packs rather than a
 * fixture. Two assertions, and they are different questions: the VALUE must
 * survive the walk, and what survives must still be a tag the taxa table
 * knows.
 */

const sessions: Session[] = readdirSync(new URL("../../packs", import.meta.url))
  .filter((file) => file.endsWith(".json"))
  .flatMap(
    (file) =>
      JSON.parse(
        readFileSync(new URL(`../../packs/${file}`, import.meta.url), "utf8")
      ).sessions ?? []
  );

const authored = sessions.filter((session) => session.primaryTopic);

describe("a lesson's primary topic through the locale layer", () => {
  it("has sessions to speak for", () => {
    expect(authored.length).toBeGreaterThan(0);
  });

  it.each(authored.map((session) => [session.id, session] as const))(
    "%s keeps its tag in US English",
    (_id, session) => {
      expect(localizeDeep(session, "us").primaryTopic).toBe(session.primaryTopic);
    }
  );

  it("still answers the taxa table in both locales", () => {
    for (const session of authored) {
      for (const locale of ["uk", "us"] as const) {
        const topic = primaryTopicOf(localizeDeep(session, locale));
        expect(topic).toBe(session.primaryTopic);
        // Not every topic is taxonomic — art and senses are not — but a topic
        // that answers the table in UK English must answer it in US English.
        expect(topic && hasTaxa(topic)).toBe(
          session.primaryTopic ? hasTaxa(session.primaryTopic) : false
        );
      }
    }
  });
});
