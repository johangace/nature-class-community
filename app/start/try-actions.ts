"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { examplePlaceBySlug, exampleTryPlace } from "@/lib/example-places";
import {
  roundTryPlace,
  serializeTryPlace,
  TRY_PLACE_COOKIE,
  TRY_PLACE_MAX_AGE,
  type TryPlace,
} from "@/lib/try-place";

/** The chosen spot, in her browser and nowhere else. */
async function keepTryPlace(place: TryPlace): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: TRY_PLACE_COOKIE,
    value: serializeTryPlace(place),
    path: "/",
    maxAge: TRY_PLACE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * A signed-out visitor answered the one question (#877). Keep her spot in her
 * own browser and open the season for it. No row is created and nothing is
 * written server-side: the place lives in the cookie until she signs in, at
 * which point the class setup screen reads it back and `createClassFromFlow`
 * clears it.
 *
 * A spot that does not parse sends her to the season anyway, on the sample
 * patch. The question is a door, never a wall.
 */
export async function rememberTryPlace(
  lat: number,
  lng: number,
  label?: string | null
): Promise<void> {
  const place = roundTryPlace(lat, lng, label ?? undefined);
  if (place) await keepTryPlace(place);
  redirect("/season");
}

/**
 * She picked one of the named example places instead of answering the question
 * (#877, third slice). Same cookie, same season, same live read — the only
 * difference is that the surfaces recognise the spot and say whose it is.
 *
 * An unrecognised slug opens the season on the sample patch rather than
 * failing: the row is a door, the same way the question is.
 */
export async function openExamplePlace(slug: string): Promise<void> {
  const example = examplePlaceBySlug(slug);
  if (example) await keepTryPlace(exampleTryPlace(example));
  redirect("/season");
}
