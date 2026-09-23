import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadAllPacks, leadPack, loadPack } from "@/lib/pack";
import {
  CLOSES_INSIDE_IT,
  DERIVED_FRAMES,
  HOUSE_SENTENCES,
  SEQUENCE_CONNECTIVES,
  cardSeconds,
  previewDeck,
  previewLength,
  sentencesOf,
  sequenceSegments,
  spokenTitle,
  speakableFrom,
  withinBudget,
  type NarrationSegment,
  type PreviewCard,
} from "@/lib/lesson/preview";
import {
  clipKey,
  previewForSession,
  type LessonPreview as LessonPreviewData,
} from "@/lib/lesson/preview-audio";
import { PreviewDeck } from "@/app/session/preview/PreviewDeck";
import manifest from "@/lib/lesson/preview-audio.manifest.json";
import { drivingQuestion } from "@/lib/lesson/driving-question";
import type { Block, Phase, Session } from "@/schema/pack";

/**
 * THE LESSON PREVIEW (nc#515).
 *
 * Run against the REAL packs rather than a fixture wherever the claim is about
 * the curriculum, because a fixture proves the code is careful with text
 * somebody wrote for the test and says nothing about the forty-eight lessons
 * that actually ship. The isolating fixtures below are for the absences —
 * a phase with no minutes, a session with no glossary — which the shelf may
 * not happen to contain tomorrow.
 *
 * The defect this feature is not allowed to have is a paraphrase of Johan's
 * curriculum in a teacher's ears. "Every spoken segment is house, derived, or
 * verbatim" is the assertion that makes that a red build.
 */

function everySession(): Session[] {
  return loadAllPacks().flatMap((pack) => pack.sessions);
}

/** Every string a session authored, sentence by sentence, as it could be said. */
function authoredSpeakables(session: Session): Set<string> {
  const found = new Set<string>();
  const add = (text: string | undefined | null) => {
    if (!text) return;
    found.add(speakableFrom(text));
    for (const sentence of sentencesOf(text)) found.add(speakableFrom(sentence));
  };

  add(session.title);
  add(session.prompt);
  add(session.objective);
  add(session.namedSkill);
  add(session.preparation);
  add(session.primer?.summary);
  add(session.primer?.why);
  for (const kit of session.kit ?? []) add(kit);

  const walk = (phase: Phase): void => {
    add(phase.title);
    for (const block of phase.blocks) if (block.type === "teacher-note") add(block.text);
    phase.conditionVariants?.forEach((variant) => walk(variant.phase));
  };
  session.phases.forEach(walk);
  return found;
}

type Provenance = "house" | "derived" | "authored";

/**
 * Where a spoken segment came from — or null, which is the failure. A null is a
 * sentence in a teacher's ears that nobody in this repo can account for.
 */
function provenanceOf(
  text: string,
  authored: Set<string>,
  session: Session
): Provenance | null {
  if ((HOUSE_SENTENCES as readonly string[]).includes(text)) return "house";
  if (authored.has(text)) return "authored";
  // The part slides' sequence segments: rebuilt from this session's own phase
  // titles and compared, because a regex cannot check an authored slot.
  const sequence = sequenceSegments(session.phases.map((phase) => phase.title));
  if (sequence.some((segment) => segment.text === text)) return "derived";
  for (const frame of DERIVED_FRAMES) {
    const match = frame.exec(text);
    if (!match) continue;
    // A frame with a slot holds an authored name, and the name is checked too:
    // "The skill is <something we made up>." would otherwise pass as derived.
    const slot = match[1];
    if (slot === undefined || authored.has(speakableFrom(slot))) return "derived";
    return null;
  }
  return null;
}

const segmentsOf = (cards: PreviewCard[]): NarrationSegment[] =>
  cards.flatMap((card) => card.narration);

describe("every word the preview speaks can be accounted for", () => {
  it("is a house sentence, a derived clause, or an authored field, on all 48 sessions", () => {
    const unaccounted: string[] = [];
    let counted = 0;

    for (const session of everySession()) {
      const authored = authoredSpeakables(session);
      for (const segment of segmentsOf(previewDeck(session))) {
        counted += 1;
        if (provenanceOf(segment.text, authored, session) === null) {
          unaccounted.push(`${session.id}: ${segment.text}`);
        }
      }
    }

    expect(counted).toBeGreaterThan(1500);
    expect(unaccounted).toEqual([]);
  });

  it("never invents a rhetorical kicker, and the two Johan named are gone", () => {
    // Structural proof is the test above; this is the named case, kept because
    // these two exact sentences were in the prototype and were called out.
    const spoken = everySession()
      .flatMap((session) => segmentsOf(previewDeck(session)))
      .map((segment) => segment.text.toLowerCase())
      .join(" ");
    expect(spoken).not.toContain("the difference between a calm");
    expect(spoken).not.toContain("while thirty children wait");
  });

  it("keeps the verbatim fields verbatim, in the words and on the card", () => {
    for (const session of everySession()) {
      const deck = previewDeck(session);
      const title = deck[0];
      expect(title?.kind).toBe("title");
      if (title?.kind !== "title") continue;

      // Shown exactly as written. Never trimmed, never smoothed for voice.
      // The prompt goes through the one display rule every surface shares
      // (nc#150): Johan's string byte for byte, or absent where it would only
      // restate the title above it. Never a third thing.
      expect(title.title).toBe(session.title);
      expect(title.prompt).toBe(drivingQuestion(session));

      const objective = deck.find((card) => card.id === "objective");
      expect(objective?.kind === "prose" && objective.lead).toBe(session.objective);

      // And what is SAID differs from what is shown only by the two transforms.
      const said = title.narration.map((segment) => segment.text);
      expect(said[0]).toBe(speakableFrom(session.title));
      const question = drivingQuestion(session);
      if (question) expect(said[1]).toBe(speakableFrom(question));
      else expect(said).toHaveLength(1);
    }
  });
});

