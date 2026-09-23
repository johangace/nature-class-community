import Link from "next/link";
import { localeHref } from "@/lib/locale-links";
import type { Locale } from "@/lib/localization";
import { SOURCE_REPOSITORY_URL } from "@/lib/source";
import styles from "../../resources/resources.module.css";

export function TermsPage({ locale, automatic = false }: { locale: Locale; automatic?: boolean }) {
  const uk = locale === "uk";
  return <>
    <h1 className={styles.title}>Terms</h1>
    <p className={styles.lead}>The simple rules for using Nature Class.</p>
    <p>Last updated 23 September 2026.</p>

    <h2>Using Nature Class</h2>
    <p>Nature Class is run by Wyld Way Corp. It is free for teachers while we pilot it with schools. It is for adults who teach or work with children. Keep your sign-in to yourself.</p>
    <p>If your school has signed a pilot agreement, that agreement also applies. Where the two differ, the agreement wins.</p>

    <h2>You are in charge outside</h2>
    <ul>
      <li>Lessons are a guide, not a script. You decide what is safe for your class, your grounds and the weather on the day.</li>
      <li>{uk ? "Follow your school’s safeguarding, supervision and risk assessment rules." : "Follow your school’s and district’s child safety, supervision and field trip rules."}</li>
      <li>Check your grounds before a lesson. Never let children eat or taste anything they find.</li>
      <li>AI answers and plant or animal identifications can be wrong. Treat them as a starting point.</li>
    </ul>

    <h2>Children’s information</h2>
    <p>Do not add children’s names or other personal details. See our <Link href={localeHref("/privacy", locale, automatic)}>privacy notice</Link>.</p>

    <h2>Our lessons and code</h2>
    <p>You can use and print lessons for your own teaching. The Nature Class software is open source under the GNU Affero General Public {uk ? "Licence" : "License"}, version 3. The complete source of what runs here is at <a href={SOURCE_REPOSITORY_URL}>{SOURCE_REPOSITORY_URL.replace("https://", "")}</a>, and the lessons are shared under CC BY-SA 4.0.</p>

    <h2>Fair use</h2>
    <p>Do not misuse the service, try to break it, or use it to harm anyone. We may pause an account that does.</p>

    <h2>Changes and availability</h2>
    <p>This is a pilot. Features may change, and the service may sometimes be unavailable. We will tell you by email about changes that matter.</p>

    <h2>Responsibility</h2>
    <p>We provide Nature Class as it is, and we are not responsible for losses that come from using it, as far as the law allows. Nothing here limits responsibility that cannot be limited by law, such as for death or injury caused by negligence.</p>

    <h2>Leaving</h2>
    <p>You can stop using Nature Class at any time. To delete your account, write to <a href="mailto:hi@natureclass.education">hi@natureclass.education</a>.</p>

    {uk && <><h2>Law</h2><p>These terms are governed by the law of England and Wales.</p></>}
  </>;
}
