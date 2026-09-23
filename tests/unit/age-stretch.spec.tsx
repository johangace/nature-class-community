import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CircleTime } from "@/app/run/CircleTime";
import { PhaseNotesContent } from "@/app/session/TeachingNotes";
import { renderBlock } from "@/engine/registry";
import { groupViews } from "@/lib/moments";
import { getSession, loadAllPacks, loadPack } from "@/lib/pack";
import { phaseBlocks, stretchNote } from "@/lib/lesson/stretch";
import { parsePack, phaseSchema, type Phase, type Session } from "@/schema/pack";

/**
 * ONE AGE-STRETCH LINE PER STAGE (#466) — the mechanism, and only the
 * mechanism.
 *
 * The panel finding (#454): ages 4-6 is a hard ceiling with nothing above it,
 * and every non-classroom facilitator runs mixed ages against it. The ask is
 * one optional "for the older children" line per stage, shown as a teacher
 * note. The WORDS of those lines are Johan's — the packs are guarded
 * byte-for-byte by scripts/verbatim-fidelity.mjs because agent-tidied copy has
 * been reverted here three times — so this ships with the field empty
 * everywhere and every assertion below authors its stretch line inside the
 * test, never into a pack.
 *
 * What is proven here: the field parses and is optional; a malformed one is
 * refused; where present it renders in the EXISTING teacher-note treatment at
 * the head of its stage; where absent nothing renders and nothing is implied;
 * and every surface that walks a phase's blocks walks them through the one
 * helper, so a written line cannot reach one screen and silently miss another.
 */

const COUNTING = "summer-w1-counting-life";

/** A real shipped phase, cloned, with a stretch line authored ONLY here. */
function phaseWithStretch(key: string, line: string): Phase {
  const session = getSession(loadPack("summer"), COUNTING);
  const phase = session.phases.find((candidate) => candidate.key === key);
  if (!phase) throw new Error(`Counting Life phase "${key}" missing`);
  return { ...structuredClone(phase), stretch: line };
}

/** The same lesson, cloned whole, with one stage's stretch authored ONLY here. */
function sessionWithStretch(key: string, line: string): Session {
  const session = structuredClone(getSession(loadPack("summer"), COUNTING));
  const phase = session.phases.find((candidate) => candidate.key === key);
  if (!phase) throw new Error(`Counting Life phase "${key}" missing`);
  phase.stretch = line;
  return session;
}

// Deliberately not a teaching line: it is a marker string, so nothing in this
// file could ever be mistaken for authored curriculum copy.
const MARKER = "STRETCH-FIXTURE-466";

describe("the stretch field in the pack schema", () => {
  it("parses on a stage that carries one, and is optional on every stage that does not", () => {
    const phase = phaseWithStretch("alive-4", MARKER);
    expect(phaseSchema.parse(phase).stretch).toBe(MARKER);

    const { stretch: _dropped, ...without } = phase;
    expect(phaseSchema.parse(without).stretch).toBeUndefined();
  });

  it("keeps every shipped pack parsing unchanged — the field is additive", () => {
    const packsDir = join(process.cwd(), "packs");
    const files = readdirSync(packsDir).filter(
      (file) => file.endsWith(".json") && file !== "settle.json"
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
      expect(() => parsePack(raw), `${file} should still parse`).not.toThrow();
    }
    const settle = JSON.parse(readFileSync(join(packsDir, "settle.json"), "utf8"));
    expect(() => phaseSchema.parse(settle.phase)).not.toThrow();
  });

  it("refuses a malformed value: not a string, empty, or blank space", () => {
    const base = phaseWithStretch("alive-4", MARKER);

    expect(phaseSchema.safeParse({ ...base, stretch: 7 }).success).toBe(false);
    expect(phaseSchema.safeParse({ ...base, stretch: "" }).success).toBe(false);
    expect(phaseSchema.safeParse({ ...base, stretch: "   " }).success).toBe(false);
    expect(phaseSchema.safeParse({ ...base, stretch: null }).success).toBe(false);
  });

  it("refuses a line the stage already carries — move it, never copy it", () => {
    // The stretch a stage needs is often already inside the stage, and naming
    // one of those costs no new words. But the note renders IN ADDITION to the
    // blocks, so a copied line would appear twice on the same screen.
    const session = getSession(loadPack("summer"), COUNTING);
    const phase = session.phases.find((candidate) => candidate.key === "alive-4");
    const spoken = phase?.blocks.find((block) => block.type === "say-aloud");
    if (!phase || spoken?.type !== "say-aloud") throw new Error("alive-4 spoken line missing");

    const copied = phaseSchema.safeParse({ ...structuredClone(phase), stretch: spoken.text });
    expect(copied.success).toBe(false);
    expect(JSON.stringify(copied.error?.issues)).toContain("repeats a line");

    // The same line MOVED out of blocks is fine — that is the authoring path.
    const moved = phaseSchema.safeParse({
      ...structuredClone(phase),
      blocks: phase.blocks.filter((block) => block !== spoken),
      stretch: spoken.text,
    });
    expect(moved.success).toBe(true);
  });

  it("refuses a stretch on the settling ritual, which cannot render one", () => {
    // The settle renders as paired cards (a spoken line with the note that
    // follows it), so a leading note there would be dropped on the floor.
    const settle = JSON.parse(readFileSync(join(process.cwd(), "packs", "settle.json"), "utf8"));
    const rigged = { ...settle.phase, stretch: MARKER };
    const parsed = phaseSchema.safeParse(rigged);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("never reach a screen");
  });

  it("publishes the field in the strict mirrored JSON Schema", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../schema/pack.schema.json", import.meta.url), "utf8")
    );
    expect(schema.$defs.phase.properties).toHaveProperty("stretch");
    expect(schema.$defs.phase.required).not.toContain("stretch");
  });
});

