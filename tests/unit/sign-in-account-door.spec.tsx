import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teacher", () => ({ getTeacher: vi.fn() }));
vi.mock("@/lib/social-sign-in", () => ({ configuredSocialProviders: () => [] }));

import SignInPage from "@/app/sign-in/page";
import { getTeacher } from "@/lib/teacher";

/**
 * #692 — the account door has to look like the site it belongs to.
 *
 * The page used to be a bare 30rem column: no wordmark, no route back to the
 * public site, and none of the documentary photography every other public page
 * carries. A pilot teacher's first touch is this door, and the pieces that
 * make it belong are exactly the pieces a later refactor of "just the form"
 * would quietly drop, so they are pinned here.
 *
 * The other half of the ticket is that NOTHING about signing in changed. That
 * is asserted here as the form's own controls still being on the page;
 * `sign-in-school-doors.spec.tsx` continues to cover the form's states, and it
 * passes unchanged because `SignInForm` was not touched.
 */
async function render() {
  return renderToStaticMarkup(await SignInPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue(null);
});

describe("the sign-in account door", () => {
  it("carries the Nature Class wordmark as the route back to the public site", async () => {
    const markup = await render();

    expect(markup).toContain('href="/welcome"');
    expect(markup).toContain('aria-label="Nature Class home"');
    // The seed lockup, not the bare wordmark: `data-logo` is what Wordmark
    // sets when `seed` is on, and the public masthead is the seeded one.
    expect(markup).toContain('data-logo="nature-class"');
    expect(markup).toContain("Nature</span>");
  });

  it("shows one approved documentary photograph with truthful alternative text", async () => {
    const markup = await render();

    expect(markup).toContain("seed-feeder-branch.jpg");
    expect(markup).toContain(
      "A homemade seed feeder hanging by green twine from a bare branch in a school garden"
    );
    // One frame, not a gallery: the door is a counterweight to the form, and
    // a second image would make the page about the pictures. Counted as `<img`
    // tags rather than as `/landing/` paths, because `next/image` rewrites
    // every src through `/_next/image?url=%2Flanding%2F…` and the readable
    // path never appears in the markup at all.
    expect(markup.match(/<img\b/g)).toHaveLength(1);
    // Never alt="" — this image is described in the ticket as a counterweight
    // a reader is entitled to, not as decoration.
    expect(markup).not.toContain('alt=""');
  });

  it("puts the sign-in task before the photograph in the document, not only in CSS", async () => {
    const markup = await render();

    // Reading order and keyboard order are the DOM's, whatever the desktop
    // grid does with columns. If the figure ever moves above the form, a
    // phone visitor meets a photograph where she expected a field.
    expect(markup.indexOf("signin-form")).toBeGreaterThan(-1);
    expect(markup.indexOf("signin-figure")).toBeGreaterThan(
      markup.indexOf("signin-form")
    );
  });

  it("leaves the sign-in task itself exactly as it was", async () => {
    const markup = await render();

    expect(markup).toContain("Sign in to save your activities");
    expect(markup).toContain("Email me a link");
    expect(markup).toContain("Use a saved passkey instead");
    expect(markup).toContain('type="email"');
    // The first-time line is the one piece of prose that makes the single
    // field make sense to someone who has never been here.
    expect(markup).toContain("First time here?");
  });

  it("still sends an already-signed-in teacher to Today rather than showing a form", async () => {
    vi.mocked(getTeacher).mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
      name: "A Teacher",
    });

    // `redirect()` signals by throwing; the assertion is that rendering does
    // not return a page at all for a signed-in teacher.
    await expect(render()).rejects.toThrow();
  });
});
