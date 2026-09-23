/**
 * Sign-in email, in two shapes, with a dev fallback that needs no service.
 *
 * A one-time CODE and a one-time LINK carry the same authority and fail
 * differently. School mail is scanned: district security gateways fetch the
 * links in a message to check where they go, and a link that works once is
 * spent by the fetch, so the teacher taps a dead link and reads it as "this
 * doesn't work". A code cannot be spent by a scanner — there is nothing to
 * fetch. It also crosses devices, which a link cannot: the code read on a
 * phone signs in the iPad in her hands, where a link opened on the phone signs
 * in the phone.
 *
 * When RESEND_API_KEY is set, the link is emailed via Resend (called over its
 * REST API with plain fetch — no SDK dependency in the AGPL tree). When it is
 * absent, the link is logged to the server console instead, so a developer can
 * sign in locally without any email provider at all. That is the whole point:
 * `npm run dev`, enter an email, copy the link from the terminal, you're in.
 *
 * That console fallback must never run in production: a link and a code are
 * both one-time sign-in tokens, and logging either there would write a live
 * credential into the server logs (and, worse, silently "succeed" so no one notices email
 * is misconfigured). So in production a missing RESEND_API_KEY fails CLOSED —
 * we throw loudly rather than log the token. The dev fallback is unchanged.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The from-address for sign-in mail. Override with MAGIC_LINK_FROM. */
const FROM = process.env.MAGIC_LINK_FROM ?? "Nature Class <onboarding@resend.dev>";

/**
 * The one place that decides console-versus-Resend, so the code path cannot
 * drift from the link path on the thing that matters: never writing a live
 * sign-in token into a production log.
 */
async function sendSignInEmail({
  email,
  subject,
  text,
  devLabel,
  devBody,
}: {
  email: string;
  subject: string;
  text: string;
  devLabel: string;
  devBody: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Fail closed in production: never log a sign-in token to the server logs.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY is not set: refusing to send a sign-in email in production. " +
          "Configure an email provider before sign-in can work."
      );
    }
    // Dev fallback: no email service configured, so print it.
    console.log(
      `\n[nature-class] ${devLabel} for ${email}\n  ${devBody}\n  (RESEND_API_KEY unset — logged instead of emailed)\n`
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: email, subject, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Resend send failed (${res.status}): ${detail.slice(0, 200)}`
    );
  }
}

export async function sendMagicLinkEmail({
  email,
  url,
}: {
  email: string;
  url: string;
}): Promise<void> {
  await sendSignInEmail({
    email,
    subject: "Your sign-in link for Nature Class",
    text: `Sign in to Nature Class by opening this link:\n\n${url}\n\nIt works once and expires soon. If you didn't ask for it, you can ignore this email.`,
    devLabel: "magic link",
    devBody: url,
  });
}

/**
 * A tester's feedback (#644), delivered as plain email while we test with
 * real teachers — no new table, no new service, and nothing lands in GitHub
 * issues (#525) or server logs (the same rule the Langfuse config keeps: a
 * teacher's free text can hold a child's words).
 *
 * The recipient comes from FEEDBACK_EMAIL_TO. Unset in production this
 * throws, exactly like the sign-in path: the caller shows "didn't send"
 * rather than the message silently evaporating. Reply-to is the teacher, so
 * answering feedback is one press of reply.
 */
export async function sendFeedbackEmail({
  teacherEmail,
  message,
}: {
  teacherEmail: string;
  message: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_EMAIL_TO;

  if (!apiKey || !to) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Feedback email is not configured: set FEEDBACK_EMAIL_TO (and RESEND_API_KEY) " +
          "or a tester's message is dropped on the floor."
      );
    }
    console.log(
      `\n[nature-class] feedback from ${teacherEmail}\n  ${message}\n  (FEEDBACK_EMAIL_TO or RESEND_API_KEY unset — logged instead of emailed)\n`
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      reply_to: teacherEmail,
      subject: `Nature Class feedback from ${teacherEmail}`,
      text: message,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Resend feedback send failed (${res.status}): ${detail.slice(0, 200)}`
    );
  }
}

/**
 * The code, written so a teacher can read it off one screen and type it into
 * another. It is the only thing in the message: no link beside it, because a
 * link in the same email is the one thing a scanner can still spend, and two
 * ways in reads as a puzzle when she is standing in a corridor.
 */
export async function sendSignInCodeEmail({
  email,
  code,
}: {
  email: string;
  code: string;
}): Promise<void> {
  await sendSignInEmail({
    email,
    subject: `${code} is your Nature Class sign-in code`,
    text: `Your sign-in code for Nature Class:\n\n${code}\n\nType it on the sign-in page. It works once and expires in ten minutes. If you didn't ask for it, you can ignore this email.`,
    devLabel: "sign-in code",
    devBody: code,
  });
}
