import { requestLocaleChoice } from "@/lib/request-locale";
import { LandingPage } from "./welcome/LandingPage";
import { landingMetadata } from "./welcome/landing-metadata";
export const dynamic = "force-dynamic";
export const metadata = landingMetadata();

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ locale?: string }> }) {
  return LandingPage(await requestLocaleChoice((await searchParams)?.locale));
}
