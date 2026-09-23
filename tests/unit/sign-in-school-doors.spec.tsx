import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignInForm } from "@/app/sign-in/SignInForm";

/**
 * What the teacher is actually offered. The form takes the providers the
 * server found credentials for, so the case worth asserting is the empty one:
 * with nothing configured, the page must be exactly the page it was before —
 * one field and the passkey offer, and no dead button promising a school
 * sign-in this deployment cannot complete.
 */
describe("the school doors on the sign-in page", () => {
  it("offers each configured school by name", () => {
    const markup = renderToStaticMarkup(
      <SignInForm social={["google", "microsoft"]} />
    );
    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("Continue with Microsoft");
    // The email path is never displaced by them.
    expect(markup).toContain("Email me a link");
  });

  it("offers only the school that is configured", () => {
    const markup = renderToStaticMarkup(<SignInForm social={["microsoft"]} />);
    expect(markup).toContain("Continue with Microsoft");
    expect(markup).not.toContain("Continue with Google");
  });

  it("shows no school door, and no separator, when none is wired", () => {
    const markup = renderToStaticMarkup(<SignInForm />);
    expect(markup).not.toContain("Continue with");
    expect(markup).not.toContain("signin-or");
    expect(markup).toContain("Email me a link");
  });
});
