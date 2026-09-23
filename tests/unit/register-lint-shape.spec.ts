import { describe, expect, it } from "vitest";
import {
  SHAPE_RULES,
  GRANDFATHERED,
  shapeFindings,
  auditGrandfathered,
  loadSessions,
  type LintSession,
} from "../../scripts/register-lint.mjs";

/**
 * The vitest half of the register lint's shape rules (#90).
 * `node scripts/register-lint.mjs` is the CLI half that CI runs on every push.
 *
 * What this file is for, beyond coverage: a rule that has never failed is not
 * a rule. Every rule below is exercised against a session that violates it AND
 * one that satisfies it, so a future edit that quietly declaws one turns red
 * here rather than passing silently for months, which is exactly how the word
 * bans survived as long as they did.
 */

const rule = (id: string) => {
  const found = SHAPE_RULES.find((r) => r.id === id);
  if (!found) throw new Error(`no shape rule "${id}"`);
  return found;
};

/** A session that satisfies every rule. Each test breaks exactly one thing. */
function goodSession(over: Partial<LintSession> = {}): LintSession {
  return {
    id: "fixture-good",
    kit: ["A5 card, one per child", "glue sticks"],
    phases: [
      { key: "settle", durationMin: 2, blocks: [{ type: "say-aloud", text: "Be still." }] },
      {
        key: "collect",
        durationMin: 12,
        blocks: [{ type: "demo", move: "The gentle pick-up" }],
      },
      { key: "create", durationMin: 15, blocks: [{ type: "say-aloud", text: "Stick it down." }] },
      { key: "circle", durationMin: 6, blocks: [{ type: "circle-question", text: "Which one?" }] },
    ],
    ...over,
  };
}

describe("shape rules pass a well-shaped session", () => {
  it("finds nothing wrong with the fixture", () => {
    expect(shapeFindings(goodSession())).toEqual([]);
  });

  it("passes every session on the shelf that already meets the bar", () => {
    // autumn-starter is the bar (#116's words), and winter-starter holds it
    // too. All ten must pass unaided — none of them is in GRANDFATHERED, so a
    // regression here is a red build.
    const starters = loadSessions().filter(
      (s) => s.__file === "autumn-starter.json" || s.__file === "winter-starter.json"
    );
    expect(starters).toHaveLength(10);
    for (const session of starters) {
      expect(shapeFindings(session), `${session.id} should be clean`).toEqual([]);
    }
  });
});

describe("make-beat", () => {
  const check = (s: LintSession) => rule("make-beat").check(s);

  it("fails a session with no demo block and a `None required` kit", () => {
    const hit = check(
      goodSession({
        kit: ["None required"],
        phases: [{ key: "awareness-1", durationMin: 8, blocks: [{ type: "say-aloud", text: "…" }] }],
      }),
    );
    expect(hit?.reason).toContain("no make beat");
  });

  it("treats `None required, hands only` as the same sentinel", () => {
    const hit = check(goodSession({ kit: ["None required, hands only"], phases: [] }));
    expect(hit).not.toBeNull();
  });

  it("fails an empty kit with no demo", () => {
    const hit = check(goodSession({ kit: [], phases: [] }));
    expect(hit?.reason).toContain("kit is empty");
  });

  it("passes a session whose only evidence is a named kit", () => {
    // spring-w1-seed-bombs' real shape: a Make phase, no `demo` block, real
    // materials. #90's demo-only wording would have failed this.
    expect(
      check(goodSession({ kit: ["Pack of wildflower seeds", "Clay"], phases: [] })),
    ).toBeNull();
  });

  it("passes a session whose only evidence is a demo block", () => {
    expect(check(goodSession({ kit: ["None required"] }))).toBeNull();
  });

  it("does not count a demo that exists only in a condition variant", () => {
    const hit = check(
      goodSession({
        kit: ["None required"],
        phases: [
          {
            key: "collect",
            durationMin: 12,
            blocks: [{ type: "say-aloud", text: "…" }],
            conditionVariants: [
              { when: "wet", phase: { key: "collect-wet", blocks: [{ type: "demo" }] } },
            ],
          },
        ],
      }),
    );
    expect(hit).not.toBeNull();
  });
});

/**
 * The twelve sessions #546 measured as false positives of #90's literal rule 1.
 * Split by what is actually true of them, because #553's third rule treats the
 * two halves differently and the split is the whole argument.
 */
