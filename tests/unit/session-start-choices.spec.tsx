import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StartChoices } from "@/app/session/start/StartChoices";

describe("the lesson's separate starting-place screen", () => {
  it("offers both introduction views and preserves lesson and locale on every link", () => {
    const markup = renderToStaticMarkup(<StartChoices sessionId="animal-leaf-masks" title="Animal leaf masks" locale="uk" />);
    expect(markup).toContain("Where are we starting?");
    expect(markup).toContain("Present on the classroom screen");
    expect(markup).toContain("Follow along in teacher view");
    for (const start of ["indoors", "outside"]) {
      expect(markup).toContain(`href="/run?session=animal-leaf-masks&amp;locale=uk&amp;start=${start}"`);
    }
    expect(markup).toContain('href="/session?session=animal-leaf-masks&amp;locale=uk"');
    expect(markup).not.toContain("at=settle");
  });
});
