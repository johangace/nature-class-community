/**
 * The location step's one piece of state reasoning, pulled out where it can be
 * read and tested.
 *
 * The step juggles two independent things: how the BROWSER's geolocation went
 * (`LocationState`) and how the TYPED search went. They are genuinely separate
 * — a teacher can be refused the permission prompt and then find her school by
 * name — and keeping them separate is what lets each failure say the one true
 * thing about itself.
 *
 * Separate, though, is not the same as unrelated, and the usability round
 * found the seam: a teacher who was refused the prompt and then typed her
 * school's name was left reading "Location permission was declined", in red,
 * UNDERNEATH a list of her school's addresses. An error about a road she had
 * already stopped walking down.
 */

/** How the browser's own geolocation attempt went. */
export type LocationState = "empty" | "prompting" | "grounded" | "denied" | "error";

/**
 * Which of the two ways in produced the coordinates we are reading, plus the
 * third case a reload creates: a class that already holds a position from an
 * earlier run of this flow, where nobody on this screen can know which route
 * originally set it. Saying "your browser gave us this" about a restored
 * position would be a guess, and a guess about provenance is the one thing
 * this whole confirmation exists to stop.
 */
export type LocationRoute = "browser" | "typed" | "restored" | "remembered";

/**
 * The step's second piece of reasoning, and the one it was missing.
 *
 * Both routes in ended at `groundToCoords`, which fetched the sky and rendered
 * it, and neither said out loud what place it had landed on. A teacher on a
 * desktop behind a VPN, or on a school network whose carrier gateway exits in
 * another country, was shown a card about somewhere she has never been, drawn
 * exactly as a correct one is drawn. She is standing in the real place, so she
 * is the only person on earth who could catch it, and nothing on the screen
 * gave her anything to catch it with (#315).
 *
 * So the fix is to make a claim she can argue with, and the parts below are
 * each pulled from something already known rather than composed for effect.
 */
export interface LocatedConfirmation {
  /**
   * The place in the words the teacher is most entitled to trust, or null when
   * the point could not be named. The map beside the words is labelled with
   * it, so it rides on the confirmation rather than being composed twice.
   */
  label: string | null;
  /** What we think the place is, said plainly. */
  headline: string;
  /** How it was found, and the coordinates actually being read. */
  provenance: string;
  /**
   * The reverse geocoder's full address for the point, when we have one and it
   * is not already the headline. It runs out to the country on purpose: that
   * is the token that makes a wrong fix obvious rather than merely possible.
   */
  address: string | null;
  /** Said only when the point could not be named at all. Null otherwise. */
  unnamed: string | null;
}

export interface LocatedInput {
  route: LocationRoute;
  lat: number;
  lng: number;
  /** Pointmoon's reverse geocode of the point, when the read carried one. */
  place: { name: string | null; address: string | null } | null;
  /**
   * The label she picked out of the search results, on the typed route. Her
   * own choice, in the words she recognised, so it leads over anything the
   * reverse geocode would call the same point.
   */
  pickedLabel?: string | null;
}

/**
 * Three decimals, the same rounding the class store and the geocoder apply.
 * Showing more would imply a precision the saved class does not keep.
 */
function coords(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

/**
 * Compose what the located step says back to her.
 *
 * The order of preference for the headline is the order of how much the
 * teacher is entitled to trust each source. Her own pick is first: she read a
 * labelled result and chose it, and restating it is the confirmation #56's
 * typed route never gave her. The map's name for the point comes next, then
 * the map's full address, then the bare coordinates, which are always known
 * and are the thing genuinely being read.
 */
export function confirmLocation(input: LocatedInput): LocatedConfirmation {
  const picked = input.pickedLabel?.trim() || null;
  // Her own words lead on the typed route, and on the remembered one: the
  // label she saw when she chose is kept with the spot (#922), so a reload
  // never renames her school after the reverse geocoder's next guess.
  const label =
    (input.route === "typed" || input.route === "remembered" ? picked : null) ??
    input.place?.name ??
    input.place?.address ??
    null;

  const where = coords(input.lat, input.lng);
  const address = input.place?.address ?? null;

  return {
    label,
    // The map above says where; this says which place that is. It was
    // "Reading conditions for ..." back when the step answered a location
    // with a day's weather and species. The step answers it with a map of the
    // place now, so the sentence names the place and promises no forecast.
    headline: label ?? `The point at ${where}`,
    provenance:
      input.route === "browser"
        ? `Your browser gave us this position, at ${where}.`
        : input.route === "typed"
          ? `You picked this from the search, at ${where}.`
          : input.route === "remembered"
            ? `This is the place you chose before signing in, at ${where}.`
            : `This is your saved position, at ${where}.`,
    // Never twice. When the address IS the headline, repeating it underneath
    // reads as two sources agreeing when there is only one.
    address: address && address !== label ? address : null,
    unnamed: label
      ? null
      : "We could not put a place name to it. Check the map, or search for a different place above.",
  };
}

/**
 * The school name a class is saved with, when the teacher is asked for it once
 * (#905).
 *
 * The first-run flow used to ask for the school on screen 1 and then ask her
 * to find the same school on screen 2. `Class.school` and `Grounds.school` are
 * non-null, so the name is genuinely needed — but it is already in the
 * confirmation the location step draws: her own pick out of the search
 * results, or the reverse geocoder's name for the point she is standing on.
 *
 * So the place supplies the default and she is asked nothing. `edited` is what
 * keeps that from fighting her: the moment the name is hers — typed into the
 * field, or carried in from a join link — it stops following the place, and it
 * stays hers even if she goes back and picks somewhere else.
 *
 * An empty string is a real answer here, and it is the one case the caller
 * must not save: the point could not be named and she has not named it, so the
 * location step holds and asks.
 */
export function schoolOfRecord(
  own: string,
  edited: boolean,
  placeLabel: string | null
): string {
  return edited ? own : (placeLabel ?? "");
}

/**
 * The geolocation state after a typed search comes back with results.
 *
 * Results mean the teacher has a way forward that does not need the
 * permission, so the permission's complaint stops being the thing in front of
 * her and is cleared.
 *
 * A search that found NOTHING leaves the denial standing, deliberately. Then
 * the permission really is still the open problem, and "allow location for
 * this site, then try again" is still the best advice we have. Clearing it
 * there would take away the only guidance on the screen.
 *
 * "grounded" and "prompting" pass through untouched: one is a success this has
 * no business undoing, the other is a request still in flight.
 */
export function afterSearchResults(
  state: LocationState,
  resultCount: number
): LocationState {
  if (resultCount <= 0) return state;
  return state === "denied" || state === "error" ? "empty" : state;
}
