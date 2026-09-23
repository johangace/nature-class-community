import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Landing } from "@/app/welcome/Landing";

/**
 * A VISITOR CAN TRY THE THING BEFORE MAKING AN ACCOUNT (#877).
 *
 * "Do you want everyone to make an account? It would be nice to see some
 * content without an account." The demo run always worked signed out; the
 * landing's "Try today's session" sent her to the sign-in wall anyway. Now
 * the button keeps its promise, and the doorstep says whose patch it is.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the landing's opening action", () => {
  it("asks the one question when signed out, and opens Today when signed in", () => {
    const out = renderToStaticMarkup(<Landing />);
    expect(out).toMatch(/href="\/start\?locale=uk"[^>]*>Try today’s lesson/);
    const inn = renderToStaticMarkup(<Landing teacher={{ id: "t", email: "t@example.test" } as never} />);
    expect(inn).toMatch(/href="\/today\?locale=uk"[^>]*>Continue with your class/);
    expect(inn).not.toContain('href="/run"');
  });

  it("keeps sign-in in the header and every lesson action on the public start flow", () => {
    const out = renderToStaticMarkup(<Landing />);
    expect(out.match(/href="\/sign-in\?locale=uk"/g)).toHaveLength(2);
    // Hero, the door under the three mornings (2026-09-07), and the last call.
    expect(out.match(/href="\/start\?locale=uk"/g)).toHaveLength(3);
  });
});

describe("the demo says whose patch it is", () => {
  it("the run page hands the doorstep one honest sentence only when nobody is signed in", () => {
    const page = read("app/run/page.tsx");
    // Signed in, there is no doorstep at all; signed out, exactly one
    // sentence, picked by what she is reading — a named example off the
    // /start list (#877 third slice), her own chosen spot, or the sample.
    expect(page).toContain("const exampleNote = teacher\n    ? null\n    : examplePlace\n      ? namedExampleNote(examplePlace.name)\n      : chosenPlace\n        ? CHOSEN_NOTE\n        : EXAMPLE_NOTE;");
    expect(page).toContain("exampleNote={exampleNote}");
    expect(page).toContain("sample school");
    expect(page).toContain("Sign in and every reading is for your own school.");
    // And a different sentence for the spot she chose herself (#877).
    expect(page).toContain("the place you chose");
  });

  it("the journey renders it on the first screen and nowhere else", () => {
    const journey = read("app/run/HybridJourney.tsx");
    expect(journey.match(/\{exampleNote && /g)).toHaveLength(1);
    expect(journey).toMatch(/if \(step\.kind === "topic"\) \{[\s\S]{0,800}\{exampleNote && <p/);
  });
});
