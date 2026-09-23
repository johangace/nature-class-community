vi.mock("@/lib/request-locale", () => ({ requestLocaleChoice: async () => ({ locale: "uk", automatic: false }), requestLocale: async (explicit?: string, location?: {lat: number; lng: number}) => { const { preferredLocale } = await import("@/lib/locale-policy"); return preferredLocale({explicit, location}); } }));
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODAY, REBUILT (#323). This file used to pin the two-card stack; it now pins
 * the page that replaced it, and the properties worth keeping are the same
 * three:
 *
 *   the lesson is the destination and does not wait on the network,
 *   the read invents nothing while it is loading or when it comes back thin,
 *   the display face carries the question and the text face carries the rest.
 *
 * The async reads are mocked out rather than rendered, because
 * renderToStaticMarkup cannot await an async server component. Their own
 * behaviour is tested where it lives: lib/outside/day-read, today-window and
 * lesson/hinge.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));
vi.mock("@/lib/curriculum", () => ({
  curriculumSequence: vi.fn(),
  nextUnled: vi.fn(),
}));
vi.mock("@/lib/teacher", () => ({
  classMinutesOutside: vi.fn(),
  completedSessionIds: vi.fn(),
  getActiveClass: vi.fn(),
  getTeacher: vi.fn(),
  teacherHasPasskey: vi.fn(),
}));
vi.mock("@/app/AppNav", async () => { const { AppNavClient } = await import("@/app/AppNavClient"); return { AppNav: AppNavClient }; });
vi.mock("@/app/TodayDay", () => ({
  TodayDay: () => null,
  TodayDoor: () => null,
}));
vi.mock("@/app/run/CompletionQueueDrain", () => ({
  CompletionQueueDrain: () => null,
}));

import RootPage from "@/app/page";
import TodayPage from "@/app/today/page";
import { curriculumSequence, nextUnled } from "@/lib/curriculum";
import {
  classMinutesOutside,
  completedSessionIds,
  getActiveClass,
  getTeacher,
  teacherHasPasskey,
} from "@/lib/teacher";

const pageSource = readFileSync(new URL("../../app/today/page.tsx", import.meta.url), "utf8");
const daySource = readFileSync(new URL("../../app/TodayDay.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/today.module.css", import.meta.url), "utf8");

const lesson = {
  id: "leaf-collage",
  title: "Leaf collage",
  prompt: "How many ways can one tree make a leaf?",
  topic: "Notice fallen leaves and make with them.",
  objective: "Notice the shape, edge and colour of fallen leaves.",
  namedSkill: "noticing",
  kit: [] as string[],
  labels: ["art", "storytelling"],
  childWorkSummary: "",
  preparation: "",
  spaceNeeded: "",
  durationMin: 35,
  settle: false,
  phases: [
    {
      key: "notice",
      title: "Notice",
      blocks: [{ type: "say-aloud", text: "Choose one fallen leaf." }],
    },
  ],
  childSheet: [],
};

function packWith(over: Partial<typeof lesson> = {}) {
  return {
    id: "autumn",
    title: "Autumn term",
    subject: "Nature",
    ageBand: "4 to 6",
    sessions: [{ ...lesson, ...over }],
  };
}

/**
 * Today's session now comes from the curriculum sequence (#55), not a bare
 * `leadPack()`. This fixture stands in for a one-stop, nothing-led sequence
 * so this file's assertions — all about what the lesson section RENDERS,
 * never about the sequencing itself (that is lib/curriculum.spec.ts's job) —
 * keep meaning what they said before the rebuild.
 */
function mockCurriculum(over: Partial<typeof lesson> = {}) {
  const pack = packWith(over);
  const entry = { pack, session: pack.sessions[0], position: 0 };
  vi.mocked(curriculumSequence).mockReturnValue([entry] as never);
  vi.mocked(nextUnled).mockReturnValue({ entry, allLed: false, total: 1 } as never);
  return entry;
}

async function renderToday(locale: "uk" | "us" = "uk") {
  const page = await TodayPage({ searchParams: Promise.resolve({ locale }) });
  return renderToStaticMarkup(page);
}

