import { requestLocale } from "@/lib/request-locale";
import { z } from "zod";
import { getOutsideNow } from "@/lib/outside";
import { groundsToHabitats } from "@/lib/outside/grounds";

import { getTeacher } from "@/lib/teacher";
import { roundTryPlace } from "@/lib/try-place";

/**
 * The live Outside-now read the /start onboarding flow calls mid-setup: the
 * teacher taps their school's location on screen 4 and this fills the card in
 * front of them — their real sky and the species actually seen near those
 * coordinates — and again on screen 5 as chosen grounds tune the look-fors.
 *
 * It is the same server-side compose the Today page does (Pointmoon +
 * regional phenology), just reachable from the client for coordinates that
 * aren't a saved class yet. Open to a signed-out visitor since #877, and no key or upstream
 * URL ever reaches the browser — Pointmoon is called from here, server-side.
 * Private, never cached: the read varies per teacher and per place.
 */
export const dynamic = "force-dynamic";

const querySchema = z.object({
  lat: z.coerce.number().gte(-90).lte(90),
  lng: z.coerce.number().gte(-180).lte(180),
  grounds: z.string().optional(),
  locale: z.string().optional(),
});

export async function GET(request: Request): Promise<Response> {
  // Open to a signed-out visitor since #877: the one question on /start is
  // answered by this read. Her coordinates are rounded to about a kilometre
  // below, so repeat reads from one town share Pointmoon's fifteen-minute
  // memo instead of each costing an upstream call.
  const teacher = await getTeacher();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
    grounds: url.searchParams.get("grounds") ?? undefined,
    locale: url.searchParams.get("locale") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "bad coordinates" }, { status: 400 });
  }
  if (!teacher) {
    const rounded = roundTryPlace(parsed.data.lat, parsed.data.lng);
    if (!rounded) {
      return Response.json({ error: "bad coordinates" }, { status: 400 });
    }
    parsed.data.lat = rounded.lat;
    parsed.data.lng = rounded.lng;
  }

  // Derived exactly as getDailyCard derives it on Today: an explicit override
  // first, then the coordinates. Here the coordinates are the ones the teacher
  // JUST TAPPED rather than a saved class's, which is the whole point — this
  // screen runs before the class row exists, and a Berkeley school must read
  // Fahrenheit in the bloom and Fahrenheit again on Today a minute later.
  //
  // Without this the route composed in the product's native voice and the
  // onboarding reveal said "13 degrees" where Today said "55°F" for the same
  // school. Same data, same teacher, two units, ninety seconds apart.
  const locale = await requestLocale(parsed.data.locale, {
    lat: parsed.data.lat,
    lng: parsed.data.lng,
  });

  const chosen = parsed.data.grounds
    ? parsed.data.grounds.split(",").map((g) => g.trim()).filter(Boolean)
    : [];
  const habitats = groundsToHabitats(chosen);

  try {
    const outside = await getOutsideNow({
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      habitats,
      locale,
    });
    return Response.json(
      {
        conditions: outside.conditions,
        // Where this read is anchored, so the step that asked for it can name
        // the place back to the teacher instead of showing her an unlabelled
        // sky she has no way to contradict (#315).
        place: outside.place,
        // Two lists, two claims, never merged (#172): recorded observations
        // and the region's seasonal record travel separately all the way to
        // the browser so the bloom cannot caption one as the other.
        sightings: outside.sightings,
        usuallyAround: outside.usuallyAround,
        lookFors: outside.lookFors,
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    // Never strand the teacher: the client shows the honest graceful-collapse
    // invite when the sky can't be reached, not a broken card.
    return Response.json(
      { error: "sky unreachable" },
      { status: 502, headers: { "cache-control": "private, no-store" } }
    );
  }
}