const REAL_MAKE_BEAT_WITHOUT_A_DEMO = [
  "spring-w1-seed-bombs",
  "spring-w3-natural-paint-making",
  "spring-w4-bird-feeders",
  "summer-w2-minibeast-hunting",
  "summer-w3-a5-leaf-collage",
  "autumn-w1-fruit-and-seed",
  "autumn-w3-where-the-leaves-go",
  "autumn-w4-getting-ready-for-winter",
];

/** The four #553 found living in the gap: a clothing kit and nothing in hand. */
const CLOTHING_KIT_ONLY = [
  "autumn-w8-the-last-warmth",
  "winter-w2-ice",
  "winter-w5-breath",
  "winter-w7-dark",
];

describe("named-outcome", () => {
  const check = (s: LintSession) => rule("named-outcome").check(s);
  const talkOnly = (over: Partial<LintSession> = {}) =>
    goodSession({
      phases: [
        { key: "awareness-1", durationMin: 8, blocks: [{ type: "say-aloud", text: "Look." }] },
        { key: "circle", durationMin: 6, blocks: [{ type: "circle-question", text: "What?" }] },
      ],
      ...over,
    });

  it("fails a session that neither shows nor says what the class comes away with", () => {
    const hit = check(talkOnly());
    expect(hit?.reason).toContain("never says what the class comes away with");
    expect(hit?.reason).toContain("no `celebration`");
  });

  it("passes on a demo block alone, with no celebration", () => {
    // autumn-starter's shape: it shows the move rather than declaring it.
    expect(check(goodSession())).toBeNull();
  });

  it("passes on a celebration headline alone, with no demo block", () => {
    // spring-w1-seed-bombs' shape: a Make phase, no `demo`, and a celebration
    // that names what the class did.
    expect(
      check(
        talkOnly({
          celebration: { headline: "You just planted wildflowers for pollinators." },
        }),
      ),
    ).toBeNull();
  });

  it("fails a celebration with no headline, and says which of the two it is", () => {
    const hit = check(talkOnly({ celebration: { emoji: "🍂" } }));
    expect(hit?.reason).toContain("a `celebration` with no headline");
  });

  it("reads presence, never wording: any non-empty headline satisfies it", () => {
    // The point of the rule is that it has no opinion about sentences. If this
    // ever starts failing, a word list has grown back.
    expect(check(talkOnly({ celebration: { headline: "x" } }))).toBeNull();
    expect(check(talkOnly({ celebration: { headline: "   " } }))).not.toBeNull();
  });

  it("evidence is machine-formed, so the authorship guard can never drop it", () => {
    // The CLI aborts if provenance drops a shape finding. That only holds while
    // the evidence text is a fact about the JSON rather than a sentence.
    expect(check(talkOnly())?.text).toBe(
      "demo blocks in base phases: 0; celebration: absent",
    );
  });
});

describe("the #553 escape case", () => {
  /**
   * The session #553 constructed and ran: `autumn-w1-return`, copied, given
   * THREE body phases at 8 minutes plus the circle at 6, and a kit of "Warm
   * clothes recommended". Built from the pack on disk rather than typed out, so
   * it stays a real port. It exited 0 against all three rules #546 shipped.
   */
  const escape = (): LintSession => {
    const source = loadSessions().find((s) => s.id === "autumn-w1-return");
    if (!source) throw new Error("autumn-w1-return is not in packs/ any more");
    const copy = JSON.parse(JSON.stringify(source)) as LintSession;
    copy.id = "escape-case-not-in-packs";
    copy.kit = ["Warm clothes recommended"];
    const phases = copy.phases ?? [];
    copy.phases = [...phases.filter((p) => p.key !== "circle").slice(0, 3), phases.at(-1)!];
    return copy;
  };

  it("walks past make-beat: the kit is not the `None required` sentinel", () => {
    expect(rule("make-beat").check(escape())).toBeNull();
  });

  it("walks past budgeted-time: three phases at 8 is under the threshold of four", () => {
    const durations = (escape().phases ?? []).map((p) => p.durationMin);
    expect(durations).toEqual([8, 8, 8, 6]);
    expect(rule("budgeted-time").check(escape())).toBeNull();
  });

  it("is caught by named-outcome, and by nothing else", () => {
    const findings = shapeFindings(escape());
    expect(findings.map((f) => f.rule)).toEqual(["named-outcome"]);
    expect(findings[0]?.ticket).toBe("#91");
  });
});

