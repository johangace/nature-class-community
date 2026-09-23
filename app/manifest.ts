import type { MetadataRoute } from "next";

/**
 * The web app manifest, so a teacher can add Nature Class to the iPad home
 * screen and open it like an app — full screen, no browser chrome, and (with
 * the service worker) working in the field with no signal. Paper on cream,
 * the Meadow palette.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nature Class",
    short_name: "Nature Class",
    description: "Guides any educator through an outdoor teaching session.",
    // Preserve the identity of installations created when start_url was `/`.
    // The launch destination may move; the installed app must not become a
    // second app or strand existing iPads on the old destination.
    id: "/",
    // Installed Nature Class is the teacher tool. Signed-out launches are
    // safely handed to sign-in by /today's existing auth boundary.
    start_url: "/today",
    display: "standalone",
    orientation: "landscape",
    /* THE GROUND, AND THE ONE PLACE IT CANNOT READ ITS OWN TOKEN (#392).
     *
     * These MUST equal --paper in app/globals.css. A manifest is JSON by the
     * time a browser reads it, so there is no var(--paper) to call here and a
     * literal is unavoidable -- this is the only colour in the product that
     * cannot consume the token system directly.
     *
     * It rotted exactly the way an unheld literal rots. It held #f4efe4, the
     * cream retired when the ground moved to chalk in #382, so every teacher
     * who added Nature Class to an iPad home screen kept getting the old cream
     * on the splash screen and in the browser chrome, months after the ground
     * changed underneath it. No gate could see it, because it is not a
     * stylesheet, and no person did either.
     *
     * So it is not held by this comment. tests/unit/design-contrast.spec.ts
     * reads --paper out of globals.css and asserts both keys equal it, which
     * means the next person to move the ground finds out from a red test
     * instead of from a home screen. */
    background_color: "#f7f7f5",
    theme_color: "#f7f7f5",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
