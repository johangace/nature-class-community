import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { groupViews } from "@/lib/moments";
import { resolvePhases } from "@/lib/resolve";
import { spokenLine } from "@/lib/text";
import { leadPack, loadAllPacks, loadPack } from "@/lib/pack";
import {
  collectSpokenLines,
  spokenAudioForSession,
  type SpokenAudio,
} from "@/lib/lesson/spoken-audio";
import { clipForMoment } from "@/lib/lesson/spoken-clip";
import { PlayAloud, isPlaybackInterruption } from "@/app/run/PlayAloud";
import type { Block, Phase, Session } from "@/schema/pack";
import manifest from "@/lib/lesson/spoken-audio.manifest.json";

/**
 * PLAY ALOUD TO CLASS (nc#358).
 *
 * The one defect this feature is not allowed to have is a teacher note read
 * into a child's ears. Every test below exists to make that a red build, and
 * they are deliberately run against the REAL packs rather than a fixture,
 * because a fixture proves the code is careful with text somebody wrote for
 * the test and says nothing about the curriculum that actually ships.
 */

function everySession(): Array<{ packId: string; session: Session }> {
  return loadAllPacks().flatMap((pack) =>
    pack.sessions.map((session) => ({ packId: pack.id, session }))
  );
}

/**
 * Every say-aloud string on disk, read straight out of the JSON.
 *
 * Deliberately a SECOND implementation rather than a call to
 * `collectSpokenLines`: this is the guard on what may exist as a recording at
 * all, and a guard that reuses the code it is guarding proves only that the
 * code agrees with itself. It also reaches every file under packs/, including
 * the ones off the shelf, which is what the synthesis script walks.
 */
function authoredSayAloudOnDisk(): Set<string> {
  const { readdirSync, readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const found = new Set<string>();

  const readNode = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(readNode);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "say-aloud") {
      const variants = (record.abilityVariants ?? {}) as Record<string, unknown>;
      for (const value of [record.text, variants.reception, variants.y1, variants.y2]) {
        if (typeof value === "string" && value.trim()) found.add(spokenLine(value));
      }
      return;
    }
    Object.values(record).forEach(readNode);
  };

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".json")) readNode(JSON.parse(readFileSync(path, "utf8")));
    }
  };

  walk("packs");
  return found;
}

/** Every block a session carries, condition variants included. */
function everyBlock(session: Session): Block[] {
  const blocks: Block[] = [];
  const walk = (phase: Phase): void => {
    blocks.push(...phase.blocks);
    phase.conditionVariants?.forEach((variant) => walk(variant.phase));
  };
  session.phases.forEach(walk);
  return blocks;
}