describe("the stretch line as the note it renders as", () => {
  it("becomes a teacher-note block carrying the authored words verbatim", () => {
    const note = stretchNote({ stretch: `  ${MARKER}  ` });
    expect(note).toEqual({ type: "teacher-note", text: `  ${MARKER}  ` });
  });

  it("is nothing at all when the stage has no stretch", () => {
    expect(stretchNote({})).toBeNull();
    expect(stretchNote({ stretch: undefined })).toBeNull();
    expect(stretchNote({ stretch: "   " })).toBeNull();
  });

  it("stands at the head of the stage's blocks when present", () => {
    const phase = phaseWithStretch("alive-4", MARKER);
    const blocks = phaseBlocks(phase);
    expect(blocks).toHaveLength(phase.blocks.length + 1);
    expect(blocks[0]).toEqual({ type: "teacher-note", text: MARKER });
    expect(blocks.slice(1)).toEqual(phase.blocks);
  });

  it("returns a stage's own blocks, untouched and by reference, when absent", () => {
    // Absent means absent: no copy, no synthetic entry, nothing to render.
    for (const pack of loadAllPacks()) {
      for (const session of pack.sessions) {
        for (const phase of session.phases) {
          if (phase.stretch) continue;
          expect(phaseBlocks(phase)).toBe(phase.blocks);
        }
      }
    }
  });

  it("rides into the stage's FIRST view, above the words it is read before", () => {
    // groupViews attaches a leading quiet block forward to the moment it sets
    // up (nc#326), which is what makes this a decision a facilitator takes on
    // the way into a stage rather than on the way out of it.
    const phase = phaseWithStretch("alive-4", MARKER);
    const views = groupViews(phaseBlocks(phase));
    expect(views[0]?.blocks[0]).toEqual({ type: "teacher-note", text: MARKER });
    expect(views.length).toBe(groupViews(phase.blocks).length);
  });
});

describe("what a teacher actually sees", () => {
  it("renders in the existing teacher-note treatment, with no new plate of its own", () => {
    const note = stretchNote({ stretch: MARKER });
    if (!note) throw new Error("stretch note missing");
    const markup = renderToStaticMarkup(renderBlock(note, "y2"));

    expect(markup).toContain(MARKER);
    expect(markup).toContain("block-teacher-note");
    expect(markup).toContain("teacher-note-text");
  });

  it("shows on the stage that carries one — the circle, through the real component", () => {
    const phase = phaseWithStretch("circle", MARKER);
    const markup = renderToStaticMarkup(
      <CircleTime blocks={phaseBlocks(phase)} ability="y1" />
    );
    expect(markup).toContain(MARKER);
    expect(markup).toContain("block-teacher-note");
  });

  it("changes nothing at all on a stage that carries none", () => {
    const session = getSession(loadPack("summer"), COUNTING);
    const phase = session.phases.find((candidate) => candidate.key === "circle");
    if (!phase) throw new Error("Counting Life circle missing");

    const before = renderToStaticMarkup(<CircleTime blocks={phase.blocks} ability="y1" />);
    const after = renderToStaticMarkup(
      <CircleTime blocks={phaseBlocks(phase)} ability="y1" />
    );
    expect(after).toBe(before);
    expect(after).not.toContain("older");
  });

  it("reaches the legacy plan page's notes panel, beside the stage's own notes", () => {
    // #668: this panel `filter`s a stage's teacher notes where WorkPhase
    // `find`s the first one, so the stretch joins the authored cues here
    // instead of displacing one. It is the same panel /read builds, and a
    // stage may not carry fewer notes in one page-mode than in the other.
    const session = sessionWithStretch("alive-4", MARKER);
    const phase = session.phases.find((candidate) => candidate.key === "alive-4");
    const authored = phase?.blocks.filter((block) => block.type === "teacher-note") ?? [];
    expect(authored.length).toBeGreaterThan(0);

    const markup = renderToStaticMarkup(<PhaseNotesContent session={session} />);
    expect(markup).toContain(MARKER);
    for (const note of authored) {
      if (note.type !== "teacher-note") continue;
      expect(markup).toContain(note.text);
    }
  });

  it("adds exactly one note to that panel, and none to a lesson with no stretch", () => {
    // Counted independently of the component: the panel should show every
    // teacher-note a stage's own blocks carry, plus one for the stretch and
    // not one more. Absent means absent, here as everywhere else.
    const plain = getSession(loadPack("summer"), COUNTING);
    const authoredNotes = plain.phases.flatMap((phase) =>
      phase.blocks.filter((block) => block.type === "teacher-note")
    );
    const countParagraphs = (session: Session) =>
      (renderToStaticMarkup(<PhaseNotesContent session={session} />).match(/<p/g) ?? []).length;

    const before = countParagraphs(plain);
    const after = countParagraphs(sessionWithStretch("alive-4", MARKER));
    expect(after).toBe(before + 1);
    expect(before).toBeGreaterThanOrEqual(authoredNotes.length);
    expect(renderToStaticMarkup(<PhaseNotesContent session={plain} />)).not.toContain(MARKER);
  });
});

