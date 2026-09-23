import { requestLocaleChoice } from "@/lib/request-locale";
import { AudiencePage } from "../audiences/AudiencePage";
import { audienceMetadata } from "../audiences/metadata";

export const dynamic = "force-dynamic";
export const metadata = audienceMetadata("schools");

export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const choice = await requestLocaleChoice((await searchParams).locale);
  return <AudiencePage audience="schools" {...choice} />;
}