describe("what may be spoken by a recording", () => {
  const sessions = everySession();

  it("offers the synthesiser say-aloud text and nothing else", () => {
    // The isolating case: one phase carrying every block type at once, so a
    // renderer or a collector that walked "all blocks with text" is caught by
    // the assertion rather than by a teacher in a playground.
    const phase: Phase = {
      key: "mixed",
      title: "Mixed",
      blocks: [
        { type: "teacher-note", text: "Keep the class behind the fence line." },
        { type: "say-aloud", text: "What can you hear from here?" },
        {
          type: "demo",
          move: "The hold and turn",
          steps: [{ text: "Hold the leaf up to the light." }],
          look: "The veins show through.",
          materials: ["a leaf"],
        },
        { type: "conditions-line", fallbackText: "It is a still, grey morning." },
        { type: "circle-question", text: "What surprised you today?" },
        { type: "named-skill", skill: "Observing" },
      ],
    };
    const session = { ...loadPack("summer").sessions[0]!, phases: [phase] };

    expect(collectSpokenLines(session)).toEqual(["What can you hear from here?"]);
  });

  it("never lets a teacher note, a demo or a conditions line become a key, in any real pack", () => {
    const spoken = new Set<string>();
    const forbidden = new Set<string>();

    for (const { session } of sessions) {
      for (const line of collectSpokenLines(session)) spoken.add(line);
      for (const block of everyBlock(session)) {
        if (block.type === "say-aloud") continue;
        const primary =
          block.type === "demo"
            ? block.move
            : block.type === "conditions-line"
              ? block.fallbackText
              : block.type === "named-skill"
                ? block.skill
                : block.text;
        for (const text of [
          primary,
          ...(block.type === "demo"
            ? [block.look, ...block.steps.map((step) => step.text)]
            : []),
          block.abilityVariants?.reception,
          block.abilityVariants?.y1,
          block.abilityVariants?.y2,
        ]) {
          if (typeof text === "string" && text.trim()) forbidden.add(spokenLine(text));
        }
      }
    }

    expect(forbidden.size).toBeGreaterThan(50);
    const leaked = [...forbidden].filter((line) => spoken.has(line));
    expect(leaked).toEqual([]);
  });

  it("carries no recording that is not a spoken line of some pack", () => {
    // The guard from the other direction: a manifest entry is the only thing
    // that can ever play, so an entry with no authored line behind it is a
    // sentence in a child's ears that nobody wrote. Orphans are pruned, not
    // tolerated.
    const authored = authoredSayAloudOnDisk();
    expect(authored.size).toBeGreaterThan(100);
    const orphans = Object.keys(manifest.lines).filter((line) => !authored.has(line));
    expect(orphans).toEqual([]);
  });

  it("keys a recording on the line verbatim, including its ability variants", () => {
    const said: Block = {
      type: "say-aloud",
      text: '"Look up. What is moving?"',
      abilityVariants: { reception: "Look up. What can you see?" },
    };
    const session = {
      ...loadPack("summer").sessions[0]!,
      phases: [{ key: "k", title: "K", blocks: [said] }],
    };

    // The wrapping quote is the page's punctuation, not part of what she says,
    // so it is unwrapped exactly as the renderer unwraps it. Everything else,
    // including the full stop and the question mark, is untouched.
    expect(collectSpokenLines(session)).toEqual([
      "Look up. What is moving?",
      "Look up. What can you see?",
    ]);
  });

  it("carries a wet-day variant's lines too", () => {
    const session = {
      ...loadPack("summer").sessions[0]!,
      phases: [
        {
          key: "k",
          title: "K",
          blocks: [{ type: "say-aloud", text: "Dry day line." }] as Block[],
          conditionVariants: [
            {
              when: "wet" as const,
              phase: {
                key: "k",
                title: "K",
                blocks: [{ type: "say-aloud", text: "Wet day line." }] as Block[],
              },
            },
          ],
        },
      ],
    };
    expect(collectSpokenLines(session)).toContain("Wet day line.");
  });
});

describe("the runner picks the right clip, or none", () => {
  const audio: SpokenAudio = {};

  it("plays the moment's spoken line and not the note sitting beside it", () => {
    const note: Block = { type: "teacher-note", text: "Stand where they can all see you." };
    const said: Block = { type: "say-aloud", text: "Find something older than you." };
    const withBoth: SpokenAudio = {
      "Find something older than you.": { src: "/lesson-audio/aaaa.mp3", seconds: 3 },
      "Stand where they can all see you.": { src: "/lesson-audio/bbbb.mp3", seconds: 3 },
    };

    expect(clipForMoment([note, said], "y1", withBoth)?.src).toBe("/lesson-audio/aaaa.mp3");
  });

  it("shows nothing on a moment with no spoken line", () => {
    const note: Block = { type: "teacher-note", text: "Stand where they can all see you." };
    expect(clipForMoment([note], "y1", { "Stand where they can all see you.": { src: "/x.mp3", seconds: 1 } })).toBeNull();
  });

  it("shows nothing for a line that has not been voiced", () => {
    const said: Block = { type: "say-aloud", text: "A line nobody has recorded." };
    expect(clipForMoment([said], "y1", audio)).toBeNull();
  });

  it("follows the class's ability band to the line the page is showing", () => {
    const said: Block = {
      type: "say-aloud",
      text: "What is living here?",
      abilityVariants: { reception: "What is alive here?" },
    };
    const both: SpokenAudio = {
      "What is living here?": { src: "/lesson-audio/y1.mp3", seconds: 2 },
      "What is alive here?": { src: "/lesson-audio/rec.mp3", seconds: 2 },
    };
    expect(clipForMoment([said], "y1", both)?.src).toBe("/lesson-audio/y1.mp3");
    expect(clipForMoment([said], "reception", both)?.src).toBe("/lesson-audio/rec.mp3");
  });

  it("walks a real lesson the way the runner does and never reaches past a moment's own words", () => {
    // The integration assertion: the same pack, the same resolvePhases, the
    // same groupViews and the same per-moment filter the hybrid runner uses,
    // with every line in the manifest pretending to be voiced. Whatever comes
    // back must be a say-aloud line of THAT moment.
    const pack = leadPack();
    const everything: SpokenAudio = {};
    for (const { session } of everySession()) {
      for (const line of collectSpokenLines(session)) {
        everything[line] = { src: `/lesson-audio/${line.length}.mp3`, seconds: 1 };
      }
    }

    let momentsChecked = 0;
    let clipsFound = 0;
    for (const session of pack.sessions) {
      for (const phase of resolvePhases(session, null)) {
        const moments = groupViews(phase.blocks).filter((moment) =>
          moment.blocks.some((block) => block.type !== "conditions-line")
        );
        for (const moment of moments) {
          momentsChecked += 1;
          const clip = clipForMoment(moment.blocks, "y1", everything);
          if (!clip) continue;
          clipsFound += 1;
          const ownLines = moment.blocks
            .filter((block) => block.type === "say-aloud")
            .map((block) => (block.type === "say-aloud" ? spokenLine(block.text) : ""));
          expect(ownLines.map((line) => everything[line]?.src)).toContain(clip.src);
        }
      }
    }

    expect(momentsChecked).toBeGreaterThan(20);
    expect(clipsFound).toBeGreaterThan(10);
  });
});