describe("#546's twelve false positives are not regressed (#553)", () => {
  const sessions = loadSessions();
  const byId = (id: string) => {
    const found = sessions.find((s) => s.id === id);
    if (!found) throw new Error(`${id} is not in packs/ any more`);
    return found;
  };

  it.each(REAL_MAKE_BEAT_WITHOUT_A_DEMO)(
    "%s has a real make beat and stays clean under every rule",
    (id) => {
      // Not merely "not red in CI" — no finding at all, so none of them needs
      // an exception entry and none can be quietly grandfathered later.
      expect(shapeFindings(byId(id)).map((f) => f.rule)).not.toContain("named-outcome");
    },
  );

  it.each(CLOTHING_KIT_ONLY)(
    "%s is caught by named-outcome and held against #91, its real debt",
    (id) => {
      expect(rule("named-outcome").check(byId(id))).not.toBeNull();
      expect(GRANDFATHERED["named-outcome"]?.[id]).toBe("#91");
    },
  );

  it("named-outcome fires on exactly the deck #91 names, and nothing else", () => {
    const fired = sessions.filter((s) => rule("named-outcome").check(s) !== null);
    expect(fired).toHaveLength(32);
    expect(new Set(fired.map((s) => s.__file))).toEqual(
      new Set(["autumn-term.json", "spring-term.json", "summer-legacy.json", "winter-term.json"]),
    );
    // Every one of them is held; a new session in this shape is not.
    for (const s of fired) expect(GRANDFATHERED["named-outcome"]?.[s.id]).toBe("#91");
  });
});

describe("budgeted-time", () => {
  const check = (s: LintSession) => rule("budgeted-time").check(s);
  const withDurations = (mins: Array<number | undefined>) =>
    goodSession({
      phases: mins.map((durationMin, i) => ({ key: `p${i}`, durationMin, blocks: [] })),
    });

  it("fails the Four Directions stamp, 8/8/8/8 with a 6 minute circle", () => {
    const hit = check(withDurations([8, 8, 8, 8, 6]));
    expect(hit?.reason).toContain("stamped clock");
    expect(hit?.reason).toContain("4 phases are all 8 minutes");
  });

  it("fails the same stamp at a different number, 10/10/10/10", () => {
    expect(check(withDurations([10, 10, 10, 10, 6]))).not.toBeNull();
  });

  it("passes a legitimately even two-phase session", () => {
    expect(check(withDurations([10, 10]))).toBeNull();
  });

  it("passes summer-w1-counting-life's real budget, 5/4/3/4/4", () => {
    // Three identical durations out of five, and hand-budgeted. This is why
    // the threshold is four.
    expect(check(withDurations([5, 4, 3, 4, 4]))).toBeNull();
  });

  it("passes a session that authors no durations at all", () => {
    // Four packs ship durations on no phase. That is a different defect.
    expect(check(withDurations([undefined, undefined, undefined, undefined]))).toBeNull();
  });
});

describe("generated-parent-line", () => {
  const check = (s: LintSession) => rule("generated-parent-line").check(s);
  const withParentLine = (text: string) =>
    goodSession({
      childSheet: { blocks: [{ type: "parent-line", text }] },
    } as Partial<LintSession>);

  it("fails the template #115 stripped, with the slot filled", () => {
    const hit = check(
      withParentLine("For home: we went outside for autumn leaves today. Ask me what I noticed."),
    );
    expect(hit?.reason).toContain("generated template");
  });

  it("fails the template with the slot still unexpanded", () => {
    expect(
      check(withParentLine("For home: we went outside for {topic} today. Ask me what I noticed.")),
    ).not.toBeNull();
  });

  it("passes a real, lesson-specific parent line", () => {
    expect(
      check(
        withParentLine(
          "For home: we met the trees near us today. Ask me whose leaf this is. I know.",
        ),
      ),
    ).toBeNull();
  });

  it("no session on disk carries the generated line", () => {
    const offenders = loadSessions().filter((s) => check(s) !== null);
    expect(offenders.map((s) => s.id)).toEqual([]);
  });
});

