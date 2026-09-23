import Link from "next/link";
import { localeHref } from "@/lib/locale-links";
import type { Locale } from "@/lib/localization";
import styles from "../../resources/resources.module.css";

export function PrivacyPage({ locale, automatic = false }: { locale: Locale; automatic?: boolean }) {
  const uk = locale === "uk";
  return <>
    <h1 className={styles.title}>Privacy</h1>
    <p className={styles.lead}>Nature Class is for adults who teach. Children do not have accounts, and we do not ask for their names.</p>
    <p>Last updated 14 September 2026.</p>

    <h2>Who we are</h2>
    <p>Nature Class is run by Wyld Way Corp. For anything about your data, write to <a href="mailto:hi@natureclass.education">hi@natureclass.education</a>.</p>

    <h2>What we store</h2>
    <ul>
      <li><strong>Your account:</strong> your email address, and your name if you add it.</li>
      <li><strong>Your classes:</strong> class name, {uk ? "year group" : "grade"}, school name, where your school grounds are, and notes you add about the grounds.</li>
      <li><strong>Lessons you run:</strong> which lesson, when, how many children took part, and any short notes you write afterwards.</li>
      <li><strong>Signing in:</strong> sign-in sessions with your browser, device and IP address, and passkeys if you set one up. If you sign in with Google or Microsoft, they tell us your email address.</li>
      <li><strong>Feedback:</strong> messages you send us, with your email address.</li>
    </ul>
    <p>Please do not type children’s names or other details about a child into notes or feedback.</p>

    <h2>Why we use it</h2>
    <p>To run Nature Class for you: signing you in, preparing lessons for your place, and keeping your class record. We also look at how the app is used so we can fix and improve it.{uk ? " Our lawful basis under UK data protection law is legitimate interests." : ""} We never sell your data or use it for advertising.</p>

    <h2>Who helps us run it</h2>
    <ul>
      <li><strong>Vercel</strong> hosts the app and counts page visits without cookies.</li>
      <li><strong>Neon</strong> hosts the database.</li>
      <li><strong>Resend</strong> sends sign-in emails and delivers feedback to us.</li>
      <li><strong>Anthropic</strong>, reached through Vercel, runs the AI help.</li>
      <li><strong>PostHog</strong> records how the app is used, including screen recordings with what you type into forms hidden.</li>
      <li><strong>Langfuse</strong> records whether AI requests worked, without your words.</li>
      <li><strong>Pointmoon</strong>, our own nature service, receives your grounds’ location (to about 100 metres) to find weather and nearby nature.</li>
      <li><strong>GBIF</strong>, the open biodiversity database, receives your grounds’ location to find species recorded nearby.</li>
      <li><strong>OpenStreetMap</strong> services turn a place you type into a location.</li>
      <li><strong>Google</strong> hosts our email inbox.</li>
    </ul>
    <p>{uk ? "Some of these services process data outside the UK, mainly in the United States." : "These services may process data in the United States and other countries."}</p>

    <h2>Cookies</h2>
    <p>We only use cookies the app needs to work: to keep you signed in, remember your class and setup progress, and remember UK or US wording. No advertising or tracking cookies.</p>

    <h2>How long we keep it</h2>
    <p>We keep your data while your account is open. A sign-in lasts 30 days on a device. There is no delete button yet. Ask us to delete your account and we will delete your account, classes and lesson record within one month.</p>

    <h2>Your rights</h2>
    {uk
      ? <p>You can ask to see, correct or delete your data, or object to how we use it. Write to <a href="mailto:hi@natureclass.education">hi@natureclass.education</a>. If you are unhappy with our answer, you can complain to the <a href="https://ico.org.uk/make-a-complaint/">Information Commissioner’s Office</a>.</p>
      : <p>You can ask to see, correct or delete your data. Write to <a href="mailto:hi@natureclass.education">hi@natureclass.education</a>.</p>}

    <p>See also our <Link href={localeHref("/terms", locale, automatic)}>terms</Link>.</p>
  </>;
}