describe("the control degrades honestly", () => {
  it("draws nothing at all when there is no recording", () => {
    expect(renderToStaticMarkup(<PlayAloud clip={null} />)).toBe("");
  });

  it("draws a real, pressable control when there is one", () => {
    const markup = renderToStaticMarkup(
      <PlayAloud clip={{ src: "/lesson-audio/aaaa.mp3", seconds: 12 }} />
    );
    expect(markup).toContain("/lesson-audio/aaaa.mp3");
    // A mark, not a label. Johan: "just play or something elegant.. i have the
    // tendency to do so much explaining". One word in the accessible name, and
    // none on the page.
    expect(markup).toContain('aria-label="Play"');
    expect(markup).toContain("<svg");
    // Nothing is fetched until she asks for it.
    expect(markup).toContain('preload="none"');
    // No strip, no plate, no rule, no waveform, no countdown, and no reading
    // matter beside the sentence. This is the assertion that keeps them gone.
    //
    // Asserted against VISIBLE COPY, not raw markup. The first cut matched the
    // whole string and failed on the CSS module class `_playAloud_fa0783` — a
    // build artefact, not something a teacher reads. A test that cannot tell a
    // class name from a caption would have forced the component to be renamed
    // to satisfy it.
    const visible = markup
      .replace(/<[^>]*>/g, " ")
      .concat(" ", markup.match(/aria-label="([^"]*)"/)?.[1] ?? "");
    expect(visible).not.toMatch(/aloud|to class|Playing|Listen|\d:\d\d/i);
  });
});

describe("a fast thumb is not a fault", () => {
  // The bug this describes: pressing play and then pressing it again before
  // the play() promise settles makes pause() reject with an AbortError. The
  // first cut treated every rejection as a broken recording and hid the
  // control, so working the button quickly made it disappear.
  it("keeps the control when pause interrupts a pending play", () => {
    const interrupted = new DOMException(
      "The play() request was interrupted by a call to pause().",
      "AbortError"
    );
    expect(isPlaybackInterruption(interrupted)).toBe(true);
  });

  it("still hides the control when the recording genuinely will not play", () => {
    expect(isPlaybackInterruption(new DOMException("no source", "NotSupportedError"))).toBe(false);
    expect(isPlaybackInterruption(new Error("network"))).toBe(false);
    expect(isPlaybackInterruption(null)).toBe(false);
    expect(isPlaybackInterruption(undefined)).toBe(false);
  });
});

describe("the shipped recordings", () => {
  it("gives every session in the lead pack something to play", () => {
    // Not a coverage target for its own sake: a control that appears on some
    // lessons and not others reads as a broken product rather than an option.
    for (const session of leadPack().sessions) {
      const spoken = collectSpokenLines(session);
      if (spoken.length === 0) continue;
      expect(Object.keys(spokenAudioForSession(session)).length).toBeGreaterThan(0);
    }
  });

  it("points every manifest entry at a file that is actually shipped", async () => {
    const { existsSync } = await import("node:fs");
    const missing = Object.values(manifest.lines)
      .map((entry) => `public/lesson-audio/${entry.file}`)
      .filter((path) => !existsSync(path));
    expect(missing).toEqual([]);
  });
});