describe("stale-session-reference (#1095)", () => {
  const check = (s: LintSession) => rule("stale-session-reference").check(s);

  it("passes a session with no `session <N>` mention at all", () => {
    expect(check(goodSession({ __file: "autumn-garden.json" } as Partial<LintSession>))).toBeNull();
  });

  it("does nothing without a `__file`: the rule needs to know which pack numbers the week", () => {
    expect(
      check(goodSession({ preparation: "If the class made leaf masks in session two, have them ready." })),
    ).toBeNull();
  });

  it("passes a reference to a week that is still in the pack", () => {
    // autumn-garden.json ships w1, w3-w8; "session seven" names a real session.
    expect(
      check(
        goodSession({
          __file: "autumn-garden.json",
          preparation: "The sleeping ribbon matters as much as the dancing one: sheltered and exposed is exactly the distinction the animals need in session seven.",
        } as Partial<LintSession>),
      ),
    ).toBeNull();
  });

  it("fails a reference to a week the pack no longer carries", () => {
    const hit = check(
      goodSession({
        __file: "autumn-garden.json",
        preparation: "If the class made leaf masks in session two, have them ready.",
      } as Partial<LintSession>),
    );
    expect(hit?.reason).toContain('refers to "session two" (week 2)');
    expect(hit?.reason).toContain("autumn-garden.json ships no session");
  });

  it("names every stale reference once, even when the same session repeats it", () => {
    // This is exactly #1095's shape: kit, preparation and a phase teacher-note
    // all named session two in the same session.
    const hit = check(
      goodSession({
        __file: "autumn-garden.json",
        kit: ["the leaf masks from session two, if they survived"],
        preparation: "If the class made leaf masks in session two, have them ready.",
        phases: [
          {
            key: "hunt",
            durationMin: 14,
            blocks: [
              {
                type: "teacher-note",
                text: "If the masks from session two survived, this is their encore.",
              },
            ],
          },
        ],
      } as Partial<LintSession>),
    );
    expect(hit?.text).toBe('"session two" (week 2)');
  });

  it("reads the real garden-w7-winter-ready session on disk, and it is clean", () => {
    // #1095's actual fix. Loaded from packs/ rather than typed out, so a
    // regression here is a real content regression, not a stale fixture.
    const session = loadSessions().find((s) => s.id === "garden-w7-winter-ready");
    if (!session) throw new Error("garden-w7-winter-ready is not in packs/ any more");
    expect(check(session)).toBeNull();
  });

  it("catches #1095 reproduced verbatim against the session as it actually shipped stale", () => {
    // The pre-fix session content, exactly as filed in #1095 — kit,
    // preparation and the phase-6 teacher-note all naming session two — run
    // against the pack's REAL week numbers (autumn-garden.json has no w2
    // today, same as when the bug was live: session two left the pack on
    // 2026-09-04, before this fix). Proves the rule would have caught the
    // issue as filed, not just a fixture built to please it.
    const session = loadSessions().find((s) => s.id === "garden-w7-winter-ready");
    if (!session) throw new Error("garden-w7-winter-ready is not in packs/ any more");
    const staleCopy = JSON.parse(JSON.stringify(session)) as LintSession;
    staleCopy.kit = [
      "gathered leaves and small branches for habitat building",
      "a few logs or large sticks if the site has none",
      "gloves for moving woody material",
      "the leaf masks from session two, if they survived",
    ];
    staleCopy.preparation =
      "Scout a corner that can honestly stay untidy through winter, and clear it " +
      "with whoever manages the site: a habitat that gets tidied away in November " +
      "teaches the wrong lesson twice. If the class made leaf masks in session two, " +
      "have them ready.";
    const hit = check(staleCopy);
    expect(hit?.reason).toContain('"session two" (week 2)');
  });

  it("no session on disk carries a stale session reference", () => {
    const offenders = loadSessions().filter((s) => check(s) !== null);
    expect(offenders.map((s) => s.id)).toEqual([]);
  });

  // ── #1145: what the rule may and may not conclude ────────────────────────

  it("says nothing in a pack whose session ids carry no week number", () => {
    // autumn-starter ships `leaves-and-their-trees`, `animal-leaf-masks` and
    // four more, none of them numbered, so its week set is empty. An empty
    // set is an absence of ground truth, not a pack that ships no weeks —
    // reading it the other way flagged every ordinal reference in three of
    // the ten packs, a correct one included. autumn-starter is the pack the
    // leaf-mask lesson MOVED INTO, so it is where the next legitimate
    // cross-reference gets written.
    expect(
      check(
        goodSession({
          __file: "autumn-starter.json",
          preparation: "Reuse the masks from session three.",
        } as Partial<LintSession>),
      ),
    ).toBeNull();
  });

  it("says nothing in winter-starter either, for the same reason", () => {
    expect(
      check(
        goodSession({
          __file: "winter-starter.json",
          preparation: "The feeders from session two hang here again.",
        } as Partial<LintSession>),
      ),
    ).toBeNull();
  });

  it("still fails the same reference in a pack that DOES number its weeks", () => {
    // The abstention above is scoped to unnumbered packs, not a hole in the
    // rule: autumn-garden numbers every session, so #1095's case still bites.
    expect(
      check(
        goodSession({
          __file: "autumn-garden.json",
          preparation: "Reuse the masks from session two.",
        } as Partial<LintSession>),
      )?.reason,
    ).toContain('"session two" (week 2)');
  });

  it("reads the digit form, which no pack uses today and nothing prevents", () => {
    const hit = check(
      goodSession({
        __file: "autumn-garden.json",
        preparation: "Collect the paper masks made in session 2 before the walk.",
      } as Partial<LintSession>),
    );
    expect(hit?.reason).toContain('"session 2" (week 2)');
  });

  it("reads a number above twelve, where the old hand-written table stopped", () => {
    // spring-term is the longest pack on the shelf at 12 weeks, which is
    // exactly the length the enumerated table was sized to. A 13-week pack
    // would have walked straight past the rule.
    const hit = check(
      goodSession({
        __file: "spring-term.json",
        preparation: "The seed trays from session fourteen come back out here.",
      } as Partial<LintSession>),
    );
    expect(hit?.reason).toContain('"session fourteen" (week 14)');
  });

  it("reads a compound number too", () => {
    const hit = check(
      goodSession({
        __file: "spring-term.json",
        preparation: "Pick this up again in session twenty-one.",
      } as Partial<LintSession>),
    );
    expect(hit?.reason).toContain('"session twenty-one" (week 21)');
  });

  it("does not read a quantity as a cross-reference", () => {
    // "Allow the session two full afternoons" counts afternoons; it names no
    // lesson. The discrimination is grammatical, not a list of phrases: a
    // determiner before `session` makes it a common noun with a count after
    // it, and names in English do not take determiners.
    expect(
      check(
        goodSession({
          __file: "autumn-garden.json",
          preparation: "Allow the session two full afternoons.",
        } as Partial<LintSession>),
      ),
    ).toBeNull();
  });

  it("keeps reading a reference when the determiner belongs to an earlier phrase", () => {
    // "the leaf masks FROM session two" — a determiner is in the sentence,
    // but the preposition closes its phrase before `session` starts a new
    // one. This is the sentence #1095 was actually filed about, so the
    // determiner test must not swallow it.
    const hit = check(
      goodSession({
        __file: "autumn-garden.json",
        kit: ["the leaf masks from session two, if they survived"],
      } as Partial<LintSession>),
    );
    expect(hit?.reason).toContain('"session two" (week 2)');
  });

  it("counts a number word only when `session` is the word before it", () => {
    expect(
      check(
        goodSession({
          __file: "autumn-garden.json",
          preparation: "This term runs two full sessions a week for eight weeks.",
        } as Partial<LintSession>),
      ),
    ).toBeNull();
  });
});

