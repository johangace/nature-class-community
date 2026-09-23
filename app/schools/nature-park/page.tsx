import { redirect } from "next/navigation";
import { localeHref } from "@/lib/locale-links";
import { publicMetadata } from "@/lib/seo";
import { requestLocaleChoice } from "@/lib/request-locale";
import { NatureParkPackage } from "../../audiences/NatureParkPackage";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata(
  "/schools/nature-park",
  "National Education Nature Park package | Nature Class",
  "Selected schools in England can apply for up to £5,000 through the National Education Nature Park for grounds improvements. Nature Class helps plan and deliver the project."
);

export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const choice = await requestLocaleChoice((await searchParams).locale);
  // An England-only grant: the US edition goes back to the Schools page.
  if (choice.locale === "us") redirect(localeHref("/schools", choice.locale, choice.automatic));
  return <NatureParkPackage {...choice} />;
}