async function renderRoot() {
  return renderToStaticMarkup(await RootPage({}));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCurriculum();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(getActiveClass).mockResolvedValue({
    id: "class-1",
    name: "Willow class",
    yearGroup: "Year 1",
    school: "St Mary’s Primary",
    groundsName: "St Mary’s main grounds",
    lat: 51.56,
    lng: -0.13,
    climate: null,
    learnerContext: { abilityBand: "y1", siteProfile: null },
  } as never);
  vi.mocked(teacherHasPasskey).mockResolvedValue(true);
  vi.mocked(classMinutesOutside).mockResolvedValue(null as never);
  vi.mocked(completedSessionIds).mockResolvedValue(new Set());
});

describe("the permanent public root", () => {
  it("shows the public landing at / without loading the teacher workspace when signed out", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null);

    const markup = await renderRoot();

    expect(markup).toContain("Teach with");
    expect(markup).toContain("Sign in");
    expect(markup).not.toContain(lesson.title);
    // Header and final action enter through auth; the opening action keeps
    // its promise and opens the public demo run (#877). The compact public
    // story carries one more door under the three mornings (2026-09-07),
    // where the adaptation section proves the product and should let her try it.
    expect(markup.match(/href="\/sign-in\?locale=uk"/g)).toHaveLength(2);
    expect(markup.match(/href="\/start\?locale=uk"/g)).toHaveLength(3);
    expect(markup).toContain('href="/uk"');
    expect(markup).not.toContain('href="/today"');
    expect(getActiveClass).not.toHaveBeenCalled();
    expect(curriculumSequence).not.toHaveBeenCalled();
  });

  it("keeps the public landing at / for a signed-in teacher and opens their workspace at /today", async () => {
    const markup = await renderRoot();

    expect(markup).toContain("Teach with");
    expect(markup).not.toContain(lesson.title);
    expect(markup).not.toContain('href="/sign-in?locale=uk"');
    expect(markup.match(/href="\/today\?locale=uk"/g)).toHaveLength(4);
    expect(getActiveClass).not.toHaveBeenCalled();
    expect(curriculumSequence).not.toHaveBeenCalled();
  });
});

describe("the /today auth boundary", () => {
  it("redirects a signed-out visitor to sign in before reading teacher data", async () => {
    vi.mocked(getTeacher).mockResolvedValue(null);

    await expect(renderToday()).rejects.toThrow("redirect:/sign-in");

    expect(getActiveClass).not.toHaveBeenCalled();
    expect(curriculumSequence).not.toHaveBeenCalled();
  });

  it("keeps the existing Today workspace at /today for a signed-in teacher", async () => {
    const markup = await renderToday();

    expect(markup).toContain(lesson.title);
    expect(markup).not.toContain("Teach with");
  });
});