describe("the exception list is a ratchet, not a comment", () => {
  const sessions = loadSessions();

  it("every grandfathered session still violates the rule it is listed under", () => {
    expect(auditGrandfathered(sessions)).toEqual([]);
  });

  it("every grandfathered id exists in packs/ and carries a ticket", () => {
    const ids = new Set(sessions.map((s) => s.id));
    for (const [ruleId, entries] of Object.entries(GRANDFATHERED)) {
      for (const [id, ticket] of Object.entries(entries)) {
        expect(ids.has(id), `${ruleId}: "${id}" is not a session in packs/`).toBe(true);
        expect(ticket, `${ruleId}: "${id}" needs a ticket`).toMatch(/^#\d+$/);
      }
    }
  });

  it("reports a listed session that has become compliant", () => {
    const [firstId] = Object.keys(GRANDFATHERED["make-beat"] ?? {});
    expect(firstId).toBeTruthy();
    const fixed = sessions.map((s) =>
      s.id === firstId ? { ...s, kit: ["clay", "wildflower seeds"] } : s,
    );
    const stale = auditGrandfathered(fixed);
    expect(stale.map((e) => e.session)).toContain(firstId);
    expect(stale[0]?.why).toContain("delete this entry");
  });

  it("reports a listed session that has vanished from packs/", () => {
    const [firstId] = Object.keys(GRANDFATHERED["budgeted-time"] ?? {});
    const without = sessions.filter((s) => s.id !== firstId);
    expect(auditGrandfathered(without).map((e) => e.session)).toContain(firstId);
  });

  it("holds no exception for a rule it does not need one for", () => {
    // generated-parent-line is preventive: #115 already cleared every
    // instance, so an entry appearing here would mean the line came back.
    expect(GRANDFATHERED["generated-parent-line"]).toEqual({});
  });
});
