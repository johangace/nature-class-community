import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import VocabularyPage from "@/app/vocabulary/page";

/**
 * THE SURFACE MAY NOT SOFTEN THE MATCHER (#563).
 *
 * `lib/vocab/match.ts` is built around three rules, and all three are the kind
 * a rendering layer breaks by accident while trying to be helpful: tidy her
 * word on the way out, promote a near miss so the page looks useful, or drop
 * the coverage line because it is unflattering. The matcher's own specs
 * (`vocab-match.spec.ts`) hold the rules where they are decided; this file
 * holds them where a teacher actually reads them.
 *
 * It renders against the REAL index rather than a synthetic one on purpose.
 * The claim on the pull request is that a teacher pasting her unit's
 * vocabulary gets an answer she can check, and that claim is about this shelf,
 * these glossaries and this coverage gap — not about a fixture.
 */

async function render(words?: string): Promise<string> {
  return renderToStaticMarkup(
    await VocabularyPage({
      searchParams: Promise.resolve(words === undefined ? {} : { words }),
    })
  );
}

describe("/vocabulary", () => {
  it("gives her string back exactly as she typed it, case and hyphen intact", async () => {
    const html = await render("  SeEdS  ");
    // Her spacing and capitals survive to the page. The match is found by
    // folding inside the matcher; the fold is never written back over her word.
    expect(html).toContain("SeEdS");
    expect(html).not.toContain(">seeds<");
  });

  it("shows our authored word only where hers differs by inflection", async () => {
    const html = await render("seeds");
    // "seeds" meets our authored "seed" through number alone, so the page says
    // which of ours it met. An exact meeting needs no such note.
    expect(html).toContain("seed");
    expect(html).toContain("seeds");
  });

  it("leaves a miss as a miss, with nothing attached and no session", async () => {
    const html = await render("xylophonity");
    expect(html).toContain("no session teaches this word");
    // The honest empty answer, not a near match dressed up as a hit.
    expect(html).toContain("No session carries any of these words");
    expect(html).toContain("0 of 1 word matched");
  });

  it("prints a near miss as near, in the matcher's own words, and never as a hit", async () => {
    // "frost pattern" against our authored "Frost". This was "micro-habitat"
    // against our "Habitat" until #564 authored "micro-habitat" itself, at
    // which point the example became a hit — the fixture moves, the property
    // does not.
    const html = await render("frost pattern");
    expect(html).toContain("not a match:");
    expect(html).toContain("is part of what you wrote, not the whole of it");
    // A near miss contributes no session overlap: the sessions list stays empty
    // even though the term it is near to is authored in one.
    expect(html).toContain("No session carries any of these words");
    expect(html).toContain("0 of 1 word matched");
  });

  it("names a session that really covers a word, and which word it covers", async () => {
    const html = await render("frost");
    expect(html).toContain("1 of 1 word matched");
    expect(html).toContain("Sessions that cover your words");
    expect(html).toContain("The last warmth");
    expect(html).toContain("covers 1 of your words");
  });

  it("keeps a repeated word from inflating the count or a session's overlap", async () => {
    // The matcher counts distinct folded words; the page must not re-count.
    const html = await render("frost\nFROST\n frost ");
    expect(html).toContain("1 of 1 word matched");
  });

  it("always states the coverage it was measured against", async () => {
    const withResults = await render("frost");
    const empty = await render();
    for (const html of [withResults, empty]) {
      expect(html).toContain("sessions: the other");
      expect(html).toContain("carry no authored glossary yet");
    }
  });

  it("shows the form and no result section before she has typed anything", async () => {
    const html = await render();
    expect(html).toContain("Your key vocabulary");
    expect(html).not.toContain("Your words, one by one");
  });

  it("does not promise that her list is unkept, because a GET puts it in the URL", async () => {
    // Codex review of PR #1188: "never rewritten or kept" was a false privacy
    // guarantee. The list is serialised into ?words=, so it sits in her address
    // bar, her history and ordinary request logs. The page says so.
    const html = await render();
    expect(html).toContain("never saved to your account");
    expect(html).toContain("browser history");
    expect(html).not.toContain("never rewritten or kept");
  });

  it("calls an off-shelf session off the shelf, never 'not on the shelf yet'", async () => {
    // Codex review of PR #1188: `onShelf` is one boolean and cannot tell a
    // session waiting for its season from a pack retired for good. "Yet"
    // promises a lesson that may never come. "Ice" lives in winter-term, which
    // lib/pack.ts holds off the shelf permanently.
    const html = await render("frost");
    expect(html).toContain("(off the shelf)");
    expect(html).not.toContain("not on the shelf yet");
  });

  it("does not split a two-word term on its space", async () => {
    // "leaf litter" and "root hairs" are one term each; splitting on a space
    // would silently ask a different question from the one she asked.
    const html = await render("leaf litter");
    expect(html).toContain("leaf litter");
    expect(html).toContain("1 word matched");
  });

  it("links every matched session, including one that is off the shelf", async () => {
    // Codex review of PR #1209: living-things-spring is in packOrder and not on
    // the shelf, so this page is its advertised way in. A matched title printed
    // as plain text left a teacher with four names and no way to open them.
    const html = await render("micro-habitat");
    expect(html).toContain("Micro-habitats");
    expect(html).toContain("(off the shelf)");
    expect(html).toContain('href="/session?session=habitats-w2-micro-habitats"');
    // And an on-shelf match is linked the same way, not only the off-shelf one.
    const onShelf = await render("frost");
    expect(onShelf).toMatch(/<a href="\/session\?session=[^"]+"><strong>The last warmth<\/strong><\/a>/);
  });
});
