export type LocationFailureState = "denied" | "timeout" | "unavailable";

/** Browser geolocation uses the standard numeric codes 1, 2 and 3. */
export function locationFailureState(code: number): LocationFailureState {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

/**
 * Each failure names what happened and the way out. The typed search renders
 * beneath every one of them (#181), so the sentence points there rather than
 * sending the teacher into her operating system's settings and back.
 */
export function locationFailureMessage(state: LocationFailureState): string {
  if (state === "denied") {
    return "Location access is off in your browser. Allow it, or type the place below.";
  }
  if (state === "timeout") {
    return "Location timed out. Try again, or type the place below.";
  }
  return "Your device could not provide a location. Type the place below instead.";
}
