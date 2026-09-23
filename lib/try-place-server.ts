import { cookies } from "next/headers";
import { parseTryPlace, TRY_PLACE_COOKIE, type TryPlace } from "./try-place";

/**
 * The spot a signed-out visitor chose on /start, if she chose one (#877).
 *
 * Server-only, and never throws: outside a request (a build-time render, a
 * script) there is no cookie jar, and the honest answer is the same as a
 * visitor who never answered the question, which is null. Every fallback that
 * used to reach straight for the London sample now asks this first.
 */
export async function getTryPlace(): Promise<TryPlace | null> {
  try {
    const jar = await cookies();
    return parseTryPlace(jar.get(TRY_PLACE_COOKIE)?.value);
  } catch {
    return null;
  }
}
