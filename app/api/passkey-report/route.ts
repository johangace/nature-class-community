import { z } from "zod";
import { sameOrigin } from "@/lib/app-origin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * #650 · Where passkey ceremonies come to be counted.
 *
 * The path has been reported broken three times since #45 and never once
 * diagnosed, because every failure lands in a console on a device we do not
 * hold. This route is the other end of `reportPasskeyCeremony` in
 * lib/passkey.ts: one row per ended ceremony, successes included, so the
 * question "keep it, demote it, or retire it" is answered by what devices did
 * rather than by how it felt.
 *
 * OPEN BY NECESSITY, BOUNDED BY DESIGN. The sign-in page is public and the
 * most interesting ceremony is the one that fails BEFORE anyone is signed in,
 * so this cannot sit behind a session. What it can do is refuse to be
 * interesting to abuse: a strict enum-only schema (anything unrecognised is
 * rejected outright rather than stored), a same-origin requirement, no way to
 * read anything back, and a row too small and too dull to be worth filling.
 *
 * NOTHING STORED IDENTIFIES A TEACHER. No user id, no email, no address, no
 * raw user-agent. The teacher may not even exist yet at the moment of the
 * report. Coarse device and browser family are the only context kept, because
 * "every failure is an iPad on Safari" and "every failure is a desktop Chrome
 * with no sensor" are different findings and the codes are unreadable without
 * that one distinction.
 */
const reportSchema = z
  .object({
    surface: z.enum(["sign-in", "sign-in-autofill", "today-strip", "onboarding"]),
    act: z.enum(["use", "enrol"]),
    outcome: z.enum(["ok", "already", "cancelled", "unavailable", "failed"]),
    // The library's own code. Bounded and character-restricted: this is the
    // only free-ish field, and it is written by a library, not by a person.
    code: z
      .string()
      .max(64)
      .regex(/^[A-Za-z0-9_]+$/)
      .nullable()
      .optional(),
    reason: z.enum(["wrong-host", "unknown"]).nullable().optional(),
    platform: z.enum(["ios", "android", "macos", "windows", "linux", "other"]),
    browser: z.enum(["safari", "chrome", "firefox", "edge", "other"]),
    canSave: z.boolean().nullable().optional(),
    conditional: z.boolean().nullable().optional(),
  })
  .strict();

/**
 * Same-origin only. A report from anywhere else is not ours to believe.
 *
 * `sameOrigin` lives in lib/app-origin.ts and is shared with
 * app/world/place/route.ts — it used to be a verbatim copy in each, and both
 * copies compared against `request.url`, which behind a reverse proxy is the
 * address the server bound to rather than the site the teacher is on (nc#955).
 * On a self-hosted install that refused every genuine report, which is a
 * silent way for the instrument this route exists to be to stop recording.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  try {
    await prisma.passkeyCeremony.create({ data: parsed.data });
  } catch {
    // A telemetry write that fails is not the teacher's problem, and this
    // endpoint has nothing to tell her either way.
  }

  return new Response(null, { status: 204 });
}
