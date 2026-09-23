import { z } from "zod";
import { autocompletePlace } from "@/lib/outside/autocomplete";
import { geocodePlace } from "@/lib/outside/geocode";

/**
 * The place search behind onboarding's location step (#56). A teacher types a
 * school name, a town or a postcode; this hands back candidate coordinates she
 * can pick from, and the pick then travels the SAME path a tapped geolocation
 * does — /api/outside for the live bloom, then createClassFromFlow, which
 * derives the climate tag and resolves the cast. One seam, two ways in.
 *
 * Same shape as /api/outside next door, deliberately: open since #877,
 * zod on the query, force-dynamic, private and never cached, and the upstream
 * called from here so no provider URL or user agent of the teacher's ever
 * reaches it. See lib/outside/geocode.ts for the provider, cost and privacy
 * note that #56 asks for.
 *
 * Three answers, and they are not the same thing:
 *   200 { results: [...] } — found these
 *   200 { results: [] }    — searched, and there is no such place
 *   502 { error }          — could not search at all
 * A teacher retypes for the second and retries for the third, so the step
 * needs to know which happened.
 */
export const dynamic = "force-dynamic";

const querySchema = z.object({
  // Two characters is the shortest thing worth asking a geocoder about, and
  // 160 is longer than any school-and-town line a teacher will type.
  q: z.string().trim().min(2).max(160),
});

export async function GET(request: Request): Promise<Response> {
  // Open to a signed-out visitor since #877: typing her town on /start is
  // the other half of the one question. Same bounds, same no-store.

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return Response.json(
      { error: "type a little more to search" },
      { status: 400, headers: { "cache-control": "private, no-store" } }
    );
  }

  try {
    const results = await (url.searchParams.get("autocomplete") === "1"
      ? autocompletePlace(parsed.data.q)
      : geocodePlace(parsed.data.q));
    return Response.json(
      { results },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    return Response.json(
      { error: "place search unreachable" },
      { status: 502, headers: { "cache-control": "private, no-store" } }
    );
  }
}
