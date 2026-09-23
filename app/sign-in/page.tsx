import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTeacher } from "@/lib/teacher";
import { configuredSocialProviders } from "@/lib/social-sign-in";
import { Wordmark } from "../Wordmark";
import { SignInForm } from "./SignInForm";

/**
 * The sign-in surface. Two elements: the prose line and the one field. Editorial
 * register, sentence case, no password anywhere. Public — reaching it never
 * requires being signed in, and it never blocks the demo.
 *
 * Public is not the same as unguarded. A teacher who is ALREADY signed in and
 * lands here (a bookmark, the browser's own suggestion, a stale tab) was shown
 * a form asking them to sign in again, which reads as "you have been signed
 * out". Every other account route states its expectation on the server and
 * redirects when it does not hold (/start and /classes both send a signed-out
 * visitor to /sign-in); this is the same idiom pointed the other way. Signed
 * out, nothing here changes.
 *
 * Which school doors to show is read here, on the server, from the credentials
 * that actually exist. A button for a provider we cannot complete would open
 * onto an error, which is worse than not offering it.
 *
 * IT NOW LOOKS LIKE THE SITE IT BELONGS TO (#692). The form used to sit in a
 * 30rem column alone on an otherwise empty canvas: no wordmark, no way back to
 * the public site, and none of the documentary photography that carries every
 * other public page. A pilot teacher's first touch is this door, and a door
 * that looks like it belongs to nothing costs trust at the worst moment.
 *
 * Three things were added and nothing was taken away. A masthead carrying the
 * seed wordmark, which is also the route home — the only chrome here, because
 * the whole point of this page is the one task on it, and the public header's
 * nav would offer "Sign in" pointing at the page she is standing on. An
 * editorial two-column composition at desktop width. And one photograph.
 *
 * The authentication is untouched: {@link SignInForm} is the same component
 * with the same states, the same passwordless email path, the same saved
 * passkey, the same already-signed-in redirect above.
 */
export const dynamic = "force-dynamic";

/**
 * WHY THIS PHOTOGRAPH, out of the twelve approved documentary frames in
 * `public/landing/` (#692 asked for the choice to be reviewed rather than
 * treated as decoration, and this is that review).
 *
 * A seed feeder the children pressed and hung on a bare branch, photographed
 * against a garden fence on a grey day. It wins on three things that were
 * measured rather than felt:
 *
 *   - **It survives the crop, in both directions.** The subject is a single
 *     object centred in a portrait 960x1280 frame, so the tall desktop column
 *     and the short band a phone gets both keep it whole. The runner-up,
 *     `birds-nest-circle.jpg` — the woven willow circle with painted log seats,
 *     and the most literally "outdoor classroom" frame we own — loses exactly
 *     here: its subject IS the circle's full width, and a narrow column cuts
 *     the sides off and leaves rubble.
 *   - **It cannot delay the sign-in task.** 108 KB, the lightest of the twelve
 *     portrait frames; the nest circle is 550 KB, five times the weight, on a
 *     page whose whole job is to get out of the way.
 *   - **It rhymes with the mark above it.** The wordmark in the masthead
 *     carries the seed lockup. Under it hangs a ball of seed. Nobody will
 *     articulate that, which is the point.
 *
 * It also carries no people at all, which is the right default for a page any
 * stranger can open without an account.
 */
const DOOR_PHOTOGRAPH = {
  src: "/landing/seed-feeder-branch.jpg",
  /**
   * Truthful, and about what is in the frame rather than about what we would
   * like it to mean: a reader who cannot see it gets the picture, not the
   * marketing. `public/landing/README.md` calls it "A seed feeder hanging from
   * a branch"; this says the same thing with what the frame actually shows.
   */
  alt: "A homemade seed feeder hanging by green twine from a bare branch in a school garden",
} as const;

export default async function SignInPage() {
  const teacher = await getTeacher();
  if (teacher) redirect("/today");

  return (
    <div className="signin-door">
      <header className="signin-masthead">
        <Link className="signin-brand" href="/welcome" aria-label="Nature Class home">
          <Wordmark className="signin-logo" seed />
        </Link>
      </header>

      <main className="signin">
        <div className="signin-column">
          <h1>Sign in to save your activities</h1>
          <SignInForm social={configuredSocialProviders()} />
          <p className="signin-first">
            First time here? The same link creates your account: no password, no
            form, just your email.
          </p>
        </div>

        {/* Ordered after the form in the DOM, not only moved by CSS: on a phone
            the task is what she came for, and a screen reader and a keyboard
            should meet it in that order too. The desktop column places this to
            the right with `grid-column`, which does not disturb that order. */}
        <figure className="signin-figure">
          <div className="signin-photo">
            <Image
              alt={DOOR_PHOTOGRAPH.alt}
              fill
              sizes="(max-width: 60rem) 100vw, 38vw"
              src={DOOR_PHOTOGRAPH.src}
            />
          </div>
        </figure>
      </main>
    </div>
  );
}