describe("the two transforms, and only those two", () => {
  it("says an ampersand as a word and lands a sentence that has no full stop", () => {
    expect(speakableFrom("Create & glue")).toBe("Create and glue.");
    // Inside the sequence sentence the title takes the transform WITHOUT the
    // full stop, or the voice would stop halfway through the list.
    expect(spokenTitle("Create & glue")).toBe("Create and glue");
    expect(speakableFrom("Which tree did your leaf come from?")).toBe(
      "Which tree did your leaf come from?"
    );
    expect(speakableFrom("Minibeast hunting.")).toBe("Minibeast hunting.");
  });

  it("does not spell numerals out, because that is a rewrite and not a reading", () => {
    // Sophia's concept proposed this transform. Applied to authored text it
    // turns a card size into a count: the failure it would ship.
    expect(speakableFrom("A5 card, one per child")).toBe("A5 card, one per child.");
  });

  it("splits sentences without opening one, including a quoted question", () => {
    const note =
      'Circulate and ask about the leaves, not the layout: "Which tree do you think this ' +
      'one came from?" Keep a small pool of spare leaves for anyone whose favourite tears.';
    expect(sentencesOf(note)).toHaveLength(2);
    expect(sentencesOf(note)[0]).toContain("came from?\"");
  });

  it("cuts a long field by whole sentences, never inside one, and never to nothing", () => {
    const long = "One two three four five. Six seven eight. Nine ten.";
    expect(withinBudget(sentencesOf(long), 8)).toEqual([
      "One two three four five.",
      "Six seven eight.",
    ]);
    // A single sentence over budget is still spoken: silence is worse.
    expect(withinBudget(["A sentence far longer than the budget allows."], 2)).toHaveLength(1);
  });
});