describe("Today's primary lesson decision", () => {
  it("names the active class and place in the header before the greeting", async () => {
    const markup = await renderToday();

    expect(markup.replace(/<[^>]+>/g, "")).toContain(
      "St Mary’s main groundsWillow class"
    );
    // The greeting reads a clock now (lib/greeting.ts); which word it is
    // depends on when the test runs, and the words are pinned in
    // greeting.spec.ts.
    expect(markup).toMatch(/Good (morning|afternoon|evening)\./);
    expect(markup).toContain("Willow class");
    expect(markup).toContain("St Mary’s main grounds");
    expect(markup).not.toContain("Use current location");
    expect(markup).toContain('href="/world?classId=class-1&amp;change=1"');
    expect(markup).toContain("Change place");
  });

  it("keeps location actions available when the Grounds has not been located yet", async () => {
    vi.mocked(getActiveClass).mockResolvedValue({
      id: "class-1",
      name: "Willow class",
      yearGroup: "Year 1",
      school: "St Mary’s Primary",
      groundsName: "Willow class grounds",
      lat: null,
      lng: null,
      climate: null,
      learnerContext: { abilityBand: "y1", siteProfile: null },
    } as never);

    const markup = await renderToday();

    expect(markup).toContain("location not set");
    expect(markup).not.toContain("Use current location");
    expect(markup).toContain("Change place");
    expect(markup).not.toContain("Set the location →");
  });

  /**
   * THE NAME LEADS, AND THE QUESTION SITS UNDER IT (#341).
   *
   * Johan: "here let's lead with Our earth's magnificent trees as the higher
   * in hierarchy font". This inverted deliberately: the question is the spine
   * of the RUNNER, where a class argues about it, but on the morning screen a
   * teacher is identifying which lesson this is, and a name does that faster.
   * Both are still on the page; only the hierarchy moved.
   */
  it("leads with the activity and offers separate view and run destinations", async () => {
    const markup = await renderToday();

    // The name is the h1, not the question.
    expect(markup).toMatch(new RegExp(`<h1[^>]*>${lesson.title}</h1>`));
    expect(markup).not.toContain(lesson.prompt);
    expect(markup).not.toMatch(new RegExp(`<h1[^>]*>${lesson.prompt}</h1>`));

    expect(markup).toContain(">View session</span>");
    expect(markup).toContain(">Run session</span>");
    expect(markup).toContain(`href="/session?session=${lesson.id}&amp;locale=uk"`);
    expect(markup).toContain(`href="/run?session=${lesson.id}&amp;locale=uk"`);
    expect(markup).toContain('aria-label="Subjects"');
    expect(markup).toContain(">Art</li>");
    expect(markup).toContain(">Storytelling</li>");
    expect(markup).not.toContain(">Go offline</button>");
    expect(markup).not.toContain("repeating");
    expect(markup).not.toContain("Print");
    expect(markup).not.toContain("/print?");
  });

  it("still names the lesson when a pack has no driving question", async () => {
    mockCurriculum({ prompt: "   " });
    const markup = await renderToday();

    // The name is the heading and does not depend on the question existing.
    expect(markup).toMatch(new RegExp(`<h1[^>]*>${lesson.title}</h1>`));
    expect(markup).not.toContain("<h1>   </h1>");
  });

  /**
   * `topic` REPLACES THE OBJECTIVE ON THIS SCREEN, and it is a swap rather
   * than a deletion (#341).
   *
   * The objective was the question restated in curriculum language, printed
   * directly under the question. `topic` says what the class actually does.
   * The objective is NOT gone from the product: a teacher needs the curriculum
   * hook when she is planning, and the test below this one holds it there.
   */
  it("keeps preparation off Today so session actions follow the summary", async () => {
    mockCurriculum({
      kit: ["A5 card, one per child", "glue sticks", "collecting baskets"],
    });
    const markup = await renderToday();

    expect(markup).toContain(lesson.topic);
    expect(markup).toContain("Year 1");
    expect(markup).not.toMatch(/\bages?\b/i);
    expect(markup).not.toContain(lesson.namedSkill);
    expect(markup).not.toContain("A5 card, one per child");
    expect(markup).not.toContain("glue sticks");
    expect(markup).not.toContain("collecting baskets");
    expect(markup).not.toContain("Nothing to carry.");
    expect(markup).not.toContain(">What to prepare</summary>");
    expect(markup).not.toMatch(/<details[^>]*\bopen/);

    // The objective and the route line are off THIS screen. Both were about
    // planning rather than about the next twenty minutes.
    expect(markup).not.toContain(lesson.objective);
  });

  it("prefers the child work summary without preparation and space", async () => {
    mockCurriculum({
      childWorkSummary: "Collect leaves, make a mask and tell its story.",
      preparation: "Print one mask template per child.",
      spaceNeeded: "Fallen leaves and a making table.",
    });
    const markup = await renderToday();
    expect(markup).toContain("Collect leaves, make a mask and tell its story.");
    expect(markup).not.toContain(lesson.topic);
    expect(markup).not.toContain("Print one mask template per child.");
    expect(markup).not.toContain("Fallen leaves and a making table.");
    expect(markup).not.toMatch(/<details[^>]*\bopen/);
  });

  it("renders the US date, grade and lesson wording through one locale", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 3, 12));
    mockCurriculum({
      title: "Minibeast colours",
      topic: "Notice the colour of each minibeast.",
    });

    try {
      const markup = await renderToday("us");
      expect(markup).toContain("Thursday, September 3");
      expect(markup).toContain("Bug colors");
      expect(markup).toContain("Notice the color of each bug.");
      expect(markup).toContain("Kindergarten");
      expect(markup).not.toContain("Fall term");
      expect(markup).not.toMatch(/\bminibeasts?\b|\bautumn\b|\bages?\s*\d/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps every supporting line on the readable body-text step", () => {
    for (const selector of [".eyebrow", ".meta", ".topic"]) {
      const start = css.indexOf(`${selector} {`);
      const rule = css.slice(start, css.indexOf("}", start) + 1);
      expect(rule).toMatch(/font-size:\s*var\(--size-2\)/);
    }
  });

  it("keeps the objective where planning happens, rather than deleting it", () => {
    // The relocation, asserted at its destinations. If the objective ever
    // stops rendering on the planning surfaces, cutting it from Today stops
    // being a swap and becomes a loss, and this fails rather than the screen
    // quietly losing the curriculum hook.
    const plan = readFileSync(
      new URL("../../app/session/PlanView.tsx", import.meta.url),
      "utf8"
    );
    const print = readFileSync(
      new URL("../../app/print/page.tsx", import.meta.url),
      "utf8"
    );
    expect(plan).toContain("journey.objective");
    expect(print).toContain("session.objective");
  });

  it("does not carry the line back to last week", async () => {
    // The bridge is a planning sentence about a lesson already led. It reads
    // on the plan, not on the screen she opens at 8:40.
    mockCurriculum({
      connectionToLast: "Last week you counted life in one square metre.",
    } as never);
    const markup = await renderToday();

    expect(markup).not.toContain("Last week you counted life");
  });
});

