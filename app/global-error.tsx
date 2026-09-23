"use client";

import type { ReactElement } from "react";
import "./globals.css";
import { ErrorRecovery } from "./ErrorRecovery";

/**
 * Root-layout crash boundary (nc#75). `global-error.tsx` replaces the ENTIRE
 * root layout when it renders — Next's own rule — so it defines its own
 * `<html>`/`<body>` and imports the stylesheet directly rather than
 * inheriting RootLayout's. It does not carry RootLayout's next/font setup: a
 * last-resort screen falling back to a system font is a fine trade for not
 * depending on the very build machinery that may be what just failed.
 *
 * Everything else — the stale-chunk detection, the one-shot reload, the calm
 * screen — is shared with app/error.tsx via ErrorRecovery.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}): ReactElement {
  return (
    <html lang="en">
      <body>
        <ErrorRecovery error={error} />
      </body>
    </html>
  );
}
