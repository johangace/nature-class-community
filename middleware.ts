import { NextRequest, NextResponse } from "next/server";
import { validLocale, VISITOR_LOCALE_COOKIE } from "./lib/locale-links";

/** Remember a visited English edition, never a prefetched link. This is only
 * the pre-location fallback; a school's place wins in requestLocale. */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const region = validLocale(request.nextUrl.pathname.slice(1)) ??
    validLocale(request.nextUrl.searchParams.get("locale"));
  const automatic = !region && request.nextUrl.searchParams.get("locale") === "auto";
  if ((region || automatic) && request.method === "GET" &&
      !request.headers.has("next-router-prefetch") &&
      request.headers.get("purpose") !== "prefetch" &&
      !request.headers.get("sec-purpose")?.includes("prefetch")) {
    if (automatic) response.cookies.delete(VISITOR_LOCALE_COOKIE);
    else if (region) response.cookies.set(VISITOR_LOCALE_COOKIE, region, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
      path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: ["/", "/us", "/uk", "/welcome", "/schools", "/parents", "/start", "/sign-in", "/season", "/today", "/run", "/session/:path*", "/read", "/print"],
};
