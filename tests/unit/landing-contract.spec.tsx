import { existsSync, readFileSync } from "node:fs";
import { globSync } from "glob";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Landing } from "@/app/welcome/Landing";
import { loadPack } from "@/lib/pack";
import { landingLesson } from "@/app/welcome/landing-lesson";
import { cardConditionFromBucket } from "@/lib/cast/conditions";
import { PUBLIC_PRECACHE_PATTERNS } from "@/next.config.mjs";

const landingSource = readFileSync(
  new URL("../../app/welcome/Landing.tsx", import.meta.url),
  "utf8"
);
const landingBodySource = readFileSync(
  new URL("../../app/welcome/LandingBody.tsx", import.meta.url),
  "utf8"
);
const childrenLearningSource = readFileSync(
  new URL("../../app/welcome/ChildrenLearning.tsx", import.meta.url),
  "utf8"
);
const landingCss = readFileSync(
  new URL("../../app/welcome/Landing.module.css", import.meta.url),
  "utf8"
);
const wordmarkSource = readFileSync(
  new URL("../../app/Wordmark.tsx", import.meta.url),
  "utf8"
);
const landingReadme = readFileSync(
  new URL("../../public/landing/README.md", import.meta.url),
  "utf8"
);
const nextConfigSource = readFileSync(
  new URL("../../next.config.mjs", import.meta.url),
  "utf8"
);
const landingPhotoFiles = [
  "cherries-in-hand.jpg",
  "birds-nest-circle.jpg",
  "botanical-print-table.jpg",
  "tyre-swing-den.jpg",
  "potatoes-in-hand.jpg",
  "bug-hotel-boots.jpg",
  "seed-feeder-branch.jpg",
  "flower-painting-table.jpg",
  "garden-wind-chime.jpg",
  "boot-birdhouse.jpg",
  "first-shoots.jpg",
  "child-nature-page.jpg",
] as const;
const speciesPhotoFiles = [
  "species-robin.jpg",
  "species-earthworm.jpg",
  "species-oak.jpg",
  "species-garden-snail.jpg",
] as const;
const landingIllustrationFiles = [
  "nature-intelligence-london-autumn.png",
  "nature-intelligence-los-angeles-spring.png",
  "nature-intelligence-vermont-winter.png",
] as const;