describe("every surface reads a stage through the one helper", () => {
  const read = (path: string) =>
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  /**
   * A line written once has to appear everywhere a stage is walked, or it
   * becomes a line that is there on the runner and gone on the printout. Two
   * of the hybrid's call sites do not even render — they compute the resume
   * clamp and the entity-position map — and a mismatch there resumes a saved
   * run one moment off, so they go through the same helper as the page.
   */
  const surfaces = [
    "app/run/HybridJourney.tsx",
    "app/run/Runner.tsx",
    "app/run/LessonScroll.tsx",
    "app/read/page.tsx",
    "engine/print-phase.tsx",
    // #668: the legacy plan page's notes panel. It `filter`s, so the stretch
    // joins the stage's notes rather than displacing one — the test that
    // decided WorkPhase stays out is the same test that brought this one in.
    "app/session/TeachingNotes.tsx",
  ];

  it.each(surfaces)("%s walks a phase through phaseBlocks", (path) => {
    const source = read(path);
    expect(source).toContain('from "@/lib/lesson/stretch"');
    expect(source).toMatch(/phaseBlocks\(/);
  });

  it("leaves no surface still grouping a phase's raw blocks", () => {
    expect(read("app/run/HybridJourney.tsx")).not.toMatch(/groupViews\(phase\.blocks\)/);
    expect(read("app/run/HybridJourney.tsx")).not.toMatch(/readCircle\(circlePhase\.blocks\)/);
    expect(read("app/run/Runner.tsx")).not.toMatch(/groupMoments\(p(hase)?\.blocks\)/);
    expect(read("app/run/LessonScroll.tsx")).not.toMatch(
      /const moments = groupMoments\(phase\.blocks\)/
    );
    expect(read("app/session/TeachingNotes.tsx")).not.toMatch(
      /notes: phase\.blocks\.filter/
    );
  });

  it("names the one surface that does not carry it, so the gap is documented", () => {
    // `?run=legacy`'s quiet child-work posture shows one authored cue and then
    // stops asking for attention. It is not wired, on purpose; the helper says
    // so in prose so the next person to touch WorkPhase inherits the reason.
    expect(read("app/run/WorkPhase.tsx")).not.toContain("phaseBlocks");
    expect(read("lib/lesson/stretch.ts")).toContain("WorkPhase.tsx");

    // And it stays out for a reason that is checkable rather than remembered:
    // it takes the FIRST teacher note, so a leading stretch would replace the
    // authored cue. Every wired surface takes all of them (#668).
    expect(read("app/run/WorkPhase.tsx")).toMatch(
      /\.find\(\(block\) => block\.type === "teacher-note"\)/
    );
    expect(read("app/session/TeachingNotes.tsx")).toMatch(
      /phaseBlocks\(phase\)\.filter\(\(block\) => block\.type === "teacher-note"\)/
    );
  });

  it("names the legacy plan page among the wired surfaces, not just in a test", () => {
    // The helper's own prose is the thing a future reader finds first, so
    // "wired at every phase-walking call site" has to be literally true there.
    expect(read("lib/lesson/stretch.ts")).toContain("TeachingNotes.tsx");
    expect(read("lib/lesson/stretch.ts")).toContain("PhaseNotesContent");
  });

  it("keeps the line off the spoken and narrated paths", () => {
    // It is a teacher-facing aside, never a recorded line: the preview deck
    // reads phase.blocks on purpose, and the synthesis manifest is keyed on
    // say-aloud text alone.
    expect(read("lib/lesson/preview.ts")).not.toContain("phaseBlocks");
    expect(read("lib/lesson/preview.ts")).toContain("phase.blocks");
  });
});
