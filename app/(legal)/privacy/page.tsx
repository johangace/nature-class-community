import { requestLocaleChoice } from "@/lib/request-locale";
import { publicMetadata } from "@/lib/seo";
import { PrivacyPage } from "./PrivacyNotice";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("/privacy", "Privacy | Nature Class", "What Nature Class stores, who helps us run it, and how to have your data deleted.");

/**
 * The teacher-facing privacy notice (#61). Every line here must stay true to
 * the code: stored fields are the Prisma models, services are the ones the
 * app actually calls. Change the page in the same PR as the data flow.
 * UK and US differ only where the law differs: regulator, basis, transfers.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const { locale, automatic } = await requestLocaleChoice((await searchParams).locale);
  return <PrivacyPage locale={locale} automatic={automatic} />;
}
