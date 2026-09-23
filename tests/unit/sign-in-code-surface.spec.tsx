import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SignInForm } from "@/app/sign-in/SignInForm";

/**
 * The two email paths, in the order a teacher meets them (#681).
 *
 * The link is the button: one tap, and for a week it was not, because the
 * code was made the front door on a hazard that was reasoned about rather
 * than measured. The code survives as the spare key, one tap away on the
 * screen after the link is sent, where its two real cases surface — a link
 * that arrived dead, and mail read on a different device from the one in her
 * hands.
 */
describe("the sign-in email paths", () => {
  const source = () =>
    readFileSync(resolve(process.cwd(), "app/sign-in/SignInForm.tsx"), "utf8");

  it("puts the link on the button", () => {
    const markup = renderToStaticMarkup(<SignInForm />);
    expect(markup).toContain("Email me a link");
    expect(markup).not.toContain("Email me a code");
  });

  it("does not make anyone reach for the spare key to sign in", () => {
    // The first screen is one field and one button. A code field here would
    // be the friction this change exists to remove.
    const markup = renderToStaticMarkup(<SignInForm />);
    expect(markup).not.toContain('autoComplete="one-time-code"');
    expect(markup).not.toContain("Send a code instead");
  });

  it("offers the code on the screen after the link is sent", () => {
    // Three steps, and the code is reachable from the sent screen only. The
    // sent screen renders after an interaction, so this reads the source: a
    // static render cannot press a button.
    const text = source();
    expect(text).toContain('useState<"email" | "sent" | "code">("email")');
    expect(text).toContain('if (step === "sent")');
    expect(text).toContain("Send a code instead");
    expect(text).toContain("onSendCode");
  });

  /**
   * What the teacher test caught: the sent screen said one sentence into open
   * space. It never named the address the mail had gone to, and it never
   * mentioned the junk folder a school mail filter routinely drops us into,
   * so a teacher with nothing in her inbox had no next move.
   */
  it("says which address it went to and where else to look", () => {
    const text = source();
    const sent = text.slice(
      text.indexOf('if (step === "sent")'),
      text.indexOf('if (step === "code")')
    );
    expect(sent).toContain("Check your email");
    expect(sent).toContain("{email}");
    expect(sent).toContain("junk or spam folder");
  });

  it("points at the junk folder on the code step too", () => {
    const text = source();
    const code = text.slice(text.indexOf('if (step === "code")'));
    expect(code).toContain("{email}");
    expect(code).toContain("junk or spam folder");
  });

  it("sends a link on submit and a code only when asked", () => {
    const text = source();
    const submit = text.slice(
      text.indexOf("async function onEmailSubmit"),
      text.indexOf("async function onSendCode")
    );
    expect(submit).toContain("signIn.magicLink");
    expect(submit).not.toContain("emailOtp");

    const spare = text.slice(text.indexOf("async function onSendCode"));
    expect(spare).toContain("authClient.emailOtp.sendVerificationOtp");
  });

  it("lands every successful sign-in in the teacher workspace", () => {
    const text = source();

    expect(text).toContain('callbackURL: "/today"');
    expect(text).toContain('window.location.assign("/today")');
    expect(text).not.toContain('callbackURL: "/"');
    expect(text).not.toContain('window.location.assign("/")');
  });

  it("still builds the code field for a code read off another screen", () => {
    const text = source();
    expect(text).toContain('inputMode="numeric"');
    expect(text).toContain('autoComplete="one-time-code"');
    expect(text).toContain("maxLength={6}");
  });

  it("keeps the code step under her when the code is refused", () => {
    const text = source();
    expect(text).toContain('if (step === "code")');
    expect(text).toContain("CODE_REFUSED");
  });
});
