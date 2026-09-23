import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonPackSection } from "@/app/season/SeasonPackSection";
import { shelfSessionView } from "@/app/season/shelf-view";
import { flashCards } from "@/app/print/FlashCards";
import { drivingQuestion, promptRestates } from "@/lib/lesson/driving-question";
import { projectLessonJourney } from "@/lib/lesson/journey";
import { previewDeck } from "@/lib/lesson/preview";
import { getSession, loadAllPacks, loadPack } from "@/lib/pack";

/**
 * nc#150. Three shipped sessions carry a `prompt` that restates the field
 * printed next to it, and every surface that shows both was printing the same
 * sentence twice. The lines are Johan's, guarded byte for byte, so the fix is
 * a display rule and these tests are its contract: what it hides, and, far
 * more important, what it must never hide.
 */

const seat = (over: Partial<Parameters<typeof drivingQuestion>[0]>) => ({
  title: "A lesson",
  objective: "An objective.",
  ...over,
});

describe("the driving-question display rule", () => {
  it("hides a prompt that is the objective, word for word", () => {
    const session = seat({
      title: "Bird feeders",
      prompt: "Making bird feeders and encouraging wildlife in your school grounds.",
      objective: "Making bird feeders and encouraging wildlife in your school grounds.",
    });

    expect(promptRestates(session)).toBe("objective");
    expect(drivingQuestion(session)).toBeNull();
  });

  it("hides a prompt that is the objective's opening clause, cut short", () => {
    const session = seat({
      title: "A5 leaf collage",
      prompt: "Create art with nature.",
      objective:
        "Create art with nature, taking influence from what the children see around them.",
    });

    expect(promptRestates(session)).toBe("objective");
    expect(drivingQuestion(session)).toBeNull();
  });

  it("hides a prompt that is the title with a full stop on it", () => {
    const session = seat({
      title: "Minibeast hunting",
      prompt: "Minibeast hunting.",
      objective:
        "Look closely at minibeasts and discover that all creatures have special roles to help our planet stay alive.",
    });

    expect(promptRestates(session)).toBe("title");
    expect(drivingQuestion(session)).toBeNull();
  });

  it("ignores case, spacing and punctuation when comparing", () => {
    expect(
      drivingQuestion(
        seat({
          title: "Minibeast   Hunting",
          prompt: "  minibeast hunting!  ",
          objective: "Something else entirely.",
        })
      )
    ).toBeNull();
  });

  // ── The boundary. Everything below MUST still render. ─────────────────────

  it("keeps a question that merely opens the way the objective does", () => {
    const session = seat({
      title: "A5 leaf collage",
      prompt: "Create art with nature?",
      objective:
        "Create art with nature, taking influence from what the children see around them.",
    });

    expect(promptRestates(session)).toBeNull();
    expect(drivingQuestion(session)).toBe("Create art with nature?");
  });

  it("keeps a statement that shares an opening clause and then says its own thing", () => {
    const session = seat({
      title: "A5 leaf collage",
      prompt: "Create art with nature and leave it where you found it.",
      objective:
        "Create art with nature, taking influence from what the children see around them.",
    });

    expect(promptRestates(session)).toBeNull();
    expect(drivingQuestion(session)).toBe(
      "Create art with nature and leave it where you found it."
    );
  });

  it("keeps a prompt whose words begin the title but do not finish it", () => {
    const session = seat({
      title: "Minibeast hunting in the long grass",
      prompt: "Minibeast hunting.",
      objective: "Something else entirely.",
    });

    expect(drivingQuestion(session)).toBe("Minibeast hunting.");
  });

  it("keeps a prompt the objective merely contains, rather than opens with", () => {
    // Deliberately NOT suppressed: two spring sessions glue a lead-in to the
    // front of the objective ("About using natural resources to create."), and
    // that is a different defect from a truncation, unmeasured by #150.
    const session = seat({
      title: "Natural paint making",
      prompt: "Using natural resources to create.",
      objective: "About using natural resources to create.",
    });

    expect(promptRestates(session)).toBeNull();
    expect(drivingQuestion(session)).toBe("Using natural resources to create.");
  });

  it("returns null when nothing was authored", () => {
    expect(drivingQuestion(seat({}))).toBeNull();
    expect(drivingQuestion(seat({ prompt: "   " }))).toBeNull();
  });

  it("renders Johan's string byte for byte when it survives", () => {
    const prompt = "  What's living in our grounds?  ";
    expect(
      drivingQuestion(seat({ prompt, objective: "Notice everything that is alive." }))
    ).toBe(prompt);
  });
});