describe("Today's network boundary", () => {
  it("paints the lesson without waiting on Pointmoon or Wikimedia", () => {
    const page = pageSource.slice(
      pageSource.indexOf("export default async function TodayPage")
    );

    // The composition itself never awaits the read: all reads are children of
    // their own boundary, and the read module is the only thing that fetches.
    expect(page).not.toContain("await getTodayRead");
    // The fallbacks are holds now (#355), never a read. See the next test.
    expect(page).toMatch(/<Suspense fallback=\{<DayHold \/>\}>/);
    expect(page).toMatch(/<Suspense fallback=\{<DoorHold \/>\}>/);
    expect(daySource).toContain("await getTodayRead(query)");
  });

  it("holds the space while it waits, and claims no value", () => {
    /**
     * THIS ASSERTION IS REVERSED FROM WHAT IT SAID, ON EVIDENCE (#355).
     *
     * It used to require a null fallback, on the argument that every hold
     * available here was a placeholder. Johan, on the running app: *"the
     * experience refreshes and is empty on every reload.. and looks broken"*,
     * then *"just like shimmering cards if you are in doubt"*.
     *
     * The file's own doc comment had pre-registered the correction: "if that
     * turns out to be wrong in front of a real teacher, the fix is to reserve
     * the height."
     *
     * What survives unchanged is the rule the old assertion was protecting: a
     * hold says what is HAPPENING, never what is TRUE. So the shapes may not
     * carry a number, a place, a species or a condition, and the status text
     * may not name one.
     */
    const code = pageSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // It holds, and it announces itself as a hold rather than as content.
    expect(code).toMatch(/aria-busy/);
    expect(code).toMatch(/role="status"/);

    // And it claims nothing. No place, no reading, no name.
    expect(code).not.toMatch(/near (our|your) school|sample patch/i);
    expect(code).not.toMatch(/°|degrees|underfoot|breeze|overcast/i);

    // It cannot outlive the data: these ARE the Suspense fallbacks, so a
    // boundary that resolves to nothing collapses rather than shimmering on.
    expect(code).toMatch(/fallback=\{<DayHold \/>\}/);
    expect(code).toMatch(/fallback=\{<DoorHold \/>\}/);
  });

  it("composes the read once for every boundary", () => {
    // One query object, built once and passed to each. `getTodayRead` is
    // wrapped in React's cache, which keys on argument identity.
    expect(pageSource).toContain("const todayQuery: TodayReadQuery");
    expect(pageSource.match(/query=\{todayQuery\}/g)).toHaveLength(2);
    expect(pageSource).not.toMatch(/getTodayRead\(\{/);
  });

  it("keeps species guidance out of the Today lesson card", () => {
    expect(pageSource).not.toContain("TodayRow");
    expect(pageSource).not.toContain("What to look for in today");
  });

  it("places the local-nature button after the weather and before the lesson card", () => {
    const day = pageSource.indexOf("<TodayDay");
    const door = pageSource.indexOf("<TodayDoor");
    const lesson = pageSource.indexOf('<section className={styles.lesson}>');

    expect(day).toBeGreaterThan(-1);
    expect(day).toBeLessThan(door);
    expect(door).toBeLessThan(lesson);
  });
});

describe("Today's type and grounds", () => {
  it("keeps the lesson name in the display face and supporting copy in the text face", () => {
    expect(css).toMatch(/\.title\s*\{[^}]*font-family:\s*var\(--display\)/s);
    expect(css).toMatch(/\.today\s*\{[^}]*font-family:\s*var\(--text\)/s);
  });

  it("carries its own tokens, except the one that is the product's", () => {
    // `--paper` is deliberately NOT defined here (#355). A local copy of the
    // ground is exactly what let the body and the content column drift into
    // two creams, with a band of the wrong one down each side of the page.
    // It is the product's ground, so it comes from globals; everything else
    // in this module stays local so a value tuned here cannot reach another
    // screen.
    expect(css).not.toMatch(/--paper:/);
    expect(css).toMatch(/--ink-soft:\s*#63684f/);
    // Brown is dead.
    expect(css).not.toMatch(/#6b5b3e|#7a6a4f|brown/i);
  });

  /**
   * ONE GROUND, AND THE STRUCTURE IS CARRIED BY AN EDGE (#341).
   *
   * Johan: "there are so many colored cards here... background should have the
   * same colors. U can use outlines or something similar to pic 4". The page
   * carried four stacked grounds; it carries one now, and SAND IS RETIRED FROM
   * THIS SCREEN. The lesson keeps the primary structural outline; the compact
   * local-nature doorway uses only a small control outline.
   */
  it("has one ground and spends its primary outline on the lesson", () => {
    // Sand is gone from this screen ENTIRELY now. It survived one more round
    // as `--cloud`, the fill inside the sky mark — but that fill had never
    // rendered in the concept sheet and was never a decision anyone made, so
    // the marks are line and the token has no reader. A token documenting a
    // choice nobody made is worse than no token.
    expect(css).not.toMatch(/--sand/);
    expect(css).not.toMatch(/--cloud/);
    expect(css).not.toMatch(/#f7e8c2/i);

    const lesson = css.slice(css.indexOf(".lesson {"), css.indexOf(".eyebrow {"));
    expect(lesson).toMatch(/border:\s*1\.5px solid var\(--outline\)/);
    expect(lesson).not.toMatch(/background/);

    // The outline is the contrast decision that was measured, not a guess.
    expect(css).toMatch(/--outline:\s*rgba\(71, 76, 63, 0\.22\)/);
  });

  /**
   * EXACTLY ONE MEDIA QUERY ON THIS SURFACE, and it may not hold type.
   *
   * Four values in the build this replaces were tuned in the base rule and
   * silently re-tuned in a query below it. The landscape layout is a layout
   * change: columns, gaps and margins, nothing else. If landscape looks wrong
   * the answer is one of those values or the markup order, never a font.
   */
  it("keeps the page in one column while adapting the session action row", () => {
    // The page remains one column; only the two action buttons adapt on phones.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const queries = code.match(/@media[^{]*\{/g) ?? [];
    const layout = queries.filter((q) => !q.includes("prefers-reduced-motion"));
    expect(layout).toEqual(["@media (max-width: 480px) {"]);
    const mobile = code.slice(code.indexOf("@media (max-width: 480px)"), code.indexOf("/* THE DOOR"));
    expect(mobile).not.toMatch(/\.main\s*\{/);

    // And no column machinery survives the deletion.
    expect(code).not.toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax/);
    expect(code).not.toMatch(/grid-column/);
  });

  it("never renders a card", () => {
    /**
     * A SHADOW ON A CIRCLE IS NOT A CARD. The species crops and the door's
     * overlapping faces carry a 2px paper ring and a hairline lift, which is
     * what makes a stack of circles read as a stack and lifts a crop off the
     * ground it shares. Both numbers are the old prototype's own.
     *
     * What the ruling forbids is a bounded, shadowed, tinted BLOCK. So the
     * assertion narrowed rather than lifted: every box-shadow on this surface
     * has to be on a fully round element.
     */
    const shadowed = (css.match(/\.[a-zA-Z]+[^{]*\{[^}]*box-shadow[^}]*\}/g) ?? []);
    for (const rule of shadowed) {
      expect(rule).toMatch(/border-radius:\s*50%/);
    }
    expect(pageSource).not.toMatch(/className=\{styles\.card\}/);
  });
});
