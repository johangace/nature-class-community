import type { ReactElement } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";

/**
 * A wrong URL used to drop straight out of the product into Next's stock
 * black-on-white default — the cheapest possible tell that nobody had walked
 * the edges. A stale bookmark, a mistyped path in a forwarded email, or a
 * mis-click in front of a room all land here, so it gets the same paper, the
 * same wordmark and the same one-way-out as every other surface.
 *
 * No apology, no error code, no illustration: it says what happened and
 * points at the one place a teacher wants to be.
 */
export default function NotFound(): ReactElement {
  return (
    <main className="strayed">
      <Wordmark className="strayed-brand" />
      <h1>This page isn&rsquo;t here.</h1>
      <p>The link may be old, or the address slightly off.</p>
      <Link className="strayed-back" href="/">
        Back to Nature Class →
      </Link>
    </main>
  );
}
