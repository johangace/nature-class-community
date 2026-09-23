"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { Wordmark } from "./Wordmark";
import { isNonSchoolGroup } from "@/lib/group-profile";

/** Shared teacher header and primary navigation. */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SunIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M18.1 5.9l-1.4 1.4M7.3 16.7l-1.4 1.4" />
    </svg>
  );
}

function TreeIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      <path d="M12 21v-6.5" />
      <path d="M12 14.5c-3.9 0-6.5-2.4-6.5-5.4C5.5 6 8.3 3.4 12 3.4s6.5 2.6 6.5 5.7c0 3-2.6 5.4-6.5 5.4Z" />
      <path d="M12 14.5l-2.4-2.6M12 11.4l2-2.1" />
    </svg>
  );
}

function BookIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      <path d="M4.5 5A1.7 1.7 0 0 1 6.2 3.3H19v14.9H6.2A1.7 1.7 0 0 0 4.5 19.9V5Z" />
      <path d="M4.5 19.9a1.7 1.7 0 0 0 1.7 1.7H19" />
      <path d="M8.5 8h6.5M8.5 11h4.5" />
    </svg>
  );
}

function SlidersIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      <path d="M4.5 8h9.5M17.5 8h2M4.5 16h4M12 16h7.5" />
      <circle cx="15.5" cy="8" r="1.9" />
      <circle cx="10" cy="16" r="1.9" />
    </svg>
  );
}

function PersonIcon(): ReactElement {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...STROKE}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.8 20c.7-3.5 3-5.4 6.2-5.4s5.5 1.9 6.2 5.4" />
    </svg>
  );
}

const TABS = [
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/season", label: "Lessons", icon: TreeIcon },
  { href: "/journal", label: "Journal", icon: BookIcon },
  { href: "/classes", label: "Classes", icon: SlidersIcon },
  { href: "/account", label: "Profile", icon: PersonIcon },
] as const;

export type HeaderPlace = { id: string; name: string; groundsName: string; groupType?: string | null };

export function AppNavClient({ place }: { place: HeaderPlace | null }) {
  const pathname = usePathname();
  const nonSchool = isNonSchoolGroup(place?.groupType);
  return (
    <>
      <div className="app-shell-head">
        <Link
          href="/today"
          className="app-shell-brand"
          aria-label="Nature Class, back to today"
        >
          <Wordmark seed />
        </Link>
        {place && (
          <div className="app-shell-place" aria-label={nonSchool ? "Current group and place" : "Current teaching context"}>
            <strong>{place.groundsName}</strong>
            <div className="app-shell-place-detail">
              <span>{place.name}</span>
              <Link className="app-shell-change" href={`/world?classId=${encodeURIComponent(place.id)}&change=1`}>
                Change place
              </Link>
            </div>
          </div>
        )}
      </div>
      <nav className="app-nav" aria-label="Main">
        <ul className="app-nav-tabs">
          {TABS.map((tab) => {
            const active =
              tab.href === "/today"
                ? pathname === "/today"
                : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={active ? "app-nav-tab active" : "app-nav-tab"}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon />
                  <span>{tab.href === "/classes" && nonSchool ? "Groups" : tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
