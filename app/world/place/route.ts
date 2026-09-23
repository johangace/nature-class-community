/**
 * Changing a class's place, as Post/Redirect/Get (nc#949).
 *
 * WHY THIS IS NOT A SERVER ACTION. It was one, and the write was never the
 * problem: the action committed in under 100ms and answered with a correct
 * `x-action-redirect`. What failed was the NAVIGATION. A server action's
 * redirect is carried out by the client router, and roughly two times in five
 * the router dropped it — the address bar never changed, no request for the
 * destination was ever made, and the page sat on the place the teacher had
 * just changed away from. The save had happened. Nothing said so, and nothing
 * went red. tests/e2e/shared-grounds.spec.ts caught it as a 30s timeout on the
 * new place's heading, at whichever of the two writes lost that day, which is
 * why it read as flake for a week.
 *
 * A 303 from a plain form POST is carried out by the BROWSER. It cannot be
 * dropped by a router that is busy, and it needs no JavaScript, which is worth
 * having on a school iPad on the far side of a field. The write itself lives
 * in lib/grounds-write.ts and is unchanged.
 *
 * Server actions verify the request's origin for you. A route handler does
 * not, so `sameOrigin` is doing the job Next was doing before — without it
 * this endpoint would be a cross-site way to move a teacher's class to
 * another place.
 *
 * Both that check and the 303's base come from lib/app-origin.ts rather than
 * from `request.url`, because behind a reverse proxy `request.url` names the
 * address the server bound to, not the site the teacher is on (nc#955): this
 * endpoint 403'd every place change on a self-hosted install, and a passing
 * check would have redirected her to the proxy's own loopback.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { appOrigin, sameOrigin } from "@/lib/app-origin";
import { getTeacher } from "@/lib/teacher";
import {
  assignGroundsForTeacher,
  createGroundsForTeacher,
} from "@/lib/grounds-write";

/** 303, so the browser turns the POST into a GET of the place page itself. */
function seeOther(destination: string, request: Request): NextResponse {
  return NextResponse.redirect(new URL(destination, appOrigin(request)), 303);
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const teacher = await getTeacher();
  if (!teacher) return seeOther("/sign-in", request);

  const formData = await request.formData().catch(() => null);
  if (!formData) return seeOther("/classes", request);

  const intent = formData.get("intent");
  let destination: string;
  if (intent === "assign") {
    destination = await assignGroundsForTeacher(teacher.id, formData);
  } else if (intent === "create") {
    destination = await createGroundsForTeacher(teacher.id, formData);
  } else {
    destination = "/classes";
  }

  revalidatePath("/");
  revalidatePath("/classes");
  revalidatePath("/world");

  return seeOther(destination, request);
}