function jpegMetadataMarkers(file: string): number[] {
  const jpeg = readFileSync(new URL(`../../public/landing/${file}`, import.meta.url));
  const markers: number[] = [];
  let offset = 2;

  expect(jpeg.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(true);
  while (offset + 1 < jpeg.length) {
    if (jpeg[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (jpeg[offset] === 0xff) offset += 1;
    const marker = jpeg[offset];
    if (marker === undefined) break;
    offset += 1;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= jpeg.length) break;

    const segmentLength = jpeg.readUInt16BE(offset);
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      markers.push(marker);
    }
    if (segmentLength < 2) break;
    offset += segmentLength;
  }

  return markers;
}

function text(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("public landing contract (#914)", () => {
  it("uses the supplied static seed lockup as an accessible public masthead", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const header = markup.slice(markup.indexOf("<header"), markup.indexOf("</header>") + 9);

    expect(header).toContain('aria-label="Nature Class home"');
    expect(header).toContain('data-logo="nature-class"');
    expect(header).toContain('class="wordmark-seed"');
    expect(header).toContain('href="/sign-in?locale=uk"');
    expect(markup.match(/class="wordmark-seed"/g)).toHaveLength(2);
    expect(wordmarkSource).not.toContain("animation");
    expect(wordmarkSource).not.toContain("setInterval");
  });

  it("states what Nature Class is in the first sentence, for the audience it is for", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const body = text(markup);

    expect(markup).toMatch(/<h1[^>]*><span>Teach with<\/span> <span>Nature\.<\/span><\/h1>/);
    expect(body).toContain("For anyone leading outdoor learning");
    expect(body).toContain("Nature Class empowers any adult to facilitate outdoor learning.");
    expect(body).toContain(
      "Ready-to-lead lessons, words to guide you and activities to explore together."
    );
    // The opening action asks where her school is, never the sign-in wall (#877).
    expect(markup).toMatch(/href="\/start\?locale=uk"[^>]*>Try today’s lesson/);
    expect(markup).toContain('href="/season?locale=uk"');
    expect(body).toContain("Free for teachers. Open source. No child accounts or profiles.");

    // Kit no longer leads the promise (#881), and "grounds" is out of the hero
    // for a US reader (#872).
    expect(body).not.toContain("See what to carry");
    const hero = markup.slice(0, markup.indexOf('id="explore-lesson"'));
    expect(text(hero)).not.toMatch(/\bgrounds\b/);
  });

  it("uses the authored counting-life content with the agreed public title", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const session = loadPack("summer").sessions.find(({ id }) => id === "summer-w1-counting-life");
    if (!session) throw new Error("Life detectives is missing from the summer pack");

    expect(landingLesson.id).toBe(session.id);
    expect(landingLesson.title).toBe("Life detectives");
    expect(markup).toContain("Life detectives");
    expect(markup).toContain(`href="/run?session=${session.id}&amp;at=settle&amp;locale=uk"`);
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("Which animal");
    expect(markup).toContain("/landing/animal-mask-template.svg");
    expect(landingBodySource).toContain("<LessonMenuPreview locale={locale} automatic={automatic} />");

    // The old summer example and its invented lines are gone.
    expect(markup).not.toContain("Counting life");
    expect(landingLesson.excerpt).toBe("Count everything that's alive within ten steps.");
    expect(landingLesson.question).toBe(session.prompt);
    expect(landingLesson.topic).toBe(session.topic);
    expect(landingSource).toContain("todayStyles.title");
  });

  it("tells how it works in three steps with the day's species, then no more", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const body = text(markup);
    const how = markup.slice(
      markup.indexOf('aria-labelledby="how-title"'),
      markup.indexOf('aria-labelledby="intelligence-title"')
    );

    expect(body).toContain("Ready to lead, in three steps.");
    expect(how.match(/<li class="[^"]*step[^"]*"/g)).toHaveLength(3);
    expect(body).toContain("Preview a lesson adapted for today.");
    expect(body).toContain("Introduce the lesson.");
    expect(body).toContain("Run it outside. Done.");
    expect(body).not.toContain("Circle time. Done.");
    expect(body).not.toContain("Say where your school is.");
    expect(how).not.toContain("Start lesson");
    expect(how).toContain("block-teacher-note");
    expect(how.match(/<img/g)).toHaveLength(4);
    for (const file of speciesPhotoFiles) {
      expect(existsSync(new URL(`../../public/landing/${file}`, import.meta.url))).toBe(true);
    }
    expect(landingReadme).toContain("CC BY-SA 3.0");
    expect(markup).toContain('href="/landing/README.md"');
    expect(markup.slice(markup.indexOf("<footer"))).not.toContain("/landing/README.md");
  });

  it("lists what a teacher gets as eight scannable features, each with its benefit", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const offer = markup.slice(
      markup.indexOf('aria-labelledby="offer-title"'),
      markup.indexOf('aria-labelledby="belief-title"')
    );
    const body = text(offer);

    expect(body).toContain("Every lesson is prepared. You lead it.");
    // Nothing to open, nothing to guess: the list is the section.
    expect(offer).not.toContain("<details");
    expect(offer).not.toContain('type="radio"');
    expect(offer.match(/<li\b/g)).toHaveLength(8);
    for (const title of [
      "A fully prepared lesson",
      "A teleprompter on your tablet or phone",
      "Play aloud",
      "An interactive children’s board",
      "Teacher’s assistant",
      "A print pack",
      "Lessons mapped to your curriculum objectives",
      "Circle time and minutes outside",
    ]) {
      expect(body).toContain(title);
    }
    // Claims the product does not keep are not on the page.
    expect(body).not.toMatch(/up to four/i);
    expect(body).not.toContain("Works offline");
    expect(body).not.toContain("one lesson a week");
    expect(landingBodySource).not.toContain("<Phone");
    for (const source of [landingSource, landingBodySource]) {
      expect(source).not.toContain("use client");
      expect(source).not.toContain("useState");
      expect(source).not.toContain("useEffect");
      expect(source).not.toContain("dangerouslySetInnerHTML");
    }
    // The three steps and the list must not say the same thing twice.
    expect(body).not.toContain("Before class");
  });

  /* WHO SHAPED IT IS A BAND, NOT FINE PRINT (Johan, this pass: "the shaped
     with teachers line could be a nicer section on its own or a band"). The
     sentence itself is unchanged and the three groups only unpack it — the
     page still claims nothing it cannot show. What this holds is the SHAPE:
     a heading on its own section, not a chip in the foot of another one. */
  it("gives who shaped it a band of its own, not a chip beside a button", () => {
    const markup = renderToStaticMarkup(<Landing />);
    // The makers close the page, after the last call (Johan, 2026-09-07).
    const section = markup.slice(markup.indexOf('aria-labelledby="shaped-title"'));
    expect(markup.indexOf('aria-labelledby="shaped-title"')).toBeGreaterThan(
      markup.indexOf('aria-labelledby="close-title"')
    );
    const body = text(section);

    expect(markup.indexOf('aria-labelledby="shaped-title"')).toBeGreaterThan(
      markup.indexOf('aria-labelledby="open-title"')
    );
    expect(section).toMatch(/<h2 id="shaped-title"/);
    expect(body).toContain("Shaped with teachers, outdoor educators and subject experts.");
    for (const group of ["Rewyld", "Plantenvironment", "Assembly Code"]) {
      expect(body).toContain(group);
    }
    // The pill it replaced is gone, not merely hidden.
    expect(landingCss).not.toContain(".credibilityNote");
    expect(landingBodySource).not.toContain("credibilityNote");
  });

  it("says which device it was drawn for, once, and does not linger", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const body = text(markup);

    expect(body).toContain("Works on any device, and especially well on an iPad.");
    // Once. A device note that repeats becomes a requirement.
    expect(body.match(/iPad/g)).toHaveLength(1);
  });

  it("makes rain or shine concrete: the formula, then the product's own note for three mornings", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const section = markup.slice(
      markup.indexOf('aria-labelledby="intelligence-title"'),
      markup.indexOf('aria-labelledby="open-title"')
    );
    const body = text(section);

    expect(body).toContain("Every lesson, adapted for today.");
    expect(body).toContain(
      "Your place + The season + Today’s weather + What is living here = Today’s lesson"
    );
    expect(body).toContain("Three mornings, three notes for the teacher:");
    expect(section).toMatch(/<ul[^>]+aria-label="Seasonal Nature Intelligence examples"/);
    expect(section.match(/<li\b/g)).toHaveLength(3);
    // The note on each card is the daily card's own line for that weather,
    // read from lib/cast/conditions, so the page cannot promise a lesson
    // change the product does not make.
    for (const [place, season, condition, bucket] of [
      ["London", "Autumn", "Rain", "wet"],
      ["Los Angeles", "Spring", "Full sun", "hot"],
      ["Vermont", "Winter", "Snow", "cold"],
    ] as const) {
      const note = cardConditionFromBucket(bucket)?.adjustment;
      expect(note).toBeTruthy();
      expect(body).toContain(`${place} ${season} ${condition} ${note}`);
      expect(body).not.toContain("Your note that morning");
    }
    for (const invented of [
      "shorter collecting loop",
      "shade and pauses built into the lesson",
      "time to warm up",
      "How a lesson can adapt",
    ]) {
      expect(body).not.toContain(invented);
    }
    for (const file of landingIllustrationFiles) {
      expect(existsSync(new URL(`../../public/landing/${file}`, import.meta.url))).toBe(true);
      expect(landingBodySource).toContain(`/landing/${file}`);
      expect(landingReadme).toContain(`\`${file}\``);
    }
    expect(body).not.toContain("Rain or shine.");
    expect(body).not.toContain("The real world is the teaching material.");
  });

  it("keeps the outcomes on the landing and sends the children's work to its own page", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const body = text(markup);

    expect(body).toContain("What half an hour outside does for a class.");
    expect(body).not.toContain("Why it matters");
    // Who it is for sits low, after the teacher's closing call and before the
    // partner plate (Johan, 2026-09-15, reversing the 09-14 placement).
    expect(markup.indexOf('aria-labelledby="audiences-title"')).toBeGreaterThan(
      markup.indexOf('aria-labelledby="close-title"')
    );
    expect(markup.indexOf('aria-labelledby="audiences-title"')).toBeLessThan(
      markup.indexOf('aria-labelledby="partner-title"')
    );
    // The children's work moved to /children (Johan, 2026-09-14).
    expect(markup).not.toContain('aria-labelledby="activity-stories-title"');
    expect(body).not.toContain("What children learn by doing.");
    expect(markup).toContain('href="/children?locale=uk"');
    expect(body).not.toContain("Bring out their best nature.");
    for (const outcome of [
      "Calmer classrooms",
      "Children who struggle indoors thrive outside",
      "Connection that compounds",
    ]) {
      expect(body).toContain(outcome);
    }
    expect(body).not.toContain("staged for the camera");
    expect(landingCss).toMatch(/\.childWork\s*\{[^}]*background: var\(--mustard\)/s);
    for (const file of landingPhotoFiles) {
      expect(existsSync(new URL(`../../public/landing/${file}`, import.meta.url))).toBe(true);
      expect(landingSource + landingBodySource + childrenLearningSource).toContain(`/landing/${file}`);
    }
    expect(markup).not.toContain('<img alt=""');
  });

  it("links to dedicated audience pages and keeps the shared trust facts", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const body = text(markup);
    // Schools and parents share one section: two cards of equal weight.
    const schools = markup.slice(
      markup.indexOf('aria-labelledby="audiences-title"'),
      markup.indexOf('aria-labelledby="partner-title"')
    );
    // The trust facts sit between the green rain-or-shine plate and the blue
    // what-you-get plate, a paper pause between the two grounds (Johan).
    expect(markup.indexOf('aria-labelledby="open-title"')).toBeGreaterThan(
      markup.indexOf('aria-labelledby="intelligence-title"')
    );
    expect(markup.indexOf('aria-labelledby="open-title"')).toBeLessThan(
      markup.indexOf('aria-labelledby="offer-title"')
    );
    const schoolsText = text(schools);

    expect(schoolsText).toContain("Make nature part of everyday school life.");
    expect(schools).toContain('href="/schools?locale=uk"');
    expect(schools).toContain('href="/parents?locale=uk"');
    expect(schoolsText).not.toContain("A head asks");
    // Each card is headed by who it is for, not an eyebrow (Johan, 2026-09-14).
    expect(schools).toMatch(/<h3[^>]*>For schools<\/h3>/);
    expect(schools).toMatch(/<h3[^>]*>For parents<\/h3>/);
    expect(schoolsText).toContain("See nature through their eyes.");
    // next/image encodes the path into its optimiser URL.
    expect(schools).toContain("%2Flanding%2Ffamily-garden-london.webp");
    expect(schools).toContain("%2Flanding%2Fbirds-nest-circle.jpg");
    // Outdoor educators get a quieter section of their own, after the teacher's last call.
    const partner = markup.slice(
      markup.indexOf('aria-labelledby="partner-title"'),
      markup.indexOf('aria-labelledby="shaped-title"')
    );
    expect(markup.indexOf('aria-labelledby="partner-title"')).toBeGreaterThan(
      markup.indexOf('aria-labelledby="close-title"')
    );
    expect(text(partner)).toContain("Partner with Nature Class");
    expect(text(partner)).toContain("Already teach outside? Bring your programme in.");
    for (const kind of ["Forest school", "Scouts and guides", "Bushcraft"]) {
      expect(text(partner)).toContain(kind);
    }
    expect(partner).toContain('href="mailto:hi@natureclass.education?subject=What%20I%20teach"');
    expect(text(partner)).toContain("Tell us what you teach");
    expect(body).not.toContain("Free while we build");
    expect(body).not.toContain("The lesson, not an extra");
    expect(body).not.toContain("One honest number");
    // The pilot conversation stays in email while the grant runs (ADR-0003).
    expect(schoolsText).not.toMatch(/[£$€]\s?\d|\bper (seat|pupil|school|year)\b/i);
    expect(schoolsText).not.toMatch(/\b(pricing|price|premium|upgrade|subscription|trial)\b/i);
    expect(schoolsText).not.toMatch(/\bages?\s*\d|\bkey stage\b|\breception\b/i);

    expect(body).toContain("Free to use. Open source. Private by design.");
    expect(body).toContain("An open source project");
    expect(body).toContain("The teacher runtime is AGPL-licensed.");
    expect(body).toContain("There are no child accounts and no child profiles.");
    expect(body).not.toContain("Our goal:");
    expect(markup).not.toContain('href="https://github.com/johangace/nature-class"');
    expect(markup.match(/>Assembly Code<\/a>/g)).toHaveLength(1);
    expect(markup).toContain('href="https://www.assemblycode.org"');
    expect(markup.match(/mailto:hi@natureclass\.education/g)).toHaveLength(1);
    expect(body.match(/Free for teachers/g)?.length ?? 0).toBeLessThanOrEqual(5);
    expect(body).toContain("Ready to take your class outside?");
    expect(body).not.toMatch(/child[^.]{0,30}\bdata\b/i);
  });

  it("runs on Nature Class tokens with one deep corner per photo and no arches", () => {
    const markup = renderToStaticMarkup(<Landing />);
    const sections = markup.match(/<section\b/g) ?? [];

    // hero, how, schools and parents, rain or shine, open, offer, what it
    // changes, close, partner, how it was made
    expect(sections).toHaveLength(11);
    expect(landingCss).toContain("background: var(--paper)");
    expect(landingCss).toContain("color: var(--ink)");
    expect(landingCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(landingCss).not.toMatch(/text-transform:\s*uppercase/);
    // Blue for the teacher's kit, green for the living world (Johan, 2026-09-07).
    expect(landingCss).toMatch(/\.offer\s*\{[^}]*background: var\(--plate-weather\)/s);
    expect(landingCss).toMatch(/\.intelligence\s*\{[^}]*background: var\(--plate-spoken\)/s);
    expect(landingCss).toMatch(/\.kicker::before\s*\{[^}]*background: var\(--living\)/s);
    // Petrol appears once on the landing: the wordmark (Johan, 2026-09-07).
    expect(landingCss.split("var(--brand)").length - 1).toBe(1);
    expect(landingCss).toMatch(/\.headerLogo\s*\{[^}]*color: var\(--brand\)/s);
    expect(landingCss).toMatch(/\.cutOne\s*\{\s*border-radius: 28px 170px 28px 28px;/);
    // An arch is two equal deep corners on top. Johan: "looks churchy".
    expect(landingCss).not.toMatch(/border-radius:\s*(\d{3})px \1px 28px 28px/);
    expect(landingCss).toMatch(/\.spoken::after\s*\{[^}]*content: "”"[^}]*color: var\(--umber\)/s);
    expect(landingCss).toMatch(/\.page a:focus-visible\s*\{[^}]*outline: 3px solid var\(--action\)/s);
    expect(markup).not.toContain("—");
  });

  it("keeps public photo derivatives private-source-safe and out of the raw precache", () => {
    expect(landingReadme).not.toContain("Private source");
    expect(landingReadme).not.toMatch(/IMG_\d+\.JPG/);
    // The claim here is that the landing's raw photography stays out of the
    // install shell, not that the exclusion list has a particular length: it
    // grew for lesson media in #1077 and will grow again. Assert the folder
    // this test speaks for against the real glob, and leave the rest to
    // scripts/sw-cache-lint.mjs, which owns the boundary.
    expect(PUBLIC_PRECACHE_PATTERNS.join(" ")).toContain("!(landing|");
    expect(
      globSync(PUBLIC_PRECACHE_PATTERNS, {
        cwd: new URL("../../public/", import.meta.url).pathname,
        nodir: true,
        follow: true,
      }).filter((entry) => entry.startsWith("landing/"))
    ).toEqual([]);
    expect(nextConfigSource).toContain("globPublicPatterns: PUBLIC_PRECACHE_PATTERNS");

    for (const file of [...landingPhotoFiles, ...speciesPhotoFiles]) {
      // APP0/JFIF is the ordinary container marker; anything else would be
      // EXIF, GPS, XMP, IPTC, a colour profile or a comment.
      expect(jpegMetadataMarkers(file).filter((marker) => marker !== 0xe0)).toEqual([]);
    }
  });
});