describe("the three shipped sessions the rule was written for", () => {
  it("names them, and only them, across every pack on disk", () => {
    const restated = loadAllPacks().flatMap((pack) =>
      pack.sessions
        .map((session) => ({ id: session.id, restates: promptRestates(session) }))
        .filter((row) => row.restates !== null)
    );

    expect(restated).toEqual([
      { id: "spring-w4-bird-feeders", restates: "objective" },
      { id: "summer-w2-minibeast-hunting", restates: "title" },
      { id: "summer-w3-a5-leaf-collage", restates: "objective" },
    ]);
  });

  it("leaves every other authored prompt on the page", () => {
    const packs = loadAllPacks();
    const authored = packs.flatMap((pack) =>
      pack.sessions.filter((session) => session.prompt?.trim())
    );
    const shown = authored.filter((session) => drivingQuestion(session) !== null);

    // Sixty-five since living-things-spring (#564) added four sessions, each
    // with a driving question of its own; the three restatements are still
    // the three named above, so the shown count moves with the total.
    expect(authored).toHaveLength(65);
    expect(shown).toHaveLength(62);
  });
});

describe("the surfaces that used to stack the pair", () => {
  it("keeps the preview deck's title card from showing and saying the title twice", () => {
    const summer = loadPack("summer");

    const minibeast = previewDeck(getSession(summer, "summer-w2-minibeast-hunting"))[0];
    expect(minibeast?.kind).toBe("title");
    if (minibeast?.kind !== "title") throw new Error("expected the title card first");
    expect(minibeast.prompt).toBeNull();
    expect(minibeast.narration.map((segment) => segment.text)).toEqual(["Minibeast hunting."]);

    // An authored question still shows and is still spoken, byte for byte.
    const counting = previewDeck(getSession(summer, "summer-w1-counting-life"))[0];
    if (counting?.kind !== "title") throw new Error("expected the title card first");
    expect(counting.prompt).toBe("What's living in our grounds?");
    expect(counting.narration).toHaveLength(2);
  });

  it("stops the lesson journey leading with a restated line", () => {
    const summer = loadPack("summer");
    const spring = loadPack("spring-term");

    const collage = projectLessonJourney(
      summer,
      getSession(summer, "summer-w3-a5-leaf-collage")
    );
    expect(collage.questionSource).toBe("objective-fallback");
    expect(collage.question).toBe(
      "Create art with nature, taking influence from what the children see around them."
    );

    const minibeast = projectLessonJourney(
      summer,
      getSession(summer, "summer-w2-minibeast-hunting")
    );
    expect(minibeast.questionSource).toBe("objective-fallback");

    const feeders = projectLessonJourney(
      spring,
      getSession(spring, "spring-w4-bird-feeders")
    );
    expect(feeders.questionSource).toBe("objective-fallback");

    // The authored questions are untouched.
    const counting = projectLessonJourney(
      summer,
      getSession(summer, "summer-w1-counting-life")
    );
    expect(counting.questionSource).toBe("prompt");
    expect(counting.question).toBe("What's living in our grounds?");
  });

  it("prints each shelf row's title once", () => {
    const pack = loadPack("summer");
    const html = renderToStaticMarkup(
      <SeasonPackSection
        pack={{
          id: pack.id,
          title: pack.title,
          sessions: pack.sessions.map(shelfSessionView),
        }}
        tier="community"
        led={new Set()}
        nextUp={null}
      />
    );

    expect(html).toContain("Minibeast hunting");
    expect(html).not.toContain("Minibeast hunting.");
    expect(html).not.toContain("shelf-prompt&quot;&gt;Create art with nature.");
    // The shelf's real job is untouched: the sessions that authored a question
    // still say it, which is how a teacher tells one row from the next.
    expect(html).toContain("What&#x27;s living in our grounds?");
    expect(html).toContain("Why are trees so important for our existence?");
  });

  it("spends no line of a flash card restating its own heading", () => {
    const pack = loadPack("summer");
    const minibeast = flashCards(
      getSession(pack, "summer-w2-minibeast-hunting"),
      "y1"
    )[0];

    expect(minibeast?.heading).toBe("Minibeast hunting");
    expect(minibeast?.lines.map((line) => line.text)).not.toContain(
      "Minibeast hunting."
    );

    const counting = flashCards(
      getSession(pack, "summer-w1-counting-life"),
      "y1"
    )[0];
    expect(counting?.lines.map((line) => line.text)).toContain(
      "What's living in our grounds?"
    );
  });
});