describe("the voice never reads the screen back", () => {
  it("speaks no minute count of its own, on any card, on any session", () => {
    // The rule is about DERIVED figures. An authored note that says "give them
    // ten minutes" is Johan's sentence and is spoken as written; what may never
    // happen is this file working a duration out and saying it. So the check
    // runs over the segments that are NOT authored.
    const invented: string[] = [];
    for (const session of everySession()) {
      const authored = authoredSpeakables(session);
      for (const segment of segmentsOf(previewDeck(session))) {
        if (provenanceOf(segment.text, authored, session) === "authored") continue;
        if (/\d/.test(segment.text) || /\bmin(ute)?s?\b/i.test(segment.text)) {
          invented.push(`${session.id}: ${segment.text}`);
        }
      }
    }
    expect(invented).toEqual([]);
  });

  it("describes the kit rather than reciting it", () => {
    const session = loadPack("autumn-starter").sessions[0]!;
    const kit = previewDeck(session).find((card) => card.id === "kit");
    expect(kit?.kind).toBe("kit");
    if (kit?.kind !== "kit") return;

    // The items are on the card...
    expect(kit.items).toEqual(session.kit);
    // ...and not one of them is in the voice.
    const said = kit.narration.map((segment) => segment.text).join(" ");
    for (const item of session.kit) expect(said).not.toContain(item);
  });

  it("walks the shape in the author's own titles, adding only its connectives", () => {
    /*
      Johan asked for this card twice, the second time: "instead should not read
      the minutes and do like you will start by and describe a bit of the…". The
      first build said "Five parts." and stopped, which is a count the segment
      bar already implies.

      The prototype's fluent line was not derivable. The SEQUENCE is: titles are
      authored on 237 of 237 phases. So the assertion is that the sentence is
      made of nothing BUT those titles and a fixed handful of connectives —
      strip the titles out and what is left must be exactly the joining words.
      That is what keeps "describe the shape" a reading of the pack rather than
      somewhere a flourish could grow.
    */
    for (const session of everySession()) {
      const titles = session.phases.map((phase) => phase.title);
      const segments = sequenceSegments(titles);

      // One segment per part, tagged with its own index, its title spoken.
      expect(segments).toHaveLength(titles.length);
      const said = segments.map((segment) => segment.text).join(" ");
      let cursor = 0;
      for (const [at, title] of titles.entries()) {
        expect(segments[at]!.part).toBe(at);
        const found = said.indexOf(spokenTitle(title), cursor);
        expect(found, `${session.id}: ${title} missing or out of order in "${said}"`)
          .toBeGreaterThan(-1);
        cursor = found + title.length;
      }

      // And nothing but the connectives sits between them.
      let residue = said;
      for (const title of titles) residue = residue.replace(spokenTitle(title), "\u0000");
      for (const word of SEQUENCE_CONNECTIVES) residue = residue.split(word).join("");
      expect(residue.replace(/[\u0000,.\s]/g, ""), `${session.id}: "${said}"`).toBe("");
    }
  });

  /**
   * THE CLOSER IS THIS SESSION'S OWN LAST STEP, AND TAKES THE PREPOSITION THAT
   * STEP CAN CARRY (nc#861).
   *
   * The defect: every session closed on the assumed "And finish in <title>",
   * which is right for the forty-nine that close in a Circle and reads as a
   * fault on the seven autumn-garden sessions that close on a named phase —
   * "And finish in Open the compost diary.", spoken to a teacher. The comment
   * in `preview.ts` had predicted the exact sentence and left it.
   *
   * Two claims, because the ticket names two failures and only one of them was
   * real. The bleed the title reports — one session's closer read across a
   * whole pack — is NOT what the corpus does; each session already closes on
   * its own phase. It is asserted here anyway: the connective is the one thing
   * in this walk that is chosen rather than quoted, and a chooser that reads
   * the wrong session's field is exactly how a pack ends up speaking one
   * lesson's ending eight times.
   */
  it("closes each session on its OWN last step, with a preposition that step can carry (nc#861)", () => {
    const wrong: string[] = [];

    for (const session of everySession()) {
      const titles = session.phases.map((phase) => phase.title);
      const mine = spokenTitle(titles[titles.length - 1]!);
      const closer = sequenceSegments(titles).at(-1)!.text;

      // 1. It names THIS session's last phase — not a neighbour's, not a
      //    constant, not the first pack's.
      if (!closer.includes(mine)) {
        wrong.push(`${session.id}: closer "${closer}" does not name its last step "${mine}"`);
      }

      // 2. "in" is spoken only over a title a class can finish INSIDE. This is
      //    the assertion about the sentence, not about the implementation:
      //    whatever chooses the connective, "And finish in <a verb phrase>" is
      //    the defect and must not reach the manifest.
      const inside = closer.startsWith("And finish in ");
      const canCarryIn = CLOSES_INSIDE_IT.some(
        (title) => title.toLowerCase() === mine.toLowerCase()
      );
      if (inside !== canCarryIn) {
        wrong.push(`${session.id}: "${closer}" — "${mine}" is not a place a class finishes in`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it("does not read 'finish in' over a step that is an instruction (nc#861)", () => {
    // The sentence `preview.ts` warned about by name, before the curriculum
    // grew one. A fixture, because no shipped pack should ever have to be the
    // thing that proves this.
    const walk = sequenceSegments(["Settle", "Take a rubbing"]);
    expect(walk.at(-1)!.text).toBe("And finish with Take a rubbing.");

    // And the closing circle keeps the preposition that was right for it.
    expect(sequenceSegments(["Settle", "Circle"]).at(-1)!.text).toBe("And finish in Circle.");
    expect(sequenceSegments(["Collect", "Circle time"]).at(-1)!.text).toBe(
      "And finish in Circle time."
    );
  });

  it("gives every part slide the whole walk, and tags its own section (nc#675)", () => {
    // The walk is the slides now: each part slide carries every header, its
    // own place in them, and exactly one connective segment — tagged with the
    // section it opens as it is spoken. "How it runs." opens the family on
    // the first slide only, and the note segments never carry a part.
    for (const session of everySession()) {
      const deck = previewDeck(session);
      const sequence = sequenceSegments(session.phases.map((phase) => phase.title));
      // Where the pack authors no settle phase the runner grounds the class
      // anyway, so the headers open with it and every part sits one row down.
      const grounded = session.phases.some((phase) => phase.key === "settle");
      const offset = grounded ? 0 : 1;
      session.phases.forEach((phase, at) => {
        const card = deck.find((each) => each.id === `phase-${at}`)!;
        expect(card.kind).toBe("phase");
        if (card.kind !== "phase") return;
        expect(card.at).toBe(at + offset);
        expect(card.parts.map((part) => part.title)).toEqual([
          ...(grounded ? [] : ["Ground the class"]),
          ...session.phases.map((each) => each.title),
        ]);

        const said = card.narration;
        if (at === 0) {
          expect(said[0]?.text).toBe("How it runs.");
          expect(said[0]?.part).toBeUndefined();
        }
        const connective = said[at === 0 ? 1 : 0]!;
        expect(connective.text).toBe(sequence[at]?.text);
        expect(connective.part).toBe(at + offset);
        for (const segment of said.slice(at === 0 ? 2 : 1)) {
          expect(segment.part).toBeUndefined();
        }
      });
    }
  });

  it("names grounding in the walk of every session, authored or not", () => {
    /*
     * Johan: *"ground the class is missing from the Runner and also preview"*.
     *
     * Fourteen sessions carry a settle phase (four author one, ten opt into
     * the shared ritual `loadPack` composes in); the other forty-two are
     * grounded by the runner's own `DEFAULT_SETTLE` and listed five sections
     * where six are taught. The header is the fix; the connective segments are
     * deliberately untouched, because moving those re-voices the corpus.
     */
    for (const session of everySession()) {
      const first = previewDeck(session).find((card) => card.id === "phase-0")!;
      expect(first.kind).toBe("phase");
      if (first.kind !== "phase") return;
      const grounding = session.phases.find((phase) => phase.key === "settle");
      expect(first.parts[0]?.title).toBe(grounding ? grounding.title : "Ground the class");
      // A header the pack did not author carries no minutes: nothing here
      // fills a gap in.
      if (!grounding) expect(first.parts[0]?.minutes).toBeNull();
    }
  });

  it("walks the whole sequence across the slides on a session with no minutes", () => {
    // The case that made the old shape card useless: no minutes means nothing
    // honest to derive, and "Five parts." was once the whole narration. 32 of
    // 237 phases.
    const session = loadPack("autumn").sessions[0]!;
    expect(session.phases.every((phase) => phase.durationMin === undefined)).toBe(true);

    const walk = previewDeck(session)
      .filter((card) => card.kind === "phase")
      .map((card) => card.narration.find((segment) => segment.part !== undefined)!.text);
    expect(walk).toHaveLength(session.phases.length);
    expect(walk[0]).toContain("You start with");
    expect(walk[walk.length - 1]).toContain("And finish in");
    // Still no minute count in the walk, and still no invented longest.
    expect(walk.join(" ")).not.toMatch(/\d|\bmin(ute)?s?\b|longest/i);
  });

  it("describes the words rather than reciting the glossary", () => {
    const session = loadPack("autumn-starter").sessions[0]!;
    const words = previewDeck(session).find((card) => card.id === "words");
    expect(words?.kind).toBe("words");
    if (words?.kind !== "words") return;

    const said = words.narration.map((segment) => segment.text).join(" ");
    for (const term of words.terms) {
      expect(said).not.toContain(term.definition);
      expect(said).not.toContain(term.term);
    }
  });

  it("reads a part's slide from that part's own notes to the teacher", () => {
    // The direct claim, rather than a substring hunt: a part slide says its
    // connective ("Then Count."), then sentences of that phase's
    // `teacher-note` blocks. Nothing from the phase next door, and nothing
    // addressed to a child.
    for (const session of everySession()) {
      for (const [at, phase] of session.phases.entries()) {
        const card = previewDeck(session).find((each) => each.id === `phase-${at}`)!;
        const notes = new Set(
          phase.blocks
            .filter((block) => block.type === "teacher-note")
            .flatMap((block) => sentencesOf((block as { text: string }).text))
            .map(speakableFrom)
        );
        const said = card.narration.map((segment) => segment.text);
        const connective = said[at === 0 ? 1 : 0];
        expect(connective).toContain(spokenTitle(phase.title));
        for (const sentence of said.slice(at === 0 ? 2 : 1)) {
          expect(notes.has(sentence), `${session.id} ${phase.key}: ${sentence}`).toBe(true);
        }
      }
    }
  });

  it("never speaks a line the class is meant to hear", () => {
    // The runner's control speaks those, in its own voice, to thirty children.
    // A teacher who hears one voice do both cannot tell which words are hers.
    //
    // Compared on WHOLE sentences, and cleared against the teacher-facing
    // fields, because a handful of sessions legitimately open their primer
    // with the same sentence the settle says out loud ("Most creatures left or
    // hid. But the birds stayed."). Reading that from the primer is not
    // reading it from the say-aloud, and a substring probe cannot tell the
    // difference — the first cut of this test could not, and failed on it.
    const leaked: string[] = [];
    for (const session of everySession()) {
      const authored = authoredSpeakables(session);
      const spoken = new Set(
        segmentsOf(previewDeck(session)).map((segment) => segment.text)
      );
      const walk = (phase: Phase): void => {
        for (const block of phase.blocks) {
          if (block.type !== "say-aloud") continue;
          for (const text of [
            block.text,
            block.abilityVariants?.reception,
            block.abilityVariants?.y1,
            block.abilityVariants?.y2,
          ]) {
            if (typeof text !== "string" || !text.trim()) continue;
            for (const sentence of sentencesOf(text).map(speakableFrom)) {
              if (spoken.has(sentence) && !authored.has(sentence)) {
                leaked.push(`${session.id}: ${sentence}`);
              }
            }
          }
        }
        phase.conditionVariants?.forEach((variant) => walk(variant.phase));
      };
      session.phases.forEach(walk);
    }
    expect(leaked).toEqual([]);
  });
});

describe("absent means absent", () => {
  const base = loadPack("autumn-starter").sessions[0]!;

  it("shows and speaks no minutes for a phase that carries none", () => {
    const phase: Phase = {
      key: "look",
      title: "Look",
      blocks: [{ type: "teacher-note", text: "Set the boundary first." }] as Block[],
    };
    const session: Session = { ...base, phases: [phase, { ...phase, key: "find", title: "Find" }] };
    const deck = previewDeck(session);

    const first = deck.find((card) => card.id === "phase-0");
    expect(first?.kind).toBe("phase");
    if (first?.kind !== "phase") return;
    // Every header shows no minutes, and the slide speaks exactly what it
    // speaks everywhere — the walk and the notes, nothing invented out of the
    // session total.
    expect(first.parts.every((part) => part.minutes === null)).toBe(true);
    expect(first.minutes).toBeNull();
    expect(first.narration.map((segment) => segment.text)).toEqual([
      "How it runs.",
      "You start with Look.",
      "Set the boundary first.",
    ]);
  });

  it("never names a longest stretch, on any session", () => {
    // The clause used to close this card ("The longest stretch is Create and
    // glue.") and Johan removed it with the drawer (nc#625): the minutes are
    // revealed section by section as the voice reaches them, and a sentence
    // that jumped back to a part already passed broke the walk. Asserted over
    // every session so it cannot quietly return.
    for (const session of everySession()) {
      const spoken = segmentsOf(previewDeck(session))
        .map((segment) => segment.text)
        .join(" ");
      expect(spoken).not.toContain("The longest stretch");
    }

    // And a session with authored minutes speaks the same walk as one without.
    const phase: Phase = {
      key: "a",
      title: "A",
      durationMin: 10,
      blocks: [{ type: "teacher-note", text: "A note." }] as Block[],
    };
    const session: Session = {
      ...base,
      phases: [phase, { ...phase, key: "b", title: "B", durationMin: 20 }],
    };
    const walk = previewDeck(session)
      .filter((card) => card.kind === "phase")
      .map((card) => card.narration.find((segment) => segment.part !== undefined)!.text);
    // "B" is not a place a class finishes in, so the closer takes the same
    // "with" the opener does (nc#861).
    expect(walk).toEqual(["You start with A.", "And finish with B."]);
  });

  it("drops a whole card rather than filling a missing field in", () => {
    const bare: Session = {
      ...base,
      kit: [],
      preparation: undefined,
      primer: undefined,
    };
    const ids = previewDeck(bare).map((card) => card.id);
    expect(ids).not.toContain("kit");
    expect(ids).not.toContain("idea");
    expect(ids).not.toContain("why");
    expect(ids).not.toContain("words");
    // What is left is still a working deck, not a broken one.
    expect(ids).toContain("title");
    expect(ids).toContain("phase-0");
    expect(ids[ids.length - 1]).toBe("end");
  });

  it("still runs a deck for every session on the shelf", () => {
    for (const session of everySession()) {
      const deck = previewDeck(session);
      expect(deck.length).toBeGreaterThan(4);
      // One card per part, every time. Phases are 48/48, which is why the deck
      // works across the whole shelf where the first concept did not.
      expect(deck.filter((card) => card.kind === "phase")).toHaveLength(session.phases.length);
    }
  });
});

describe("a card is as long as the longer of its voice and its reading", () => {
  it("gives a list card time to be read after the voice has finished", () => {
    const session = loadPack("autumn-starter").sessions[0]!;
    const deck = previewDeck(session);
    const kit = deck.find((card) => card.id === "kit")!;
    const clip = previewForSession(session)?.clips[kit.id];

    // The build this replaces advanced on the audio. On this card the voice is
    // three seconds and the kit is four items.
    expect(kit.readingSeconds).toBeGreaterThan(3);
    if (clip) expect(kit.readingSeconds).toBeGreaterThan(clip.seconds);
  });

  it("gives the end card no length, because she stops there", () => {
    const deck = previewDeck(loadPack("autumn-starter").sessions[0]!);
    const end = deck[deck.length - 1]!;
    expect(end.kind).toBe("end");
    expect(end.narration).toEqual([]);
    expect(end.readingSeconds).toBe(0);
  });
});

describe("the recordings, and the row that opens them", () => {
  it("agrees with the synthesis script on every content address", async () => {
    // The app and the script now call ONE implementation (#570,
    // `lib/lesson/clip-key.mjs`), so this can no longer fail by the two
    // drifting apart. It is kept because it can still fail the other way: if
    // either side ever grows its own copy again, or salts the hash
    // differently, this says so over the whole shipped corpus.
    //
    // It has already earned that. On its first run it caught the script
    // passing raw control characters as separators while the app did not —
    // every card disagreed, nothing looked wrong in the diff, and the failure
    // it would have shipped is every Preview row vanishing at once.
    const script = await import("../../scripts/synthesize-lesson-preview.mjs");
    let compared = 0;
    for (const session of everySession()) {
      for (const card of previewDeck(session)) {
        if (card.narration.length === 0) continue;
        compared += 1;
        expect(script.clipKeyFor(card.narration)).toBe(clipKey(card.narration));
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it("holds the committed narration manifest current against the generator", async () => {
    const builder = await import("../../scripts/build-preview-narration.mjs");
    const committed = readFileSync("lib/lesson/preview-narration.json", "utf8");
    expect(builder.serialiseManifest()).toBe(committed);
  });

  /**
   * THE DRIFT GUARD (nc#626), and it is the cheap half of that ticket.
   *
   * Johan, after adding sessions: *"I added new sessions but they dont seem to
   * have the slide."* Eight autumn-garden lessons (#581) had shipped with no
   * preview at all, and nothing anywhere said so. It is a two-step pipeline
   * and only the first step is automatic: the narration TEXT is generated from
   * the pack and a spec keeps it current, but the RECORDINGS come from
   * `synthesize-lesson-preview.mjs`, which a maintainer runs by hand with a key
   * CI does not have. Nobody ran it, and the app then did exactly what it was
   * designed to do — no recordings, no Preview row, never a dead control —
   * which is correct behaviour and is precisely why it was invisible.
   *
   * So the shelf and the corpus could drift apart in silence. This is the
   * check that makes that impossible. It cannot make the audio, and it is not
   * meant to; it is meant to be the thing that says a word.
   *
   * PER CARD, NOT PER SESSION, because per session is the weaker claim that
   * already missed a real defect. The nc#625 regeneration found ten sessions
   * where the builder read packs raw and missed the shared settling phase, so
   * every phase key shifted one part and individual cards were silently
   * unvoiced in production while the session still opened a row and the corpus
   * still looked complete. A session-level count would have stayed green
   * through all of it.
   *
   * AND IT IS AN EQUALITY, NOT A CEILING (nc#861). A text fix that CI can make
   * and a recording that only a maintainer with the key can make are two
   * different lanes, and the second one lags: correcting the closer's
   * preposition retired seven recordings the moment the words changed. Read as
   * "nothing is unvoiced" this guard would then be red until a hand step
   * nobody in CI can take, which is how a guard gets an exception bolted on and
   * then a second one, and stops meaning anything.
   *
   * So the claim it makes is the stronger one: the unvoiced set is EXACTLY
   * `AWAITING_VOICE`. A card that drifts out of the corpus by accident is not
   * on the list and fails; a card that is voiced while the list still names it
   * ALSO fails, so the list cannot outlive the gap it documents — clearing it
   * is part of committing the mp3s. Same precedent as the one live shelf-title
   * collision in `validate-packs`: a known, named, open exception the check
   * documents rather than blocks on.
   */
  /**
   * Cards whose words are correct and whose recording is not yet made, with
   * the ticket that changed the words. Johan owns the synthesis lane; nothing
   * in CI can clear these.
   *
   * nc#861 — the closer of each autumn-garden session read "And finish in
   * <named phase>" ("And finish in Open the compost diary."). The preposition
   * now comes off the title, so these seven cards speak "And finish with …"
   * and their old recordings — which say "in" — no longer address them. Until
   * they are re-voiced these seven part slides play silently and advance on a
   * tap, which is the designed fallback, and the other 601 cards are unchanged.
   *
   * nc#1095 — `garden-w7-winter-ready`'s kit and its "winter shopping trip"
   * teacher note both named "the leaf masks from session two", a session that
   * moved out of this pack entirely on 2026-09-04 and never made it back.
   * Removing the stale reference changed the words ("Four things to gather"
   * became "Three"; the encore line is gone), so their old recordings no
   * longer address them.
   *
   * nc#564 — `living-things-spring` is a new pack of four sessions, so every
   * one of its speaking cards is words-without-a-recording by construction.
   * Synthesis needs an ElevenLabs key and the backend checkout and is run by
   * hand, which no cloud session or CI runner has; the pack is also OFF the
   * shelf until Johan has read it, so nothing a teacher can reach today plays
   * silently. These 37 rows clear in the same commit as the mp3s.
   */
  const AWAITING_VOICE: readonly string[] = [
    "garden-w7-winter-ready: kit",
    "garden-w7-winter-ready: phase-2",
    "habitats-w1-alive-dead-never-alive: title",
    "habitats-w1-alive-dead-never-alive: objective",
    "habitats-w1-alive-dead-never-alive: idea",
    "habitats-w1-alive-dead-never-alive: why",
    "habitats-w1-alive-dead-never-alive: kit",
    "habitats-w1-alive-dead-never-alive: phase-1",
    "habitats-w1-alive-dead-never-alive: phase-2",
    "habitats-w1-alive-dead-never-alive: phase-3",
    "habitats-w1-alive-dead-never-alive: phase-4",
    "habitats-w2-micro-habitats: title",
    "habitats-w2-micro-habitats: objective",
    "habitats-w2-micro-habitats: idea",
    "habitats-w2-micro-habitats: why",
    "habitats-w2-micro-habitats: kit",
    "habitats-w2-micro-habitats: phase-1",
    "habitats-w2-micro-habitats: phase-2",
    "habitats-w2-micro-habitats: phase-3",
    "habitats-w2-micro-habitats: phase-4",
    "habitats-w3-what-a-habitat-gives: title",
    "habitats-w3-what-a-habitat-gives: objective",
    "habitats-w3-what-a-habitat-gives: idea",
    "habitats-w3-what-a-habitat-gives: why",
    "habitats-w3-what-a-habitat-gives: kit",
    "habitats-w3-what-a-habitat-gives: phase-1",
    "habitats-w3-what-a-habitat-gives: phase-2",
    "habitats-w3-what-a-habitat-gives: phase-3",
    "habitats-w3-what-a-habitat-gives: phase-4",
    "habitats-w4-food-chains: title",
    "habitats-w4-food-chains: objective",
    "habitats-w4-food-chains: idea",
    "habitats-w4-food-chains: why",
    "habitats-w4-food-chains: kit",
    "habitats-w4-food-chains: phase-1",
    "habitats-w4-food-chains: phase-2",
    "habitats-w4-food-chains: phase-3",
    "habitats-w4-food-chains: phase-4",
    "habitats-w4-food-chains: words",
  ];

  it("has a recording for every speaking card, on every session on the shelf", () => {
    // The JSON import types every hash as its own literal key, so a computed
    // lookup needs the same widening `previewForSession` gives it.
    const recorded = manifest.clips as Record<string, { file: string } | undefined>;
    const unvoiced = everySession().flatMap((session) =>
      previewDeck(session)
        .filter((card) => card.narration.length > 0)
        .filter((card) => !recorded[clipKey(card.narration)])
        .map((card) => `${session.id}: ${card.id}`)
    );

    const undocumented = unvoiced.filter((row) => !AWAITING_VOICE.includes(row));
    const stale = AWAITING_VOICE.filter((row) => !unvoiced.includes(row));

    expect(
      { undocumented, stale },
      undocumented.length + stale.length === 0
        ? ""
        : [
            ...(undocumented.length > 0
              ? [
                  "The shelf has drifted from the recorded corpus.",
                  "",
                  ...undocumented,
                  "",
                  "Nothing in CI can fix this: synthesis needs an ElevenLabs key and the",
                  "backend checkout, and is run by hand. Voice the gap with",
                  "`node scripts/synthesize-lesson-preview.mjs` (--dry-run first, for the",
                  "cost), commit the mp3s and the manifest, and this goes green. The wider",
                  "question of whether a hand-run script is the right shape at all is nc#626.",
                ]
              : []),
            ...(stale.length > 0
              ? [
                  "These cards ARE voiced now. Delete them from AWAITING_VOICE:",
                  "",
                  ...stale,
                ]
              : []),
          ].join("\n")
    ).toEqual({ undocumented: [], stale: [] });
  });

  it("points every manifest entry at a file that is actually shipped", () => {
    const missing = Object.values(manifest.clips)
      .map((entry) => `public/lesson-preview/${entry.file}`)
      .filter((path) => !existsSync(path));
    expect(missing).toEqual([]);
  });

  it("was recorded in the same voice as the runner's", async () => {
    // One hero voice. This used to assert the opposite, on the theory that a
    // teacher who hears one voice describe the lesson and then teach it cannot
    // tell which words are hers; Johan overruled it on 2026-09-06 ("Lily should
    // be read aloud too"). The spoken line carries the quotation mark on screen;
    // the voice does not have to carry the difference as well.
    const runner = await import("@/lib/lesson/spoken-audio.manifest.json");
    expect(manifest.voice).toBe(runner.default.voice);
  });

  it("opens a row on every session in the lead pack", () => {
    for (const session of leadPack().sessions) {
      const preview = previewForSession(session);
      expect(preview, session.id).not.toBeNull();
      expect(Object.keys(preview!.clips).length).toBeGreaterThan(4);
    }
  });

  it("shows no row at all for a session nothing has been voiced for", () => {
    // Never a dead control. The doorway renders the row only when this is
    // non-null, so an unvoiced session simply has one fewer row.
    const base = loadPack("autumn-starter").sessions[0]!;
    const unvoiced: Session = {
      ...base,
      title: "A lesson nobody has recorded",
      prompt: "What has not been voiced?",
      objective: "Prove the absent state",
      namedSkill: "absence",
      kit: [],
      preparation: undefined,
      primer: undefined,
      phases: [
        {
          key: "only",
          title: "An unrecorded part",
          blocks: [{ type: "teacher-note", text: "Nothing here has been synthesised." }],
        },
      ],
    };
    expect(previewForSession(unvoiced)).toBeNull();
  });

  it("says the length in whole minutes, floored at one", () => {
    expect(previewLength(116)).toBe("2 min, narrated");
    expect(previewLength(20)).toBe("1 min, narrated");
    expect(previewLength(0)).toBe("1 min, narrated");
  });

  it("captions the row with the clock the deck actually keeps", () => {
    // Not the sum of the recordings. The first cut had the caption adding clip
    // lengths and the player adding holds and reading floors on top, which
    // agreed on the subject lesson by luck and would not have on a longer one.
    for (const session of leadPack().sessions) {
      const preview = previewForSession(session)!;
      const deck = preview.cards.reduce(
        (total, card) => total + cardSeconds(card, preview.clips[card.id]?.seconds ?? 0),
        0
      );
      expect(preview.seconds).toBe(Math.round(deck));
      // And every card holds its voice, plus the beat after it.
      for (const card of preview.cards) {
        const clip = preview.clips[card.id];
        if (!clip) continue;
        expect(cardSeconds(card, clip.seconds)).toBeGreaterThanOrEqual(clip.seconds);
      }
    }
  });
});

describe("the deck on screen", () => {
  const session = loadPack("autumn-starter").sessions[0]!;
  const preview = previewForSession(session) as LessonPreviewData;

  const render = () => renderToStaticMarkup(<PreviewDeck preview={preview} sessionId={session.id} />);

  it("opens on the title card with the founder's own two lines, unaltered", () => {
    const markup = render();
    expect(markup).toContain(session.title);
    expect(markup).toContain(session.prompt!);
  });

  it("exposes the visible lesson title as the page's one level-1 heading (nc#619)", () => {
    // Production had this as an h2 with nothing above it. `main` is labelled
    // "Lesson preview" — the surface's name, not the lesson's — so promoting
    // the title card's own headline to h1 adds a heading without duplicating
    // that label.
    const markup = render();
    const h1s = [...markup.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]);
    expect(h1s).toEqual([session.title]);
    expect(markup).toContain('aria-label="Lesson preview"');
  });

  it("keeps the end card's own heading subordinate to that h1, not standing alone", () => {
    // The end card ("Ready when you are.") is the one other card with a
    // heading. Rendered on its own it must stay an h2 — never grow to a
    // second h1 — because the coherent-order claim above only holds if
    // exactly one heading in this deck is ever level 1.
    const deck = previewDeck(session);
    const markup = renderToStaticMarkup(
      <PreviewDeck
        preview={{ ...preview, cards: [deck[deck.length - 1]!] }}
        sessionId={session.id}
      />
    );
    expect(markup).not.toMatch(/<h1[^>]*>/);
    expect(markup).toMatch(/<h2[^>]*>Ready when you are\.<\/h2>/);
  });

  it("owns the screen, and its one way out goes back to this lesson", () => {
    // Johan: "make it full screen instead of overlay". No scrim, no dialog, no
    // device frame — the runner's shape, which is the precedent for a surface
    // that takes the viewport and is left by one mark.
    const markup = render();
    expect(markup).toContain("<main");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).toContain(`href="/session?session=${session.id}"`);
    // And no other way out on the way IN: the three doors are on the end card,
    // so nothing can take the lesson she was deciding about away from her.
    expect(markup).not.toContain('href="/season"');
  });

  it("sends Enter into the lesson rather than back to the door she came from", () => {
    // She has just watched the whole thing, and the ✕ is already the way back.
    // An Enter that returned her to the doorway would be a second name for
    // close.
    const deck = previewDeck(session);
    const markup = renderToStaticMarkup(
      <PreviewDeck
        preview={{ ...preview, cards: [deck[deck.length - 1]!] }}
        sessionId={session.id}
      />
    );
    // Into the run, which opens on the introduction (no `at=settle` since
    // 2026-09-06: the grounding follows the introduction).
    expect(markup).toContain(`href="/run?session=${session.id}"`);
    expect(markup).toContain(`href="/session/primer?session=${session.id}"`);
    expect(markup).toContain('href="/season"');
  });

  it("carries one segment per card, sized to that card", () => {
    const markup = render();
    const segments = markup.match(/flex:/g) ?? [];
    expect(segments).toHaveLength(preview.cards.length);
  });

  it("holds body prose to a measure rather than the width of an iPad", () => {
    // The one thing full screen actually changes. A card that reads well at
    // 520px reads badly at 1024, and scaling the prototype's frame up would
    // have shipped a mockup.
    const css = readFileSync("app/session/preview/preview.module.css", "utf8");
    expect(css).toContain("--measure: 44rem");
    expect(css).toContain("max-width: var(--measure)");
    // And the type grows with the viewport rather than sitting at one step.
    expect(css).toMatch(/\.title \{[^}]*clamp\(/);
    expect(css).toMatch(/\.lead \{[^}]*clamp\(/);
  });

  it("gives every control the touch floor and no explaining label", () => {
    const markup = render();
    // One word, or a bare mark. "Watch a preview", "Play aloud to class" and
    // the like are us telling a teacher what a play triangle already tells her.
    expect(markup).toContain('aria-label="Play"');
    const visible = markup.replace(/<[^>]*>/g, " ");
    expect(visible).not.toMatch(/watch|listen|narrated slideshow/i);
    // "Silent" names the mode; it does not describe it.
    expect(visible).toContain("Silent");
  });
});
