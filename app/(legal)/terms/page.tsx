import { requestLocaleChoice } from "@/lib/request-locale";
import { publicMetadata } from "@/lib/seo";
import { TermsPage } from "./TermsOfUse";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("/terms", "Terms | Nature Class", "The simple terms for using Nature Class.");

/**
 * The plain terms of use (#61). A school's signed pilot agreement sits on top
 * of these. UK and US differ in safeguarding wording and governing law; the
 * US governing-law line waits until Wyld Way Corp's registration is confirmed.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const { locale, automatic } = await requestLocaleChoice((await searchParams).locale);
  return <TermsPage locale={locale} automatic={automatic} />;
}
