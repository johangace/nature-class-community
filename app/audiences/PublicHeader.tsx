import Link from "next/link";
import type { Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import type { Teacher } from "@/lib/teacher";
import { Wordmark } from "../Wordmark";
import { MobileMenu } from "./MobileMenu";
import styles from "./public-header.module.css";

export function PublicHeader({ locale, automatic = false, page = "home", teacher }: { locale: Locale; automatic?: boolean; page?: "home" | "schools" | "parents" | "children" | "season"; teacher?: Teacher | null }) {
  const href = (path: string) => localeHref(path, locale, automatic);
  const teacherLabel = teacher?.name?.trim() || teacher?.email;
  const teacherInitial = (teacherLabel || "T").slice(0, 1).toUpperCase();
  const brand = <Link className={styles.brand} href={automatic ? "/?locale=auto" : `/${locale}`} aria-label="Nature Class home"><Wordmark className={styles.logo} seed /></Link>;
  const navigation = <>
    <nav className={styles.links} aria-label="Main navigation">
      <Link href={href("/schools")} aria-current={page === "schools" ? "page" : undefined}>Schools</Link>
      <Link href={href("/parents")} aria-current={page === "parents" ? "page" : undefined}>Parents</Link>
      <Link href={href("/children")} aria-current={page === "children" ? "page" : undefined}>Children</Link>
      <Link href={href("/season")} aria-current={page === "season" ? "page" : undefined}>Curriculum</Link>
    </nav>
    <div className={styles.tools}>
      <nav className={styles.locales} aria-label="English version">{(["us", "uk"] as const).map(version => <Link key={version} href={page === "home" ? `/${version}` : `/${page}?locale=${version}`} lang={version === "us" ? "en-US" : "en-GB"} hrefLang={version === "us" ? "en-US" : "en-GB"} aria-label={`English (${version.toUpperCase()})`} title={`English (${version.toUpperCase()})`} aria-current={locale === version ? "page" : undefined}><span aria-hidden="true">{version === "us" ? "🇺🇸" : "🇬🇧"}</span></Link>)}</nav>
      <Link href={href(teacher ? "/today" : "/sign-in")} aria-label={teacherLabel ? `Continue as ${teacherLabel} to Today` : undefined}>{teacher && <span className={styles.avatar} data-avatar="teacher" aria-hidden="true">{teacherInitial}</span>}{teacher ? "Today" : "Sign in"}</Link>
    </div>
  </>;
  return <header className={styles.header}>
    {brand}
    <div className={styles.desktop}>{navigation}</div>
    <MobileMenu brand={brand}>{navigation}</MobileMenu>
  </header>;
}
