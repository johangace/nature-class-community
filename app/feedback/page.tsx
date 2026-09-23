import Link from "next/link";
import { redirect } from "next/navigation";
import { getTeacher } from "@/lib/teacher";
import { AppNav } from "../AppNav";
import { sendFeedback } from "./actions";
import { FEEDBACK_DEVICES, FEEDBACK_SCREENS } from "./options";

/**
 * Feedback (/feedback), #644 — a temporary surface while real teachers test.
 * One textarea, one button, in the settings register (prose and plain forms,
 * the same global classes /classes wears). Reached by a quiet line at the
 * foot of Today and of Classes; deliberately NOT a fifth nav tab (the
 * four-tab bar is a composition) and NOT chrome on /run (that surface asks
 * for nothing). The message leaves as email (`sendFeedbackEmail`) — when the
 * testing season ends, removal is this folder plus two entry lines.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const params = await searchParams;
  const sent = params?.sent === "1";
  const trouble = params?.trouble === "1";

  return (
    <main className="classes">
      <AppNav />
      <h1>Feedback</h1>

      <p className="classes-intro">
        Nature Class is new, and you are one of its first teachers. Tell us
        anything that broke, confused you, or got in the way of a lesson.
        Small things count.
      </p>

      {sent ? (
        <section aria-live="polite">
          <p className="class-meta">
            Sent, thank you. We read every message, and it shapes what we build
            next. If a reply would help, it will come to {teacher.email}.
          </p>
          <p className="classes-foot">
            <Link href="/feedback">Send another →</Link>
          </p>
        </section>
      ) : (
        <form action={sendFeedback} className="class-new">
          {trouble && (
            <p className="class-meta" role="alert">
              That one didn&rsquo;t send. Your words are still below, so
              please try again in a moment.
            </p>
          )}
          <label className="signin-label">
            What would you like us to know?
            <textarea
              className="signin-input"
              name="message"
              required
              maxLength={4000}
              rows={12}
            />
          </label>
          <p className="class-meta">
            If it helps, say where it happened. Both are fine to skip.
          </p>
          <label className="signin-label">
            Which screen
            <select className="signin-input" name="screen" defaultValue="">
              <option value="">no answer</option>
              {FEEDBACK_SCREENS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="signin-label">
            Which device
            <select className="signin-input" name="device" defaultValue="">
              <option value="">no answer</option>
              {FEEDBACK_DEVICES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="signin-submit">
            Send
          </button>
          <p className="class-meta">
            Your message goes straight to the people building Nature Class,
            with your address ({teacher.email}) so we can reply.
          </p>
        </form>
      )}
    </main>
  );
}
