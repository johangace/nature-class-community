import Link from "next/link";
import { localeHref } from "@/lib/locale-links";
import type { Locale } from "@/lib/localization";

export function AudienceLinks({ locale, automatic = false }: { locale: Locale; automatic?: boolean }) {
  return <>
    <Link href={localeHref("/schools", locale, automatic)}>Schools</Link>{" · "}
    <Link href={localeHref("/parents", locale, automatic)}>Parents</Link>{" · "}
    <Link href={localeHref("/children", locale, automatic)}>Children</Link>
  </>;
}
