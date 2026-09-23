import { NextResponse, type NextRequest } from "next/server";
import { retireRememberedFact } from "@/app/worldMemoryActions";
import { appOrigin, sameOrigin } from "@/lib/app-origin";
import { validLocale } from "@/lib/locale-links";
import { findSession } from "@/lib/pack";

export const dynamic = "force-dynamic";

/**
 * Retiring one remembered fact, as an ORDINARY FORM POST (#509).
 *
 * WHY THIS IS NOT A SERVER ACTION, WHICH IS WHAT IT WAS FIRST. The strip's
 * control was built three ways as a server action — an `onClick` inside a
 * transition, a `<form action={fn}>` with `useActionState`, and that plus a
 * `redirect` — and every one of them left the retired fact on the page about
 * half the time. Not slowly: a poll held one for thirty seconds and the row
 * never went. The write had landed every time, and so had the re-render. A
 * server probe showed the very next render reading the emptied column half a
 * second after the click, and capturing the action's own response showed it
 * complete and correct, 13,559 identical bytes in a run that updated and a run
 * that did not. What differed was whether the CLIENT applied it. The one thing
 * that worked in every probe was a full document navigation — which is also
 * what the passing runs turn out to have been doing, submitting natively
 * before hydration finished.
 *
 * So the control does that on purpose, every time, for every teacher. A plain
 * `method="post"` form to this handler is not intercepted by React, does not
 * depend on hydration, and ends in a 303 back to the page she was on. It is
 * the same write, taken off a code path that was not delivering it.
 *
 * THE ORIGIN IS CHECKED, BECAUSE A ROUTE HANDLER IS NOT A SERVER ACTION. Next
 * verifies the origin of an action for you and does nothing of the kind here,
 * which is why `app/world/place/route.ts` — the same Post/Redirect/Get shape,
 * reached the same way — calls `sameOrigin` first. SameSite=Lax is not the
 * guard it looks like: it is SAME-SITE, so a sibling subdomain still sends the
 * session cookie, and without this line that page could retire a signed-in
 * teacher's facts. Both this check and the redirect's base come from
 * `lib/app-origin.ts` rather than `request.url`, because behind a reverse proxy
 * `request.url` names the address the server bound to and not the site the
 * teacher is on (nc#955).
 *
 * A SIGNED-OUT POST GOES TO SIGN-IN, NOT BACK TO THE PAGE. A session can expire
 * between the render and the submit, and the primer a signed-out visitor gets
 * has no class, so no strip, so no failure line either — the row would appear
 * to have gone while the fact stayed. She is sent where she can actually fix
 * that, exactly as the place route does.
 *
 * THE DESTINATION IS BUILT HERE, NEVER POSTED. The form carries the lesson's
 * own id and locale, and both are checked against what they may be — a lesson
 * the shelf actually holds, one of the two editions — before either reaches a
 * query string. A posted URL would be an open redirect for the sake of a
 * string concatenation. Any other failed write comes back as `?retire=failed`,
 * so the page can say so without any client state at all — which is what lets
 * the whole strip be a server component.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return seeOther("/session/primer", request);

  const result = await retireRememberedFact({
    classId: String(form.get("classId") ?? ""),
    kind: String(form.get("kind") ?? ""),
    value: String(form.get("value") ?? ""),
  });
  if (!result.ok && result.reason === "not-signed-in") return seeOther("/sign-in", request);

  // Both carried values are checked against what they are allowed to be,
  // rather than echoed: a lesson that exists, and one of the two editions.
  // Anything else is dropped and she lands on the primer's own default,
  // which is the same page with one fewer assumption.
  const params = new URLSearchParams();
  const sessionId = form.get("sessionId");
  const locale = validLocale(form.get("locale"));
  if (typeof sessionId === "string" && sessionId && findSession(sessionId)) {
    params.set("session", sessionId);
  }
  if (locale) params.set("locale", locale);
  if (!result.ok) params.set("retire", "failed");
  const query = params.toString();

  return seeOther(`/session/primer${query ? `?${query}` : ""}`, request);
}

/** 303, so the browser follows with a GET and a reload cannot re-post. */
function seeOther(destination: string, request: Request): NextResponse {
  return NextResponse.redirect(new URL(destination, appOrigin(request)), 303);
}
