import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fredoka, Nunito } from "next/font/google";
import { Analytics } from "./Analytics";
import { VercelAnalytics } from "./VercelAnalytics";
import { OfflineOwnerLifecycle } from "./OfflineOwnerLifecycle";
import { isPreparedOfflineUiEnabled } from "@/lib/offline/prepared-feature";
import "./globals.css";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * The Meadow face: friendly, rounded, glare-proof at arm's length outdoors.
 * Fredoka carries the display voice — titles and every spoken line, soft and
 * round at big sizes; Nunito carries the supporting text — notes, folio,
 * chrome, buttons. Both open-license via next/font, self-hosted at build
 * time. (The Meadow direction is set in the Nature Class Design System.)
 */
const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-text",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  // Classroom routes inherit noindex; public editorial pages explicitly opt in.
  robots: { index: false, follow: true },
  title: "Nature Class",
  description: "Guides any educator through an outdoor teaching session.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        <Analytics />
        {process.env.VERCEL_ENV === "production" && <VercelAnalytics />}
        {isPreparedOfflineUiEnabled() && <OfflineOwnerLifecycle />}
        {children}
      </body>
    </html>
  );
}
