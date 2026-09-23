"use client";

import { useState } from "react";
import { setClassLocation } from "./actions";
import { LocationSearch } from "./LocationSearch";
import {
  locationFailureMessage,
  locationFailureState,
  type LocationFailureState,
} from "./location-feedback";

/**
 * "Use this school's location." The teacher taps it standing in the
 * playground; the iPad's own geolocation fixes the class to this spot, and
 * from then on today's conditions line is grounded here, not at a fixed demo
 * point. One tap, no map, no address typing, no key.
 *
 * The browser asks the teacher's permission; if they decline or the device
 * can't fix a position, the button says so plainly and nothing is stored —
 * conditions keep falling back to the demo default, so nothing breaks. And a
 * typed search opens beneath the note (#181), because a laptop with Location
 * Services off is not a reason a class cannot have a place.
 */
export function LocationButton({
  classId,
  hasLocation,
  label,
  returnTo = "/classes",
}: {
  classId: string;
  hasLocation: boolean;
  label?: string;
  returnTo?: "/today" | "/classes";
}) {
  const [state, setState] = useState<"idle" | "locating" | LocationFailureState>("idle");

  function capture() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const form = new FormData();
        form.set("classId", classId);
        form.set("lat", String(pos.coords.latitude));
        form.set("lng", String(pos.coords.longitude));
        form.set("returnTo", returnTo);
        void setClassLocation(form);
      },
      (err) => {
        setState(locationFailureState(err.code));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  return (
    <span className="loc">
      <button
        type="button"
        className="loc-btn"
        onClick={capture}
        disabled={state === "locating"}
      >
        {state === "locating"
          ? "Finding this spot…"
          : label ?? (hasLocation ? "Update the location" : "Use this school's location")}
      </button>
      {state !== "idle" && state !== "locating" && (
        <>
          <span className="loc-note" role="status">
            {locationFailureMessage(state)}
          </span>
          <LocationSearch classId={classId} returnTo={returnTo} />
        </>
      )}
    </span>
  );
}
