"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sendFeedbackEmail } from "@/lib/email";
import { getTeacher } from "@/lib/teacher";
import { FEEDBACK_DEVICES, FEEDBACK_SCREENS } from "./options";

/**
 * The feedback page's one action (#644). Same shape as every shell action:
 * re-check the session server-side, validate, act, redirect. The teacher's
 * address comes from the session, never from the form — the form asks for
 * nothing but the message.
 *
 * The message itself is never logged (it is a teacher's free text, which can
 * carry a child's words — the same line the Langfuse config holds); on a
 * failed send we log only that a send failed, and the page says so, so she
 * can copy her words and try again rather than trusting a void.
 */

const feedbackSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  // The two optional context answers (#686). "" is the no-answer default the
  // form renders; anything outside the rendered options is rejected, so the
  // email can only ever carry words this page offered.
  screen: z.enum(["", ...FEEDBACK_SCREENS]),
  device: z.enum(["", ...FEEDBACK_DEVICES]),
});

export async function sendFeedback(formData: FormData): Promise<void> {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const parsed = feedbackSchema.safeParse({
    message: formData.get("message"),
    screen: formData.get("screen") ?? "",
    device: formData.get("device") ?? "",
  });
  if (!parsed.success) redirect("/feedback?bad=1");

  const context = [
    parsed.data.screen && `Screen: ${parsed.data.screen}`,
    parsed.data.device && `Device: ${parsed.data.device}`,
  ].filter(Boolean);

  let delivered = true;
  try {
    await sendFeedbackEmail({
      teacherEmail: teacher.email,
      message:
        context.length > 0
          ? `${parsed.data.message}\n\n${context.join("\n")}`
          : parsed.data.message,
    });
  } catch (error) {
    delivered = false;
    console.error(
      `[nature-class] feedback send failed for teacher ${teacher.id}:`,
      error instanceof Error ? error.message : error
    );
  }

  redirect(delivered ? "/feedback?sent=1" : "/feedback?trouble=1");
}
